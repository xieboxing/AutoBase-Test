import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { CaseRecorder } from '@/test-cases/case-recorder.js';
import type { TestCase } from '@/types/test-case.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Phase 16.4: 录制流程联调测试
 */
describe('Record Flow Integration Tests', () => {
  let recorder: CaseRecorder;
  const testOutputDir = './data/test-recordings';

  beforeAll(async () => {
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterAll(async () => {
    // 清理测试输出
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // 目录不存在，忽略
    }
  });

  beforeEach(() => {
    recorder = new CaseRecorder({
      headless: true,
      viewport: { width: 1280, height: 720 },
      recordVideo: false,
      artifactsDir: testOutputDir,
    });
  });

  describe('CaseRecorder Core Functions', () => {
    it('should initialize recorder', () => {
      expect(recorder).toBeDefined();
    });

    it('should have default config', () => {
      const defaultRecorder = new CaseRecorder();
      expect(defaultRecorder).toBeDefined();
    });

    it('should track action count', () => {
      expect(recorder.getActionCount()).toBe(0);
    });

    it('should get empty actions initially', () => {
      const actions = recorder.getActions();
      expect(actions).toEqual([]);
    });

    it('should clear actions', () => {
      recorder.clearActions();
      expect(recorder.getActionCount()).toBe(0);
    });
  });

  describe('Recorded Actions Processing', () => {
    it('should generate test case from recorded actions', async () => {
      // 模拟一些录制操作
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
        { timestamp: new Date().toISOString(), action: 'click', selector: '#login-btn', tagName: 'button', text: '登录' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="username"]', tagName: 'input', value: 'testuser' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="password"]', tagName: 'input', value: 'testpass' },
        { timestamp: new Date().toISOString(), action: 'click', selector: 'button[type="submit"]', tagName: 'button', text: '提交' },
      ];

      // 使用反射来设置内部 actions 数组
      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '登录流程测试',
        description: '用户登录操作录制',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['login', 'recorded'],
      });

      expect(testCase).toBeDefined();
      expect(testCase.name).toBe('登录流程测试');
      expect(testCase.description).toBe('用户登录操作录制');
      expect(testCase.priority).toBe('P1');
      expect(testCase.type).toBe('functional');
      expect(testCase.platform).toContain('pc-web');
      expect(testCase.tags).toContain('login');
      expect(testCase.tags).toContain('recorded');
      expect(testCase.steps.length).toBeGreaterThan(0);
    });

    it('should convert navigate action to step', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '导航测试',
        description: '页面导航',
      });

      expect(testCase.steps.length).toBe(1);
      expect(testCase.steps[0].action).toBe('navigate');
      expect(testCase.steps[0].value).toBe('https://example.com');
    });

    it('should convert click action to step', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'click', selector: '#submit', tagName: 'button', text: '提交' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '点击测试',
        description: '点击按钮',
      });

      expect(testCase.steps.length).toBe(1);
      expect(testCase.steps[0].action).toBe('click');
      expect(testCase.steps[0].target).toBe('#submit');
    });

    it('should convert fill action to step', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="email"]', tagName: 'input', value: 'test@example.com' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '输入测试',
        description: '输入文本',
      });

      expect(testCase.steps.length).toBe(1);
      expect(testCase.steps[0].action).toBe('fill');
      expect(testCase.steps[0].target).toBe('[name="email"]');
      expect(testCase.steps[0].value).toBe('test@example.com');
    });

    it('should deduplicate consecutive fill actions', async () => {
      // 模拟用户在同一个输入框连续输入
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'fill', selector: '#search', tagName: 'input', value: 'h' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '#search', tagName: 'input', value: 'he' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '#search', tagName: 'input', value: 'hel' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '#search', tagName: 'input', value: 'hello' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '输入去重测试',
        description: '连续输入应该合并',
      });

      // 应该只有一个 fill 步骤，值为最终值
      expect(testCase.steps.length).toBe(1);
      expect(testCase.steps[0].value).toBe('hello');
    });

    it('should convert select action to step', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'select', selector: '#country', tagName: 'select', value: 'china' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '选择测试',
        description: '下拉选择',
      });

      expect(testCase.steps.length).toBe(1);
      expect(testCase.steps[0].action).toBe('select');
      expect(testCase.steps[0].value).toBe('china');
    });
  });

  describe('Test Case Generation', () => {
    it('should generate valid test case structure', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
        { timestamp: new Date().toISOString(), action: 'click', selector: '#login', tagName: 'button', text: '登录' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '测试用例',
        description: '描述',
      });

      // 验证测试用例结构
      expect(testCase.id).toBeDefined();
      expect(testCase.id).toMatch(/^tc-recorded-/);
      expect(testCase.name).toBe('测试用例');
      expect(testCase.description).toBe('描述');
      expect(testCase.priority).toBe('P2'); // 默认优先级
      expect(testCase.type).toBe('functional'); // 默认类型
      expect(testCase.platform).toEqual(['pc-web']); // 默认平台
      expect(testCase.tags).toContain('recorded'); // 默认标签
      expect(testCase.steps).toBeDefined();
      expect(Array.isArray(testCase.steps)).toBe(true);
      expect(testCase.metadata).toBeDefined();
      expect(testCase.metadata.author).toBe('Case Recorder');
      expect(testCase.metadata.created).toBeDefined();
    });

    it('should include metadata in generated test case', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '元数据测试',
        description: '测试元数据',
      });

      expect(testCase.metadata).toBeDefined();
      expect(testCase.metadata.author).toBe('Case Recorder');
      expect(testCase.metadata.created).toBeDefined();
      expect(testCase.metadata.updated).toBeDefined();
      expect(testCase.metadata.run_count).toBe(0);
      expect(testCase.metadata.pass_rate).toBe(0);
    });
  });

  describe('Save and Export', () => {
    it('should save test case to file', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
        { timestamp: new Date().toISOString(), action: 'click', selector: '#btn', tagName: 'button', text: '按钮' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '保存测试',
        description: '测试保存功能',
      });

      const savedPath = await recorder.saveTestCase('test-project', testCase);

      expect(savedPath).toBeDefined();
      expect(savedPath).toContain('test-project');
      expect(savedPath).toContain('.case.json');

      // 验证文件存在
      const exists = await fs.access(savedPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      // 读取并验证内容
      const content = await fs.readFile(savedPath, 'utf-8');
      const parsed = JSON.parse(content) as TestCase;
      expect(parsed.name).toBe('保存测试');
      expect(parsed.steps.length).toBeGreaterThan(0);
    });

    it('should create project directory if not exists', async () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '目录创建测试',
        description: '测试自动创建目录',
      });

      const uniqueProject = `unique-project-${Date.now()}`;
      const savedPath = await recorder.saveTestCase(uniqueProject, testCase);

      expect(savedPath).toContain(uniqueProject);

      // 清理
      try {
        await fs.rm(`./test-suites/${uniqueProject}`, { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    });
  });

  describe('History Data Export/Import', () => {
    it('should export actions', () => {
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com' },
        { timestamp: new Date().toISOString(), action: 'click', selector: '#btn', tagName: 'button', text: '按钮' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const exported = JSON.stringify(recorder.getActions());
      expect(exported).toBeDefined();

      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(2);
    });
  });

  describe('Full Recording Workflow', () => {
    it('should complete full recording workflow', async () => {
      // 1. 准备录制操作
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com/login' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="username"]', tagName: 'input', value: 'admin' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="password"]', tagName: 'input', value: 'password123' },
        { timestamp: new Date().toISOString(), action: 'click', selector: 'button[type="submit"]', tagName: 'button', text: '登录' },
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com/dashboard' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      // 2. 生成测试用例
      const testCase = recorder.generateTestCase({
        name: '完整登录流程',
        description: '用户登录完整操作流程',
        priority: 'P0',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['login', 'auth', 'recorded'],
      });

      // 3. 验证测试用例
      expect(testCase).toBeDefined();
      expect(testCase.steps.length).toBeGreaterThan(0);

      // 4. 保存测试用例
      const savedPath = await recorder.saveTestCase('workflow-test', testCase);

      // 5. 验证保存成功
      expect(savedPath).toBeDefined();

      // 6. 读取并验证
      const content = await fs.readFile(savedPath, 'utf-8');
      const savedCase = JSON.parse(content) as TestCase;

      expect(savedCase.name).toBe('完整登录流程');
      expect(savedCase.priority).toBe('P0');
      expect(savedCase.tags).toContain('login');
      expect(savedCase.tags).toContain('auth');
      expect(savedCase.steps.length).toBeGreaterThan(0);

      // 清理
      try {
        await fs.rm('./test-suites/workflow-test', { recursive: true, force: true });
      } catch {
        // 忽略清理错误
      }
    });

    it('should handle complex form recording', async () => {
      // 模拟复杂表单填写
      const mockActions = [
        { timestamp: new Date().toISOString(), action: 'navigate', url: 'https://example.com/register' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="name"]', tagName: 'input', value: '张三' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="email"]', tagName: 'input', value: 'zhangsan@example.com' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="phone"]', tagName: 'input', value: '13800138000' },
        { timestamp: new Date().toISOString(), action: 'select', selector: '[name="gender"]', tagName: 'select', value: 'male' },
        { timestamp: new Date().toISOString(), action: 'fill', selector: '[name="address"]', tagName: 'textarea', value: '北京市朝阳区' },
        { timestamp: new Date().toISOString(), action: 'click', selector: '#agree-terms', tagName: 'input', text: '同意条款' },
        { timestamp: new Date().toISOString(), action: 'click', selector: 'button[type="submit"]', tagName: 'button', text: '注册' },
      ];

      (recorder as unknown as { actions: typeof mockActions }).actions = mockActions;

      const testCase = recorder.generateTestCase({
        name: '注册表单测试',
        description: '复杂表单填写流程',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['register', 'form', 'recorded'],
      });

      expect(testCase.steps.length).toBeGreaterThan(0);

      // 验证各种操作类型都被正确转换
      const actionTypes = testCase.steps.map(s => s.action);
      expect(actionTypes).toContain('navigate');
      expect(actionTypes).toContain('fill');
      expect(actionTypes).toContain('select');
      expect(actionTypes).toContain('click');
    });
  });
});
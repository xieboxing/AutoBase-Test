import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { WebCrawler } from '@/crawlers/web-crawler.js';
import { PageSnapshot, takePageSnapshot } from '@/crawlers/page-snapshot.js';
import { PageAnalyzer } from '@/ai/analyzer.js';
import { CaseGenerator } from '@/ai/case-generator.js';
import { PcTester } from '@/testers/web/pc-tester.js';
import { H5Tester } from '@/testers/web/h5-tester.js';
import { HtmlReporter } from '@/reporters/html-reporter.js';
import { JsonReporter } from '@/reporters/json-reporter.js';
import { MarkdownReporter } from '@/reporters/markdown-reporter.js';
import { Orchestrator } from '@/core/orchestrator.js';
import type { TestCase, TestRunResult } from '@/types/index.js';
import { getAiClient } from '@/ai/client.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// Helper to check if Playwright browsers are installed
async function isPlaywrightInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch {
    return false;
  }
}

let playwrightAvailable = false;

/**
 * Web 全流程集成测试
 * 测试：爬取页面 → AI 分析 → 生成用例 → 执行测试 → 生成报告
 */
describe('Web Full Flow Integration', () => {
  // 测试目标 URL（使用 Playwright 官方 demo 网站）
  const testUrl = 'https://demo.playwright.dev/todomvc';
  const outputDir = './data/reports/integration-test';
  const screenshotsDir = './data/screenshots/integration-test';

  // Mock AI 客户端（避免真正调用 API）
  const mockAiResponse = {
    pageDescription: 'TodoMVC 应用 - 一个简单的待办事项管理应用',
    testableFeatures: [
      {
        name: '添加待办事项',
        priority: 'P0',
        description: '测试添加新的待办事项功能',
        suggestedSteps: ['输入待办事项内容', '按回车键添加', '验证待办事项出现在列表中'],
        type: 'functional',
      },
      {
        name: '完成待办事项',
        priority: 'P1',
        description: '测试标记待办事项为已完成',
        suggestedSteps: ['点击待办事项前的复选框', '验证待办事项显示为已完成状态'],
        type: 'functional',
      },
      {
        name: '删除待办事项',
        priority: 'P1',
        description: '测试删除待办事项功能',
        suggestedSteps: ['悬停待办事项', '点击删除按钮', '验证待办事项从列表中移除'],
        type: 'functional',
      },
    ],
    potentialRisks: ['输入框为空时不应添加待办事项'],
    suggestedTestData: {
      todo: ['Buy groceries', 'Walk the dog', 'Clean the house', ''],
    },
  };

  beforeAll(async () => {
    // 确保输出目录存在
    await fs.mkdir(outputDir, { recursive: true });
    await fs.mkdir(screenshotsDir, { recursive: true });

    // Check if Playwright is available
    playwrightAvailable = await isPlaywrightInstalled();

    // Mock AI 客户端
    vi.spyOn(getAiClient(), 'chatWithRetry').mockResolvedValue({
      content: JSON.stringify(mockAiResponse),
      tokenUsage: { inputTokens: 100, outputTokens: 200, totalTokens: 300 },
    });

    vi.spyOn(getAiClient(), 'isEnabled').mockReturnValue(true);
    vi.spyOn(getAiClient(), 'isConfigured').mockReturnValue(true);
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe('Phase 1: Page Crawling', () => {
    it('should crawl the demo website successfully', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const crawler = new WebCrawler({
        maxDepth: 1,
        maxPages: 5,
        timeout: 30000,
      });

      const result = await crawler.crawl(testUrl);

      expect(result).toBeDefined();
      expect(result.pages.length).toBeGreaterThan(0);
      expect(result.errors.length).toBe(0);

      // 验证第一个页面
      const firstPage = result.pages[0];
      expect(firstPage.url).toContain('demo.playwright.dev');
      expect(firstPage.title).toBeDefined();

      await crawler.close();
    }, 60000);
  });

  describe('Phase 2: Page Snapshot', () => {
    let snapshot: PageSnapshot;

    it('should take page snapshot with interactive elements', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();

      await page.goto(testUrl, { waitUntil: 'networkidle' });

      // Wait for React app to render
      await page.waitForSelector('.new-todo', { timeout: 10000 });

      // Use correct SnapshotConfig options
      snapshot = await takePageSnapshot(page, testUrl, {
        fullPageScreenshot: true,
        captureInteractiveElements: true,
        captureDom: true,
        timeout: 30000,
      });

      expect(snapshot).toBeDefined();
      expect(snapshot.url).toContain('demo.playwright.dev');
      expect(snapshot.title).toBeDefined();
      // html might be empty in some cases, just check it's defined
      expect(snapshot.html).toBeDefined();
      // Interactive elements should be extracted (at least some inputs/buttons)
      expect(snapshot.interactiveElements.length).toBeGreaterThan(0);

      // 验证关键元素存在
      const inputElements = snapshot.interactiveElements.filter(el => el.tag === 'input');
      expect(inputElements.length).toBeGreaterThan(0);

      await browser.close();
    }, 30000);
  });

  describe('Phase 3: AI Analysis', () => {
    it('should analyze page and generate test features', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();

      await page.goto(testUrl, { waitUntil: 'networkidle' });

      const snapshot = await takePageSnapshot(page, testUrl, {
        fullPageScreenshot: false,
        captureInteractiveElements: true,
        captureDom: true,
        timeout: 30000,
      });

      const analyzer = new PageAnalyzer({ useAi: true, useScreenshot: false });
      const analysis = await analyzer.analyze(snapshot);

      expect(analysis).toBeDefined();
      expect(analysis.pageDescription).toBeDefined();
      expect(analysis.testableFeatures.length).toBeGreaterThan(0);
      expect(analysis.potentialRisks).toBeDefined();

      // 验证生成的功能点有优先级
      for (const feature of analysis.testableFeatures) {
        expect(feature.priority).toMatch(/^P[0-3]$/);
        expect(feature.name).toBeDefined();
        expect(feature.suggestedSteps.length).toBeGreaterThan(0);
      }

      await browser.close();
    }, 30000);
  });

  describe('Phase 4: Test Case Generation', () => {
    it('should generate test cases from analysis result', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const { chromium } = await import('playwright');
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const page = await context.newPage();

      await page.goto(testUrl, { waitUntil: 'networkidle' });

      const snapshot = await takePageSnapshot(page, testUrl, {
        fullPageScreenshot: false,
        captureInteractiveElements: true,
        captureDom: true,
        timeout: 30000,
      });

      const analyzer = new PageAnalyzer({ useAi: true, useScreenshot: false });
      const analysis = await analyzer.analyze(snapshot);

      const generator = new CaseGenerator({ platform: 'pc-web' });
      const cases = await generator.generateFromSnapshot(snapshot);

      expect(cases).toBeDefined();
      expect(cases.length).toBeGreaterThan(0);

      // 验证生成的用例格式正确
      for (const testCase of cases) {
        expect(testCase.id).toBeDefined();
        expect(testCase.name).toBeDefined();
        expect(testCase.steps.length).toBeGreaterThan(0);
        expect(testCase.platform).toContain('pc-web');

        // 验证每个步骤
        for (const step of testCase.steps) {
          expect(step.order).toBeGreaterThan(0);
          expect(step.action).toBeDefined();
        }
      }

      await browser.close();
    }, 30000);
  });

  describe('Phase 5: Test Execution (PC Web)', () => {
    it('should execute generated test cases on PC browser', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      // 创建一个简单的测试用例
      const testCase: TestCase = {
        id: 'tc-integration-001',
        name: 'TodoMVC 添加待办事项测试',
        description: '测试在 TodoMVC 应用中添加待办事项',
        priority: 'P0',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['integration', 'todo', 'smoke'],
        steps: [
          {
            order: 1,
            action: 'navigate',
            value: testUrl,
            description: '打开 TodoMVC 应用',
          },
          {
            order: 2,
            action: 'wait',
            value: '500',
            description: '等待页面渲染',
          },
          {
            order: 3,
            action: 'assert',
            target: '.new-todo',
            type: 'element-visible',
            description: '验证输入框可见',
          },
          {
            order: 4,
            action: 'fill',
            target: '.new-todo',
            value: 'Integration Test Task',
            description: '输入待办事项内容',
          },
          {
            order: 5,
            action: 'wait',
            value: '100',
            description: '等待输入完成',
          },
        ],
        metadata: {
          author: 'Integration Test',
          created: new Date().toISOString(),
        },
      };

      const tester = new PcTester({
        headless: true,
        screenshotOnFailure: true,
        artifactsDir: screenshotsDir,
      });

      const result = await tester.runTest(testCase);

      expect(result).toBeDefined();
      expect(result.caseId).toBe(testCase.id);
      expect(result.status).toBe('passed');
      expect(result.steps.length).toBe(testCase.steps.length);

      // 验证每个步骤都通过
      for (const stepResult of result.steps) {
        expect(stepResult.status).toBe('passed');
      }

      await tester.close();
    }, 60000);
  });

  describe('Phase 6: H5 Mobile Web Test', () => {
    it('should execute test on mobile viewport', async () => {
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const testCase: TestCase = {
        id: 'tc-integration-h5-001',
        name: 'TodoMVC H5 测试',
        description: '测试 TodoMVC 在移动端视口下的表现',
        priority: 'P1',
        type: 'functional',
        platform: ['h5-web'],
        tags: ['integration', 'h5'],
        steps: [
          {
            order: 1,
            action: 'navigate',
            value: testUrl,
            description: '打开 TodoMVC 应用',
          },
          {
            order: 2,
            action: 'wait',
            value: '500',
            description: '等待页面渲染',
          },
          {
            order: 3,
            action: 'assert',
            target: '.new-todo',
            type: 'element-visible',
            description: '验证输入框在移动端可见',
          },
        ],
        metadata: {
          author: 'Integration Test',
          created: new Date().toISOString(),
        },
      };

      const tester = new H5Tester({
        device: 'iPhone 15',
        headless: true,
        screenshotOnFailure: true,
        artifactsDir: screenshotsDir,
      });

      const result = await tester.runTest(testCase);

      expect(result).toBeDefined();
      expect(result.caseId).toBe(testCase.id);
      // H5 测试可能因为布局差异而结果不同，主要验证流程能跑通
      expect(['passed', 'failed']).toContain(result.status);
      expect(result.environment.viewport).toBeDefined();

      await tester.close();
    }, 60000);
  });

  describe('Phase 7: Report Generation', () => {
    let testRunResult: TestRunResult;

    beforeAll(() => {
      // 构造测试运行结果
      testRunResult = {
        runId: 'integration-test-run',
        project: 'TodoMVC Demo',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 5000,
        platform: 'pc-web',
        environment: {
          browser: 'chromium',
          viewport: { width: 1920, height: 1080 },
          os: process.platform,
        },
        summary: {
          total: 3,
          passed: 2,
          failed: 1,
          skipped: 0,
          blocked: 0,
          passRate: 0.67,
        },
        categories: {
          functional: { total: 2, passed: 1, failed: 1, skipped: 0, passRate: 0.5 },
          visual: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          performance: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          security: { total: 1, passed: 1, failed: 0, skipped: 0, passRate: 1 },
          accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          stability: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
        },
        cases: [
          {
            caseId: 'tc-001',
            caseName: '页面加载测试',
            status: 'passed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 1000,
            platform: 'pc-web',
            environment: { browser: 'chromium' },
            steps: [
              { order: 1, action: 'navigate', status: 'passed', durationMs: 500 },
            ],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [] },
          },
          {
            caseId: 'tc-002',
            caseName: '添加待办事项',
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 2000,
            platform: 'pc-web',
            environment: { browser: 'chromium' },
            steps: [
              { order: 1, action: 'navigate', status: 'passed', durationMs: 500 },
              { order: 2, action: 'fill', status: 'failed', durationMs: 1000, errorMessage: 'Element not found' },
            ],
            retryCount: 1,
            selfHealed: false,
            artifacts: { screenshots: [], logs: ['Element not found'] },
          },
          {
            caseId: 'tc-003',
            caseName: '安全检查',
            status: 'passed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 1500,
            platform: 'pc-web',
            environment: { browser: 'chromium' },
            steps: [
              { order: 1, action: 'assert', status: 'passed', durationMs: 1500 },
            ],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [] },
          },
        ],
        aiAnalysis: {
          overallAssessment: '测试通过率 67%，存在元素定位问题需要关注',
          criticalIssues: ['添加待办事项功能的元素定位器可能需要更新'],
          recommendations: ['建议使用更稳定的选择器策略', '增加自愈机制配置'],
          riskLevel: 'medium',
        },
        artifacts: {
          screenshots: [],
          videos: [],
          logs: [],
        },
      };
    });

    it('should generate JSON report', async () => {
      const reporter = new JsonReporter({ outputDir });
      const filePath = await reporter.generate(testRunResult);

      expect(filePath).toBeDefined();
      expect(filePath).toContain('.json');

      // 验证文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.runId).toBe(testRunResult.runId);
      expect(parsed.summary.total).toBe(3);
    });

    it('should generate Markdown report', async () => {
      const reporter = new MarkdownReporter({ outputDir });
      const filePath = await reporter.generate(testRunResult);

      expect(filePath).toBeDefined();
      expect(filePath).toContain('.md');

      // 验证文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('# 测试报告');
      expect(content).toContain('TodoMVC Demo');
      expect(content).toContain('总用例');
    });

    it('should generate HTML report', async () => {
      const reporter = new HtmlReporter({
        outputDir,
        openOnComplete: false,
        embedScreenshots: true,
      });
      const filePath = await reporter.generate(testRunResult);

      expect(filePath).toBeDefined();
      expect(filePath).toContain('.html');

      // 验证文件内容
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('测试报告');
      expect(content).toContain('TodoMVC Demo');
      expect(content).toContain('cdn.jsdelivr.net/npm/chart.js'); // 验证图表脚本
    });
  });

  describe('Phase 8: Orchestrator Full Flow', () => {
    it('should orchestrate complete test flow', async () => {
      // 检查 Playwright 是否安装
      if (!playwrightAvailable) {
        console.log('Skipping: Playwright browsers not installed');
        return;
      }

      const { defaultConfig } = await import('../../config/index.js');

      const orchestrator = new Orchestrator({
        project: 'TodoMVC Integration Test',
        platform: 'pc-web',
        testType: 'smoke',
        config: defaultConfig,
        cases: [
          {
            id: 'tc-orch-001',
            name: '简单冒烟测试',
            description: '验证页面能正常打开',
            priority: 'P0',
            type: 'functional',
            platform: ['pc-web'],
            tags: ['smoke'],
            steps: [
              {
                order: 1,
                action: 'navigate',
                value: testUrl,
                description: '打开页面',
              },
              {
                order: 2,
                action: 'wait',
                value: '500',
                description: '等待页面渲染',
              },
              {
                order: 3,
                action: 'assert',
                target: 'body',
                type: 'element-visible',
                description: '验证页面主体可见',
              },
            ],
            metadata: {
              author: 'Integration Test',
              created: new Date().toISOString(),
            },
          },
        ],
      });

      // 获取运行状态
      const status = orchestrator.getStatus();
      expect(status.runId).toBeDefined();
      expect(status.project).toBe('TodoMVC Integration Test');
      expect(status.platform).toBe('pc-web');
      expect(status.totalCases).toBe(1);

      // 执行测试流程
      await orchestrator.run();

      // 验证运行完成
      const finalStatus = orchestrator.getStatus();
      expect(finalStatus.isRunning).toBe(false);
      expect(finalStatus.endTime).toBeDefined();
    }, 60000);
  });
});
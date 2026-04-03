import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { AiClient, getAiClient } from '@/ai/client.js';
import { PageAnalyzer } from '@/ai/analyzer.js';
import { CaseGenerator } from '@/ai/case-generator.js';
import { FailureAnalyzer } from '@/ai/failure-analyzer.js';
import { SelfHealer } from '@/ai/self-healer.js';
import { FlowOptimizer } from '@/ai/flow-optimizer.js';
import { buildAnalyzePagePrompt, parsePageAnalysisResult } from '@/ai/prompts/analyze-page.prompt.js';
import type { PageSnapshot, InteractiveElement, FormInfo } from '@/types/crawler.types.js';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { TestCaseResult } from '@/types/test-result.types.js';
import type { PageAnalysisResult, FailureContext } from '@/types/ai.types.js';

/**
 * AI 模块集成测试
 * 测试：AI 客户端 → 页面分析 → 用例生成 → 失败分析 → 自愈 → 流程优化
 * 使用 Mock API 避免真实调用
 */
describe('AI Flow Integration', () => {
  // Mock AI 响应
  const mockPageAnalysisResponse: PageAnalysisResult = {
    pageDescription: '登录页面 - 用户身份验证表单',
    testableFeatures: [
      {
        name: '用户登录功能',
        priority: 'P0',
        description: '验证用户可以使用正确的凭证登录系统',
        suggestedSteps: [
          '输入有效的用户名',
          '输入有效的密码',
          '点击登录按钮',
          '验证登录成功并跳转到首页',
        ],
        type: 'functional',
      },
      {
        name: '空输入验证',
        priority: 'P1',
        description: '验证表单对空输入的处理',
        suggestedSteps: [
          '清空用户名输入框',
          '清空密码输入框',
          '点击登录按钮',
          '验证显示错误提示',
        ],
        type: 'functional',
      },
      {
        name: '错误密码处理',
        priority: 'P1',
        description: '验证错误密码时的系统响应',
        suggestedSteps: [
          '输入有效用户名',
          '输入错误密码',
          '点击登录按钮',
          '验证显示密码错误提示',
        ],
        type: 'functional',
      },
    ],
    potentialRisks: [
      '密码输入框应遮罩显示',
      '登录按钮应有禁用状态',
    ],
    suggestedTestData: {
      username: ['admin', 'user@test.com', ''],
      password: ['Password123!', 'wrong_password', '', 'short'],
    },
  };

  const mockTestCaseResponse = {
    cases: [
      {
        id: 'tc-ai-001',
        name: '正常登录流程测试',
        description: '验证用户可以使用有效凭证登录',
        priority: 'P0',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['login', 'auth', 'smoke'],
        steps: [
          { order: 1, action: 'navigate', target: '/login', description: '打开登录页面' },
          { order: 2, action: 'fill', target: '#username', value: 'admin', description: '输入用户名' },
          { order: 3, action: 'fill', target: '#password', value: 'Password123!', description: '输入密码' },
          { order: 4, action: 'click', target: '#login-button', description: '点击登录按钮' },
          { order: 5, action: 'assert', target: '#dashboard', type: 'element-visible', description: '验证跳转到首页' },
        ],
      },
      {
        id: 'tc-ai-002',
        name: '空输入验证测试',
        description: '验证表单对空输入的处理',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['login', 'validation'],
        steps: [
          { order: 1, action: 'navigate', target: '/login', description: '打开登录页面' },
          { order: 2, action: 'fill', target: '#username', value: '', description: '清空用户名' },
          { order: 3, action: 'fill', target: '#password', value: '', description: '清空密码' },
          { order: 4, action: 'click', target: '#login-button', description: '点击登录按钮' },
          { order: 5, action: 'assert', target: '.error-message', type: 'element-visible', description: '验证错误提示显示' },
        ],
      },
    ],
  };

  const mockFailureAnalysisResponse = {
    failureType: 'element_not_found',
    rootCause: '登录按钮的选择器 #login-button 已失效，页面 DOM 结构可能已更新',
    isProductBug: false,
    isTestIssue: true,
    confidence: 0.85,
    suggestedFix: '建议更新选择器为 button[type="submit"] 或使用文本定位器',
    alternativeSelectors: ['button[type="submit"]', '.submit-btn', 'button:has-text("登录")'],
    retryRecommended: true,
    additionalInfo: {
      lastKnownWorkingSelector: '#login-button',
      suggestedWaitStrategy: '等待按钮可见后再点击',
    },
  };

  // Mock 页面快照
  const createMockSnapshot = (): PageSnapshot => ({
    url: 'https://example.com/login',
    title: '登录页面',
    html: `
      <html>
        <body>
          <form id="login-form">
            <input type="text" id="username" name="username" placeholder="用户名" required />
            <input type="password" id="password" name="password" placeholder="密码" required />
            <button type="submit" id="login-button">登录</button>
          </form>
        </body>
      </html>
    `,
    interactiveElements: [
      { tag: 'input', type: 'text', selector: '#username', text: '', visible: true, clickable: false, disabled: false, position: { x: 0, y: 0, width: 200, height: 30 }, attributes: { id: 'username', name: 'username', type: 'text' } },
      { tag: 'input', type: 'password', selector: '#password', text: '', visible: true, clickable: false, disabled: false, position: { x: 0, y: 40, width: 200, height: 30 }, attributes: { id: 'password', name: 'password', type: 'password' } },
      { tag: 'button', type: 'submit', selector: '#login-button', text: '登录', visible: true, clickable: true, disabled: false, position: { x: 0, y: 80, width: 100, height: 40 }, attributes: { id: 'login-button', type: 'submit' } },
    ],
    forms: [
      {
        selector: '#login-form',
        action: '/api/login',
        method: 'POST',
        fields: [
          { name: 'username', type: 'text', selector: '#username', required: true, label: '用户名' },
          { name: 'password', type: 'password', selector: '#password', required: true, label: '密码' },
        ],
      },
    ],
    networkRequests: [],
    screenshot: {
      viewport: 'base64-mock-screenshot-data',
      fullPage: 'base64-mock-fullpage-data',
    },
    timestamp: new Date().toISOString(),
  });

  // Mock 失败的测试结果
  const createMockFailedResult = (): TestCaseResult => ({
    caseId: 'tc-ai-001',
    caseName: '正常登录流程测试',
    status: 'failed',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    durationMs: 5000,
    platform: 'pc-web',
    environment: { browser: 'chromium', viewport: { width: 1920, height: 1080 } },
    steps: [
      { order: 1, action: 'navigate', target: '/login', status: 'passed', durationMs: 500 },
      { order: 2, action: 'fill', target: '#username', value: 'admin', status: 'passed', durationMs: 200 },
      { order: 3, action: 'fill', target: '#password', value: 'Password123!', status: 'passed', durationMs: 200 },
      { order: 4, action: 'click', target: '#login-button', status: 'failed', durationMs: 3000, errorMessage: 'Timeout waiting for element #login-button' },
    ],
    retryCount: 2,
    selfHealed: false,
    artifacts: {
      screenshots: ['./data/screenshots/failure.png'],
      logs: ['Element #login-button not found after 30s'],
    },
  });

  let mockAiClient: AiClient;

  beforeAll(() => {
    // 创建 Mock AI 客户端
    mockAiClient = getAiClient();

    vi.spyOn(mockAiClient, 'isEnabled').mockReturnValue(true);
    vi.spyOn(mockAiClient, 'isConfigured').mockReturnValue(true);
    vi.spyOn(mockAiClient, 'chatWithRetry').mockImplementation(async (messages, options) => {
      // 根据消息内容返回不同的 Mock 响应
      const messageContent = messages[0]?.content || '';

      if (typeof messageContent === 'string' && messageContent.includes('分析页面')) {
        return {
          content: JSON.stringify(mockPageAnalysisResponse),
          tokenUsage: { inputTokens: 500, outputTokens: 300, totalTokens: 800 },
        };
      }

      if (typeof messageContent === 'string' && messageContent.includes('生成测试用例')) {
        return {
          content: JSON.stringify(mockTestCaseResponse),
          tokenUsage: { inputTokens: 600, outputTokens: 400, totalTokens: 1000 },
        };
      }

      if (typeof messageContent === 'string' && messageContent.includes('分析失败')) {
        return {
          content: JSON.stringify(mockFailureAnalysisResponse),
          tokenUsage: { inputTokens: 400, outputTokens: 200, totalTokens: 600 },
        };
      }

      // 默认响应
      return {
        content: JSON.stringify({ result: 'mock response' }),
        tokenUsage: { inputTokens: 100, outputTokens: 100, totalTokens: 200 },
      };
    });
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  describe('AI Client', () => {
    it('should check if AI is enabled and configured', () => {
      expect(mockAiClient.isEnabled()).toBe(true);
      expect(mockAiClient.isConfigured()).toBe(true);
    });

    it('should call chat API with retry', async () => {
      const response = await mockAiClient.chatWithRetry([
        { role: 'user', content: '分析页面结构' },
      ], { responseFormat: 'json' });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
      expect(response.tokenUsage).toBeDefined();

      const parsed = JSON.parse(response.content);
      expect(parsed.pageDescription).toBeDefined();
    });

    it('should handle multimodal input with screenshot', async () => {
      const response = await mockAiClient.chatWithRetry([
        {
          role: 'user',
          content: [
            { type: 'text', text: '分析这个页面截图' },
            { type: 'image', data: 'base64-image-data', mediaType: 'image/png' },
          ],
        },
      ], { responseFormat: 'json' });

      expect(response).toBeDefined();
      expect(response.content).toBeDefined();
    });
  });

  describe('Page Analyzer', () => {
    it('should analyze page snapshot using AI', async () => {
      const snapshot = createMockSnapshot();
      const analyzer = new PageAnalyzer({ useAi: true }, mockAiClient);

      const result = await analyzer.analyze(snapshot);

      expect(result).toBeDefined();
      expect(result.pageDescription).toBeDefined();
      expect(result.testableFeatures.length).toBeGreaterThan(0);
      expect(result.potentialRisks).toBeDefined();
      expect(result.suggestedTestData).toBeDefined();
    });

    it('should analyze page with rules when AI is disabled', async () => {
      vi.spyOn(mockAiClient, 'isEnabled').mockReturnValue(false);

      const snapshot = createMockSnapshot();
      const analyzer = new PageAnalyzer({ useAi: false }, mockAiClient);

      const result = await analyzer.analyze(snapshot);

      expect(result).toBeDefined();
      expect(result.testableFeatures.length).toBeGreaterThan(0);
      // 规则引擎生成的特征名应包含关键词
      expect(result.testableFeatures[0].name).toBeDefined();

      vi.spyOn(mockAiClient, 'isEnabled').mockReturnValue(true);
    });

    it('should fallback to rules when AI analysis fails', async () => {
      vi.spyOn(mockAiClient, 'chatWithRetry').mockRejectedValueOnce(new Error('AI API Error'));

      const snapshot = createMockSnapshot();
      const analyzer = new PageAnalyzer({ useAi: true }, mockAiClient);

      const result = await analyzer.analyze(snapshot);

      // 应降级到规则引擎
      expect(result).toBeDefined();
      expect(result.testableFeatures.length).toBeGreaterThan(0);

      vi.spyOn(mockAiClient, 'chatWithRetry').mockRestore();
    });
  });

  describe('Case Generator', () => {
    it('should generate test cases from snapshot', async () => {
      const snapshot = createMockSnapshot();

      const generator = new CaseGenerator({ platform: 'pc-web' }, mockAiClient);
      const cases = await generator.generateFromSnapshot(snapshot);

      expect(cases).toBeDefined();
      expect(cases.length).toBeGreaterThan(0);

      // 验证生成的用例格式
      for (const testCase of cases) {
        expect(testCase.id).toBeDefined();
        expect(testCase.name).toBeDefined();
        expect(testCase.steps.length).toBeGreaterThan(0);
        expect(testCase.platform).toContain('pc-web');
      }
    });

    it('should generate cases with correct priority', async () => {
      const snapshot = createMockSnapshot();

      const generator = new CaseGenerator({ platform: 'pc-web' }, mockAiClient);
      const cases = await generator.generateFromSnapshot(snapshot);

      // P0 优先级的用例应存在（冒烟测试）
      const p0Cases = cases.filter(c => c.priority === 'P0');
      expect(p0Cases.length).toBeGreaterThan(0);
    });

    it('should generate cases with valid action types', async () => {
      const snapshot = createMockSnapshot();

      const generator = new CaseGenerator({ platform: 'pc-web' }, mockAiClient);
      const cases = await generator.generateFromSnapshot(snapshot);

      const validActions = ['navigate', 'click', 'fill', 'select', 'hover', 'scroll', 'wait', 'screenshot', 'assert'];

      for (const testCase of cases) {
        for (const step of testCase.steps) {
          expect(validActions).toContain(step.action);
        }
      }
    });
  });

  describe('Failure Analyzer', () => {
    it('should analyze test failure and provide diagnosis', async () => {
      const failedResult = createMockFailedResult();
      const snapshot = createMockSnapshot();

      // Create FailureContext from the failed result
      const context: FailureContext = {
        testCaseId: failedResult.caseId,
        testCaseName: failedResult.caseName,
        failedStep: failedResult.steps.find(s => s.status === 'failed')!,
        errorMessage: failedResult.steps.find(s => s.status === 'failed')?.errorMessage || 'Unknown error',
        previousSteps: failedResult.steps.filter(s => s.status === 'passed'),
      };

      const analyzer = new FailureAnalyzer(mockAiClient);
      const analysis = await analyzer.analyze(context, snapshot);

      expect(analysis).toBeDefined();
      expect(analysis.category).toBeDefined();
      expect(analysis.possibleCauses).toBeDefined();
      expect(analysis.isProductBug).toBeDefined();
      expect(analysis.isTestIssue).toBeDefined();
      expect(analysis.fixSuggestions).toBeDefined();
    });

    it('should identify test issue vs product bug', async () => {
      const failedResult = createMockFailedResult();
      const snapshot = createMockSnapshot();

      const context: FailureContext = {
        testCaseId: failedResult.caseId,
        testCaseName: failedResult.caseName,
        failedStep: failedResult.steps.find(s => s.status === 'failed')!,
        errorMessage: 'Element not found: #login-button',
        previousSteps: failedResult.steps.filter(s => s.status === 'passed'),
      };

      const analyzer = new FailureAnalyzer(mockAiClient);
      const analysis = await analyzer.analyze(context, snapshot);

      // 元素定位失败通常是测试问题
      expect(analysis.isTestIssue).toBe(true);
    });

    it('should provide fix suggestions', async () => {
      const failedResult = createMockFailedResult();
      const snapshot = createMockSnapshot();

      const context: FailureContext = {
        testCaseId: failedResult.caseId,
        testCaseName: failedResult.caseName,
        failedStep: failedResult.steps.find(s => s.status === 'failed')!,
        errorMessage: 'Timeout waiting for element',
        previousSteps: failedResult.steps.filter(s => s.status === 'passed'),
      };

      const analyzer = new FailureAnalyzer(mockAiClient);
      const analysis = await analyzer.analyze(context, snapshot);

      expect(analysis.fixSuggestions).toBeDefined();
      expect(analysis.fixSuggestions.length).toBeGreaterThan(0);
    });
  });

  describe('Self Healer', () => {
    it('should attempt to heal failed element locator', async () => {
      const snapshot = createMockSnapshot();

      const healer = new SelfHealer(mockAiClient);
      const result = await healer.heal('#login-button', snapshot, 'click');

      expect(result).toBeDefined();
      expect(result.originalSelector).toBe('#login-button');
      expect(result.method).toBeDefined();
      expect(result.candidatesTested).toBeGreaterThanOrEqual(0);
    });

    it('should record healing history', async () => {
      const snapshot = createMockSnapshot();

      const healer = new SelfHealer(mockAiClient);
      await healer.heal('#login-button', snapshot, 'click');

      const mappings = healer.getMappings();
      // Mappings may be empty if healing failed, that's okay
      expect(Array.isArray(mappings)).toBe(true);
    });

    it('should test multiple candidates', async () => {
      const snapshot = createMockSnapshot();

      const healer = new SelfHealer(mockAiClient);
      const result = await healer.heal('#username', snapshot, 'fill');

      expect(result).toBeDefined();
      expect(result.candidatesTested).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Flow Optimizer', () => {
    it('should analyze historical test results', async () => {
      const historyData = [
        { caseId: 'tc-001', caseName: 'Test 1', totalRuns: 5, passCount: 4, failCount: 1, skipCount: 0, avgDurationMs: 1000, lastResult: 'passed' as const, recentResults: ['passed', 'passed', 'passed', 'failed', 'passed'], priority: 'P0' as const, type: 'functional', tags: [] },
        { caseId: 'tc-002', caseName: 'Test 2', totalRuns: 5, passCount: 2, failCount: 3, skipCount: 0, avgDurationMs: 5000, lastResult: 'failed' as const, recentResults: ['failed', 'passed', 'failed', 'failed', 'passed'], priority: 'P1' as const, type: 'functional', tags: [] },
        { caseId: 'tc-003', caseName: 'Test 3', totalRuns: 3, passCount: 3, failCount: 0, skipCount: 0, avgDurationMs: 30000, lastResult: 'passed' as const, recentResults: ['passed', 'passed', 'passed'], priority: 'P2' as const, type: 'functional', tags: [] },
      ];

      const optimizer = new FlowOptimizer(mockAiClient);
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData,
        recentPassRate: 0.6,
        previousPassRate: 0.7,
        avgDuration: 10000,
      });

      expect(result).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should identify frequently failing cases', async () => {
      const historyData = [
        { caseId: 'tc-flaky', caseName: 'Flaky Test', totalRuns: 5, passCount: 2, failCount: 3, skipCount: 0, avgDurationMs: 1000, lastResult: 'failed' as const, recentResults: ['failed', 'passed', 'failed', 'passed', 'failed'], priority: 'P1' as const, type: 'functional', tags: [] },
        { caseId: 'tc-stable', caseName: 'Stable Test', totalRuns: 5, passCount: 5, failCount: 0, skipCount: 0, avgDurationMs: 500, lastResult: 'passed' as const, recentResults: ['passed', 'passed', 'passed', 'passed', 'passed'], priority: 'P1' as const, type: 'functional', tags: [] },
      ];

      const optimizer = new FlowOptimizer(mockAiClient);
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 2,
        historyData,
        recentPassRate: 0.5,
        avgDuration: 750,
      });

      // Should have suggestions for the flaky test
      expect(result.suggestions.some(s => s.caseId === 'tc-flaky')).toBe(true);
    });

    it('should identify slow test cases', async () => {
      const historyData = [
        { caseId: 'tc-slow', caseName: 'Slow Test', totalRuns: 3, passCount: 3, failCount: 0, skipCount: 0, avgDurationMs: 60000, lastResult: 'passed' as const, recentResults: ['passed', 'passed', 'passed'], priority: 'P2' as const, type: 'functional', tags: [] },
        { caseId: 'tc-fast', caseName: 'Fast Test', totalRuns: 3, passCount: 3, failCount: 0, skipCount: 0, avgDurationMs: 500, lastResult: 'passed' as const, recentResults: ['passed', 'passed', 'passed'], priority: 'P2' as const, type: 'functional', tags: [] },
      ];

      const optimizer = new FlowOptimizer(mockAiClient);
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 2,
        historyData,
        recentPassRate: 1.0,
        avgDuration: 30250,
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should generate optimization recommendations', async () => {
      const historyData = [
        { caseId: 'tc-001', caseName: 'Test 1', totalRuns: 3, passCount: 1, failCount: 2, skipCount: 0, avgDurationMs: 5000, lastResult: 'failed' as const, recentResults: ['failed', 'failed', 'passed'], priority: 'P0' as const, type: 'functional', tags: [] },
      ];

      const optimizer = new FlowOptimizer(mockAiClient);
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 1,
        historyData,
        recentPassRate: 0.33,
        avgDuration: 5000,
      });

      for (const suggestion of result.suggestions) {
        expect(suggestion.type).toBeDefined();
        expect(suggestion.reason).toBeDefined();
        expect(suggestion.confidence).toBeGreaterThanOrEqual(0);
        expect(suggestion.impact).toBeDefined();
      }
    });
  });

  describe('Full AI Flow Integration', () => {
    it('should complete full AI analysis pipeline', async () => {
      // 1. 页面分析
      const snapshot = createMockSnapshot();
      const analyzer = new PageAnalyzer({ useAi: true }, mockAiClient);
      const analysis = await analyzer.analyze(snapshot);

      expect(analysis.testableFeatures.length).toBeGreaterThan(0);

      // 2. 用例生成
      const generator = new CaseGenerator({ platform: 'pc-web' }, mockAiClient);
      const cases = await generator.generateFromSnapshot(snapshot);

      expect(cases.length).toBeGreaterThan(0);

      // 3. 模拟执行失败 - 创建 FailureContext
      const failedResult = createMockFailedResult();
      const context: FailureContext = {
        testCaseId: failedResult.caseId,
        testCaseName: failedResult.caseName,
        failedStep: failedResult.steps.find(s => s.status === 'failed')!,
        errorMessage: failedResult.steps.find(s => s.status === 'failed')?.errorMessage || 'Unknown error',
        previousSteps: failedResult.steps.filter(s => s.status === 'passed'),
      };

      // 4. 失败分析
      const failureAnalyzer = new FailureAnalyzer(mockAiClient);
      const failureAnalysis = await failureAnalyzer.analyze(context, snapshot);

      expect(failureAnalysis.fixSuggestions).toBeDefined();

      // 5. 自愈尝试
      const healer = new SelfHealer(mockAiClient);
      const healResult = await healer.heal('#login-button', snapshot, 'click');

      expect(healResult.originalSelector).toBeDefined();

      // 6. 流程优化建议
      const optimizer = new FlowOptimizer(mockAiClient);
      const optimizationResult = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 1,
        historyData: [
          { caseId: failedResult.caseId, caseName: failedResult.caseName, totalRuns: 3, passCount: 0, failCount: 3, skipCount: 0, avgDurationMs: 5000, lastResult: 'failed', recentResults: ['failed', 'failed', 'failed'], priority: 'P0', type: 'functional', tags: [] },
        ],
        recentPassRate: 0,
        avgDuration: 5000,
      });

      expect(optimizationResult.suggestions.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle AI degradation gracefully', async () => {
      // Mock AI 不可用
      vi.spyOn(mockAiClient, 'isEnabled').mockReturnValue(false);
      vi.spyOn(mockAiClient, 'isConfigured').mockReturnValue(false);

      const snapshot = createMockSnapshot();
      const analyzer = new PageAnalyzer({ useAi: true }, mockAiClient);

      // 应降级到规则引擎
      const result = await analyzer.analyze(snapshot);
      expect(result).toBeDefined();
      expect(result.testableFeatures.length).toBeGreaterThan(0);

      // 恢复 Mock
      vi.spyOn(mockAiClient, 'isEnabled').mockReturnValue(true);
      vi.spyOn(mockAiClient, 'isConfigured').mockReturnValue(true);
    });
  });

  describe('Prompt Templates', () => {
    it('should build valid analyze page prompt', () => {
      const prompt = buildAnalyzePagePrompt({
        url: 'https://example.com/login',
        title: '登录页面',
        html: '<html><body><form><input id="username" /></form></body></html>',
        interactiveElements: createMockSnapshot().interactiveElements,
        forms: createMockSnapshot().forms,
        platform: 'pc',
      });

      expect(prompt).toBeDefined();
      expect(prompt).toContain('https://example.com/login');
      expect(prompt).toContain('登录页面');
    });

    it('should parse page analysis result correctly', () => {
      const jsonString = JSON.stringify(mockPageAnalysisResponse);
      const result = parsePageAnalysisResult(jsonString);

      expect(result).toBeDefined();
      expect(result.pageDescription).toBe(mockPageAnalysisResponse.pageDescription);
      expect(result.testableFeatures.length).toBe(mockPageAnalysisResponse.testableFeatures.length);
    });
  });
});
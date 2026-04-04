/**
 * 业务流分析器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  BusinessFlowAnalyzer,
  createBusinessFlowAnalyzer,
} from '@/ai/business-flow-analyzer.js';
import {
  buildBusinessFlowPrompt,
  buildBusinessFlowWithScreenshotPrompt,
  buildCrossPageFlowPrompt,
  parseBusinessFlowAnalysis,
  businessStepSchema,
  businessFlowSchema,
  pageBusinessAnalysisSchema,
} from '@/ai/prompts/business-flow.prompt.js';
import type { PageSnapshot } from '@/types/crawler.types.js';

// Mock AI Client
const mockAiClient = {
  chatWithRetry: vi.fn(),
};

// Mock Database
const mockDb = {
  execute: vi.fn(),
  query: vi.fn(),
};

describe('BusinessFlowAnalyzer', () => {
  let analyzer: BusinessFlowAnalyzer;

  const mockSnapshot: PageSnapshot = {
    url: 'https://example.com/login',
    title: '登录页面',
    html: '<html><body><form><input name="email" /><input name="password" /><button type="submit">登录</button></form></body></html>',
    screenshot: {
      viewport: 'base64screenshotdata',
      fullPage: 'base64fullpagedata',
    },
    interactiveElements: [
      {
        tag: 'input',
        type: 'email',
        selector: 'input[name="email"]',
        text: '',
        attributes: { name: 'email', placeholder: '请输入邮箱' },
      },
      {
        tag: 'input',
        type: 'password',
        selector: 'input[name="password"]',
        text: '',
        attributes: { name: 'password', placeholder: '请输入密码' },
      },
      {
        tag: 'button',
        type: 'submit',
        selector: 'button[type="submit"]',
        text: '登录',
        attributes: { type: 'submit' },
      },
    ],
    forms: [
      {
        selector: 'form',
        action: '/api/login',
        method: 'POST',
        fields: [
          { name: 'email', type: 'email', label: '邮箱', required: true },
          { name: 'password', type: 'password', label: '密码', required: true },
        ],
      },
    ],
    timestamp: new Date().toISOString(),
  };

  const mockAnalysisResponse = JSON.stringify({
    pageName: '登录页面',
    pagePurpose: '用户登录认证',
    businessScenarios: [
      {
        name: '用户登录',
        description: '使用邮箱和密码登录系统',
        userGoal: '成功登录并跳转到首页',
        involvedElements: ['input[name="email"]', 'input[name="password"]', 'button[type="submit"]'],
      },
    ],
    potentialFlows: [
      {
        flowId: 'login-flow',
        flowName: '用户登录流程',
        flowType: 'authentication',
        description: '用户通过邮箱密码登录系统',
        priority: 'P0',
        entryPoint: '/login',
        exitPoint: '/dashboard',
        steps: [
          {
            stepId: 'step-1',
            name: '输入邮箱',
            description: '在邮箱输入框中输入用户邮箱',
            action: 'fill',
            target: 'input[name="email"]',
            value: 'test@example.com',
            expectedOutcome: '邮箱输入框显示输入内容',
            criticalStep: true,
          },
          {
            stepId: 'step-2',
            name: '输入密码',
            description: '在密码输入框中输入密码',
            action: 'fill',
            target: 'input[name="password"]',
            value: 'password123',
            expectedOutcome: '密码输入框显示掩码内容',
            criticalStep: true,
          },
          {
            stepId: 'step-3',
            name: '点击登录',
            description: '点击登录按钮提交表单',
            action: 'click',
            target: 'button[type="submit"]',
            expectedOutcome: '表单提交，跳转到首页',
            criticalStep: true,
          },
        ],
        preconditions: ['用户已注册账号'],
        postconditions: ['用户已登录状态'],
        testData: { email: 'test@example.com', password: 'Test123456' },
        confidence: 0.95,
      },
    ],
    criticalElements: [
      {
        selector: 'input[name="email"]',
        elementName: '邮箱输入框',
        businessValue: '用户身份标识',
      },
      {
        selector: 'button[type="submit"]',
        elementName: '登录按钮',
        businessValue: '提交登录请求',
      },
    ],
    recommendations: ['建议添加登录失败的处理测试', '建议测试记住密码功能'],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    analyzer = new BusinessFlowAnalyzer(
      { useScreenshot: false, persistToKnowledgeBase: false },
      mockAiClient as any,
      null,
    );
  });

  describe('module exports', () => {
    it('should export BusinessFlowAnalyzer class', () => {
      expect(BusinessFlowAnalyzer).toBeDefined();
      expect(typeof BusinessFlowAnalyzer).toBe('function');
    });

    it('should export createBusinessFlowAnalyzer function', () => {
      expect(createBusinessFlowAnalyzer).toBeDefined();
      expect(typeof createBusinessFlowAnalyzer).toBe('function');
    });

    it('should create instance with default config', () => {
      const defaultAnalyzer = createBusinessFlowAnalyzer();
      expect(defaultAnalyzer).toBeInstanceOf(BusinessFlowAnalyzer);
    });
  });

  describe('analyzePage', () => {
    it('should analyze page and return business analysis', async () => {
      mockAiClient.chatWithRetry.mockResolvedValueOnce({
        content: mockAnalysisResponse,
      });

      const result = await analyzer.analyzePage(mockSnapshot, {
        platform: 'pc-web',
      });

      expect(result).toBeDefined();
      expect(result.pageName).toBe('登录页面');
      expect(result.potentialFlows).toHaveLength(1);
      expect(result.potentialFlows[0].flowId).toBe('login-flow');
    });

    it('should pass previous pages to the analysis', async () => {
      mockAiClient.chatWithRetry.mockResolvedValueOnce({
        content: mockAnalysisResponse,
      });

      await analyzer.analyzePage(mockSnapshot, {
        platform: 'pc-web',
        previousPages: [{ url: 'https://example.com', title: '首页' }],
      });

      expect(mockAiClient.chatWithRetry).toHaveBeenCalled();
    });

    it('should fallback to rule engine when AI fails', async () => {
      mockAiClient.chatWithRetry.mockRejectedValueOnce(new Error('AI error'));

      // When AI fails, analyzer should fallback to rule engine instead of throwing
      const result = await analyzer.analyzePage(mockSnapshot);

      // Rule engine should detect login form and return analysis
      expect(result).toBeDefined();
      expect(result.pageName).toBe('登录页面');
      expect(result.pagePurpose).toBeDefined();
      expect(result.potentialFlows).toBeDefined();
      // Rule engine detects login flow
      expect(result.potentialFlows.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeFlow', () => {
    it('should analyze cross-page flows', async () => {
      const mockFlowsResponse = JSON.stringify({
        flows: [
          {
            flowId: 'purchase-flow',
            flowName: '购物流程',
            flowType: 'shopping',
            description: '从浏览到购买的完整流程',
            priority: 'P1',
            steps: [
              {
                stepId: 's1',
                name: '浏览商品',
                description: '浏览商品列表',
                action: 'click',
                expectedOutcome: '显示商品详情',
                criticalStep: true,
              },
            ],
            preconditions: [],
            postconditions: [],
            confidence: 0.85,
          },
        ],
      });

      mockAiClient.chatWithRetry.mockResolvedValueOnce({
        content: `\`\`\`json\n${mockFlowsResponse}\n\`\`\``,
      });

      const pages = [
        { url: 'https://example.com', title: '首页' },
        { url: 'https://example.com/products', title: '商品列表' },
      ];

      const result = await analyzer.analyzeFlow(pages, { platform: 'pc-web' });

      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array on error', async () => {
      mockAiClient.chatWithRetry.mockRejectedValueOnce(new Error('AI error'));

      const pages = [
        { url: 'https://example.com', title: '首页' },
      ];

      const result = await analyzer.analyzeFlow(pages);

      expect(result).toEqual([]);
    });
  });

  describe('generateE2ETestCases', () => {
    it('should generate test cases from business flows', () => {
      const flows = [
        {
          flowId: 'login-flow',
          flowName: '登录流程',
          flowType: 'authentication' as const,
          description: '用户登录',
          priority: 'P0' as const,
          entryPoint: '/login',
          exitPoint: '/dashboard',
          steps: [
            {
              stepId: 's1',
              name: '输入邮箱',
              description: '输入邮箱',
              action: 'fill' as const,
              target: 'input[name="email"]',
              value: 'test@example.com',
              expectedOutcome: '邮箱已输入',
              criticalStep: true,
            },
          ],
          preconditions: [],
          postconditions: [],
          confidence: 0.9,
        },
      ];

      const testCases = analyzer.generateE2ETestCases(flows, {
        projectId: 'test-project',
        platform: 'pc-web',
      });

      expect(testCases).toHaveLength(1);
      expect(testCases[0].name).toContain('登录流程');
      expect(testCases[0].priority).toBe('P0');
      expect(testCases[0].metadata?.businessFlow).toBe(true);
      expect(testCases[0].metadata?.flowId).toBe('login-flow');
    });

    it('should return empty array for empty flows', () => {
      const testCases = analyzer.generateE2ETestCases([]);
      expect(testCases).toHaveLength(0);
    });
  });

  describe('identifyCriticalPath', () => {
    it('should identify critical steps from flows', () => {
      const flows = [
        {
          flowId: 'f1',
          flowName: 'Flow 1',
          flowType: 'authentication' as const,
          description: 'Test flow',
          priority: 'P0' as const,
          entryPoint: '/',
          steps: [
            {
              stepId: 's1',
              name: 'Step 1',
              description: 'Critical step',
              action: 'click' as const,
              expectedOutcome: 'OK',
              criticalStep: true,
            },
            {
              stepId: 's2',
              name: 'Step 2',
              description: 'Non-critical step',
              action: 'click' as const,
              expectedOutcome: 'OK',
              criticalStep: false,
            },
          ],
          preconditions: [],
          postconditions: [],
          confidence: 0.9,
        },
      ];

      const criticalSteps = analyzer.identifyCriticalPath(flows);

      expect(criticalSteps).toHaveLength(1);
      expect(criticalSteps[0].stepId).toBe('s1');
    });
  });
});

describe('business-flow.prompt', () => {
  describe('buildBusinessFlowPrompt', () => {
    it('should build text prompt with page info', () => {
      const prompt = buildBusinessFlowPrompt({
        url: 'https://example.com',
        title: 'Test Page',
        platform: 'pc-web',
        interactiveElements: [
          {
            tag: 'button',
            selector: '#submit',
            type: 'button',
            text: 'Submit',
            attributes: {},
          },
        ],
        forms: [],
      });

      expect(prompt).toContain('https://example.com');
      expect(prompt).toContain('Test Page');
      expect(prompt).toContain('pc-web');
    });

    it('should include previous pages when provided', () => {
      const prompt = buildBusinessFlowPrompt({
        url: 'https://example.com/page2',
        title: 'Page 2',
        platform: 'pc-web',
        interactiveElements: [],
        forms: [],
        previousPages: [
          { url: 'https://example.com', title: 'Home' },
        ],
      });

      expect(prompt).toContain('已访问页面');
      expect(prompt).toContain('Home');
    });
  });

  describe('buildBusinessFlowWithScreenshotPrompt', () => {
    it('should build multimodal prompt with screenshot', () => {
      const promptParts = buildBusinessFlowWithScreenshotPrompt({
        url: 'https://example.com',
        title: 'Test Page',
        platform: 'pc-web',
        interactiveElements: [],
        forms: [],
        screenshotBase64: 'base64imagedata',
      });

      expect(promptParts).toHaveLength(3);
      expect(promptParts[0].type).toBe('text');
      expect(promptParts[1].type).toBe('image');
      expect(promptParts[2].type).toBe('text');
    });
  });

  describe('buildCrossPageFlowPrompt', () => {
    it('should build cross-page flow prompt', () => {
      const prompt = buildCrossPageFlowPrompt({
        pages: [
          { url: 'https://example.com', title: 'Home', keyElements: ['#nav'] },
          { url: 'https://example.com/products', title: 'Products', keyElements: ['.product-list'] },
        ],
        platform: 'pc-web',
      });

      expect(prompt).toContain('跨页面业务流');
      expect(prompt).toContain('Home');
      expect(prompt).toContain('Products');
    });
  });

  describe('parseBusinessFlowAnalysis', () => {
    it('should parse valid JSON response', () => {
      const validResponse = JSON.stringify({
        pageName: 'Test Page',
        pagePurpose: 'Test purpose',
        businessScenarios: [],
        potentialFlows: [],
        criticalElements: [],
        recommendations: [],
      });

      const result = parseBusinessFlowAnalysis(validResponse);

      expect(result.pageName).toBe('Test Page');
    });

    it('should parse JSON wrapped in code block', () => {
      const wrappedResponse = `\`\`\`json
${JSON.stringify({
  pageName: 'Test Page',
  pagePurpose: 'Test purpose',
  businessScenarios: [],
  potentialFlows: [],
  criticalElements: [],
  recommendations: [],
})}
\`\`\``;

      const result = parseBusinessFlowAnalysis(wrappedResponse);

      expect(result.pageName).toBe('Test Page');
    });

    it('should throw error for invalid JSON', () => {
      expect(() => parseBusinessFlowAnalysis('not valid json')).toThrow();
    });
  });

  describe('schemas', () => {
    it('should validate business step schema', () => {
      const validStep = {
        stepId: 's1',
        name: 'Test Step',
        description: 'Test description',
        action: 'click' as const,
        expectedOutcome: 'Success',
        criticalStep: true,
      };

      const result = businessStepSchema.parse(validStep);
      expect(result.stepId).toBe('s1');
    });

    it('should validate business flow schema', () => {
      const validFlow = {
        flowId: 'f1',
        flowName: 'Test Flow',
        flowType: 'authentication' as const,
        description: 'Test flow description',
        priority: 'P0' as const,
        entryPoint: '/login',
        steps: [],
        preconditions: [],
        postconditions: [],
        confidence: 0.9,
      };

      const result = businessFlowSchema.parse(validFlow);
      expect(result.flowId).toBe('f1');
    });
  });
});
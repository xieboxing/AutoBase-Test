import { describe, it, expect, beforeEach } from 'vitest';
import { FailureAnalyzer, analyzeFailure } from '@/ai/failure-analyzer.js';
import { buildAnalyzeFailurePrompt, parseFailureAnalysisResult, classifyFailureQuick } from '@/ai/prompts/analyze-failure.prompt.js';
import type { FailureContext } from '@/ai/prompts/analyze-failure.prompt.js';
import type { PageSnapshot } from '@/types/crawler.types.js';

// Define mock data at file level for all test blocks
const defaultMockContext: FailureContext = {
  testCaseId: 'tc-001',
  testCaseName: 'Login Test',
  failedStep: {
    order: 2,
    action: 'click',
    target: 'button[type="submit"]',
    description: 'Click login button',
  },
  errorMessage: 'Element not found: button[type="submit"]',
  timestamp: new Date().toISOString(),
  retryCount: 2,
  previousSteps: [
    { order: 1, action: 'navigate', status: 'passed' },
  ],
};

const defaultMockSnapshot: PageSnapshot = {
  url: 'https://example.com/login',
  title: 'Login',
  html: '<html><body><form><button>Login</button></form></body></html>',
  interactiveElements: [
    {
      selector: 'button',
      tag: 'button',
      text: 'Login',
      attributes: {},
      visible: true,
      clickable: true,
      position: { x: 0, y: 0, width: 100, height: 50 },
    },
  ],
  forms: [],
  metadata: {
    capturedAt: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    loadTime: 1000,
  },
};

describe('FailureAnalyzer', () => {
  let analyzer: FailureAnalyzer;
  let mockContext: FailureContext;
  let mockSnapshot: PageSnapshot;

  beforeEach(() => {
    analyzer = new FailureAnalyzer({ useAi: false });
    mockContext = { ...defaultMockContext };
    mockSnapshot = { ...defaultMockSnapshot };
  });

  describe('analyze', () => {
    it('should analyze with rules engine when AI is disabled', async () => {
      const result = await analyzer.analyze(mockContext);

      expect(result.possibleCauses.length).toBeGreaterThan(0);
      expect(result.category).toBeDefined();
      expect(result.severity).toBeDefined();
      expect(result.analyzerType).toBe('rules');
    });

    it('should classify element-not-found errors', async () => {
      const result = await analyzer.analyze(mockContext);

      expect(result.category).toBe('element-not-found');
      expect(result.isTestIssue).toBe(true);
    });

    it('should classify timeout errors', async () => {
      const timeoutContext: FailureContext = {
        ...mockContext,
        errorMessage: 'Timeout waiting for element',
      };

      const result = await analyzer.analyze(timeoutContext);

      expect(result.category).toBe('timeout');
    });

    it('should classify assertion errors', async () => {
      const assertionContext: FailureContext = {
        ...mockContext,
        errorMessage: 'Assertion failed: expected true but got false',
      };

      const result = await analyzer.analyze(assertionContext);

      expect(result.category).toBe('assertion-failed');
      expect(result.isProductBug).toBe(true);
    });

    it('should classify network errors', async () => {
      const networkContext: FailureContext = {
        ...mockContext,
        errorMessage: 'Network error: failed to fetch',
      };

      const result = await analyzer.analyze(networkContext);

      expect(result.category).toBe('network-error');
    });

    it('should use snapshot for better analysis', async () => {
      const result = await analyzer.analyze(mockContext, mockSnapshot);

      expect(result.possibleCauses.length).toBeGreaterThan(0);
    });

    it('should mark auto-fixable for element-not-found', async () => {
      const result = await analyzer.analyze(mockContext);

      expect(result.autoFixable).toBe(true);
    });

    it('should determine severity based on step order', async () => {
      const earlyFailure: FailureContext = {
        ...mockContext,
        failedStep: { ...mockContext.failedStep, order: 1 },
      };

      const result = await analyzer.analyze(earlyFailure);

      expect(result.severity).toBe('critical');
    });
  });

  describe('analyzeBatch', () => {
    it('should analyze multiple failures', async () => {
      const contexts = [
        { context: mockContext },
        { context: { ...mockContext, errorMessage: 'Timeout error' } },
      ];

      const results = await analyzer.analyzeBatch(contexts);

      expect(results.length).toBe(2);
      expect(results[0].category).toBe('element-not-found');
      expect(results[1].category).toBe('timeout');
    });
  });
});

describe('analyzeFailure', () => {
  it('should be a shortcut function', async () => {
    const result = await analyzeFailure(defaultMockContext, undefined, { useAi: false });

    expect(result.category).toBeDefined();
    expect(result.possibleCauses.length).toBeGreaterThan(0);
  });
});

describe('analyze-failure.prompt', () => {
  describe('buildAnalyzeFailurePrompt', () => {
    it('should build prompt with context', () => {
      const prompt = buildAnalyzeFailurePrompt({ context: defaultMockContext });

      expect(prompt).toContain('tc-001');
      expect(prompt).toContain('Login Test');
      expect(prompt).toContain('Element not found');
    });

    it('should include page HTML', () => {
      const prompt = buildAnalyzeFailurePrompt({
        context: defaultMockContext,
        pageHtml: '<html></html>',
      });

      expect(prompt).toContain('<html></html>');
    });

    it('should include interactive elements', () => {
      const prompt = buildAnalyzeFailurePrompt({
        context: defaultMockContext,
        interactiveElements: [{ selector: 'button', text: 'Login', visible: true }],
      });

      expect(prompt).toContain('button');
    });
  });

  describe('parseFailureAnalysisResult', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        possibleCauses: ['Cause 1'],
        isProductBug: false,
        isTestIssue: true,
        confidence: 0.8,
        fixSuggestions: ['Fix 1'],
        category: 'element-not-found',
        severity: 'high',
      });

      const result = parseFailureAnalysisResult(json);

      expect(result.possibleCauses.length).toBe(1);
      expect(result.category).toBe('element-not-found');
    });

    it('should parse JSON in code block', () => {
      const content = '```json\n{"possibleCauses":["Cause"],"isProductBug":false,"isTestIssue":true,"confidence":0.8,"fixSuggestions":[],"category":"timeout","severity":"medium"}\n```';

      const result = parseFailureAnalysisResult(content);

      expect(result.category).toBe('timeout');
    });
  });

  describe('classifyFailureQuick', () => {
    it('should classify element-not-found', () => {
      const category = classifyFailureQuick('Element not found');

      expect(category).toBe('element-not-found');
    });

    it('should classify timeout', () => {
      const category = classifyFailureQuick('Timeout waiting for element');

      expect(category).toBe('timeout');
    });

    it('should classify assertion-failed', () => {
      const category = classifyFailureQuick('Assertion failed');

      expect(category).toBe('assertion-failed');
    });

    it('should classify network-error', () => {
      const category = classifyFailureQuick('Network error occurred');

      expect(category).toBe('network-error');
    });

    it('should classify permission-denied', () => {
      const category = classifyFailureQuick('Permission denied');

      expect(category).toBe('permission-denied');
    });

    it('should return other for unknown errors', () => {
      const category = classifyFailureQuick('Unknown error');

      expect(category).toBe('other');
    });
  });
});
import { describe, it, expect, beforeEach } from 'vitest';
import { CaseGenerator, generateTestCases } from '@/ai/case-generator.js';
import { buildGenerateCasesPrompt, parseGenerateCasesResult } from '@/ai/prompts/generate-cases.prompt.js';
import type { PageSnapshot } from '@/types/crawler.types.js';
import type { PageAnalysisResult } from '@/types/ai.types.js';

// Define mock data at file level for all test blocks
const defaultMockSnapshot: PageSnapshot = {
  url: 'https://example.com/login',
  title: 'Login Page',
  html: '<html><body><form><input name="email"><input name="password"><button type="submit">Login</button></form></body></html>',
  interactiveElements: [
    {
      selector: 'input[name="email"]',
      tag: 'input',
      text: '',
      attributes: { name: 'email', type: 'email' },
      visible: true,
      clickable: true,
      position: { x: 0, y: 0, width: 200, height: 30 },
    },
    {
      selector: 'input[name="password"]',
      tag: 'input',
      text: '',
      attributes: { name: 'password', type: 'password' },
      visible: true,
      clickable: true,
      position: { x: 0, y: 30, width: 200, height: 30 },
    },
    {
      selector: 'button[type="submit"]',
      tag: 'button',
      text: 'Login',
      attributes: { type: 'submit' },
      visible: true,
      clickable: true,
      position: { x: 0, y: 60, width: 100, height: 40 },
    },
  ],
  forms: [
    {
      selector: 'form',
      fields: [
        { selector: 'input[name="email"]', name: 'email', type: 'email', required: true },
        { selector: 'input[name="password"]', name: 'password', type: 'password', required: true },
      ],
    },
  ],
  metadata: {
    capturedAt: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 },
    loadTime: 1000,
  },
};

const defaultMockAnalysis: PageAnalysisResult = {
  pageDescription: 'Login page with email and password fields',
  testableFeatures: [
    {
      name: 'Login Success Test',
      priority: 'P0',
      description: 'Test successful login flow',
      suggestedSteps: ['Enter email', 'Enter password', 'Click login', 'Verify redirect'],
      type: 'functional',
    },
    {
      name: 'Login Failure Test',
      priority: 'P1',
      description: 'Test login with invalid credentials',
      suggestedSteps: ['Enter invalid email', 'Click login', 'Verify error message'],
      type: 'functional',
    },
  ],
  potentialRisks: [],
  suggestedTestData: {},
};

describe('CaseGenerator', () => {
  let generator: CaseGenerator;
  let mockSnapshot: PageSnapshot;
  let mockAnalysis: PageAnalysisResult;

  beforeEach(() => {
    generator = new CaseGenerator({ useAi: false });
    mockSnapshot = JSON.parse(JSON.stringify(defaultMockSnapshot));
    mockAnalysis = JSON.parse(JSON.stringify(defaultMockAnalysis));
  });

  describe('generateFromSnapshot', () => {
    it('should generate test cases with rules engine', async () => {
      const cases = await generator.generateFromSnapshot(mockSnapshot);

      expect(cases.length).toBeGreaterThan(0);
      expect(cases[0].id).toBeDefined();
      expect(cases[0].name).toBeDefined();
      expect(cases[0].steps.length).toBeGreaterThan(0);
    });

    it('should generate smoke test case', async () => {
      const cases = await generator.generateFromSnapshot(mockSnapshot);

      const smokeCase = cases.find(c => c.name.includes('冒烟测试'));
      expect(smokeCase).toBeDefined();
      expect(smokeCase?.priority).toBe('P0');
      expect(smokeCase?.tags).toContain('smoke');
    });

    it('should generate form test cases', async () => {
      const cases = await generator.generateFromSnapshot(mockSnapshot);

      const formCases = cases.filter(c => c.tags.includes('form'));
      expect(formCases.length).toBeGreaterThan(0);
    });

    it('should use correct platform', async () => {
      const h5Generator = new CaseGenerator({ useAi: false, platform: 'h5-web' });
      const cases = await h5Generator.generateFromSnapshot(mockSnapshot);

      expect(cases[0].platform).toContain('h5-web');
    });

    it('should skip navigation tests when disabled', async () => {
      const noNavGenerator = new CaseGenerator({
        useAi: false,
        generateNavigationTests: false,
      });
      const cases = await noNavGenerator.generateFromSnapshot(mockSnapshot);

      const navCase = cases.find(c => c.tags.includes('navigation'));
      expect(navCase).toBeUndefined();
    });
  });

  describe('generateBatch', () => {
    it('should generate cases for multiple snapshots', async () => {
      const snapshots = [mockSnapshot, { ...mockSnapshot, url: 'https://example.com/home' }];
      const cases = await generator.generateBatch(snapshots);

      expect(cases.length).toBeGreaterThan(0);
    });
  });

  describe('normalizeTestCase', () => {
    it('should normalize raw test case', () => {
      // Access private method through casting
      const gen = generator as any;

      const rawCase = {
        name: 'Test Case',
        steps: [{ action: 'click' }, { action: 'fill', value: 'test' }],
      };

      const normalized = gen.normalizeTestCase(rawCase);

      expect(normalized.id).toBeDefined();
      expect(normalized.priority).toBe('P2'); // default
      expect(normalized.platform).toEqual(['pc-web']);
      expect(normalized.steps[0].order).toBe(1);
      expect(normalized.steps[1].order).toBe(2);
    });
  });

  describe('getDefaultValueForType', () => {
    it('should return correct default values', () => {
      const gen = generator as any;

      expect(gen.getDefaultValueForType('email')).toBe('test@example.com');
      expect(gen.getDefaultValueForType('password')).toBe('Test123456!');
      expect(gen.getDefaultValueForType('tel')).toBe('13800138000');
      expect(gen.getDefaultValueForType('number')).toBe('100');
      expect(gen.getDefaultValueForType('url')).toBe('https://example.com');
      expect(gen.getDefaultValueForType('date')).toBe('2024-01-01');
      expect(gen.getDefaultValueForType('text')).toBe('测试文本');
    });
  });
});

describe('generateTestCases', () => {
  it('should be a shortcut function', async () => {
    const mockSnapshot: PageSnapshot = {
      url: 'https://test.com',
      title: 'Test',
      html: '<html></html>',
      interactiveElements: [],
      forms: [],
      metadata: {
        capturedAt: new Date().toISOString(),
        viewport: { width: 1920, height: 1080 },
        loadTime: 100,
      },
    };

    const cases = await generateTestCases(mockSnapshot, { useAi: false });

    expect(cases.length).toBeGreaterThan(0);
  });
});

describe('generate-cases.prompt', () => {
  describe('buildGenerateCasesPrompt', () => {
    it('should build prompt with all parameters', () => {
      const prompt = buildGenerateCasesPrompt({
        pageUrl: 'https://example.com',
        pageTitle: 'Example',
        platform: 'pc-web',
        pageAnalysis: defaultMockAnalysis,
        interactiveElements: [],
        forms: [],
      });

      expect(prompt).toContain('https://example.com');
      expect(prompt).toContain('Example');
      expect(prompt).toContain('pc-web');
    });
  });

  describe('parseGenerateCasesResult', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        cases: [
          {
            id: 'tc-001',
            name: 'Test Case',
            description: 'Description',
            priority: 'P0',
            type: 'functional',
            platform: ['pc-web'],
            tags: ['smoke'],
            steps: [{ order: 1, action: 'navigate', description: 'Open page' }],
          },
        ],
        summary: {
          total: 1,
          byPriority: { P0: 1 },
          byType: { functional: 1 },
        },
      });

      const result = parseGenerateCasesResult(json);

      expect(result.cases.length).toBe(1);
      expect(result.cases[0].id).toBe('tc-001');
    });

    it('should parse JSON in code block', () => {
      const content = '```json\n{"cases":[{"id":"tc-001","name":"Test","description":"","priority":"P2","type":"functional","platform":["pc-web"],"tags":[],"steps":[]}],"summary":{"total":1,"byPriority":{},"byType":{}}}\n```';

      const result = parseGenerateCasesResult(content);

      expect(result.cases.length).toBe(1);
    });

    it('should throw on invalid JSON', () => {
      expect(() => parseGenerateCasesResult('invalid')).toThrow();
    });
  });
});
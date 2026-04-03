import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PageAnalyzer, analyzePage } from '@/ai/analyzer.js';
import { buildAnalyzePagePrompt, parsePageAnalysisResult } from '@/ai/prompts/analyze-page.prompt.js';
import type { PageSnapshot } from '@/types/crawler.types.js';

describe('PageAnalyzer', () => {
  let analyzer: PageAnalyzer;
  let mockSnapshot: PageSnapshot;

  beforeEach(() => {
    analyzer = new PageAnalyzer({ useAi: false });

    mockSnapshot = {
      url: 'https://example.com',
      title: 'Example Page',
      html: '<html><body><button>Click</button><a href="/link">Link</a></body></html>',
      interactiveElements: [
        {
          selector: 'button',
          tag: 'button',
          text: 'Click',
          attributes: {},
          visible: true,
          clickable: true,
          position: { x: 0, y: 0, width: 100, height: 50 },
        },
        {
          selector: 'a',
          tag: 'a',
          text: 'Link',
          attributes: { href: '/link' },
          visible: true,
          clickable: true,
          position: { x: 0, y: 50, width: 50, height: 20 },
        },
      ],
      forms: [],
      metadata: {
        capturedAt: new Date().toISOString(),
        viewport: { width: 1920, height: 1080 },
        loadTime: 1000,
      },
    };
  });

  describe('analyze', () => {
    it('should analyze page with rules engine when AI is disabled', async () => {
      const result = await analyzer.analyze(mockSnapshot);

      expect(result.pageDescription).toBeDefined();
      expect(result.testableFeatures.length).toBeGreaterThan(0);
      expect(result.potentialRisks).toBeDefined();
      expect(result.suggestedTestData).toBeDefined();
    });

    it('should include smoke test in features', async () => {
      const result = await analyzer.analyze(mockSnapshot);

      const smokeTest = result.testableFeatures.find(f => f.name.includes('冒烟测试'));
      expect(smokeTest).toBeDefined();
      expect(smokeTest?.priority).toBe('P0');
    });

    it('should analyze buttons', async () => {
      const result = await analyzer.analyze(mockSnapshot);

      const buttonTest = result.testableFeatures.find(f => f.name.includes('按钮'));
      expect(buttonTest).toBeDefined();
    });

    it('should analyze links', async () => {
      const result = await analyzer.analyze(mockSnapshot);

      const linkTest = result.testableFeatures.find(f => f.name.includes('链接'));
      expect(linkTest).toBeDefined();
    });

    it('should analyze forms', async () => {
      const snapshotWithForm: PageSnapshot = {
        ...mockSnapshot,
        forms: [
          {
            selector: 'form',
            fields: [
              { selector: 'input[name="email"]', name: 'email', type: 'email', required: true },
              { selector: 'input[name="password"]', name: 'password', type: 'password', required: true },
            ],
          },
        ],
      };

      const result = await analyzer.analyze(snapshotWithForm);

      const formTest = result.testableFeatures.find(f => f.name.includes('表单'));
      expect(formTest).toBeDefined();
      expect(formTest?.priority).toBe('P0');
    });

    it('should detect potential risks', async () => {
      const snapshotWithRisk: PageSnapshot = {
        ...mockSnapshot,
        interactiveElements: [
          ...mockSnapshot.interactiveElements,
          {
            selector: '.hidden-btn',
            tag: 'button',
            text: '',
            attributes: {},
            visible: false,
            clickable: true,
            position: { x: 0, y: 0, width: 0, height: 0 },
          },
        ],
      };

      const result = await analyzer.analyze(snapshotWithRisk);

      expect(result.potentialRisks.length).toBeGreaterThan(0);
    });
  });

  describe('analyzeBatch', () => {
    it('should analyze multiple snapshots', async () => {
      const snapshots = [mockSnapshot, { ...mockSnapshot, url: 'https://example2.com' }];

      const results = await analyzer.analyzeBatch(snapshots);

      expect(results.length).toBe(2);
      expect(results[0].testableFeatures.length).toBeGreaterThan(0);
      expect(results[1].testableFeatures.length).toBeGreaterThan(0);
    });

    it('should handle errors gracefully', async () => {
      // Create a malformed snapshot that would cause an error
      const badSnapshot: PageSnapshot = {
        url: '',
        title: '',
        html: '',
        interactiveElements: [],
        forms: [],
        metadata: {
          capturedAt: '',
          viewport: { width: 0, height: 0 },
          loadTime: 0,
        },
      };

      const results = await analyzer.analyzeBatch([mockSnapshot, badSnapshot]);

      expect(results.length).toBe(2);
      // Second result should still have some content (graceful degradation)
      expect(results[1].pageDescription).toBeDefined();
    });
  });
});

describe('analyzePage', () => {
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

    const result = await analyzePage(mockSnapshot, { useAi: false });

    expect(result.pageDescription).toBeDefined();
    expect(result.testableFeatures).toBeDefined();
  });
});

describe('analyze-page.prompt', () => {
  describe('buildAnalyzePagePrompt', () => {
    it('should build prompt with all parameters', () => {
      const prompt = buildAnalyzePagePrompt({
        url: 'https://example.com',
        title: 'Example',
        html: '<html></html>',
        interactiveElements: [],
        forms: [],
        platform: 'pc',
      });

      expect(prompt).toContain('https://example.com');
      expect(prompt).toContain('Example');
      expect(prompt).toContain('PC');
    });

    it('should handle h5 platform', () => {
      const prompt = buildAnalyzePagePrompt({
        url: 'https://m.example.com',
        title: 'Mobile',
        html: '<html></html>',
        interactiveElements: [],
        forms: [],
        platform: 'h5',
      });

      expect(prompt).toContain('H5');
    });
  });

  describe('parsePageAnalysisResult', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        pageDescription: 'Test page',
        testableFeatures: [
          {
            name: 'Test',
            priority: 'P0',
            description: 'Desc',
            suggestedSteps: ['Step 1'],
            type: 'functional',
          },
        ],
        potentialRisks: ['Risk 1'],
        suggestedTestData: { field1: ['data1'] },
      });

      const result = parsePageAnalysisResult(json);

      expect(result.pageDescription).toBe('Test page');
      expect(result.testableFeatures.length).toBe(1);
    });

    it('should parse JSON in code block', () => {
      const content = '```json\n{"pageDescription":"Test","testableFeatures":[],"potentialRisks":[],"suggestedTestData":{}}\n```';

      const result = parsePageAnalysisResult(content);

      expect(result.pageDescription).toBe('Test');
    });

    it('should throw on invalid JSON', () => {
      expect(() => parsePageAnalysisResult('invalid')).toThrow();
    });
  });
});
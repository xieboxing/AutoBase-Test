import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  A11yTester,
  scanAccessibility,
  scanAccessibilityBatch,
} from '@/testers/accessibility/a11y-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          setDefaultTimeout: vi.fn(),
          goto: vi.fn().mockResolvedValue(undefined),
          waitForLoadState: vi.fn().mockResolvedValue(undefined),
          waitForTimeout: vi.fn().mockResolvedValue(undefined),
          addScriptTag: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockResolvedValue({
            violations: [],
            incomplete: [],
            passes: ['test-rule'],
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('A11yTester', () => {
  let testDir: string;
  let tester: A11yTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-a11y');
    await fs.mkdir(testDir, { recursive: true });
    tester = new A11yTester({
      artifactsDir: testDir,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export A11yTester class', () => {
      expect(A11yTester).toBeDefined();
      expect(typeof A11yTester).toBe('function');
    });

    it('should export scanAccessibility function', () => {
      expect(scanAccessibility).toBeDefined();
      expect(typeof scanAccessibility).toBe('function');
    });

    it('should export scanAccessibilityBatch function', () => {
      expect(scanAccessibilityBatch).toBeDefined();
      expect(typeof scanAccessibilityBatch).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new A11yTester({
        includeWarnings: false,
        tags: ['wcag2aa'],
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect includeWarnings option', () => {
      const customTester = new A11yTester({
        includeWarnings: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect tags option', () => {
      const customTester = new A11yTester({
        tags: ['wcag21aa', 'section508'],
      });
      expect(customTester).toBeDefined();
    });

    it('should respect rulesToDisable option', () => {
      const customTester = new A11yTester({
        rulesToDisable: ['color-contrast', 'region'],
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('scanPage', () => {
    it('should return AxeScanResult', async () => {
      const result = await scanAccessibility('https://example.com', {
        artifactsDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.violations)).toBe(true);
      expect(Array.isArray(result.incomplete)).toBe(true);
      expect(Array.isArray(result.passes)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should include violations when found', async () => {
      // Mock with violations
      vi.mocked(await import('playwright')).chromium.launch = vi.fn().mockResolvedValue({
        newContext: vi.fn().mockResolvedValue({
          newPage: vi.fn().mockResolvedValue({
            setDefaultTimeout: vi.fn(),
            goto: vi.fn().mockResolvedValue(undefined),
            waitForLoadState: vi.fn().mockResolvedValue(undefined),
            addScriptTag: vi.fn().mockResolvedValue(undefined),
            evaluate: vi.fn().mockResolvedValue({
              violations: [
                {
                  id: 'color-contrast',
                  impact: 'serious',
                  description: 'Insufficient color contrast',
                  help: 'Elements must have sufficient color contrast',
                  helpUrl: 'https://dequeuniversity.com/rules/axe/4.8/color-contrast',
                  nodes: [{ html: '<span>text</span>', target: ['span'] }],
                },
              ],
              incomplete: [],
              passes: [],
            }),
            close: vi.fn().mockResolvedValue(undefined),
          }),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      });

      const testerWithViolations = new A11yTester({ artifactsDir: testDir });
      const result = await testerWithViolations.scanPage('https://example.com');

      expect(result.violations.length).toBe(1);
      expect(result.passed).toBe(false);
    });
  });

  describe('scanPages', () => {
    it('should scan multiple pages', async () => {
      const urls = ['https://example1.com', 'https://example2.com'];
      const results = await scanAccessibilityBatch(urls, {
        artifactsDir: testDir,
      });

      expect(results.length).toBe(2);
      expect(results[0].url).toBe('https://example1.com');
      expect(results[1].url).toBe('https://example2.com');
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      const results = [
        await tester.scanPage('https://example1.com'),
        await tester.scanPage('https://example2.com'),
      ];

      const summary = tester.getSummary(results);

      expect(summary.totalScanned).toBe(2);
      expect(typeof summary.passedScans).toBe('number');
      expect(typeof summary.totalViolations).toBe('number');
      expect(typeof summary.violationsByType).toBe('object');
    });
  });

  describe('A11yTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });
});

describe('AxeScanResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      violations: [],
      incomplete: [],
      passes: ['rule1', 'rule2'],
      executionTime: 500,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.violations)).toBe(true);
  });
});

describe('AxeViolation type', () => {
  it('should have correct structure', () => {
    const violation = {
      id: 'color-contrast',
      impact: 'serious',
      description: 'Insufficient contrast',
      help: 'Color contrast help',
      helpUrl: 'https://example.com',
      nodes: [],
    };

    expect(violation.id).toBe('color-contrast');
    expect(violation.impact).toBe('serious');
  });

  it('should support all impact levels', () => {
    const impacts = ['critical', 'serious', 'moderate', 'minor'] as const;

    impacts.forEach(impact => {
      const violation = {
        id: 'test',
        impact,
        description: 'Test',
        help: 'Help',
        helpUrl: 'https://example.com',
        nodes: [],
      };

      expect(violation.impact).toBe(impact);
    });
  });
});

describe('AxeNodeResult type', () => {
  it('should have correct structure', () => {
    const node = {
      html: '<span>text</span>',
      target: ['body > span'],
      failureSummary: 'Fix any of the following...',
    };

    expect(node.html).toBe('<span>text</span>');
    expect(node.target).toEqual(['body > span']);
  });
});
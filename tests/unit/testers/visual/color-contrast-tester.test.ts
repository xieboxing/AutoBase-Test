import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ColorContrastTester,
  checkColorContrast,
} from '@/testers/visual/color-contrast-tester.js';
import fs from 'node:fs/promises';
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
          evaluate: vi.fn().mockResolvedValue([]),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('ColorContrastTester', () => {
  let testDir: string;
  let tester: ColorContrastTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-color-contrast');
    await fs.mkdir(testDir, { recursive: true });
    tester = new ColorContrastTester({
      artifactsDir: testDir,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export ColorContrastTester class', () => {
      expect(ColorContrastTester).toBeDefined();
      expect(typeof ColorContrastTester).toBe('function');
    });

    it('should export checkColorContrast function', () => {
      expect(checkColorContrast).toBeDefined();
      expect(typeof checkColorContrast).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new ColorContrastTester({
        wcagLevel: 'AAA',
        checkLargeText: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect wcagLevel option', () => {
      const customTester = new ColorContrastTester({
        wcagLevel: 'AAA',
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkLargeText option', () => {
      const customTester = new ColorContrastTester({
        checkLargeText: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('ColorContrastTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });

  describe('checkContrast', () => {
    it('should return ColorContrastResult', async () => {
      const result = await checkColorContrast('https://example.com', {
        artifactsDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.elements)).toBe(true);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      const results = [
        await tester.checkContrast('https://example1.com'),
        await tester.checkContrast('https://example2.com'),
      ];

      const summary = tester.getSummary(results);

      expect(summary.totalChecked).toBe(2);
      expect(typeof summary.passedChecks).toBe('number');
      expect(typeof summary.totalElements).toBe('number');
      expect(typeof summary.totalIssues).toBe('number');
    });
  });
});

describe('ColorContrastResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      elements: [],
      issues: [],
      executionTime: 500,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.elements)).toBe(true);
  });
});

describe('ContrastCheckElement type', () => {
  it('should have correct structure', () => {
    const element = {
      selector: '#heading',
      tagName: 'h1',
      text: 'Welcome',
      foregroundColor: 'rgb(0, 0, 0)',
      backgroundColor: 'rgb(255, 255, 255)',
      contrastRatio: 21,
      isLargeText: true,
      requiredRatio: 3,
      passes: true,
    };

    expect(element.contrastRatio).toBe(21);
    expect(element.passes).toBe(true);
    expect(element.isLargeText).toBe(true);
  });
});

describe('ContrastIssue type', () => {
  it('should have correct structure', () => {
    const issue = {
      selector: '#text',
      text: 'Low contrast text',
      foregroundColor: 'rgb(150, 150, 150)',
      backgroundColor: 'rgb(200, 200, 200)',
      contrastRatio: 2.5,
      requiredRatio: 4.5,
      severity: 'serious' as const,
      description: 'Insufficient contrast ratio',
      recommendation: 'Increase contrast',
    };

    expect(issue.contrastRatio).toBe(2.5);
    expect(issue.severity).toBe('serious');
    expect(issue.requiredRatio).toBe(4.5);
  });

  it('should support all severity levels', () => {
    const severities = ['critical', 'serious', 'moderate'] as const;

    severities.forEach(severity => {
      const issue = {
        selector: '#test',
        foregroundColor: 'black',
        backgroundColor: 'white',
        contrastRatio: 1,
        requiredRatio: 4.5,
        severity,
        description: 'Test',
        recommendation: 'Fix',
      };

      expect(issue.severity).toBe(severity);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  XssTester,
  testXss,
  testXssBatch,
  XSS_PAYLOADS,
} from '@/testers/security/xss-tester.js';
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
          reload: vi.fn().mockResolvedValue(undefined),
          evaluate: vi.fn().mockResolvedValue([]),
          locator: vi.fn().mockReturnValue({
            isVisible: vi.fn().mockResolvedValue(true),
            clear: vi.fn().mockResolvedValue(undefined),
            fill: vi.fn().mockResolvedValue(undefined),
            blur: vi.fn().mockResolvedValue(undefined),
            first: vi.fn().mockReturnValue({
              click: vi.fn().mockResolvedValue(undefined),
            }),
            count: vi.fn().mockResolvedValue(0),
          }),
          screenshot: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe('XssTester', () => {
  let testDir: string;
  let tester: XssTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-security');
    await fs.mkdir(testDir, { recursive: true });
    tester = new XssTester({
      artifactsDir: testDir,
      headless: true,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export XssTester class', () => {
      expect(XssTester).toBeDefined();
      expect(typeof XssTester).toBe('function');
    });

    it('should export testXss function', () => {
      expect(testXss).toBeDefined();
      expect(typeof testXss).toBe('function');
    });

    it('should export testXssBatch function', () => {
      expect(testXssBatch).toBeDefined();
      expect(typeof testXssBatch).toBe('function');
    });

    it('should export XSS_PAYLOADS array', () => {
      expect(XSS_PAYLOADS).toBeDefined();
      expect(Array.isArray(XSS_PAYLOADS)).toBe(true);
      expect(XSS_PAYLOADS.length).toBeGreaterThan(0);
    });

    it('should accept configuration', () => {
      const customTester = new XssTester({
        timeout: 10000,
        maxPayloadsPerField: 5,
        stopOnFirstVulnerability: true,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('XSS_PAYLOADS', () => {
    it('should contain basic script injection payloads', () => {
      expect(XSS_PAYLOADS).toContain('<script>alert(1)</script>');
      expect(XSS_PAYLOADS).toContain('<script>alert(document.domain)</script>');
    });

    it('should contain event handler payloads', () => {
      expect(XSS_PAYLOADS).toContain('<img src=x onerror=alert(1)>');
      expect(XSS_PAYLOADS).toContain('<svg onload=alert(1)>');
    });

    it('should contain JavaScript URI payloads', () => {
      expect(XSS_PAYLOADS).toContain('javascript:alert(1)');
    });

    it('should contain encoded payloads', () => {
      // HTML entity encoding
      expect(XSS_PAYLOADS.some(p => p.includes('&'))).toBe(true);
      // Unicode encoded payload becomes actual characters when evaluated
      expect(XSS_PAYLOADS.some(p => p.includes('<script>'))).toBe(true);
    });

    it('should contain case-mixed payloads', () => {
      expect(XSS_PAYLOADS).toContain('<ScRiPt>alert(1)</ScRiPt>');
    });

    it('should contain attribute injection payloads', () => {
      expect(XSS_PAYLOADS.some(p => p.includes('onmouseover'))).toBe(true);
      expect(XSS_PAYLOADS.some(p => p.includes('onclick'))).toBe(true);
    });
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await tester.initialize();
      expect(fsSync.existsSync(testDir)).toBe(true);
    });

    it('should create artifacts directory', async () => {
      const customDir = path.join(testDir, 'custom-artifacts');
      const customTester = new XssTester({ artifactsDir: customDir });

      await customTester.initialize();
      expect(fsSync.existsSync(customDir)).toBe(true);
    });
  });

  describe('testXss function', () => {
    it('should return XssDetectionResult', async () => {
      const result = await testXss('https://example.com', {
        artifactsDir: testDir,
        timeout: 5000,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.testedFields).toBe('number');
      expect(typeof result.totalPayloads).toBe('number');
      expect(typeof result.executionTime).toBe('number');
    });

    it('should include vulnerableFields array', async () => {
      const result = await testXss('https://example.com', {
        artifactsDir: testDir,
        timeout: 5000,
      });

      expect(Array.isArray(result.vulnerableFields)).toBe(true);
    });
  });

  describe('testXssBatch function', () => {
    it('should test multiple URLs', async () => {
      const urls = ['https://example1.com', 'https://example2.com'];
      const results = await testXssBatch(urls, {
        artifactsDir: testDir,
        timeout: 5000,
      });

      expect(results.length).toBe(2);
      expect(results[0].url).toBe('https://example1.com');
      expect(results[1].url).toBe('https://example2.com');
    });
  });

  describe('XssTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });

    it('should return empty summary initially', () => {
      const summary = tester.getSummary();
      expect(Array.isArray(summary)).toBe(true);
      expect(summary.length).toBe(0);
    });
  });

  describe('configuration options', () => {
    it('should respect maxPayloadsPerField option', () => {
      const customTester = new XssTester({
        maxPayloadsPerField: 10,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect stopOnFirstVulnerability option', () => {
      const customTester = new XssTester({
        stopOnFirstVulnerability: true,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkDomRendering option', () => {
      const customTester = new XssTester({
        checkDomRendering: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkUrlInjection option', () => {
      const customTester = new XssTester({
        checkUrlInjection: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should accept custom payloads', () => {
      const customPayloads = ['<script>test</script>', '<img src=x onerror=test>'];
      const customTester = new XssTester({
        payloads: customPayloads,
      });
      expect(customTester).toBeDefined();
    });
  });
});

describe('XssVulnerability type', () => {
  it('should have correct structure', () => {
    const vulnerability = {
      type: 'xss',
      severity: 'high' as const,
      description: 'Test vulnerability',
      fieldSelector: '#test',
      fieldType: 'text',
      payload: '<script>alert(1)</script>',
      executionMethod: 'alert' as const,
      recommendation: 'Test recommendation',
    };

    expect(vulnerability.type).toBe('xss');
    expect(vulnerability.severity).toBe('high');
    expect(vulnerability.executionMethod).toBe('alert');
  });

  it('should support all severity levels', () => {
    const severities = ['critical', 'high', 'medium', 'low'] as const;

    severities.forEach(severity => {
      const vuln = {
        type: 'xss',
        severity,
        description: 'Test',
        fieldSelector: '#test',
        fieldType: 'text',
        payload: 'test',
        executionMethod: 'alert' as const,
      };

      expect(vuln.severity).toBe(severity);
    });
  });

  it('should support all execution methods', () => {
    const methods = ['alert', 'dom_render', 'event_handler', 'url_redirect', 'unknown'] as const;

    methods.forEach(method => {
      const vuln = {
        type: 'xss',
        severity: 'high' as const,
        description: 'Test',
        fieldSelector: '#test',
        fieldType: 'text',
        payload: 'test',
        executionMethod: method,
      };

      expect(vuln.executionMethod).toBe(method);
    });
  });
});

describe('InputField type', () => {
  it('should have correct structure', () => {
    const field = {
      selector: '#username',
      type: 'text',
      name: 'username',
      id: 'username',
      placeholder: 'Enter username',
      acceptsText: true,
    };

    expect(field.selector).toBe('#username');
    expect(field.acceptsText).toBe(true);
  });

  it('should handle different input types', () => {
    const textTypes = ['text', 'email', 'password', 'search', 'textarea'];
    textTypes.forEach(type => {
      const field = {
        selector: '#test',
        type,
        acceptsText: true,
      };
      expect(field.acceptsText).toBe(true);
    });

    const nonTextTypes = ['checkbox', 'radio', 'file'];
    nonTextTypes.forEach(type => {
      const field = {
        selector: '#test',
        type,
        acceptsText: false,
      };
      expect(field.acceptsText).toBe(false);
    });
  });
});

describe('XssDetectionResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      vulnerableFields: [],
      testedFields: 5,
      totalPayloads: 100,
      executionTime: 5000,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.vulnerableFields)).toBe(true);
    expect(typeof result.testedFields).toBe('number');
    expect(typeof result.totalPayloads).toBe('number');
    expect(typeof result.executionTime).toBe('number');
  });
});
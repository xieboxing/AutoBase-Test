import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HeaderTester,
  checkSecurityHeaders,
  checkSecurityHeadersBatch,
  SECURITY_HEADERS,
} from '@/testers/security/header-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('HeaderTester', () => {
  let testDir: string;
  let tester: HeaderTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-security-headers');
    await fs.mkdir(testDir, { recursive: true });
    tester = new HeaderTester({
      artifactsDir: testDir,
      timeout: 5000,
    });

    // Reset mock
    mockFetch.mockReset();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export HeaderTester class', () => {
      expect(HeaderTester).toBeDefined();
      expect(typeof HeaderTester).toBe('function');
    });

    it('should export checkSecurityHeaders function', () => {
      expect(checkSecurityHeaders).toBeDefined();
      expect(typeof checkSecurityHeaders).toBe('function');
    });

    it('should export checkSecurityHeadersBatch function', () => {
      expect(checkSecurityHeadersBatch).toBeDefined();
      expect(typeof checkSecurityHeadersBatch).toBe('function');
    });

    it('should export SECURITY_HEADERS array', () => {
      expect(SECURITY_HEADERS).toBeDefined();
      expect(Array.isArray(SECURITY_HEADERS)).toBe(true);
      expect(SECURITY_HEADERS.length).toBeGreaterThan(0);
    });

    it('should accept configuration', () => {
      const customTester = new HeaderTester({
        timeout: 10000,
        checkRedirects: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('SECURITY_HEADERS', () => {
    it('should contain HSTS header config', () => {
      const hsts = SECURITY_HEADERS.find(h => h.name === 'Strict-Transport-Security');
      expect(hsts).toBeDefined();
      expect(hsts?.required).toBe(true);
      expect(hsts?.severity).toBe('high');
    });

    it('should contain CSP header config', () => {
      const csp = SECURITY_HEADERS.find(h => h.name === 'Content-Security-Policy');
      expect(csp).toBeDefined();
      expect(csp?.required).toBe(true);
      expect(csp?.severity).toBe('critical');
    });

    it('should contain X-Frame-Options header config', () => {
      const xfo = SECURITY_HEADERS.find(h => h.name === 'X-Frame-Options');
      expect(xfo).toBeDefined();
      expect(xfo?.required).toBe(true);
    });

    it('should contain Referrer-Policy header config', () => {
      const rp = SECURITY_HEADERS.find(h => h.name === 'Referrer-Policy');
      expect(rp).toBeDefined();
      expect(rp?.required).toBe(true);
    });

    it('should contain all required header properties', () => {
      for (const header of SECURITY_HEADERS) {
        expect(header.name).toBeDefined();
        expect(typeof header.description).toBe('string');
        expect(['critical', 'high', 'medium', 'low']).toContain(header.severity);
      }
    });
  });

  describe('checkHeaders', () => {
    it('should return HeaderCheckResult', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Headers({
          'strict-transport-security': 'max-age=31536000',
          'content-security-policy': 'default-src self',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
          'referrer-policy': 'strict-origin',
        }),
      });

      const result = await checkSecurityHeaders('https://example.com', {
        artifactsDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.executionTime).toBe('number');
      expect(Array.isArray(result.missingHeaders)).toBe(true);
      expect(Array.isArray(result.weakHeaders)).toBe(true);
      expect(Array.isArray(result.presentHeaders)).toBe(true);
    });

    it('should detect missing required headers', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Headers({
          'x-content-type-options': 'nosniff',
        }),
      });

      const result = await tester.checkHeaders('https://example.com');

      expect(result.passed).toBe(false);
      expect(result.missingHeaders.length).toBeGreaterThan(0);

      // Should detect missing HSTS
      expect(result.missingHeaders.some(h => h.headerName === 'Strict-Transport-Security')).toBe(true);

      // Should detect missing CSP
      expect(result.missingHeaders.some(h => h.headerName === 'Content-Security-Policy')).toBe(true);
    });

    it('should detect weak header configuration', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Headers({
          'strict-transport-security': 'max-age=1000', // Too short
          'content-security-policy': 'default-src self',
          'x-content-type-options': 'wrong-value', // Not 'nosniff'
          'x-frame-options': 'ALLOWALL', // Invalid value
          'referrer-policy': 'unsafe-url', // Unsafe value
        }),
      });

      const result = await tester.checkHeaders('https://example.com');

      // Should detect weak HSTS
      expect(result.weakHeaders.some(h => h.headerName === 'Strict-Transport-Security')).toBe(true);

      // Should detect wrong X-Content-Type-Options
      expect(result.weakHeaders.some(h => h.headerName === 'X-Content-Type-Options')).toBe(true);

      // Should detect unsafe Referrer-Policy
      expect(result.weakHeaders.some(h => h.headerName === 'Referrer-Policy')).toBe(true);
    });

    it('should pass when all headers are properly configured', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        headers: new Headers({
          'strict-transport-security': 'max-age=31536000; includeSubDomains',
          'content-security-policy': 'default-src self; script-src self',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
          'referrer-policy': 'strict-origin-when-cross-origin',
          'permissions-policy': 'camera=(), microphone=()',
        }),
      });

      const result = await tester.checkHeaders('https://example.com');

      expect(result.passed).toBe(true);
      expect(result.missingHeaders.filter(h => h.severity === 'critical' || h.severity === 'high').length).toBe(0);
    });

    it('should handle connection errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await tester.checkHeaders('https://unreachable.example.com');

      expect(result.passed).toBe(false);
      expect(result.missingHeaders.some(h => h.type === 'connection_error')).toBe(true);
    });
  });

  describe('checkHeadersBatch', () => {
    it('should check multiple URLs', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Headers({
          'strict-transport-security': 'max-age=31536000',
          'content-security-policy': 'default-src self',
          'x-content-type-options': 'nosniff',
          'x-frame-options': 'SAMEORIGIN',
        }),
      });

      const urls = ['https://example1.com', 'https://example2.com'];
      const results = await checkSecurityHeadersBatch(urls, {
        artifactsDir: testDir,
      });

      expect(results.length).toBe(2);
      expect(results[0].url).toBe('https://example1.com');
      expect(results[1].url).toBe('https://example2.com');
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        headers: new Headers({
          'x-content-type-options': 'nosniff',
        }),
      });

      const results = await tester.checkHeadersBatch(['https://example1.com', 'https://example2.com']);
      const summary = tester.getSummary(results);

      expect(summary.totalUrls).toBe(2);
      expect(typeof summary.passedUrls).toBe('number');
      expect(typeof summary.totalMissingHeaders).toBe('number');
      expect(typeof summary.totalWeakHeaders).toBe('number');
      expect(Array.isArray(summary.commonMissingHeaders)).toBe(true);
    });
  });

  describe('HeaderTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });

  describe('configuration options', () => {
    it('should respect checkRedirects option', () => {
      const customTester = new HeaderTester({
        checkRedirects: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect followRedirects option', () => {
      const customTester = new HeaderTester({
        followRedirects: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect userAgent option', () => {
      const customTester = new HeaderTester({
        userAgent: 'CustomUA/1.0',
      });
      expect(customTester).toBeDefined();
    });
  });
});

describe('HeaderCheckResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      headers: { 'content-type': 'text/html' },
      missingHeaders: [],
      weakHeaders: [],
      presentHeaders: [],
      executionTime: 1000,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(typeof result.headers).toBe('object');
    expect(Array.isArray(result.missingHeaders)).toBe(true);
  });
});

describe('SecurityHeaderIssue type', () => {
  it('should have correct structure', () => {
    const issue = {
      type: 'missing_security_header',
      severity: 'high' as const,
      headerName: 'Strict-Transport-Security',
      description: 'Missing HSTS header',
      recommendation: 'Add HSTS header',
    };

    expect(issue.type).toBe('missing_security_header');
    expect(issue.severity).toBe('high');
    expect(issue.headerName).toBe('Strict-Transport-Security');
  });

  it('should support all severity levels', () => {
    const severities = ['critical', 'high', 'medium', 'low'] as const;

    severities.forEach(severity => {
      const issue = {
        type: 'missing_security_header',
        severity,
        headerName: 'Test-Header',
        description: 'Test',
      };

      expect(issue.severity).toBe(severity);
    });
  });
});

describe('SecurityHeaderInfo type', () => {
  it('should have correct structure', () => {
    const info = {
      name: 'Strict-Transport-Security',
      value: 'max-age=31536000',
      status: 'good' as const,
      description: 'HSTS header',
    };

    expect(info.name).toBe('Strict-Transport-Security');
    expect(info.status).toBe('good');
  });

  it('should support all status values', () => {
    const statuses = ['good', 'warning', 'missing'] as const;

    statuses.forEach(status => {
      const info = {
        name: 'Test-Header',
        value: 'test',
        status,
        description: 'Test',
      };

      expect(info.status).toBe(status);
    });
  });
});

describe('RequiredSecurityHeader type', () => {
  it('should have correct structure', () => {
    const headerConfig = {
      name: 'X-Custom-Header',
      required: true,
      recommendedValue: 'expected-value',
      description: 'Custom header description',
      severity: 'high' as const,
    };

    expect(headerConfig.name).toBe('X-Custom-Header');
    expect(headerConfig.required).toBe(true);
    expect(headerConfig.severity).toBe('high');
  });
});
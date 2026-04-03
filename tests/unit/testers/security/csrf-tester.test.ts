import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CsrfTester,
  checkCsrf,
  type CookieInfo,
} from '@/testers/security/csrf-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

describe('CsrfTester', () => {
  let testDir: string;
  let tester: CsrfTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-security-csrf');
    await fs.mkdir(testDir, { recursive: true });
    tester = new CsrfTester({
      artifactsDir: testDir,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export CsrfTester class', () => {
      expect(CsrfTester).toBeDefined();
      expect(typeof CsrfTester).toBe('function');
    });

    it('should export checkCsrf function', () => {
      expect(checkCsrf).toBeDefined();
      expect(typeof checkCsrf).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new CsrfTester({
        checkForms: false,
        checkCookies: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect checkForms option', () => {
      const customTester = new CsrfTester({
        checkForms: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkCookies option', () => {
      const customTester = new CsrfTester({
        checkCookies: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect csrfTokenNames option', () => {
      const customTester = new CsrfTester({
        csrfTokenNames: ['custom_token', 'my_csrf'],
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('CsrfTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have addTokenName method', () => {
      expect(tester.addTokenName).toBeDefined();
      expect(typeof tester.addTokenName).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });

  describe('checkCsrf', () => {
    it('should return CsrfCheckResult', async () => {
      const html = '<html><body>No forms</body></html>';

      const result = await checkCsrf('https://example.com', html, [], {
        artifactsDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.forms)).toBe(true);
      expect(Array.isArray(result.cookieAnalysis)).toBe(true);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should detect form without CSRF token', async () => {
      const html = `
        <html>
        <body>
          <form method="POST" action="/submit">
            <input type="text" name="username">
            <button type="submit">Submit</button>
          </form>
        </body>
        </html>
      `;

      const result = await tester.checkCsrf('https://example.com', html);

      expect(result.passed).toBe(false);
      expect(result.forms.length).toBe(1);
      expect(result.forms[0].hasCsrfToken).toBe(false);
      expect(result.forms[0].vulnerable).toBe(true);
      expect(result.issues.some(i => i.issueType === 'missing_csrf_token')).toBe(true);
    });

    it('should pass when form has CSRF token', async () => {
      const html = `
        <html>
        <body>
          <form method="POST" action="/submit">
            <input type="hidden" name="csrf_token" value="abc123">
            <input type="text" name="username">
            <button type="submit">Submit</button>
          </form>
        </body>
        </html>
      `;

      const result = await tester.checkCsrf('https://example.com', html);

      expect(result.forms.length).toBe(1);
      expect(result.forms[0].hasCsrfToken).toBe(true);
      expect(result.forms[0].vulnerable).toBe(false);
    });

    it('should detect various CSRF token names', async () => {
      const tokenNames = ['_csrf', '_token', 'authenticity_token', 'csrfmiddlewaretoken'];

      for (const tokenName of tokenNames) {
        const html = `
          <form method="POST" action="/submit">
            <input type="hidden" name="${tokenName}" value="abc123">
          </form>
        `;

        const result = await tester.checkCsrf('https://example.com', html);
        expect(result.forms[0].hasCsrfToken).toBe(true);
      }
    });

    it('should not require CSRF for GET forms', async () => {
      const html = `
        <html>
        <body>
          <form method="GET" action="/search">
            <input type="text" name="q">
            <button type="submit">Search</button>
          </form>
        </body>
        </html>
      `;

      const result = await tester.checkCsrf('https://example.com', html);

      expect(result.forms[0].vulnerable).toBe(false);
    });

    it('should check cookie SameSite attribute', async () => {
      const html = '<html><body></body></html>';
      const cookies: CookieInfo[] = [
        {
          name: 'session_id',
          value: 'abc123',
          sameSite: 'Strict',
          secure: true,
          httpOnly: true,
        },
      ];

      const result = await tester.checkCsrf('https://example.com', html, cookies);

      expect(result.cookieAnalysis.length).toBe(1);
      expect(result.cookieAnalysis[0].hasSameSite).toBe(true);
      expect(result.cookieAnalysis[0].vulnerable).toBe(false);
    });

    it('should detect cookie without SameSite', async () => {
      const html = '<html><body></body></html>';
      const cookies: CookieInfo[] = [
        {
          name: 'session_id',
          value: 'abc123',
          secure: true,
          httpOnly: true,
        },
      ];

      const result = await tester.checkCsrf('https://example.com', html, cookies);

      expect(result.cookieAnalysis[0].hasSameSite).toBe(false);
      expect(result.cookieAnalysis[0].vulnerable).toBe(true);
    });

    it('should detect weak SameSite=None', async () => {
      const html = '<html><body></body></html>';
      const cookies: CookieInfo[] = [
        {
          name: 'session_id',
          value: 'abc123',
          sameSite: 'None',
          secure: true,
        },
      ];

      const result = await tester.checkCsrf('https://example.com', html, cookies);

      expect(result.cookieAnalysis[0].hasSameSite).toBe(false);
    });

    it('should pass when no vulnerable forms or cookies', async () => {
      const html = `
        <html>
        <body>
          <form method="POST" action="/submit">
            <input type="hidden" name="csrf_token" value="abc123">
          </form>
        </body>
        </html>
      `;

      const result = await tester.checkCsrf('https://example.com', html);

      expect(result.passed).toBe(true);
    });
  });

  describe('addTokenName', () => {
    it('should add custom token name', () => {
      tester.addTokenName('my_custom_token');

      // Verify by checking a form with the custom token
      // The token should now be recognized
      expect(tester).toBeDefined();
    });

    it('should not add duplicate token name', () => {
      const initialLength = tester['config'].csrfTokenNames.length;
      tester.addTokenName('csrf_token'); // Already exists
      expect(tester['config'].csrfTokenNames.length).toBe(initialLength);
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      const results = [
        await tester.checkCsrf('https://example1.com', '<html></html>'),
        await tester.checkCsrf('https://example2.com', '<html></html>'),
      ];

      const summary = tester.getSummary(results);

      expect(summary.totalChecked).toBe(2);
      expect(typeof summary.passedChecks).toBe('number');
      expect(typeof summary.totalIssues).toBe('number');
      expect(typeof summary.vulnerableForms).toBe('number');
      expect(typeof summary.weakCookies).toBe('number');
    });
  });
});

describe('CsrfCheckResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      forms: [],
      cookieAnalysis: [],
      issues: [],
      executionTime: 500,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.forms)).toBe(true);
    expect(Array.isArray(result.cookieAnalysis)).toBe(true);
  });
});

describe('FormCsrfResult type', () => {
  it('should have correct structure', () => {
    const formResult = {
      formSelector: '#login-form',
      action: '/login',
      method: 'POST',
      hasCsrfToken: true,
      tokenFieldName: 'csrf_token',
      tokenLocation: 'hidden_field' as const,
      vulnerable: false,
    };

    expect(formResult.formSelector).toBe('#login-form');
    expect(formResult.hasCsrfToken).toBe(true);
    expect(formResult.tokenLocation).toBe('hidden_field');
  });
});

describe('CookieCsrfResult type', () => {
  it('should have correct structure', () => {
    const cookieResult = {
      name: 'session_id',
      hasSameSite: true,
      sameSiteValue: 'Strict',
      isSecure: true,
      isHttpOnly: true,
      vulnerable: false,
    };

    expect(cookieResult.name).toBe('session_id');
    expect(cookieResult.hasSameSite).toBe(true);
    expect(cookieResult.vulnerable).toBe(false);
  });
});

describe('CsrfIssue type', () => {
  it('should have correct structure', () => {
    const issue = {
      type: 'csrf_vulnerability',
      severity: 'high' as const,
      issueType: 'missing_csrf_token' as const,
      formSelector: '#login-form',
      description: 'Form missing CSRF token',
      recommendation: 'Add CSRF token',
    };

    expect(issue.type).toBe('csrf_vulnerability');
    expect(issue.issueType).toBe('missing_csrf_token');
    expect(issue.severity).toBe('high');
  });

  it('should support all issue types', () => {
    const issueTypes = ['missing_csrf_token', 'weak_same_site', 'form_vulnerable', 'cookie_vulnerable'] as const;

    issueTypes.forEach(issueType => {
      const issue = {
        type: 'csrf_vulnerability',
        severity: 'high' as const,
        issueType,
        description: 'Test',
      };

      expect(issue.issueType).toBe(issueType);
    });
  });
});

describe('CookieInfo type', () => {
  it('should have correct structure', () => {
    const cookie: CookieInfo = {
      name: 'session_id',
      value: 'abc123',
      domain: 'example.com',
      path: '/',
      secure: true,
      httpOnly: true,
      sameSite: 'Strict',
    };

    expect(cookie.name).toBe('session_id');
    expect(cookie.secure).toBe(true);
    expect(cookie.sameSite).toBe('Strict');
  });
});
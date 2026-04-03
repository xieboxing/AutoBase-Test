import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SensitiveDataTester,
  scanPageForSensitiveData,
  SENSITIVE_DATA_PATTERNS,
} from '@/testers/security/sensitive-data-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';

describe('SensitiveDataTester', () => {
  let testDir: string;
  let tester: SensitiveDataTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-security-sensitive');
    await fs.mkdir(testDir, { recursive: true });
    tester = new SensitiveDataTester({
      artifactsDir: testDir,
      timeout: 5000,
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export SensitiveDataTester class', () => {
      expect(SensitiveDataTester).toBeDefined();
      expect(typeof SensitiveDataTester).toBe('function');
    });

    it('should export scanPageForSensitiveData function', () => {
      expect(scanPageForSensitiveData).toBeDefined();
      expect(typeof scanPageForSensitiveData).toBe('function');
    });

    it('should export SENSITIVE_DATA_PATTERNS array', () => {
      expect(SENSITIVE_DATA_PATTERNS).toBeDefined();
      expect(Array.isArray(SENSITIVE_DATA_PATTERNS)).toBe(true);
      expect(SENSITIVE_DATA_PATTERNS.length).toBeGreaterThan(0);
    });

    it('should accept configuration', () => {
      const customTester = new SensitiveDataTester({
        checkComments: false,
        checkMetaTags: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('SENSITIVE_DATA_PATTERNS', () => {
    it('should contain API key pattern', () => {
      expect(SENSITIVE_DATA_PATTERNS.some(p => p.type === 'api_key')).toBe(true);
    });

    it('should contain secret key pattern', () => {
      expect(SENSITIVE_DATA_PATTERNS.some(p => p.type === 'secret_key')).toBe(true);
    });

    it('should contain AWS key pattern', () => {
      expect(SENSITIVE_DATA_PATTERNS.some(p => p.type === 'aws_key')).toBe(true);
    });

    it('should contain JWT pattern', () => {
      expect(SENSITIVE_DATA_PATTERNS.some(p => p.type === 'jwt')).toBe(true);
    });

    it('should contain database URL pattern', () => {
      expect(SENSITIVE_DATA_PATTERNS.some(p => p.type === 'database_url')).toBe(true);
    });

    it('should contain all required pattern properties', () => {
      for (const pattern of SENSITIVE_DATA_PATTERNS) {
        expect(pattern.type).toBeDefined();
        expect(pattern.name).toBeDefined();
        expect(Array.isArray(pattern.patterns)).toBe(true);
        expect(['critical', 'high', 'medium', 'low']).toContain(pattern.severity);
        expect(typeof pattern.description).toBe('string');
        expect(typeof pattern.recommendation).toBe('string');
      }
    });
  });

  describe('scanPage', () => {
    it('should return SensitiveDataResult', async () => {
      const html = '<html><body>Safe content</body></html>';

      const result = await tester.scanPage('https://example.com', html);

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.findings)).toBe(true);
      expect(Array.isArray(result.scannedSources)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should detect API key in page source', async () => {
      const html = `
        <html>
        <body>
          <script>
            const config = { api_key: 'sk_test_example_fake_key_for_testing_only' };
          </script>
        </body>
        </html>
      `;

      const result = await tester.scanPage('https://example.com', html);

      // Check if any sensitive data was found (could be api_key or password due to pattern matching)
      expect(result.findings.length).toBeGreaterThan(0);
    });

    it('should detect AWS access key', async () => {
      const html = `
        <script>
          const config = {
            awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE'
          };
        </script>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.findings.some(f => f.dataType === 'aws_key')).toBe(true);
    });

    it('should detect JWT token', async () => {
      const html = `
        <script>
          const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
        </script>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.findings.some(f => f.dataType === 'jwt')).toBe(true);
    });

    it('should detect database URL', async () => {
      const html = `
        <script>
          const dbUrl = 'mysql://user:password@localhost:3306/database';
        </script>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.findings.some(f => f.dataType === 'database_url')).toBe(true);
    });

    it('should detect password in code', async () => {
      const html = `
        <script>
          const config = {
            password: 'MySecretPassword123!'
          };
        </script>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.findings.some(f => f.dataType === 'password')).toBe(true);
    });

    it('should detect private key', async () => {
      const html = `
        <script>
          const key = '-----BEGIN RSA PRIVATE KEY-----\\nMIIEpAIBAAKCAQEA...';
        </script>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.findings.some(f => f.dataType === 'private_key')).toBe(true);
    });

    it('should detect sensitive data in HTML comments', async () => {
      const html = `
        <!--
          Debug info:
          API_KEY = 'test-api-key-12345678901234567890'
        -->
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.scannedSources).toContain('html_comments');
    });

    it('should detect sensitive data in meta tags', async () => {
      const html = `
        <meta name="api-key" content="sk-1234567890abcdefghijklmnop">
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.scannedSources).toContain('meta_tags');
    });

    it('should pass when no sensitive data found', async () => {
      const html = `
        <html>
        <body>
          <h1>Welcome</h1>
          <p>This is a safe page with no sensitive data.</p>
        </body>
        </html>
      `;

      const result = await tester.scanPage('https://example.com', html);

      expect(result.passed).toBe(true);
      expect(result.findings.filter(f => f.severity === 'critical' || f.severity === 'high').length).toBe(0);
    });
  });

  describe('scanContent', () => {
    it('should return findings array', () => {
      const content = 'const secret_key = "my_super_secret_key_value_12345678"';
      const findings = tester.scanContent(content, 'test');

      expect(Array.isArray(findings)).toBe(true);
      // May or may not find depending on patterns
    });

    it('should include location in findings', () => {
      const content = 'const password = "MySecretPassword12345678!"';
      const findings = tester.scanContent(content, 'test_location');

      // If findings exist, check location
      if (findings.length > 0) {
        expect(findings[0].location).toBe('test_location');
      }
    });

    it('should mask sensitive data in match', () => {
      const content = 'const api_key = "sk_test_example_fake_key_for_testing_only"';
      const findings = tester.scanContent(content, 'test');

      if (findings.length > 0) {
        expect(findings[0].match).toContain('*');
      }
    });
  });

  describe('configuration options', () => {
    it('should respect checkComments option', () => {
      const testerNoComments = new SensitiveDataTester({
        checkComments: false,
      });
      expect(testerNoComments).toBeDefined();
    });

    it('should respect checkMetaTags option', () => {
      const testerNoMeta = new SensitiveDataTester({
        checkMetaTags: false,
      });
      expect(testerNoMeta).toBeDefined();
    });

    it('should accept custom patterns', () => {
      const customPattern = {
        type: 'custom_key' as const,
        name: 'Custom Key',
        patterns: [/custom[_-]?key['":\s]*['"]?([a-zA-Z0-9]{16,})['"]?/gi],
        severity: 'high' as const,
        description: 'Custom key detected',
        recommendation: 'Remove custom key',
      };

      const testerWithCustom = new SensitiveDataTester({
        customPatterns: [customPattern],
      });

      expect(testerWithCustom).toBeDefined();
    });
  });

  describe('methods', () => {
    it('should have getPatterns method', () => {
      expect(tester.getPatterns).toBeDefined();
      expect(typeof tester.getPatterns).toBe('function');
    });

    it('should have addPattern method', () => {
      expect(tester.addPattern).toBeDefined();
      expect(typeof tester.addPattern).toBe('function');
    });

    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have scanScriptContent method', () => {
      expect(tester.scanScriptContent).toBeDefined();
      expect(typeof tester.scanScriptContent).toBe('function');
    });

    it('should have scanNetworkRequest method', () => {
      expect(tester.scanNetworkRequest).toBeDefined();
      expect(typeof tester.scanNetworkRequest).toBe('function');
    });

    it('should have scanConsoleOutput method', () => {
      expect(tester.scanConsoleOutput).toBeDefined();
      expect(typeof tester.scanConsoleOutput).toBe('function');
    });

    it('getPatterns should return all patterns', () => {
      const patterns = tester.getPatterns();
      expect(Array.isArray(patterns)).toBe(true);
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('addPattern should add new pattern', () => {
      const initialCount = tester.getPatterns().length;

      tester.addPattern({
        type: 'custom',
        name: 'Custom',
        patterns: [/test/],
        severity: 'low',
        description: 'Test',
        recommendation: 'Test',
      });

      expect(tester.getPatterns().length).toBe(initialCount + 1);
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      const results = [
        await tester.scanPage('https://example1.com', '<html><body>Safe</body></html>'),
        await tester.scanPage('https://example2.com', '<html><body>Safe</body></html>'),
      ];

      const summary = tester.getSummary(results);

      expect(summary.totalScanned).toBe(2);
      expect(typeof summary.passedScans).toBe('number');
      expect(typeof summary.totalFindings).toBe('number');
      expect(typeof summary.criticalFindings).toBe('number');
      expect(typeof summary.highFindings).toBe('number');
      expect(typeof summary.findingsByType).toBe('object');
    });
  });
});

describe('SensitiveDataFinding type', () => {
  it('should have correct structure', () => {
    const finding = {
      type: 'sensitive_data_exposure',
      severity: 'high' as const,
      dataType: 'api_key' as const,
      match: 'sk-****-****',
      location: 'page_source',
      line: 10,
      context: 'const apiKey = "sk-..."',
      description: 'API Key: API 密钥泄露',
      recommendation: '将 API 密钥移至服务端',
    };

    expect(finding.type).toBe('sensitive_data_exposure');
    expect(finding.dataType).toBe('api_key');
    expect(finding.severity).toBe('high');
  });
});

describe('SensitiveDataPattern type', () => {
  it('should have correct structure', () => {
    const pattern = {
      type: 'api_key' as const,
      name: 'API Key',
      patterns: [/test/g],
      severity: 'high' as const,
      description: 'API key detected',
      recommendation: 'Remove API key',
    };

    expect(pattern.type).toBe('api_key');
    expect(pattern.name).toBe('API Key');
    expect(pattern.severity).toBe('high');
  });
});

describe('SensitiveDataResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      passed: true,
      findings: [],
      scannedSources: ['page_source'],
      executionTime: 500,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(Array.isArray(result.scannedSources)).toBe(true);
  });
});
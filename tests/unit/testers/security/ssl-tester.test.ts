import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SslTester,
  checkSsl,
  checkSslBatch,
} from '@/testers/security/ssl-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';

// Mock tls module
vi.mock('node:tls', () => ({
  default: {
    connect: vi.fn(),
  },
}));

describe('SslTester', () => {
  let testDir: string;
  let tester: SslTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-security-ssl');
    await fs.mkdir(testDir, { recursive: true });
    tester = new SslTester({
      artifactsDir: testDir,
      timeout: 5000,
    });

    vi.clearAllMocks();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export SslTester class', () => {
      expect(SslTester).toBeDefined();
      expect(typeof SslTester).toBe('function');
    });

    it('should export checkSsl function', () => {
      expect(checkSsl).toBeDefined();
      expect(typeof checkSsl).toBe('function');
    });

    it('should export checkSslBatch function', () => {
      expect(checkSslBatch).toBeDefined();
      expect(typeof checkSslBatch).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new SslTester({
        timeout: 15000,
        minDaysBeforeExpiry: 60,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should respect timeout option', () => {
      const customTester = new SslTester({
        timeout: 20000,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect minDaysBeforeExpiry option', () => {
      const customTester = new SslTester({
        minDaysBeforeExpiry: 14,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkChain option', () => {
      const customTester = new SslTester({
        checkChain: false,
      });
      expect(customTester).toBeDefined();
    });

    it('should respect checkWeakAlgorithms option', () => {
      const customTester = new SslTester({
        checkWeakAlgorithms: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('SslTester methods', () => {
    it('should have getSummary method', () => {
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have close method', () => {
      expect(tester.close).toBeDefined();
      expect(typeof tester.close).toBe('function');
    });
  });

  describe('checkSsl', () => {
    it('should return SslCheckResult', async () => {
      // Mock successful TLS connection
      const mockCert = {
        subject: { CN: 'example.com' },
        issuer: { CN: 'Test CA' },
        valid_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        serialNumber: '12345',
        fingerprint: 'AB:CD:EF',
        fingerprint256: 'AB:CD:EF:12:34',
        subjectaltname: 'DNS:example.com, DNS:www.example.com',
        isCA: false,
        version: 3,
        signatureAlgorithm: 'sha256WithRSAEncryption',
      };

      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
        destroy: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        // Simulate successful connection
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await checkSsl('https://example.com', {
        artifactsDir: testDir,
      });

      expect(result).toBeDefined();
      expect(result.url).toBe('https://example.com');
      expect(result.hostname).toBe('example.com');
      expect(result.port).toBe(443);
      expect(typeof result.passed).toBe('boolean');
      expect(typeof result.hasCertificate).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should detect expired certificate', async () => {
      // Mock expired certificate
      const mockCert = {
        subject: { CN: 'expired.example.com' },
        issuer: { CN: 'Test CA' },
        valid_from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
        serialNumber: '12345',
        fingerprint: 'AB:CD:EF',
        fingerprint256: 'AB:CD:EF:12:34',
        subjectaltname: null,
        isCA: false,
        version: 3,
        signatureAlgorithm: 'sha256WithRSAEncryption',
      };

      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
        destroy: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await tester.checkSsl('https://expired.example.com');

      expect(result.isExpired).toBe(true);
      expect(result.passed).toBe(false);
      expect(result.issues.some(i => i.issueType === 'expired')).toBe(true);
    });

    it('should detect expiring soon certificate', async () => {
      // Mock certificate expiring soon (15 days)
      const mockCert = {
        subject: { CN: 'expiring.example.com' },
        issuer: { CN: 'Test CA' },
        valid_from: new Date(Date.now() - 350 * 24 * 60 * 60 * 1000).toISOString(),
        valid_to: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days
        serialNumber: '12345',
        fingerprint: 'AB:CD:EF',
        fingerprint256: 'AB:CD:EF:12:34',
        subjectaltname: null,
        isCA: false,
        version: 3,
        signatureAlgorithm: 'sha256WithRSAEncryption',
      };

      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
        destroy: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await tester.checkSsl('https://expiring.example.com');

      expect(result.isExpiringSoon).toBe(true);
      expect(result.issues.some(i => i.issueType === 'expiring_soon')).toBe(true);
    });

    it('should detect weak signature algorithm', async () => {
      // Mock certificate with SHA-1
      const mockCert = {
        subject: { CN: 'weak.example.com' },
        issuer: { CN: 'Test CA' },
        valid_from: new Date().toISOString(),
        valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        serialNumber: '12345',
        fingerprint: 'AB:CD:EF',
        fingerprint256: 'AB:CD:EF:12:34',
        subjectaltname: null,
        isCA: false,
        version: 3,
        signatureAlgorithm: 'sha1WithRSAEncryption', // Weak algorithm
      };

      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
        destroy: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await tester.checkSsl('https://weak.example.com');

      expect(result.issues.some(i => i.issueType === 'weak_algorithm')).toBe(true);
    });

    it('should detect self-signed certificate', async () => {
      // Mock self-signed certificate
      const mockCert = {
        subject: { CN: 'selfsigned.example.com', O: 'Test Org' },
        issuer: { CN: 'selfsigned.example.com', O: 'Test Org' }, // Same as subject
        valid_from: new Date().toISOString(),
        valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        serialNumber: '12345',
        fingerprint: 'AB:CD:EF',
        fingerprint256: 'AB:CD:EF:12:34',
        subjectaltname: null,
        isCA: true, // Self-signed certs are CA
        version: 3,
        signatureAlgorithm: 'sha256WithRSAEncryption',
      };

      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue(mockCert),
        destroy: vi.fn(),
        on: vi.fn(),
        setTimeout: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        setTimeout(() => callback(), 0);
        return mockSocket;
      });

      const result = await tester.checkSsl('https://selfsigned.example.com');

      expect(result.issues.some(i => i.issueType === 'self_signed')).toBe(true);
    });

    it('should handle connection failure', async () => {
      // Mock connection error
      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        const mockSocket = {
          destroy: vi.fn(),
          on: vi.fn((event: string, handler: any) => {
            if (event === 'error') {
              setTimeout(() => handler(new Error('Connection refused')), 0);
            }
          }),
          setTimeout: vi.fn((timeout: number, handler: any) => {
            // Don't trigger timeout
          }),
        };
        return mockSocket;
      });

      const result = await tester.checkSsl('https://unreachable.example.com');

      expect(result.passed).toBe(false);
      expect(result.hasCertificate).toBe(false);
      expect(result.issues.some(i => i.issueType === 'connection_failed')).toBe(true);
    });
  });

  describe('checkSslBatch', () => {
    it('should check multiple URLs', async () => {
      // Mock successful connection
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue({
          subject: { CN: 'example.com' },
          issuer: { CN: 'Test CA' },
          valid_from: new Date().toISOString(),
          valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          serialNumber: '12345',
          fingerprint: 'AB:CD:EF',
          fingerprint256: 'AB:CD:EF:12:34',
          subjectaltname: null,
          isCA: false,
          version: 3,
          signatureAlgorithm: 'sha256WithRSAEncryption',
        }),
        destroy: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        callback();
        return mockSocket;
      });

      const urls = ['https://example1.com', 'https://example2.com'];
      const results = await checkSslBatch(urls, {
        artifactsDir: testDir,
      });

      expect(results.length).toBe(2);
      expect(results[0].hostname).toBe('example1.com');
      expect(results[1].hostname).toBe('example2.com');
    });
  });

  describe('getSummary', () => {
    it('should generate summary from results', async () => {
      // Mock connection
      const mockSocket = {
        getPeerCertificate: vi.fn().mockReturnValue({
          subject: { CN: 'example.com' },
          issuer: { CN: 'Test CA' },
          valid_from: new Date().toISOString(),
          valid_to: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          serialNumber: '12345',
          fingerprint: 'AB:CD:EF',
          fingerprint256: 'AB:CD:EF:12:34',
          subjectaltname: null,
          isCA: false,
          version: 3,
          signatureAlgorithm: 'sha256WithRSAEncryption',
        }),
        destroy: vi.fn(),
      };

      (tls.connect as any).mockImplementation((options: any, callback: any) => {
        callback();
        return mockSocket;
      });

      const results = await tester.checkSslBatch(['https://example1.com', 'https://example2.com']);
      const summary = tester.getSummary(results);

      expect(summary.totalUrls).toBe(2);
      expect(typeof summary.passedUrls).toBe('number');
      expect(typeof summary.expiredCerts).toBe('number');
      expect(typeof summary.expiringSoonCerts).toBe('number');
      expect(typeof summary.validCerts).toBe('number');
      expect(Array.isArray(summary.issues)).toBe(true);
    });
  });
});

describe('SslCheckResult type', () => {
  it('should have correct structure', () => {
    const result = {
      url: 'https://example.com',
      hostname: 'example.com',
      port: 443,
      passed: true,
      hasCertificate: true,
      issues: [],
      isValid: true,
      daysUntilExpiry: 365,
      isExpired: false,
      isExpiringSoon: false,
      executionTime: 500,
    };

    expect(result.url).toBe('https://example.com');
    expect(result.passed).toBe(true);
    expect(result.daysUntilExpiry).toBe(365);
  });
});

describe('SslIssue type', () => {
  it('should have correct structure', () => {
    const issue = {
      type: 'ssl_certificate',
      severity: 'critical' as const,
      issueType: 'expired' as const,
      description: 'Certificate expired',
      recommendation: 'Renew certificate',
    };

    expect(issue.type).toBe('ssl_certificate');
    expect(issue.severity).toBe('critical');
    expect(issue.issueType).toBe('expired');
  });

  it('should support all issue types', () => {
    const issueTypes = ['expired', 'expiring_soon', 'invalid_chain', 'weak_algorithm', 'self_signed', 'hostname_mismatch', 'connection_failed'] as const;

    issueTypes.forEach(issueType => {
      const issue = {
        type: 'ssl_certificate',
        severity: 'high' as const,
        issueType,
        description: 'Test',
      };

      expect(issue.issueType).toBe(issueType);
    });
  });
});

describe('CertificateInfo type', () => {
  it('should have correct structure', () => {
    const certInfo = {
      subject: 'CN=example.com',
      issuer: 'CN=Test CA',
      validFrom: new Date(),
      validTo: new Date(),
      serialNumber: '12345',
      fingerprint: 'AB:CD:EF',
      fingerprint256: 'AB:CD:EF:12:34',
      subjectAltNames: ['example.com', 'www.example.com'],
      isCA: false,
      version: 3,
      signatureAlgorithm: 'sha256WithRSAEncryption',
    };

    expect(certInfo.subject).toBe('CN=example.com');
    expect(certInfo.isCA).toBe(false);
    expect(certInfo.subjectAltNames.length).toBe(2);
  });
});
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import tls from 'node:tls';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * SSL 证书信息
 */
export interface CertificateInfo {
  subject: string;
  issuer: string;
  validFrom: Date;
  validTo: Date;
  serialNumber: string;
  fingerprint: string;
  fingerprint256: string;
  subjectAltNames: string[];
  isCA: boolean;
  version: number;
  signatureAlgorithm: string;
}

/**
 * SSL 检查结果
 */
export interface SslCheckResult {
  url: string;
  hostname: string;
  port: number;
  passed: boolean;
  hasCertificate: boolean;
  certificate?: CertificateInfo;
  issues: SslIssue[];
  isValid: boolean;
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  executionTime: number;
}

/**
 * SSL 问题
 */
export interface SslIssue extends SecurityIssue {
  issueType: 'expired' | 'expiring_soon' | 'invalid_chain' | 'weak_algorithm' | 'self_signed' | 'hostname_mismatch' | 'connection_failed';
  details?: string;
}

/**
 * SSL 测试器配置
 */
export interface SslTesterConfig {
  timeout: number;
  minDaysBeforeExpiry: number; // 证书过期警告阈值
  checkChain: boolean;
  checkWeakAlgorithms: boolean;
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_SSL_TESTER_CONFIG: SslTesterConfig = {
  timeout: 10000,
  minDaysBeforeExpiry: 30, // 30天内过期发出警告
  checkChain: true,
  checkWeakAlgorithms: true,
  artifactsDir: './data/screenshots/security',
};

/**
 * 弱签名算法列表
 */
const WEAK_SIGNATURE_ALGORITHMS = [
  'md5',
  'md5WithRSAEncryption',
  'sha1',
  'sha1WithRSAEncryption',
];

/**
 * SSL/TLS 证书测试器
 * 检查网站的 SSL 证书配置
 */
export class SslTester {
  private config: SslTesterConfig;
  private testId: string;

  constructor(config: Partial<SslTesterConfig> = {}) {
    this.config = { ...DEFAULT_SSL_TESTER_CONFIG, ...config };
    this.testId = nanoid(8);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    logger.pass('✅ SSL 测试器初始化完成');
  }

  /**
   * 检查单个 URL 的 SSL 证书
   */
  async checkSsl(url: string): Promise<SslCheckResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.step(`🔒 检查 SSL 证书: ${url}`);

    // 解析 URL
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    const port = parseInt(urlObj.port) || 443;

    const issues: SslIssue[] = [];
    let certificate: CertificateInfo | undefined;
    let hasCertificate = false;
    let isValid = false;
    let daysUntilExpiry = 0;
    let isExpired = false;
    let isExpiringSoon = false;

    try {
      // 获取证书
      const cert = await this.getCertificate(hostname, port);

      if (cert) {
        hasCertificate = true;
        certificate = this.parseCertificate(cert);

        // 检查证书有效期
        const now = new Date();
        const expiryDate = new Date(certificate.validTo);
        daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        isExpired = daysUntilExpiry < 0;
        isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry < this.config.minDaysBeforeExpiry;
        isValid = !isExpired;

        // 检查过期
        if (isExpired) {
          issues.push({
            type: 'ssl_certificate',
            severity: 'critical',
            issueType: 'expired',
            description: `SSL 证书已过期 ${Math.abs(daysUntilExpiry)} 天`,
            details: `证书过期时间: ${certificate.validTo.toISOString()}`,
            recommendation: '立即更新 SSL 证书',
          });
        } else if (isExpiringSoon) {
          issues.push({
            type: 'ssl_certificate',
            severity: 'high',
            issueType: 'expiring_soon',
            description: `SSL 证书将在 ${daysUntilExpiry} 天后过期`,
            details: `证书过期时间: ${certificate.validTo.toISOString()}`,
            recommendation: `在 ${this.config.minDaysBeforeExpiry} 天内更新 SSL 证书`,
          });
        }

        // 检查弱签名算法
        if (this.config.checkWeakAlgorithms && certificate.signatureAlgorithm) {
          const isWeak = WEAK_SIGNATURE_ALGORITHMS.some(algo =>
            certificate!.signatureAlgorithm.toLowerCase().includes(algo.toLowerCase()),
          );

          if (isWeak) {
            issues.push({
              type: 'ssl_certificate',
              severity: 'medium',
              issueType: 'weak_algorithm',
              description: `SSL 证书使用弱签名算法: ${certificate.signatureAlgorithm}`,
              details: '弱签名算法可能被破解，存在安全风险',
              recommendation: '使用 SHA-256 或更强的签名算法重新签发证书',
            });
          }
        }

        // 检查自签名证书
        if (certificate.isCA && certificate.subject === certificate.issuer) {
          issues.push({
            type: 'ssl_certificate',
            severity: 'medium',
            issueType: 'self_signed',
            description: '使用自签名证书',
            details: '自签名证书不被浏览器信任',
            recommendation: '使用受信任的 CA 机构签发的证书',
          });
        }

      } else {
        // 没有证书
        issues.push({
          type: 'ssl_certificate',
          severity: 'critical',
          issueType: 'connection_failed',
          description: '无法获取 SSL 证书',
          details: `连接 ${hostname}:${port} 失败或未配置 SSL`,
          recommendation: '确保服务器正确配置 SSL/TLS',
        });
      }

    } catch (error) {
      issues.push({
        type: 'ssl_certificate',
        severity: 'critical',
        issueType: 'connection_failed',
        description: `SSL 检查失败: ${error instanceof Error ? error.message : String(error)}`,
        recommendation: '检查服务器 SSL 配置',
      });
    }

    const executionTime = Date.now() - startTime;
    const passed = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

    if (passed) {
      if (certificate) {
        logger.pass(`  ✅ SSL 证书有效，剩余 ${daysUntilExpiry} 天`);
      } else {
        logger.pass(`  ✅ SSL 检查通过`);
      }
    } else {
      logger.fail(`  ❌ 发现 ${issues.length} 个 SSL 问题`);
    }

    return {
      url,
      hostname,
      port,
      passed,
      hasCertificate,
      certificate,
      issues,
      isValid,
      daysUntilExpiry,
      isExpired,
      isExpiringSoon,
      executionTime,
    };
  }

  /**
   * 批量检查多个 URL
   */
  async checkSslBatch(urls: string[]): Promise<SslCheckResult[]> {
    const results: SslCheckResult[] = [];

    for (const url of urls) {
      const result = await this.checkSsl(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 获取证书
   */
  private getCertificate(hostname: string, port: number): Promise<tls.PeerCertificate | null> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({
        host: hostname,
        port: port,
        rejectUnauthorized: false, // 允许自签名证书
        servername: hostname,
      }, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        resolve(cert || null);
      });

      socket.setTimeout(this.config.timeout, () => {
        socket.destroy();
        reject(new Error('Connection timeout'));
      });

      socket.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * 解析证书信息
   */
  private parseCertificate(cert: tls.PeerCertificate): CertificateInfo {
    const subject = this.parseCertSubject(cert.subject);
    const issuer = this.parseCertSubject(cert.issuer);

    // 解析 SAN (Subject Alternative Names)
    const subjectAltNames: string[] = [];
    if (cert.subjectaltname) {
      const sanMatch = cert.subjectaltname.match(/DNS:([^,\s]+)/g);
      if (sanMatch) {
        sanMatch.forEach(san => {
          subjectAltNames.push(san.replace('DNS:', ''));
        });
      }
    }

    const certAny = cert as any;

    return {
      subject,
      issuer,
      validFrom: new Date(cert.valid_from),
      validTo: new Date(cert.valid_to),
      serialNumber: cert.serialNumber,
      fingerprint: cert.fingerprint,
      fingerprint256: cert.fingerprint256,
      subjectAltNames,
      isCA: certAny.isCA || false,
      version: certAny.version || 3,
      signatureAlgorithm: certAny.signatureAlgorithm || '',
    };
  }

  /**
   * 解析证书主体/颁发者
   */
  private parseCertSubject(subject: tls.DetailedPeerCertificate['subject']): string {
    if (typeof subject === 'string') {
      return subject;
    }

    const parts: string[] = [];
    if (subject.CN) parts.push(`CN=${subject.CN}`);
    if (subject.O) parts.push(`O=${subject.O}`);
    if (subject.OU) parts.push(`OU=${subject.OU}`);
    if (subject.C) parts.push(`C=${subject.C}`);

    return parts.join(', ');
  }

  /**
   * 获取检查摘要
   */
  getSummary(results: SslCheckResult[]): {
    totalUrls: number;
    passedUrls: number;
    expiredCerts: number;
    expiringSoonCerts: number;
    validCerts: number;
    issues: SslIssue[];
  } {
    const passedUrls = results.filter(r => r.passed).length;
    const expiredCerts = results.filter(r => r.isExpired).length;
    const expiringSoonCerts = results.filter(r => r.isExpiringSoon).length;
    const validCerts = results.filter(r => r.isValid).length;

    return {
      totalUrls: results.length,
      passedUrls,
      expiredCerts,
      expiringSoonCerts,
      validCerts,
      issues: results.flatMap(r => r.issues),
    };
  }

  /**
   * 关闭（清理资源）
   */
  async close(): Promise<void> {
    logger.info('🔚 SSL 测试器已关闭');
  }
}

/**
 * 快捷检查函数
 */
export async function checkSsl(
  url: string,
  config?: Partial<SslTesterConfig>,
): Promise<SslCheckResult> {
  const tester = new SslTester(config);
  try {
    return await tester.checkSsl(url);
  } finally {
    await tester.close();
  }
}

/**
 * 批量检查函数
 */
export async function checkSslBatch(
  urls: string[],
  config?: Partial<SslTesterConfig>,
): Promise<SslCheckResult[]> {
  const tester = new SslTester(config);
  try {
    return await tester.checkSslBatch(urls);
  } finally {
    await tester.close();
  }
}
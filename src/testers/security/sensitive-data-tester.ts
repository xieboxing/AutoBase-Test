import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * 敏感信息类型
 */
export type SensitiveDataType =
  | 'api_key'
  | 'secret_key'
  | 'access_token'
  | 'private_key'
  | 'password'
  | 'credential'
  | 'jwt'
  | 'aws_key'
  | 'database_url'
  | 'credit_card'
  | 'ssn'
  | 'email'
  | 'phone'
  | 'ip_address';

/**
 * 敏感信息模式
 */
export interface SensitiveDataPattern {
  type: SensitiveDataType;
  name: string;
  patterns: RegExp[];
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

/**
 * 敏感信息检测结果
 */
export interface SensitiveDataResult {
  url: string;
  passed: boolean;
  findings: SensitiveDataFinding[];
  scannedSources: string[];
  executionTime: number;
}

/**
 * 敏感信息发现
 */
export interface SensitiveDataFinding extends SecurityIssue {
  dataType: SensitiveDataType;
  match: string;
  location: string;
  line?: number;
  context?: string;
}

/**
 * 敏感信息检测器配置
 */
export interface SensitiveDataTesterConfig {
  timeout: number;
  checkPageSource: boolean;
  checkScripts: boolean;
  checkNetworkRequests: boolean;
  checkConsole: boolean;
  checkComments: boolean;
  checkMetaTags: boolean;
  customPatterns: SensitiveDataPattern[];
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_SENSITIVE_DATA_CONFIG: SensitiveDataTesterConfig = {
  timeout: 30000,
  checkPageSource: true,
  checkScripts: true,
  checkNetworkRequests: true,
  checkConsole: true,
  checkComments: true,
  checkMetaTags: true,
  customPatterns: [],
  artifactsDir: './data/screenshots/security',
};

/**
 * 预定义的敏感信息模式
 */
const SENSITIVE_DATA_PATTERNS: SensitiveDataPattern[] = [
  {
    type: 'api_key',
    name: 'API Key',
    patterns: [
      /(?:api[_-]?key|apikey)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
      /(?:x-api-key)['":\s]*['"]?([a-zA-Z0-9_-]{20,})['"]?/gi,
    ],
    severity: 'high',
    description: 'API 密钥泄露',
    recommendation: '将 API 密钥移至服务端，不要暴露在前端代码中',
  },
  {
    type: 'secret_key',
    name: 'Secret Key',
    patterns: [
      /(?:secret[_-]?key|secretkey)['":\s]*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
      /(?:client[_-]?secret)['":\s]*['"]?([a-zA-Z0-9_-]{16,})['"]?/gi,
    ],
    severity: 'critical',
    description: '密钥泄露',
    recommendation: '立即更换密钥，使用环境变量或密钥管理服务',
  },
  {
    type: 'access_token',
    name: 'Access Token',
    patterns: [
      /(?:access[_-]?token|accesstoken)['":\s]*['"]?([a-zA-Z0-9_.-]{20,})['"]?/gi,
      /(?:bearer)\s+([a-zA-Z0-9_.-]{20,})/gi,
    ],
    severity: 'high',
    description: '访问令牌泄露',
    recommendation: '使用短期有效的令牌，实现令牌刷新机制',
  },
  {
    type: 'private_key',
    name: 'Private Key',
    patterns: [
      /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
      /-----BEGIN\s+OPENSSH\s+PRIVATE\s+KEY-----/gi,
    ],
    severity: 'critical',
    description: '私钥泄露',
    recommendation: '立即更换私钥，检查是否有未授权访问',
  },
  {
    type: 'jwt',
    name: 'JWT Token',
    patterns: [
      /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    ],
    severity: 'high',
    description: 'JWT 令牌泄露',
    recommendation: '检查 JWT 是否包含敏感信息，使用短期令牌',
  },
  {
    type: 'aws_key',
    name: 'AWS Access Key',
    patterns: [
      /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
      /(?:aws[_-]?access[_-]?key[_-]?id)['":\s]*['"]?([A-Z0-9]{20})['"]?/gi,
      /(?:aws[_-]?secret[_-]?access[_-]?key)['":\s]*['"]?([a-zA-Z0-9/+=]{40})['"]?/gi,
    ],
    severity: 'critical',
    description: 'AWS 凭证泄露',
    recommendation: '立即禁用并更换 AWS 密钥，使用 IAM 角色',
  },
  {
    type: 'database_url',
    name: 'Database Connection URL',
    patterns: [
      /(?:mysql|postgres|mongodb|redis):\/\/[^\s'"]+:[^\s'"]+@[^\s'"]+/gi,
      /jdbc:[a-z]+:\/\/[^\s'"]+/gi,
    ],
    severity: 'critical',
    description: '数据库连接字符串泄露',
    recommendation: '使用环境变量存储连接字符串，限制数据库访问 IP',
  },
  {
    type: 'password',
    name: 'Password',
    patterns: [
      /(?:password|passwd|pwd)['":\s]*['"]?([^'"\s]{8,})['"]?/gi,
    ],
    severity: 'critical',
    description: '密码泄露',
    recommendation: '立即更换密码，不要在代码中硬编码密码',
  },
  {
    type: 'credit_card',
    name: 'Credit Card Number',
    patterns: [
      /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    ],
    severity: 'critical',
    description: '信用卡号泄露',
    recommendation: '立即报告安全团队，遵循 PCI DSS 规范',
  },
  {
    type: 'ssn',
    name: 'Social Security Number',
    patterns: [
      /\b\d{3}-\d{2}-\d{4}\b/g,
    ],
    severity: 'critical',
    description: '社会安全号码泄露',
    recommendation: '立即报告安全团队，遵守数据保护法规',
  },
  {
    type: 'email',
    name: 'Email Address',
    patterns: [
      /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    ],
    severity: 'low',
    description: '邮箱地址泄露',
    recommendation: '考虑是否需要暴露邮箱地址',
  },
  {
    type: 'phone',
    name: 'Phone Number',
    patterns: [
      /\b(?:\+?1[-.]?)?\(?[0-9]{3}\)?[-.]?[0-9]{3}[-.]?[0-9]{4}\b/g,
      /\b(?:\+?86[-.]?)?1[3-9][0-9]{9}\b/g, // 中国手机号
    ],
    severity: 'low',
    description: '电话号码泄露',
    recommendation: '考虑是否需要暴露电话号码',
  },
  {
    type: 'ip_address',
    name: 'Internal IP Address',
    patterns: [
      /\b(?:10\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){2}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      /\b172\.(?:1[6-9]|2[0-9]|3[01])\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
      /\b192\.168\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    ],
    severity: 'medium',
    description: '内网 IP 地址泄露',
    recommendation: '不要暴露内网 IP 地址信息',
  },
];

/**
 * 敏感信息泄露检测器
 */
export class SensitiveDataTester {
  private config: SensitiveDataTesterConfig;
  private patterns: SensitiveDataPattern[];
  private testId: string;

  constructor(config: Partial<SensitiveDataTesterConfig> = {}) {
    this.config = { ...DEFAULT_SENSITIVE_DATA_CONFIG, ...config };
    this.patterns = [...SENSITIVE_DATA_PATTERNS, ...this.config.customPatterns];
    this.testId = nanoid(8);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    logger.pass('✅ 敏感信息检测器初始化完成');
  }

  /**
   * 扫描页面
   */
  async scanPage(url: string, pageContent: string): Promise<SensitiveDataResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.step(`🔍 扫描敏感信息: ${url}`);

    const findings: SensitiveDataFinding[] = [];
    const scannedSources: string[] = [];

    // 扫描页面源码
    if (this.config.checkPageSource) {
      const sourceFindings = this.scanContent(pageContent, 'page_source');
      findings.push(...sourceFindings);
      scannedSources.push('page_source');
    }

    // 扫描注释
    if (this.config.checkComments) {
      const comments = this.extractComments(pageContent);
      const commentFindings = this.scanContent(comments, 'html_comments');
      findings.push(...commentFindings);
      scannedSources.push('html_comments');
    }

    // 扫描 meta 标签
    if (this.config.checkMetaTags) {
      const metaContent = this.extractMetaTags(pageContent);
      const metaFindings = this.scanContent(metaContent, 'meta_tags');
      findings.push(...metaFindings);
      scannedSources.push('meta_tags');
    }

    const executionTime = Date.now() - startTime;
    const passed = findings.filter(f => f.severity === 'critical' || f.severity === 'high').length === 0;

    if (passed) {
      logger.pass(`  ✅ 未发现敏感信息泄露`);
    } else {
      logger.fail(`  ❌ 发现 ${findings.length} 处敏感信息泄露`);
    }

    return {
      url,
      passed,
      findings,
      scannedSources,
      executionTime,
    };
  }

  /**
   * 扫描内容
   */
  scanContent(content: string, location: string): SensitiveDataFinding[] {
    const findings: SensitiveDataFinding[] = [];

    for (const pattern of this.patterns) {
      for (const regex of pattern.patterns) {
        const matches = content.matchAll(regex);

        for (const match of matches) {
          // 获取匹配位置
          const lineNumber = this.getLineNumber(content, match.index || 0);
          const context = this.getContext(content, match.index || 0, 50);

          findings.push({
            type: 'sensitive_data_exposure',
            severity: pattern.severity,
            dataType: pattern.type,
            description: `${pattern.name}: ${pattern.description}`,
            match: this.maskSensitiveData(match[0]),
            location,
            line: lineNumber,
            context,
            recommendation: pattern.recommendation,
          });
        }
      }
    }

    return findings;
  }

  /**
   * 扫描脚本内容
   */
  scanScriptContent(scriptContent: string, scriptUrl: string): SensitiveDataFinding[] {
    return this.scanContent(scriptContent, `script: ${scriptUrl}`);
  }

  /**
   * 扫描网络请求
   */
  scanNetworkRequest(url: string, headers: Record<string, string>, body?: string): SensitiveDataFinding[] {
    const findings: SensitiveDataFinding[] = [];

    // 扫描 URL
    const urlFindings = this.scanContent(url, 'request_url');
    findings.push(...urlFindings);

    // 扫描 headers
    const headerString = Object.entries(headers)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
    const headerFindings = this.scanContent(headerString, 'request_headers');
    findings.push(...headerFindings);

    // 扫描 body
    if (body) {
      const bodyFindings = this.scanContent(body, 'request_body');
      findings.push(...bodyFindings);
    }

    return findings;
  }

  /**
   * 扫描控制台输出
   */
  scanConsoleOutput(messages: string[]): SensitiveDataFinding[] {
    const content = messages.join('\n');
    return this.scanContent(content, 'console_output');
  }

  /**
   * 提取 HTML 注释
   */
  private extractComments(html: string): string {
    const comments: string[] = [];
    const regex = /<!--[\s\S]*?-->/g;
    let match;

    while ((match = regex.exec(html)) !== null) {
      comments.push(match[0]);
    }

    return comments.join('\n');
  }

  /**
   * 提取 meta 标签内容
   */
  private extractMetaTags(html: string): string {
    const metaContents: string[] = [];
    const regex = /<meta[^>]+(?:content|value)=['"]([^'"]+)['"][^>]*>/gi;
    let match;

    while ((match = regex.exec(html)) !== null) {
      if (match[1]) {
        metaContents.push(match[1]);
      }
    }

    return metaContents.join('\n');
  }

  /**
   * 获取行号
   */
  private getLineNumber(content: string, index: number): number {
    const lines = content.substring(0, index).split('\n');
    return lines.length;
  }

  /**
   * 获取上下文
   */
  private getContext(content: string, index: number, radius: number): string {
    const start = Math.max(0, index - radius);
    const end = Math.min(content.length, index + radius);
    return content.substring(start, end);
  }

  /**
   * 脱敏敏感数据
   */
  private maskSensitiveData(data: string): string {
    if (data.length <= 8) {
      return '*'.repeat(data.length);
    }

    const start = data.substring(0, 4);
    const end = data.substring(data.length - 4);
    const middle = '*'.repeat(Math.min(data.length - 8, 20));

    return `${start}${middle}${end}`;
  }

  /**
   * 添加自定义模式
   */
  addPattern(pattern: SensitiveDataPattern): void {
    this.patterns.push(pattern);
  }

  /**
   * 获取所有模式
   */
  getPatterns(): SensitiveDataPattern[] {
    return [...this.patterns];
  }

  /**
   * 获取检测摘要
   */
  getSummary(results: SensitiveDataResult[]): {
    totalScanned: number;
    passedScans: number;
    totalFindings: number;
    criticalFindings: number;
    highFindings: number;
    findingsByType: Record<string, number>;
  } {
    const passedScans = results.filter(r => r.passed).length;
    const allFindings = results.flatMap(r => r.findings);

    const findingsByType: Record<string, number> = {};
    for (const finding of allFindings) {
      findingsByType[finding.dataType] = (findingsByType[finding.dataType] || 0) + 1;
    }

    return {
      totalScanned: results.length,
      passedScans,
      totalFindings: allFindings.length,
      criticalFindings: allFindings.filter(f => f.severity === 'critical').length,
      highFindings: allFindings.filter(f => f.severity === 'high').length,
      findingsByType,
    };
  }

  /**
   * 关闭（清理资源）
   */
  async close(): Promise<void> {
    logger.info('🔚 敏感信息检测器已关闭');
  }
}

/**
 * 快捷扫描函数
 */
export async function scanPageForSensitiveData(
  url: string,
  pageContent: string,
  config?: Partial<SensitiveDataTesterConfig>,
): Promise<SensitiveDataResult> {
  const tester = new SensitiveDataTester(config);
  try {
    return await tester.scanPage(url, pageContent);
  } finally {
    await tester.close();
  }
}

/**
 * 导出模式和类型
 */
export { SENSITIVE_DATA_PATTERNS };
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * 安全头检查结果
 */
export interface HeaderCheckResult {
  url: string;
  passed: boolean;
  headers: Record<string, string>;
  missingHeaders: SecurityHeaderIssue[];
  weakHeaders: SecurityHeaderIssue[];
  presentHeaders: SecurityHeaderInfo[];
  executionTime: number;
}

/**
 * 安全头问题
 */
export interface SecurityHeaderIssue extends SecurityIssue {
  headerName: string;
  expectedValue?: string;
  actualValue?: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

/**
 * 安全头信息
 */
export interface SecurityHeaderInfo {
  name: string;
  value: string;
  status: 'good' | 'warning' | 'missing';
  description: string;
}

/**
 * 必须检查的安全头配置
 */
export interface RequiredSecurityHeader {
  name: string;
  required: boolean;
  recommendedValue?: string | RegExp;
  description: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  checkFunction?: (value: string) => boolean;
}

/**
 * 安全头列表配置
 */
const SECURITY_HEADERS: RequiredSecurityHeader[] = [
  {
    name: 'Strict-Transport-Security',
    required: true,
    recommendedValue: /max-age=\d{6,}/,
    description: 'HSTS 强制使用 HTTPS 连接',
    severity: 'high',
    checkFunction: (value: string) => {
      // 至少 6 个月的 max-age
      const maxAgeMatch = value.match(/max-age=(\d+)/);
      if (!maxAgeMatch) return false;
      const maxAge = parseInt(maxAgeMatch[1]!, 10);
      return maxAge >= 15768000; // 6个月 = 6 * 30 * 24 * 60 * 60
    },
  },
  {
    name: 'Content-Security-Policy',
    required: true,
    description: 'CSP 防止 XSS 和数据注入攻击',
    severity: 'critical',
    checkFunction: (value: string) => {
      // 检查是否有有效的 CSP 指令
      const directives = ['default-src', 'script-src', 'style-src', 'img-src', 'connect-src'];
      return directives.some(d => value.includes(d));
    },
  },
  {
    name: 'X-Content-Type-Options',
    required: true,
    recommendedValue: 'nosniff',
    description: '防止 MIME 类型嗅探',
    severity: 'medium',
    checkFunction: (value: string) => value.toLowerCase() === 'nosniff',
  },
  {
    name: 'X-Frame-Options',
    required: true,
    recommendedValue: /DENY|SAMEORIGIN/,
    description: '防止点击劫持攻击',
    severity: 'medium',
    checkFunction: (value: string) => {
      const upperValue = value.toUpperCase();
      return upperValue === 'DENY' || upperValue === 'SAMEORIGIN' || upperValue.startsWith('ALLOW-FROM');
    },
  },
  {
    name: 'X-XSS-Protection',
    required: false, // 现代浏览器已弃用，但仍建议检查
    recommendedValue: '1; mode=block',
    description: '启用浏览器 XSS 过滤器（已弃用）',
    severity: 'low',
    checkFunction: (value: string) => value === '1; mode=block' || value === '1',
  },
  {
    name: 'Referrer-Policy',
    required: true,
    recommendedValue: /strict-origin|strict-origin-when-cross-origin|no-referrer/,
    description: '控制 Referrer 信息泄露',
    severity: 'medium',
    checkFunction: (value: string) => {
      const safeValues = [
        'no-referrer',
        'no-referrer-when-downgrade',
        'strict-origin',
        'strict-origin-when-cross-origin',
        'same-origin',
      ];
      return safeValues.includes(value.toLowerCase());
    },
  },
  {
    name: 'Permissions-Policy',
    required: false, // 新标准，建议检查
    description: '控制浏览器功能权限（摄像头、地理位置等）',
    severity: 'medium',
    checkFunction: (value: string) => {
      // 检查是否有有效的策略
      return value.length > 0 && value.includes('=') || value === '';
    },
  },
  {
    name: 'Cross-Origin-Opener-Policy',
    required: false,
    description: '防止跨域打开者攻击',
    severity: 'medium',
    checkFunction: (value: string) => {
      const validValues = ['same-origin', 'same-origin-allow-popups', 'unsafe-none'];
      return validValues.includes(value);
    },
  },
  {
    name: 'Cross-Origin-Resource-Policy',
    required: false,
    description: '防止跨域资源访问',
    severity: 'medium',
    checkFunction: (value: string) => {
      const validValues = ['same-origin', 'same-site', 'cross-origin'];
      return validValues.includes(value);
    },
  },
  {
    name: 'Cross-Origin-Embedder-Policy',
    required: false,
    description: '防止跨域嵌入资源攻击',
    severity: 'medium',
    checkFunction: (value: string) => {
      const validValues = ['require-corp', 'credentialless'];
      return validValues.includes(value);
    },
  },
];

/**
 * 安全头测试器配置
 */
export interface HeaderTesterConfig {
  timeout: number;
  userAgent?: string;
  artifactsDir: string;
  checkRedirects: boolean;
  followRedirects: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_HEADER_TESTER_CONFIG: HeaderTesterConfig = {
  timeout: 30000,
  artifactsDir: './data/screenshots/security',
  checkRedirects: true,
  followRedirects: true,
};

/**
 * HTTP 安全头测试器
 * 检查网站 HTTP 响应头的安全性配置
 */
export class HeaderTester {
  private config: HeaderTesterConfig;
  private testId: string;

  constructor(config: Partial<HeaderTesterConfig> = {}) {
    this.config = { ...DEFAULT_HEADER_TESTER_CONFIG, ...config };
    this.testId = nanoid(8);
  }

  /**
   * 初始化（创建目录）
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    logger.pass('✅ 安全头测试器初始化完成');
  }

  /**
   * 检查单个 URL 的安全头
   */
  async checkHeaders(url: string): Promise<HeaderCheckResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.step(`🔒 检查安全头: ${url}`);

    const missingHeaders: SecurityHeaderIssue[] = [];
    const weakHeaders: SecurityHeaderIssue[] = [];
    const presentHeaders: SecurityHeaderInfo[] = [];
    let headers: Record<string, string> = {};

    try {
      // 使用原生 fetch 获取响应头
      const response = await fetch(url, {
        method: 'GET',
        redirect: this.config.followRedirects ? 'follow' : 'manual',
      });

      // 获取所有响应头
      headers = this.extractHeaders(response.headers);

      // 检查每个安全头
      for (const headerConfig of SECURITY_HEADERS) {
        const headerValue = headers[headerConfig.name.toLowerCase()] ||
                           headers[headerConfig.name] ||
                           this.findHeaderCaseInsensitive(headers, headerConfig.name);

        if (!headerValue) {
          if (headerConfig.required) {
            missingHeaders.push({
              type: 'missing_security_header',
              severity: headerConfig.severity,
              headerName: headerConfig.name,
              description: `缺少安全头 "${headerConfig.name}": ${headerConfig.description}`,
              recommendation: `添加 ${headerConfig.name} 响应头。建议值: ${headerConfig.recommendedValue?.toString() || '根据业务需求配置'}`,
            });
          }
          presentHeaders.push({
            name: headerConfig.name,
            value: '',
            status: headerConfig.required ? 'missing' : 'warning',
            description: headerConfig.description,
          });
        } else {
          // 检查值是否符合推荐
          const isValid = headerConfig.checkFunction?.(headerValue) ?? true;
          const matchesRecommended = headerConfig.recommendedValue
            ? (typeof headerConfig.recommendedValue === 'string'
              ? headerValue === headerConfig.recommendedValue
              : headerConfig.recommendedValue.test(headerValue))
            : true;

          if (!isValid || !matchesRecommended) {
            weakHeaders.push({
              type: 'weak_security_header',
              severity: headerConfig.severity === 'critical' ? 'high' : 'medium',
              headerName: headerConfig.name,
              actualValue: headerValue,
              expectedValue: headerConfig.recommendedValue?.toString(),
              description: `安全头 "${headerConfig.name}" 配置不安全: ${headerConfig.description}`,
              recommendation: `当前值 "${headerValue}" 不符合最佳实践。建议值: ${headerConfig.recommendedValue?.toString() || '根据最佳实践配置'}`,
            });
          }

          presentHeaders.push({
            name: headerConfig.name,
            value: headerValue,
            status: isValid && matchesRecommended ? 'good' : 'warning',
            description: headerConfig.description,
          });
        }
      }

      // 检查重定向链（如果启用）
      if (this.config.checkRedirects) {
        await this.checkRedirectChain(url, missingHeaders);
      }

    } catch (error) {
      logger.fail(`  ❌ 无法访问 URL: ${error}`);
      return {
        url,
        passed: false,
        headers,
        missingHeaders: [{
          type: 'connection_error',
          severity: 'critical',
          headerName: 'Connection',
          description: `无法访问 URL: ${error instanceof Error ? error.message : String(error)}`,
          recommendation: '检查 URL 是否可访问，确保服务器正常运行',
        }],
        weakHeaders,
        presentHeaders,
        executionTime: Date.now() - startTime,
      };
    }

    const executionTime = Date.now() - startTime;
    const passed = missingHeaders.filter(h => h.severity === 'critical' || h.severity === 'high').length === 0;

    if (passed) {
      logger.pass(`  ✅ 安全头检查通过 (${presentHeaders.filter(h => h.status === 'good').length}/${SECURITY_HEADERS.length} 正常)`);
    } else {
      logger.fail(`  ❌ 发现 ${missingHeaders.length} 个缺失安全头，${weakHeaders.length} 个配置不安全`);
    }

    return {
      url,
      passed,
      headers,
      missingHeaders,
      weakHeaders,
      presentHeaders,
      executionTime,
    };
  }

  /**
   * 批量检查多个 URL
   */
  async checkHeadersBatch(urls: string[]): Promise<HeaderCheckResult[]> {
    const results: HeaderCheckResult[] = [];

    for (const url of urls) {
      const result = await this.checkHeaders(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 检查重定向链的安全性
   */
  private async checkRedirectChain(url: string, issues: SecurityHeaderIssue[]): Promise<void> {
    try {
      const response = await fetch(url, { method: 'GET', redirect: 'manual' });

      // 检查是否有重定向
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          // 检查是否重定向到 HTTPS
          if (location.startsWith('http://') && !url.startsWith('http://')) {
            issues.push({
              type: 'unsafe_redirect',
              severity: 'high',
              headerName: 'Location',
              actualValue: location,
              description: '重定向到不安全的 HTTP URL',
              recommendation: '所有重定向应指向 HTTPS URL',
            });
          }

          // 递归检查重定向链
          if (this.config.followRedirects) {
            await this.checkRedirectChain(location, issues);
          }
        }
      }
    } catch {
      // 忽略重定向检查错误
    }
  }

  /**
   * 提取响应头为普通对象
   */
  private extractHeaders(responseHeaders: Headers): Record<string, string> {
    const headers: Record<string, string> = {};

    responseHeaders.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    return headers;
  }

  /**
   * 查找大小写不敏感的 header
   */
  private findHeaderCaseInsensitive(
    headers: Record<string, string>,
    targetName: string,
  ): string | undefined {
    const lowerTarget = targetName.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === lowerTarget) {
        return value;
      }
    }
    return undefined;
  }

  /**
   * 生成检查报告摘要
   */
  getSummary(results: HeaderCheckResult[]): {
    totalUrls: number;
    passedUrls: number;
    totalMissingHeaders: number;
    totalWeakHeaders: number;
    commonMissingHeaders: string[];
  } {
    const passedUrls = results.filter(r => r.passed).length;
    const allMissing = results.flatMap(r => r.missingHeaders);
    const allWeak = results.flatMap(r => r.weakHeaders);

    // 统计最常见的缺失头
    const missingCounts: Record<string, number> = {};
    for (const issue of allMissing) {
      missingCounts[issue.headerName] = (missingCounts[issue.headerName] || 0) + 1;
    }

    const commonMissingHeaders = Object.entries(missingCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);

    return {
      totalUrls: results.length,
      passedUrls,
      totalMissingHeaders: allMissing.length,
      totalWeakHeaders: allWeak.length,
      commonMissingHeaders,
    };
  }

  /**
   * 关闭（清理资源）
   */
  async close(): Promise<void> {
    logger.info('🔚 安全头测试器已关闭');
  }
}

/**
 * 快捷检查函数
 */
export async function checkSecurityHeaders(
  url: string,
  config?: Partial<HeaderTesterConfig>,
): Promise<HeaderCheckResult> {
  const tester = new HeaderTester(config);
  try {
    return await tester.checkHeaders(url);
  } finally {
    await tester.close();
  }
}

/**
 * 批量检查函数
 */
export async function checkSecurityHeadersBatch(
  urls: string[],
  config?: Partial<HeaderTesterConfig>,
): Promise<HeaderCheckResult[]> {
  const tester = new HeaderTester(config);
  try {
    return await tester.checkHeadersBatch(urls);
  } finally {
    await tester.close();
  }
}

/**
 * 导出安全头配置列表
 */
export { SECURITY_HEADERS };
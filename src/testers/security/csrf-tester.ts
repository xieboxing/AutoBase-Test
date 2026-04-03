import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * CSRF 检查结果
 */
export interface CsrfCheckResult {
  url: string;
  passed: boolean;
  forms: FormCsrfResult[];
  cookieAnalysis: CookieCsrfResult[];
  issues: CsrfIssue[];
  executionTime: number;
}

/**
 * 表单 CSRF 检查结果
 */
export interface FormCsrfResult {
  formSelector: string;
  action: string;
  method: string;
  hasCsrfToken: boolean;
  tokenFieldName?: string;
  tokenLocation: 'hidden_field' | 'header' | 'cookie' | 'none';
  vulnerable: boolean;
}

/**
 * Cookie CSRF 检查结果
 */
export interface CookieCsrfResult {
  name: string;
  hasSameSite: boolean;
  sameSiteValue?: string;
  isSecure: boolean;
  isHttpOnly: boolean;
  vulnerable: boolean;
}

/**
 * CSRF 问题
 */
export interface CsrfIssue extends SecurityIssue {
  issueType: 'missing_csrf_token' | 'weak_same_site' | 'form_vulnerable' | 'cookie_vulnerable';
  formSelector?: string;
  cookieName?: string;
  details?: string;
}

/**
 * CSRF 测试器配置
 */
export interface CsrfTesterConfig {
  timeout: number;
  checkForms: boolean;
  checkCookies: boolean;
  checkHeaders: boolean;
  csrfTokenNames: string[];
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_CSRF_TESTER_CONFIG: CsrfTesterConfig = {
  timeout: 30000,
  checkForms: true,
  checkCookies: true,
  checkHeaders: true,
  csrfTokenNames: [
    'csrf_token',
    'csrfmiddlewaretoken',
    '_csrf',
    '_token',
    'authenticity_token',
    'antiForgeryToken',
    '__RequestVerificationToken',
    'csrf',
    'token',
  ],
  artifactsDir: './data/screenshots/security',
};

/**
 * CSRF 防护检测器
 */
export class CsrfTester {
  private config: CsrfTesterConfig;
  private testId: string;

  constructor(config: Partial<CsrfTesterConfig> = {}) {
    this.config = { ...DEFAULT_CSRF_TESTER_CONFIG, ...config };
    this.testId = nanoid(8);
  }

  /**
   * 初始化
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    logger.pass('✅ CSRF 检测器初始化完成');
  }

  /**
   * 检查页面 CSRF 防护
   */
  async checkCsrf(url: string, pageContent: string, cookies: CookieInfo[] = []): Promise<CsrfCheckResult> {
    await this.initialize();

    const startTime = Date.now();
    logger.step(`🛡️ 检查 CSRF 防护: ${url}`);

    const issues: CsrfIssue[] = [];
    const forms: FormCsrfResult[] = [];
    const cookieResults: CookieCsrfResult[] = [];

    // 检查表单 CSRF Token
    if (this.config.checkForms) {
      const formResults = this.analyzeForms(pageContent);
      forms.push(...formResults);

      for (const form of formResults) {
        if (form.vulnerable) {
          issues.push({
            type: 'csrf_vulnerability',
            severity: 'high',
            issueType: 'missing_csrf_token',
            formSelector: form.formSelector,
            description: `表单 "${form.formSelector}" 缺少 CSRF Token`,
            details: `Action: ${form.action}, Method: ${form.method}`,
            recommendation: '为表单添加 CSRF Token 隐藏字段',
          });
        }
      }
    }

    // 检查 Cookie SameSite 属性
    if (this.config.checkCookies && cookies.length > 0) {
      for (const cookie of cookies) {
        const cookieResult = this.analyzeCookie(cookie);
        cookieResults.push(cookieResult);

        if (cookieResult.vulnerable) {
          issues.push({
            type: 'csrf_vulnerability',
            severity: 'medium',
            issueType: 'weak_same_site',
            cookieName: cookie.name,
            description: `Cookie "${cookie.name}" 缺少 SameSite 属性或设置不安全`,
            details: `SameSite: ${cookieResult.sameSiteValue || '未设置'}, Secure: ${cookieResult.isSecure}`,
            recommendation: '为 Session Cookie 设置 SameSite=Strict 或 SameSite=Lax',
          });
        }
      }
    }

    const executionTime = Date.now() - startTime;
    const passed = issues.filter(i => i.severity === 'critical' || i.severity === 'high').length === 0;

    if (passed) {
      logger.pass(`  ✅ CSRF 防护检查通过`);
    } else {
      logger.fail(`  ❌ 发现 ${issues.length} 个 CSRF 防护问题`);
    }

    return {
      url,
      passed,
      forms,
      cookieAnalysis: cookieResults,
      issues,
      executionTime,
    };
  }

  /**
   * 分析页面中的表单
   */
  private analyzeForms(html: string): FormCsrfResult[] {
    const forms: FormCsrfResult[] = [];

    // 提取所有表单
    const formRegex = /<form[^>]*>([\s\S]*?)<\/form>/gi;
    let formMatch;

    while ((formMatch = formRegex.exec(html)) !== null) {
      const formHtml = formMatch[0];
      const formSelector = this.extractFormSelector(formHtml);

      // 提取 action 和 method
      const actionMatch = formHtml.match(/action\s*=\s*['"]([^'"]*)['"]/i);
      const methodMatch = formHtml.match(/method\s*=\s*['"]([^'"]*)['"]/i);

      const action = actionMatch && actionMatch[1] ? actionMatch[1] : '';
      const method = methodMatch && methodMatch[1] ? methodMatch[1].toUpperCase() : 'GET';

      // 检查是否有 CSRF Token
      const csrfCheck = this.checkFormCsrfToken(formHtml);

      // GET 表单通常不需要 CSRF Token
      const needsCsrf = method === 'POST' || method === 'PUT' || method === 'DELETE';

      forms.push({
        formSelector,
        action,
        method,
        hasCsrfToken: csrfCheck.hasToken,
        tokenFieldName: csrfCheck.tokenName,
        tokenLocation: csrfCheck.location,
        vulnerable: needsCsrf && !csrfCheck.hasToken,
      });
    }

    return forms;
  }

  /**
   * 提取表单选择器
   */
  private extractFormSelector(formHtml: string): string {
    const idMatch = formHtml.match(/id\s*=\s*['"]([^'"]+)['"]/i);
    const nameMatch = formHtml.match(/name\s*=\s*['"]([^'"]+)['"]/i);
    const classMatch = formHtml.match(/class\s*=\s*['"]([^'"]+)['"]/i);

    if (idMatch) return `#${idMatch[1]}`;
    if (nameMatch) return `form[name="${nameMatch[1]}"]`;
    if (classMatch && classMatch[1]) return `form.${classMatch[1].split(' ')[0]}`;

    return 'form';
  }

  /**
   * 检查表单中的 CSRF Token
   */
  private checkFormCsrfToken(formHtml: string): {
    hasToken: boolean;
    tokenName?: string;
    location: 'hidden_field' | 'header' | 'cookie' | 'none';
  } {
    // 检查隐藏字段中的 CSRF Token
    for (const tokenName of this.config.csrfTokenNames) {
      // 检查 name 属性
      const namePattern = new RegExp(`name\\s*=\\s*['"]${tokenName}['"]`, 'i');
      if (namePattern.test(formHtml)) {
        return {
          hasToken: true,
          tokenName,
          location: 'hidden_field',
        };
      }

      // 检查 id 属性
      const idPattern = new RegExp(`id\\s*=\\s*['"]${tokenName}['"]`, 'i');
      if (idPattern.test(formHtml)) {
        return {
          hasToken: true,
          tokenName,
          location: 'hidden_field',
        };
      }
    }

    // 检查是否有任何隐藏字段可能包含 token
    const hiddenFieldPattern = /<input[^>]+type\s*=\s*['"]hidden['"][^>]*>/gi;
    const hiddenFields = formHtml.match(hiddenFieldPattern) || [];

    for (const field of hiddenFields) {
      // 检查常见的 token 字段名模式
      if (/token|csrf|_t|_key/i.test(field)) {
        const nameMatch = field.match(/name\s*=\s*['"]([^'"]+)['"]/i);
        return {
          hasToken: true,
          tokenName: nameMatch ? nameMatch[1] : 'unknown_token',
          location: 'hidden_field',
        };
      }
    }

    return {
      hasToken: false,
      location: 'none',
    };
  }

  /**
   * 分析 Cookie 的 CSRF 防护属性
   */
  private analyzeCookie(cookie: CookieInfo): CookieCsrfResult {
    const hasSameSite = cookie.sameSite !== undefined && cookie.sameSite !== 'None';
    const sameSiteValue = cookie.sameSite;

    // Cookie 脆弱性判断
    // 如果是会话相关 Cookie 且没有 SameSite，则脆弱
    const isSessionCookie = cookie.name.toLowerCase().includes('session') ||
                            cookie.name.toLowerCase().includes('sess') ||
                            cookie.name.toLowerCase().includes('token');

    const vulnerable = isSessionCookie && !hasSameSite;

    return {
      name: cookie.name,
      hasSameSite,
      sameSiteValue,
      isSecure: cookie.secure || false,
      isHttpOnly: cookie.httpOnly || false,
      vulnerable,
    };
  }

  /**
   * 获取检测摘要
   */
  getSummary(results: CsrfCheckResult[]): {
    totalChecked: number;
    passedChecks: number;
    totalIssues: number;
    vulnerableForms: number;
    weakCookies: number;
  } {
    const passedChecks = results.filter(r => r.passed).length;
    const allIssues = results.flatMap(r => r.issues);

    return {
      totalChecked: results.length,
      passedChecks,
      totalIssues: allIssues.length,
      vulnerableForms: allIssues.filter(i => i.issueType === 'missing_csrf_token').length,
      weakCookies: allIssues.filter(i => i.issueType === 'weak_same_site').length,
    };
  }

  /**
   * 添加自定义 Token 名称
   */
  addTokenName(name: string): void {
    if (!this.config.csrfTokenNames.includes(name)) {
      this.config.csrfTokenNames.push(name);
    }
  }

  /**
   * 关闭（清理资源）
   */
  async close(): Promise<void> {
    logger.info('🔚 CSRF 检测器已关闭');
  }
}

/**
 * Cookie 信息接口
 */
export interface CookieInfo {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

/**
 * 快捷检查函数
 */
export async function checkCsrf(
  url: string,
  pageContent: string,
  cookies?: CookieInfo[],
  config?: Partial<CsrfTesterConfig>,
): Promise<CsrfCheckResult> {
  const tester = new CsrfTester(config);
  try {
    return await tester.checkCsrf(url, pageContent, cookies);
  } finally {
    await tester.close();
  }
}
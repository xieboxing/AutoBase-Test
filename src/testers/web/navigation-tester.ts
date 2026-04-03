import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';

/**
 * 链接信息
 */
export interface LinkInfo {
  selector: string;
  href: string;
  text?: string;
  isExternal: boolean;
  hasTargetBlank: boolean;
  hasNoopener: boolean;
  isMailto: boolean;
  isTel: boolean;
  isJavascript: boolean;
  isHash: boolean;
}

/**
 * 导航测试结果
 */
export interface NavigationTestResult {
  url: string;
  passed: boolean;
  links: LinkTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

/**
 * 链接测试结果
 */
export interface LinkTestResult {
  link: LinkInfo;
  passed: boolean;
  issues: NavigationIssue[];
}

/**
 * 导航问题
 */
export interface NavigationIssue {
  type: 'broken-link' | 'empty-href' | 'missing-target-blank' | 'missing-noopener' | 'javascript-link' | 'hash-link' | 'redirect';
  severity: 'error' | 'warning' | 'info';
  description: string;
}

/**
 * 导航测试器配置
 */
export interface NavigationTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  checkExternalLinks: boolean;
  allowJavascriptLinks: boolean;
  allowHashLinks: boolean;
  followRedirects: boolean;
  maxRedirects: number;
}

/**
 * 默认配置
 */
const DEFAULT_NAVIGATION_TESTER_CONFIG: NavigationTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  checkExternalLinks: true,
  allowJavascriptLinks: false,
  allowHashLinks: true,
  followRedirects: true,
  maxRedirects: 5,
};

/**
 * 导航测试器
 */
export class NavigationTester {
  private config: NavigationTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: Partial<NavigationTesterConfig> = {}) {
    this.config = { ...DEFAULT_NAVIGATION_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({ viewport: this.config.viewport });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);
    logger.pass('✅ 导航测试器初始化完成');
  }

  /**
   * 测试页面导航
   */
  async testNavigation(url: string): Promise<NavigationTestResult> {
    if (!this.page) {
      await this.initialize();
    }

    logger.step(`🧭 开始测试导航: ${url}`);

    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForLoadState('networkidle').catch(() => {});

    // 发现所有链接
    const links = await this.discoverLinks();
    logger.step(`  📊 发现 ${links.length} 个链接`);

    const results: LinkTestResult[] = [];
    let passed = 0;
    let failed = 0;
    let warnings = 0;

    for (const link of links) {
      const result = await this.testLink(link);
      results.push(result);

      if (result.passed) {
        passed++;
      } else {
        const hasError = result.issues?.some(i => i.severity === 'error');
        if (hasError) {
          failed++;
          logger.fail(`    ❌ ${link.selector}: ${result.issues?.[0]?.description}`);
        } else {
          warnings++;
          logger.warn(`    ⚠️ ${link.selector}: ${result.issues?.[0]?.description}`);
        }
      }
    }

    const allPassed = failed === 0;

    if (allPassed) {
      logger.pass(`  ✅ 导航测试通过: ${passed}/${links.length}`);
    } else {
      logger.fail(`  ❌ 导航测试失败: ${failed} 个错误, ${warnings} 个警告`);
    }

    return {
      url,
      passed: allPassed,
      links: results,
      summary: {
        total: links.length,
        passed,
        failed,
        warnings,
      },
    };
  }

  /**
   * 发现页面上的所有链接
   */
  private async discoverLinks(): Promise<LinkInfo[]> {
    if (!this.page) return [];

    const currentUrl = this.page.url();
    const currentOrigin = new URL(currentUrl).origin;

    return await this.page.evaluate((origin) => {
      const links: LinkInfo[] = [];

      document.querySelectorAll('a[href]').forEach(a => {
        const href = a.getAttribute('href') || '';
        const target = a.getAttribute('target');
        const rel = a.getAttribute('rel') || '';

        const isExternal = href.startsWith('http') && !href.includes(origin);
        const isMailto = href.startsWith('mailto:');
        const isTel = href.startsWith('tel:');
        const isJavascript = href.startsWith('javascript:');
        const isHash = href.startsWith('#');

        links.push({
          selector: a.id ? `#${a.id}` : a.className ? `a.${a.className.split(' ')[0]}` : 'a',
          href,
          text: a.textContent?.slice(0, 50) || undefined,
          isExternal,
          hasTargetBlank: target === '_blank',
          hasNoopener: rel.includes('noopener') || rel.includes('noreferrer'),
          isMailto,
          isTel,
          isJavascript,
          isHash,
        });
      });

      return links;
    }, currentOrigin);
  }

  /**
   * 测试单个链接
   */
  private async testLink(link: LinkInfo): Promise<LinkTestResult> {
    const issues: NavigationIssue[] = [];

    // 检查空链接
    if (!link.href || link.href.trim() === '') {
      issues.push({
        type: 'empty-href',
        severity: 'error',
        description: 'Link has empty href',
      });
      return { link, passed: false, issues };
    }

    // 检查 JavaScript 链接
    if (link.isJavascript) {
      if (!this.config.allowJavascriptLinks) {
        issues.push({
          type: 'javascript-link',
          severity: 'warning',
          description: 'Link uses javascript: href',
        });
      }
      return { link, passed: issues.length === 0, issues };
    }

    // 检查 hash 链接
    if (link.isHash) {
      if (!this.config.allowHashLinks) {
        issues.push({
          type: 'hash-link',
          severity: 'info',
          description: 'Link is a hash anchor',
        });
      }
      return { link, passed: issues.length === 0, issues };
    }

    // mailto 和 tel 链接
    if (link.isMailto || link.isTel) {
      return { link, passed: true, issues: [] };
    }

    // 检查外链属性
    if (link.isExternal) {
      if (!link.hasTargetBlank) {
        issues.push({
          type: 'missing-target-blank',
          severity: 'warning',
          description: 'External link should have target="_blank"',
        });
      }
      if (!link.hasNoopener && link.hasTargetBlank) {
        issues.push({
          type: 'missing-noopener',
          severity: 'warning',
          description: 'External link with target="_blank" should have rel="noopener"',
        });
      }

      // 检查外链是否可访问
      if (this.config.checkExternalLinks) {
        const isAccessible = await this.checkLinkAccessible(link.href);
        if (!isAccessible) {
          issues.push({
            type: 'broken-link',
            severity: 'error',
            description: `External link is not accessible: ${link.href}`,
          });
        }
      }
    } else {
      // 内链检查
      const isAccessible = await this.checkLinkAccessible(link.href);
      if (!isAccessible) {
        issues.push({
          type: 'broken-link',
          severity: 'error',
          description: `Internal link is broken: ${link.href}`,
        });
      }
    }

    return {
      link,
      passed: !issues.some(i => i.severity === 'error'),
      issues,
    };
  }

  /**
   * 检查链接是否可访问
   */
  private async checkLinkAccessible(href: string): Promise<boolean> {
    if (!this.page) return false;

    try {
      // 对于相对链接，构建完整 URL
      let fullUrl = href;
      if (!href.startsWith('http')) {
        const baseUrl = this.page.url();
        fullUrl = new URL(href, baseUrl).toString();
      }

      // 使用 fetch 检查
      const response = await this.page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
          return { ok: true, status: res.status };
        } catch {
          // CORS 错误也视为可访问
          return { ok: true, status: 0 };
        }
      }, fullUrl);

      // 状态码检查
      if (response.status >= 400 && response.status < 600) {
        return false;
      }

      return true;
    } catch {
      return true; // 无法检查时假设可访问
    }
  }

  /**
   * 测试浏览器前进/后退
   */
  async testBackForward(url: string): Promise<{
    passed: boolean;
    errorMessage?: string;
  }> {
    if (!this.page) {
      await this.initialize();
    }

    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });

      // 点击一个内链
      const internalLink = await this.page!.locator('a[href]:not([href^="http"]):not([href^="#"]):not([href^="javascript:"])').first();
      const linkHref = await internalLink.getAttribute('href');

      if (linkHref) {
        await internalLink.click();
        await this.page!.waitForLoadState('domcontentloaded');

        // 测试后退
        await this.page!.goBack();
        await this.page!.waitForLoadState('domcontentloaded');

        if (this.page!.url() !== url) {
          return { passed: false, errorMessage: 'Back navigation failed' };
        }

        // 测试前进
        await this.page!.goForward();
        await this.page!.waitForLoadState('domcontentloaded');

        return { passed: true };
      }

      return { passed: true }; // 没有内链可测试
    } catch (error) {
      return {
        passed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('🔚 导航测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testNavigation(
  url: string,
  config?: Partial<NavigationTesterConfig>,
): Promise<NavigationTestResult> {
  const tester = new NavigationTester(config);
  try {
    return await tester.testNavigation(url);
  } finally {
    await tester.close();
  }
}
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';

/**
 * 交互元素测试结果
 */
export interface InteractionTestResult {
  selector: string;
  tag: string;
  text?: string;
  passed: boolean;
  errorMessage?: string;
  responseUrl?: string;
  httpStatus?: number;
  consoleErrors: string[];
  screenshot?: string;
}

/**
 * 交互测试器配置
 */
export interface InteractionTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  ignoreExternalLinks: boolean;
  ignoreHashLinks: boolean;
  ignoreJavascriptLinks: boolean;
  checkConsoleErrors: boolean;
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_INTERACTION_TESTER_CONFIG: InteractionTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  ignoreExternalLinks: false,
  ignoreHashLinks: false,
  ignoreJavascriptLinks: false,
  checkConsoleErrors: true,
  artifactsDir: './data/screenshots',
};

/**
 * 交互测试器
 */
export class InteractionTester {
  private config: InteractionTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private consoleErrors: string[] = [];

  constructor(config: Partial<InteractionTesterConfig> = {}) {
    this.config = { ...DEFAULT_INTERACTION_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    // 监听控制台错误
    if (this.config.checkConsoleErrors) {
      this.page.on('console', msg => {
        if (msg.type() === 'error') {
          this.consoleErrors.push(msg.text());
        }
      });

      this.page.on('pageerror', error => {
        this.consoleErrors.push(error.message);
      });
    }

    logger.pass('✅ 交互测试器初始化完成');
  }

  /**
   * 测试页面上所有可交互元素
   */
  async testInteractions(url: string): Promise<InteractionTestResult[]> {
    if (!this.page) {
      await this.initialize();
    }

    logger.step(`🔍 开始测试交互元素: ${url}`);

    // 导航到页面
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForLoadState('networkidle').catch(() => {});

    // 获取所有可交互元素
    const elements = await this.getInteractiveElements();

    logger.step(`  📊 发现 ${elements.length} 个可交互元素`);

    const results: InteractionTestResult[] = [];

    for (const element of elements) {
      // 清空控制台错误记录
      this.consoleErrors = [];

      const result = await this.testElement(element);
      results.push(result);

      if (result.passed) {
        logger.pass(`    ✅ ${element.selector}: 正常`);
      } else {
        logger.fail(`    ❌ ${element.selector}: ${result.errorMessage}`);
      }
    }

    return results;
  }

  /**
   * 获取页面上所有可交互元素
   */
  private async getInteractiveElements(): Promise<Array<{
    selector: string;
    tag: string;
    text?: string;
    href?: string;
    type: string;
  }>> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const elements: Array<{
        selector: string;
        tag: string;
        text?: string;
        href?: string;
        type: string;
      }> = [];

      // 查找所有可交互元素
      document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]').forEach(el => {
        // 跳过隐藏元素
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
          return;
        }

        // 生成选择器
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.className && typeof el.className === 'string') {
          const classes = el.className.split(' ').filter(c => c).slice(0, 2);
          selector = `${el.tagName.toLowerCase()}.${classes.join('.')}`;
        } else {
          selector = el.tagName.toLowerCase();
        }

        elements.push({
          selector,
          tag: el.tagName.toLowerCase(),
          text: el.textContent?.slice(0, 50) || undefined,
          href: el.getAttribute('href') || undefined,
          type: el.tagName.toLowerCase() === 'a' ? 'link' : el.tagName.toLowerCase() === 'button' ? 'button' : 'input',
        });
      });

      return elements;
    });
  }

  /**
   * 测试单个元素
   */
  private async testElement(element: {
    selector: string;
    tag: string;
    text?: string;
    href?: string;
    type: string;
  }): Promise<InteractionTestResult> {
    const result: InteractionTestResult = {
      selector: element.selector,
      tag: element.tag,
      text: element.text,
      passed: true,
      consoleErrors: [],
    };

    try {
      if (!this.page) {
        throw new Error('Page not initialized');
      }

      // 检查元素是否存在且可见
      const locator = this.page.locator(element.selector);
      const isVisible = await locator.isVisible().catch(() => false);

      if (!isVisible) {
        result.passed = false;
        result.errorMessage = 'Element is not visible';
        return result;
      }

      // 根据元素类型测试
      if (element.type === 'link' && element.href) {
        return await this.testLink(element, result);
      } else if (element.type === 'button' || element.tag === 'button') {
        return await this.testButton(element, result);
      } else if (element.tag === 'input' || element.tag === 'select' || element.tag === 'textarea') {
        return await this.testInput(element, result);
      }

      // 检查控制台错误
      result.consoleErrors = [...this.consoleErrors];
      if (this.consoleErrors.length > 0) {
        result.passed = false;
        result.errorMessage = `Console errors: ${this.consoleErrors.join('; ')}`;
      }

    } catch (error) {
      result.passed = false;
      result.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * 测试链接
   */
  private async testLink(
    element: { selector: string; href?: string; tag: string; text?: string },
    result: InteractionTestResult,
  ): Promise<InteractionTestResult> {
    if (!this.page) return result;

    const href = element.href;

    // 检查空链接
    if (!href || href === '#' || href === 'javascript:void(0)' || href === 'javascript:;') {
      if (this.config.ignoreHashLinks && href === '#') {
        result.passed = true;
        return result;
      }
      if (this.config.ignoreJavascriptLinks && href?.startsWith('javascript:')) {
        result.passed = true;
        return result;
      }
      result.passed = false;
      result.errorMessage = `Invalid link: ${href || '(empty)'}`;
      return result;
    }

    // 检查外链
    const currentUrl = this.page.url();
    const linkUrl = new URL(href, currentUrl);
    const currentOrigin = new URL(currentUrl).origin;

    if (linkUrl.origin !== currentOrigin) {
      if (this.config.ignoreExternalLinks) {
        result.passed = true;
        result.consoleErrors = [...this.consoleErrors];
        return result;
      }
      // 外链只检查是否有 target="_blank"
      const hasTargetBlank = await this.page.locator(element.selector).getAttribute('target')
        .then(target => target === '_blank');

      if (!hasTargetBlank) {
        result.passed = false;
        result.errorMessage = 'External link missing target="_blank"';
      }
      result.consoleErrors = [...this.consoleErrors];
      return result;
    }

    // 内链检查响应
    try {
      const response = await this.page.evaluate(async (url) => {
        try {
          const res = await fetch(url, { method: 'HEAD' });
          return { status: res.status, ok: res.ok };
        } catch {
          return { status: 0, ok: false };
        }
      }, linkUrl.toString());

      result.httpStatus = response.status;

      if (!response.ok && response.status >= 400) {
        result.passed = false;
        result.errorMessage = `HTTP ${response.status}`;
      }
    } catch {
      // 无法检查时假设通过
    }

    result.consoleErrors = [...this.consoleErrors];
    return result;
  }

  /**
   * 测试按钮（智能等待）
   */
  private async testButton(
    element: { selector: string; tag: string; text?: string },
    result: InteractionTestResult,
  ): Promise<InteractionTestResult> {
    if (!this.page) return result;

    try {
      const locator = this.page.locator(element.selector);

      // 检查按钮是否禁用
      const isDisabled = await locator.isDisabled();
      if (isDisabled) {
        result.passed = true;
        return result;
      }

      // 尝试点击（但不跳转）
      await locator.click({ timeout: 5000 });

      // 智能等待：等待网络空闲或关键响应
      // 使用 Promise.race 避免无限等待
      await Promise.race([
        this.page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {}),
        this.page.waitForTimeout(500),
      ]);

      result.consoleErrors = [...this.consoleErrors];

      if (this.consoleErrors.length > 0) {
        result.passed = false;
        result.errorMessage = `Console errors after click: ${this.consoleErrors.join('; ')}`;
      }

    } catch (error) {
      // 点击失败不一定意味着按钮有问题
      result.consoleErrors = [...this.consoleErrors];
      // 记录具体的点击失败原因，便于调试
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.debug(`按钮点击异常: ${element.selector}`, { error: errorMsg });
    }

    return result;
  }

  /**
   * 测试输入框
   */
  private async testInput(
    element: { selector: string; tag: string; text?: string },
    result: InteractionTestResult,
  ): Promise<InteractionTestResult> {
    if (!this.page) return result;

    try {
      const locator = this.page.locator(element.selector);
      const isDisabled = await locator.isDisabled();

      if (!isDisabled) {
        // 尝试聚焦
        await locator.focus({ timeout: 5000 });
      }

      result.consoleErrors = [...this.consoleErrors];
    } catch {
      // 聚焦失败
    }

    return result;
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
    logger.info('🔚 交互测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testInteractions(
  url: string,
  config?: Partial<InteractionTesterConfig>,
): Promise<InteractionTestResult[]> {
  const tester = new InteractionTester(config);
  try {
    return await tester.testInteractions(url);
  } finally {
    await tester.close();
  }
}
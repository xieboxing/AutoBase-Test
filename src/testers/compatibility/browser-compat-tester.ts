import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page } from 'playwright';
import type { TestCase } from '@/types/test-case.types.js';
import type { TestCaseResult, TestStepResult } from '@/types/test-result.types.js';
import { logger } from '@/core/logger.js';

/**
 * 浏览器兼容性测试配置
 */
export interface BrowserCompatConfig {
  browsers: ('chromium' | 'firefox' | 'webkit')[];
  headless: boolean;
  timeout: number;
}

/**
 * 浏览器测试结果
 */
export interface BrowserTestResult {
  browser: 'chromium' | 'firefox' | 'webkit';
  success: boolean;
  errors: string[];
  screenshot?: string;
  durationMs: number;
}

/**
 * 跨浏览器兼容性测试器
 */
export class BrowserCompatTester {
  private config: BrowserCompatConfig;

  constructor(config: Partial<BrowserCompatConfig> = {}) {
    this.config = {
      browsers: config.browsers ?? ['chromium', 'firefox', 'webkit'],
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
    };
  }

  /**
   * 在多个浏览器中执行测试用例
   */
  async runCompatTest(testCase: TestCase): Promise<BrowserTestResult[]> {
    const results: BrowserTestResult[] = [];

    for (const browserName of this.config.browsers) {
      logger.step(`🌐 在 ${browserName} 中执行测试`);
      const result = await this.runInBrowser(browserName, testCase);
      results.push(result);

      if (result.success) {
        logger.pass(`✅ ${browserName}: 测试通过`);
      } else {
        logger.fail(`❌ ${browserName}: 测试失败 - ${result.errors.join(', ')}`);
      }
    }

    return results;
  }

  /**
   * 在单个浏览器中执行测试
   */
  private async runInBrowser(
    browserName: 'chromium' | 'firefox' | 'webkit',
    testCase: TestCase,
  ): Promise<BrowserTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let screenshot: string | undefined;

    let browser: Browser | null = null;

    try {
      // 启动浏览器
      switch (browserName) {
        case 'chromium':
          browser = await chromium.launch({ headless: this.config.headless });
          break;
        case 'firefox':
          browser = await firefox.launch({ headless: this.config.headless });
          break;
        case 'webkit':
          browser = await webkit.launch({ headless: this.config.headless });
          break;
      }

      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      // 执行测试用例的步骤
      for (const step of testCase.steps) {
        await this.executeStep(page, step);
      }

      // 获取最终截图
      screenshot = `./data/screenshots/compat-${browserName}-${testCase.id}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });

      await context.close();
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      if (browser) {
        await browser.close();
      }
    }

    return {
      browser: browserName,
      success: errors.length === 0,
      errors,
      screenshot,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 执行单个测试步骤
   */
  private async executeStep(page: Page, step: TestStepResult | { action: string; target?: string; value?: string; type?: string }): Promise<void> {
    const action = step.action;
    const target = (step as any).target;
    const value = (step as any).value;

    switch (action) {
      case 'navigate':
        if (value) {
          await page.goto(value as string, { timeout: this.config.timeout });
        }
        break;

      case 'click':
        if (target) {
          await page.click(target, { timeout: this.config.timeout });
        }
        break;

      case 'fill':
        if (target && value) {
          await page.fill(target, value as string, { timeout: this.config.timeout });
        }
        break;

      case 'assert':
        if (target) {
          const type = (step as any).type;
          if (type === 'element-visible') {
            await page.waitForSelector(target, { state: 'visible', timeout: this.config.timeout });
          } else if (type === 'element-hidden') {
            await page.waitForSelector(target, { state: 'hidden', timeout: this.config.timeout });
          } else if (type === 'url-contains') {
            const url = page.url();
            if (!url.includes(value as string)) {
              throw new Error(`URL 不包含 "${value}": ${url}`);
            }
          }
        }
        break;

      case 'wait':
        if (value) {
          await page.waitForTimeout(Number(value));
        }
        break;
    }
  }

  /**
   * 获取兼容性矩阵
   */
  getCompatibilityMatrix(results: BrowserTestResult[]): Record<string, boolean> {
    const matrix: Record<string, boolean> = {};
    for (const result of results) {
      matrix[result.browser] = result.success;
    }
    return matrix;
  }
}

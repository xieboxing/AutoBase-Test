import { devices as playwrightDevices } from '@playwright/test';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import type { TestCase } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';

/**
 * Device Descriptor type (Playwright internal type)
 */
export type DeviceDescriptor = {
  viewport: { width: number; height: number };
  deviceScaleFactor: number;
  userAgent: string;
  hasTouch: boolean;
  isMobile: boolean;
  defaultBrowserType: 'chromium' | 'firefox' | 'webkit';
};

/**
 * 设备兼容性测试配置
 */
export interface DeviceCompatConfig {
  devices: string[];
  headless: boolean;
  timeout: number;
  screenshotDir: string;
}

/**
 * 设备测试结果
 */
export interface DeviceTestResult {
  device: string;
  viewport: { width: number; height: number };
  success: boolean;
  errors: string[];
  screenshot?: string;
  layoutIssues: LayoutIssue[];
  durationMs: number;
}

/**
 * 布局问题
 */
export interface LayoutIssue {
  type: 'overflow' | 'overlap' | 'truncated' | 'small-touch-target';
  element: string;
  description: string;
  severity: 'warning' | 'error';
}

/**
 * 设备兼容性测试器
 */
export class DeviceCompatTester {
  private config: DeviceCompatConfig;

  constructor(config: Partial<DeviceCompatConfig> = {}) {
    this.config = {
      devices: config.devices ?? ['iPhone 14', 'Pixel 7', 'iPad Pro'],
      headless: config.headless ?? true,
      timeout: config.timeout ?? 30000,
      screenshotDir: config.screenshotDir ?? './data/screenshots',
    };
  }

  /**
   * 在多个设备上执行测试用例
   */
  async runCompatTest(testCase: TestCase, url: string): Promise<DeviceTestResult[]> {
    const results: DeviceTestResult[] = [];

    for (const deviceName of this.config.devices) {
      logger.step(`📱 在 ${deviceName} 上执行测试`);
      const result = await this.runOnDevice(deviceName, testCase, url);
      results.push(result);

      if (result.success && result.layoutIssues.length === 0) {
        logger.pass(`✅ ${deviceName}: 测试通过`);
      } else {
        const issues = result.layoutIssues.map(i => `${i.type}: ${i.description}`).join(', ');
        logger.fail(`❌ ${deviceName}: ${result.errors.join(', ')} | ${issues}`);
      }
    }

    return results;
  }

  /**
   * 在单个设备上执行测试
   */
  private async runOnDevice(
    deviceName: string,
    testCase: TestCase,
    url: string,
  ): Promise<DeviceTestResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const layoutIssues: LayoutIssue[] = [];
    let screenshot: string | undefined;

    // 获取设备描述符
    const deviceDescriptor = playwrightDevices[deviceName] as DeviceDescriptor | undefined;
    if (!deviceDescriptor) {
      return {
        device: deviceName,
        viewport: { width: 0, height: 0 },
        success: false,
        errors: [`未知设备: ${deviceName}`],
        layoutIssues: [],
        durationMs: Date.now() - startTime,
      };
    }

    let browser: Browser | null = null;

    try {
      browser = await chromium.launch({ headless: this.config.headless });

      const context = await browser.newContext(deviceDescriptor);
      const page = await context.newPage();

      // 导航到目标 URL
      await page.goto(url, { timeout: this.config.timeout, waitUntil: 'networkidle' });

      // 执行测试用例的步骤
      for (const step of testCase.steps) {
        await this.executeStep(page, step);
      }

      // 检查布局问题
      const issues = await this.checkLayoutIssues(page);
      layoutIssues.push(...issues);

      // 截图
      screenshot = `${this.config.screenshotDir}/device-${deviceName}-${testCase.id}.png`;
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
      device: deviceName,
      viewport: deviceDescriptor.viewport,
      success: errors.length === 0,
      errors,
      screenshot,
      layoutIssues,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 执行单个测试步骤
   */
  private async executeStep(page: Page, step: { action: string; target?: string; value?: string; type?: string }): Promise<void> {
    const action = step.action;
    const target = step.target;
    const value = step.value;

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
          const type = step.type;
          if (type === 'element-visible') {
            await page.waitForSelector(target, { state: 'visible', timeout: this.config.timeout });
          } else if (type === 'element-hidden') {
            await page.waitForSelector(target, { state: 'hidden', timeout: this.config.timeout });
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
   * 检查布局问题
   */
  private async checkLayoutIssues(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];

    // 检查横向溢出
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });

    if (hasHorizontalOverflow) {
      issues.push({
        type: 'overflow',
        element: 'document',
        description: '页面存在横向滚动条',
        severity: 'warning',
      });
    }

    // 检查小触摸目标
    const smallTouchTargets = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, a, input, [role="button"]');
      const small: { selector: string; width: number; height: number }[] = [];

      elements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 44 || rect.height < 44) {
          const selector = el.id ? `#${el.id}` : el.className ? `.${(el.className as string).split(' ')[0]}` : el.tagName.toLowerCase();
          small.push({
            selector,
            width: rect.width,
            height: rect.height,
          });
        }
      });

      return small;
    });

    for (const target of smallTouchTargets) {
      issues.push({
        type: 'small-touch-target',
        element: target.selector,
        description: `触摸目标过小 (${target.width}x${target.height}px, 最小应为 44x44px)`,
        severity: 'warning',
      });
    }

    return issues;
  }

  /**
   * 获取设备兼容性矩阵
   */
  getDeviceMatrix(results: DeviceTestResult[]): Record<string, { success: boolean; issues: number }> {
    const matrix: Record<string, { success: boolean; issues: number }> = {};
    for (const result of results) {
      matrix[result.device] = {
        success: result.success,
        issues: result.layoutIssues.length,
      };
    }
    return matrix;
  }
}

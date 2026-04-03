import type { RemoteOptions } from 'webdriverio';
import { remote } from 'webdriverio';
import { logger } from '@/core/logger.js';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { TestCaseResult, TestStepResult } from '@/types/test-result.types.js';

/**
 * UI 测试器配置
 */
export interface UiTesterConfig {
  deviceId: string;
  packageName: string;
  mainActivity?: string;
  appiumHost: string;
  appiumPort: number;
  automationTimeout: number;
  screenshotOnStep: boolean;
  screenshotOnFailure: boolean;
  artifactsDir: string;
}

/**
 * 元素定位策略
 */
export type LocatorStrategy =
  | 'id'
  | 'accessibility-id'
  | 'xpath'
  | 'class-name'
  | 'android-uiautomator';

/**
 * APP UI 交互测试器
 */
export class UiTester {
  protected config: UiTesterConfig;
  protected driver: WebdriverIO.Browser | null = null;

  constructor(config: Partial<UiTesterConfig>) {
    this.config = {
      deviceId: '',
      packageName: '',
      appiumHost: '127.0.0.1',
      appiumPort: 4723,
      automationTimeout: 30000,
      screenshotOnStep: false,
      screenshotOnFailure: true,
      artifactsDir: './data/screenshots',
      ...config,
    };
  }

  /**
   * 初始化 Appium 连接
   */
  async initialize(): Promise<void> {
    logger.info('🚀 初始化 Appium 连接', {
      deviceId: this.config.deviceId,
      packageName: this.config.packageName,
    });

    const capabilities: Record<string, unknown> = {
      platformName: 'Android',
      'appium:deviceName': this.config.deviceId,
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': this.config.packageName,
      'appium:noReset': true,
      'appium:newCommandTimeout': 300,
    };

    if (this.config.mainActivity) {
      capabilities['appium:appActivity'] = this.config.mainActivity;
    }

    const options: RemoteOptions = {
      hostname: this.config.appiumHost,
      port: this.config.appiumPort,
      path: '/wd/hub',
      capabilities,
    };

    this.driver = await remote(options);

    logger.pass('✅ Appium 连接成功');
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
      logger.info('🔌 Appium 连接已关闭');
    }
  }

  /**
   * 执行测试用例
   */
  async runTest(testCase: TestCase): Promise<TestCaseResult> {
    const startTime = new Date();
    const steps: TestStepResult[] = [];
    let testStatus: 'passed' | 'failed' | 'skipped' = 'passed';
    const errors: string[] = [];
    const screenshots: string[] = [];

    try {
      if (!this.driver) {
        await this.initialize();
      }

      logger.step(`📋 执行测试用例：${testCase.name}`);

      for (const step of testCase.steps) {
        const stepResult = await this.executeStep(step);
        steps.push(stepResult);

        if (stepResult.status === 'failed') {
          testStatus = 'failed';
          if (stepResult.errorMessage) {
            errors.push(stepResult.errorMessage);
          }
          if (stepResult.screenshot) {
            screenshots.push(stepResult.screenshot);
          }
        }
      }

    } catch (error) {
      testStatus = 'failed';
      errors.push((error as Error).message);
      logger.fail('❌ 测试执行失败', { error: (error as Error).message });
    }

    const endTime = new Date();

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status: testStatus,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      platform: 'android-app',
      environment: { browser: 'appium' },
      steps,
      retryCount: 0,
      selfHealed: false,
      artifacts: { screenshots, video: undefined, logs: errors },
    };
  }

  /**
   * 执行单步操作
   */
  protected async executeStep(step: TestStep): Promise<TestStepResult> {
    const startTime = Date.now();
    let status: 'passed' | 'failed' | 'skipped' = 'passed';
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    try {
      if (!this.driver) {
        throw new Error('Driver not initialized');
      }

      logger.step(`📍 执行步骤：${step.action}${step.target ? ` -> ${step.target}` : ''}`);

      switch (step.action) {
        case 'tap':
          await this.tap(step.target, 'id');
          break;
        case 'long-press':
          await this.longPress(step.target, 'id', step.timeout || 500);
          break;
        case 'fill':
          await this.fill(step.target, step.value || '', 'id');
          break;
        case 'swipe':
          await this.swipe('up');
          break;
        case 'scroll':
          await this.scroll('down');
          break;
        case 'back':
          await this.back();
          break;
        case 'home':
          await this.home();
          break;
        case 'wait':
          await this.waitForElement(step.target, 'id', step.timeout || this.config.automationTimeout);
          break;
        case 'assert':
          status = await this.assert(step);
          break;
        case 'screenshot':
          if (this.config.screenshotOnStep) {
            screenshot = await this.takeScreenshot(`step-${step.order}`);
          }
          break;
        default:
          throw new Error(`Unknown action: ${step.action}`);
      }

    } catch (error) {
      status = 'failed';
      errorMessage = (error as Error).message;
      logger.fail(`❌ 步骤失败：${step.action}`, { error: errorMessage });

      if (this.config.screenshotOnFailure) {
        screenshot = await this.takeScreenshot(`step-${step.order}-error`);
      }
    }

    return {
      order: step.order,
      action: step.action,
      target: step.target,
      status,
      durationMs: Date.now() - startTime,
      errorMessage,
      screenshot,
    };
  }

  /**
   * 点击元素
   */
  protected async tap(selector: string | undefined, _strategy: LocatorStrategy = 'id'): Promise<void> {
    if (!this.driver || !selector) return;

    const element = await this.findElement(selector, 'id');
    await element.click();

    logger.pass(`👆 点击：${selector}`);
  }

  /**
   * 长按元素
   */
  protected async longPress(
    selector: string | undefined,
    _strategy: LocatorStrategy = 'id',
    duration: number = 500,
  ): Promise<void> {
    if (!this.driver || !selector) return;

    const element = await this.findElement(selector, 'id');

    await this.driver.touchAction([
      { element, action: 'press' },
      { action: 'wait', ms: duration },
      { element, action: 'release' },
    ]);

    logger.pass(`👆 长按：${selector}`);
  }

  /**
   * 输入文本
   */
  protected async fill(
    selector: string | undefined,
    value: string,
    _strategy: LocatorStrategy = 'id',
  ): Promise<void> {
    if (!this.driver || !selector) return;

    const element = await this.findElement(selector, 'id');

    await element.clearValue();
    await element.setValue(value);

    logger.pass(`⌨️ 输入：${selector} = "${value}"`);
  }

  /**
   * 滑动
   */
  protected async swipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
    if (!this.driver) return;

    const { width, height } = await this.driver.getWindowSize();
    const centerX = width / 2;
    const centerY = height / 2;

    let startX = centerX;
    let startY = centerY;
    let endX = centerX;
    let endY = centerY;

    switch (direction) {
      case 'up':
        startY = height * 0.8;
        endY = height * 0.2;
        break;
      case 'down':
        startY = height * 0.2;
        endY = height * 0.8;
        break;
      case 'left':
        startX = width * 0.8;
        endX = width * 0.2;
        break;
      case 'right':
        startX = width * 0.2;
        endX = width * 0.8;
        break;
    }

    await this.driver.touchAction([
      { action: 'press', x: startX, y: startY },
      { action: 'wait', ms: 300 },
      { action: 'moveTo', x: endX, y: endY },
      { action: 'release' },
    ]);

    logger.pass(`👋 滑动：${direction}`);
  }

  /**
   * 滚动
   */
  protected async scroll(direction: 'up' | 'down'): Promise<void> {
    await this.swipe(direction === 'down' ? 'up' : 'down');
    logger.pass(`📜 滚动：${direction}`);
  }

  /**
   * 返回
   */
  protected async back(): Promise<void> {
    if (!this.driver) return;
    await this.driver.back();
    logger.pass('⬅️ 返回');
  }

  /**
   * 回到主屏幕
   */
  protected async home(): Promise<void> {
    if (!this.driver) return;
    await this.driver.execute('mobile: pressKey', { keycode: 3 });
    logger.pass('🏠 主屏幕');
  }

  /**
   * 等待元素
   */
  protected async waitForElement(
    selector: string | undefined,
    _strategy: LocatorStrategy = 'id',
    timeout: number = this.config.automationTimeout,
  ): Promise<void> {
    if (!this.driver || !selector) return;

    const locator = this.buildLocator(selector, 'id');
    await this.driver.$(locator).waitForDisplayed({ timeout });

    logger.pass(`⏳ 等待元素：${selector}`);
  }

  /**
   * 断言
   */
  protected async assert(step: TestStep): Promise<'passed' | 'failed'> {
    if (!this.driver) return 'failed';

    const assertType = step.type || 'element-visible';

    try {
      switch (assertType) {
        case 'element-visible': {
          if (!step.target) {
            throw new Error('Element target required for visibility check');
          }
          const element = await this.findElement(step.target, 'id');
          const displayed = await element.isDisplayed();
          if (!displayed) {
            throw new Error(`Element ${step.target} is not visible`);
          }
          break;
        }

        case 'element-hidden': {
          if (!step.target) {
            throw new Error('Element target required for hidden check');
          }
          try {
            const element = await this.findElement(step.target, 'id');
            const displayed = await element.isDisplayed();
            if (displayed) {
              throw new Error(`Element ${step.target} is visible but should be hidden`);
            }
          } catch {
            // 元素不存在或不可见，通过
          }
          break;
        }

        case 'text-contains': {
          if (!step.target || !step.value) {
            throw new Error('Element target and value required for text check');
          }
          const element = await this.findElement(step.target, 'id');
          const text = await element.getText();
          if (!text.includes(step.value)) {
            throw new Error(`Text "${text}" does not contain "${step.value}"`);
          }
          break;
        }

        case 'text-equals': {
          if (!step.target || !step.value) {
            throw new Error('Element target and value required for text check');
          }
          const element = await this.findElement(step.target, 'id');
          const text = await element.getText();
          if (text !== step.value) {
            throw new Error(`Text "${text}" does not equal "${step.value}"`);
          }
          break;
        }

        default:
          throw new Error(`Unknown assert type: ${assertType}`);
      }

      logger.pass(`✅ 断言通过：${assertType}`);
      return 'passed';

    } catch (error) {
      logger.fail(`❌ 断言失败：${assertType}`, { error: (error as Error).message });
      return 'failed';
    }
  }

  /**
   * 查找元素
   */
  protected async findElement(
    selector: string,
    _strategy: LocatorStrategy = 'id',
    timeout: number = this.config.automationTimeout,
  ): Promise<WebdriverIO.Element> {
    if (!this.driver) {
      throw new Error('Driver not initialized');
    }

    const locator = this.buildLocator(selector, 'id');
    const element = await this.driver.$(locator);

    await element.waitForExist({ timeout });

    return element;
  }

  /**
   * 构建定位器
   */
  protected buildLocator(selector: string, _strategy: LocatorStrategy): string {
    return `id:${selector}`;
  }

  /**
   * 截图
   */
  async takeScreenshot(name: string): Promise<string> {
    if (!this.driver) {
      throw new Error('Driver not initialized');
    }

    const screenshot = await this.driver.takeScreenshot();
    const filename = `${this.config.packageName}-${name}-${Date.now()}.png`;
    const filepath = `${this.config.artifactsDir}/${filename}`;

    const fs = await import('node:fs/promises');
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    await fs.writeFile(filepath, screenshot, 'base64');

    logger.pass(`📸 截图：${filepath}`);

    return filepath;
  }
}

/**
 * 快捷执行函数
 */
export async function runUiTest(
  deviceId: string,
  packageName: string,
  testCase: TestCase,
  options?: Partial<UiTesterConfig>,
): Promise<TestCaseResult> {
  const tester = new UiTester({
    deviceId,
    packageName,
    ...options,
  });

  try {
    return await tester.runTest(testCase);
  } finally {
    await tester.close();
  }
}

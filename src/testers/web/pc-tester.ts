import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page, type BrowserType } from 'playwright';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { TestCaseResult, TestStepResult, TestEnvironment } from '@/types/test-result.types.js';
import type { VisualRegressionConfig, VisualRegressionTestResult } from '@/types/visual.types.js';
import { logger } from '@/core/logger.js';
import { eventBus } from '@/core/event-bus.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import { VisualRegressionManager } from '@/testers/visual/visual-regression-manager.js';
import { registerBrowser, registerContext, closeBrowser } from './browser-manager.js';

/**
 * 浏览器类型
 */
export type BrowserName = 'chromium' | 'firefox' | 'webkit';

/**
 * PC Web 测试器配置
 */
export interface PcTesterConfig {
  browser: BrowserName;
  viewport: { width: number; height: number };
  headless: boolean;
  slowMo: number;
  timeout: number;
  screenshotOnStep: boolean;
  screenshotOnFailure: boolean;
  videoOnFailure: boolean;
  artifactsDir: string;
  baseUrl?: string;
  /** 视觉回归配置 */
  visualRegression?: VisualRegressionConfig;
  /** 是否启用视觉回归 */
  enableVisualRegression?: boolean;
  /** 项目 ID（用于视觉回归） */
  projectId?: string;
}

/**
 * 默认配置
 */
const DEFAULT_PC_TESTER_CONFIG: PcTesterConfig = {
  browser: 'chromium',
  viewport: { width: 1920, height: 1080 },
  headless: true,
  slowMo: 0,
  timeout: 30000,
  screenshotOnStep: false,
  screenshotOnFailure: true,
  videoOnFailure: true,
  artifactsDir: './data/screenshots',
  enableVisualRegression: false,
};

/**
 * PC Web 测试器
 */
export class PcTester {
  protected config: PcTesterConfig;
  protected browser: Browser | null = null;
  protected context: BrowserContext | null = null;
  protected page: Page | null = null;
  protected visualRegressionManager: VisualRegressionManager | null = null;
  protected browserId: string | null = null;

  constructor(config: Partial<PcTesterConfig> = {}) {
    this.config = { ...DEFAULT_PC_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    logger.info('🚀 初始化浏览器', { browser: this.config.browser, headless: this.config.headless });

    const browserType = this.getBrowserType();

    // 确保截图目录存在
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    this.browser = await browserType.launch({
      headless: this.config.headless,
      slowMo: this.config.slowMo,
    });

    // 注册到浏览器管理器，确保资源能被正确清理
    this.browserId = registerBrowser(this.browser);

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      recordVideo: this.config.videoOnFailure
        ? { dir: this.config.artifactsDir }
        : undefined,
    });

    // 注册上下文到管理器
    if (this.browserId) {
      registerContext(this.browserId, this.context);
    }

    this.page = await this.context.newPage();

    // 设置默认超时
    this.page.setDefaultTimeout(this.config.timeout);

    logger.pass('✅ 浏览器初始化完成');
  }

  /**
   * 获取浏览器类型
   */
  protected getBrowserType(): BrowserType {
    switch (this.config.browser) {
      case 'firefox':
        return firefox;
      case 'webkit':
        return webkit;
      default:
        return chromium;
    }
  }

  /**
   * 执行测试用例
   */
  async runTest(testCase: TestCase, maxRetries: number = 0): Promise<TestCaseResult> {
    const runId = nanoid(8);
    const startTime = new Date();
    const stepResults: TestStepResult[] = [];
    let status: 'passed' | 'failed' | 'skipped' = 'passed';
    let retryCount = 0;
    const screenshots: string[] = [];
    const logs: string[] = [];
    let videoPath: string | undefined;

    logger.step(`📍 开始执行测试用例: ${testCase.name}`, { caseId: testCase.id });

    // 发送测试开始事件
    eventBus.emit('test:start', { caseId: testCase.id, name: testCase.name });

    // 重试循环
    while (true) {
      try {
        // 确保浏览器已初始化
        if (!this.page) {
          await this.initialize();
        }

        // 清空之前的步骤结果（重试时）
        stepResults.length = 0;
        screenshots.length = 0;
        logs.length = 0;
        status = 'passed';

        // 执行每个步骤
        for (const step of testCase.steps) {
          const stepResult = await this.executeStep(step, testCase.id, runId);
          stepResults.push(stepResult);

          if (stepResult.screenshot) {
            screenshots.push(stepResult.screenshot);
          }

          if (stepResult.status === 'failed') {
            status = 'failed';
            logger.fail(`❌ 步骤 ${step.order} 失败: ${stepResult.errorMessage}`);

            // 发送步骤失败事件
            eventBus.emit('test:step', {
              caseId: testCase.id,
              step: step.order,
              status: 'failed',
              error: stepResult.errorMessage,
            });

            // 步骤失败后停止执行
            break;
          } else {
            logger.pass(`✅ 步骤 ${step.order} 通过: ${step.description}`);
            eventBus.emit('test:step', {
              caseId: testCase.id,
              step: step.order,
              status: 'passed',
            });
          }
        }

        // 如果通过或达到最大重试次数，退出循环
        if (status === 'passed' || retryCount >= maxRetries) {
          break;
        }

        // 准备重试
        retryCount++;
        logger.warn(`⚠️ 测试失败，准备重试 (${retryCount}/${maxRetries})`, { caseId: testCase.id });

        // 重试前等待一段时间
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));

      } catch (error) {
        status = 'failed';
        const errorMessage = error instanceof Error ? error.message : String(error);
        logs.push(errorMessage);
        logger.fail('❌ 测试用例执行出错', { error: errorMessage });

        // 如果达到最大重试次数，退出循环
        if (retryCount >= maxRetries) {
          break;
        }

        // 准备重试
        retryCount++;
        logger.warn(`⚠️ 测试出错，准备重试 (${retryCount}/${maxRetries})`, { caseId: testCase.id });
        await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
      }
    }

    // 执行清理步骤（无论测试是否通过）
    if (testCase.cleanup) {
      for (const step of testCase.cleanup) {
        try {
          const stepResult = await this.executeStep(step, testCase.id, runId);
          // 清理步骤失败不影响测试结果
          if (stepResult.status === 'failed') {
            logger.warn(`⚠️ 清理步骤 ${step.order} 失败: ${stepResult.errorMessage}`);
          }
        } catch (error) {
          logger.warn(`⚠️ 清理步骤 ${step.order} 执行出错: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const endTime = new Date();

    // 保存视频（必须在关闭 context 前获取路径）
    if (this.config.videoOnFailure && this.page) {
      try {
        const video = this.page.video();
        if (video) {
          videoPath = await video.path();
        }
      } catch {
        // 忽略视频路径获取错误
      }
    }

    // 发送测试完成事件
    eventBus.emit('test:complete', { caseId: testCase.id, status });

    logger.info(`📊 测试结果: ${status}`, { caseId: testCase.id, duration: endTime.getTime() - startTime.getTime() });

    // 视觉回归测试
    let visualRegressionResult;
    if (this.config.enableVisualRegression && this.config.projectId) {
      visualRegressionResult = await this.runVisualRegression({
        caseId: testCase.id,
        runId,
        pageUrl: this.page?.url() || '',
      });
    }

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      platform: 'pc-web',
      environment: this.getEnvironment(),
      steps: stepResults,
      retryCount,
      selfHealed: false,
      visualRegression: visualRegressionResult,
      artifacts: {
        screenshots,
        video: videoPath,
        logs,
      },
    };
  }

  /**
   * 执行视觉回归测试
   */
  protected async runVisualRegression(options: {
    caseId: string;
    runId: string;
    pageUrl: string;
  }): Promise<VisualRegressionTestResult | undefined> {
    if (!this.page || !this.config.projectId) {
      return undefined;
    }

    try {
      // 初始化视觉回归管理器
      if (!this.visualRegressionManager) {
        this.visualRegressionManager = new VisualRegressionManager(
          this.config.visualRegression
        );
        await this.visualRegressionManager.initialize();
      }

      // 获取当前页面截图
      const screenshot = await this.page.screenshot({ fullPage: true });
      const screenshotPath = path.join(
        this.config.artifactsDir,
        `${options.caseId}_${options.runId}_visual.png`
      );
      await fs.writeFile(screenshotPath, screenshot);

      // 执行对比
      const diffResult = await this.visualRegressionManager.compare(screenshotPath, {
        projectId: this.config.projectId,
        platform: 'pc-web',
        pageUrl: options.pageUrl,
        caseId: options.caseId,
        runId: options.runId,
        viewport: this.config.viewport,
        browser: this.config.browser,
      });

      if (!diffResult) {
        // 新基线创建
        return {
          caseId: options.caseId,
          pageUrl: options.pageUrl,
          hasBaseline: false,
          baselineId: null,
          diffResult: null,
          status: 'new-baseline',
          message: '自动创建新基线',
        };
      }

      return {
        caseId: options.caseId,
        pageUrl: options.pageUrl,
        hasBaseline: true,
        baselineId: diffResult.baselineId,
        diffResult,
        status: diffResult.passed ? 'passed' : 'failed',
        message: diffResult.passed
          ? `视觉回归测试通过，差异: ${diffResult.diffPercentage.toFixed(2)}%`
          : `视觉回归测试失败，差异: ${diffResult.diffPercentage.toFixed(2)}%`,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ 视觉回归测试失败: ${errorMessage}`);
      return {
        caseId: options.caseId,
        pageUrl: options.pageUrl,
        hasBaseline: false,
        baselineId: null,
        diffResult: null,
        status: 'error',
        message: errorMessage,
      };
    }
  }

  /**
   * 执行单个步骤
   */
  protected async executeStep(step: TestStep, caseId: string, runId: string): Promise<TestStepResult> {
    const startTime = Date.now();
    let status: 'passed' | 'failed' = 'passed';
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    try {
      if (!this.page) {
        throw new Error('Page not initialized');
      }

      // 等待前置时间
      if (step.waitBefore) {
        await this.page.waitForTimeout(step.waitBefore);
      }

      // 执行动作
      await this.executeAction(step);

      // 等待后置时间
      if (step.waitAfter) {
        await this.page.waitForTimeout(step.waitAfter);
      }

      // 步骤截图
      if (this.config.screenshotOnStep) {
        screenshot = await this.takeScreenshot(caseId, runId, step.order);
      }
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);

      // 失败截图
      if (this.config.screenshotOnFailure) {
        screenshot = await this.takeScreenshot(caseId, runId, step.order, 'failure');
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
   * 执行动作
   */
  protected async executeAction(step: TestStep): Promise<void> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    const timeout = step.timeout || this.config.timeout;

    switch (step.action) {
      case 'navigate':
        await this.navigate(step.value || '', timeout);
        break;

      case 'click':
        await this.click(step.target || '', timeout);
        break;

      case 'fill':
        await this.fill(step.target || '', step.value || '', timeout);
        break;

      case 'select':
        await this.select(step.target || '', step.value || '', timeout);
        break;

      case 'hover':
        await this.hover(step.target || '', timeout);
        break;

      case 'scroll':
        await this.scroll(step.target, step.value);
        break;

      case 'wait':
        await this.wait(step.value, step.target, timeout);
        break;

      case 'screenshot':
        await this.takeScreenshot('auto', nanoid(4), 0);
        break;

      case 'assert':
        await this.assert(step.target || '', step.type || 'element-visible', step.value, timeout);
        break;

      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  /**
   * 导航到 URL
   */
  protected async navigate(url: string, timeout: number): Promise<void> {
    if (!this.page) return;

    const fullUrl = this.config.baseUrl && !url.startsWith('http')
      ? new URL(url, this.config.baseUrl).toString()
      : url;

    logger.step(`📍 导航到: ${fullUrl}`);
    await this.page.goto(fullUrl, { timeout, waitUntil: 'domcontentloaded' });
  }

  /**
   * 点击元素（带显式等待）
   */
  protected async click(selector: string, timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`👆 点击: ${selector}`);
    // 显式等待元素可见且可点击
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
    await this.page.click(selector, { timeout });
  }

  /**
   * 填写输入框（带显式等待）
   */
  protected async fill(selector: string, value: string, timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`⌨️ 填写: ${selector} = "${value.slice(0, 50)}"`);
    // 显式等待元素可见
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
    await this.page.fill(selector, value, { timeout });
  }

  /**
   * 选择下拉选项（带显式等待）
   */
  protected async select(selector: string, value: string, timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`📋 选择: ${selector} = "${value}"`);
    // 显式等待元素可见
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
    await this.page.selectOption(selector, value, { timeout });
  }

  /**
   * 悬停（带显式等待）
   */
  protected async hover(selector: string, timeout: number): Promise<void> {
    if (!this.page) return;
    logger.step(`🖱️ 悬停: ${selector}`);
    // 显式等待元素可见
    await this.page.waitForSelector(selector, { state: 'visible', timeout });
    await this.page.hover(selector, { timeout });
  }

  /**
   * 滚动
   */
  protected async scroll(selector?: string, value?: string): Promise<void> {
    if (!this.page) return;

    if (selector) {
      await this.page.locator(selector).scrollIntoViewIfNeeded();
    } else if (value) {
      const [x, y] = value.split(',').map(Number);
      await this.page.mouse.wheel(x || 0, y || 0);
    } else {
      await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }
  }

  /**
   * 等待
   */
  protected async wait(value?: string, selector?: string, timeout?: number): Promise<void> {
    if (!this.page) return;

    if (selector) {
      await this.page.waitForSelector(selector, { timeout });
    } else if (value) {
      const ms = parseInt(value, 10);
      if (!isNaN(ms)) {
        await this.page.waitForTimeout(ms);
      }
    } else {
      await this.page.waitForLoadState('networkidle', { timeout });
    }
  }

  /**
   * 断言
   */
  protected async assert(
    selector: string,
    assertType: string,
    value?: string,
    timeout?: number,
  ): Promise<void> {
    if (!this.page) return;

    logger.step(`🔍 断言: ${assertType} on ${selector}`);

    const assertTimeout = timeout ?? this.config.timeout;

    switch (assertType) {
      case 'element-visible':
        await this.page.locator(selector).waitFor({ state: 'visible', timeout: assertTimeout });
        break;

      case 'element-hidden':
        await this.page.locator(selector).waitFor({ state: 'hidden', timeout: assertTimeout });
        break;

      case 'text-contains':
        await this.page.locator(selector).waitFor({ state: 'visible', timeout: assertTimeout });
        const textContent = await this.page.locator(selector).textContent();
        if (!textContent?.includes(value || '')) {
          throw new Error(`断言失败: 元素文本 "${textContent}" 不包含 "${value}"`);
        }
        break;

      case 'text-equals':
        await this.page.locator(selector).waitFor({ state: 'visible', timeout: assertTimeout });
        const text = await this.page.locator(selector).textContent();
        if (text !== value) {
          throw new Error(`断言失败: 元素文本 "${text}" 不等于 "${value}"`);
        }
        break;

      case 'url-contains':
        if (!this.page.url().includes(value || '')) {
          throw new Error(`断言失败: URL "${this.page.url()}" 不包含 "${value}"`);
        }
        break;

      case 'url-equals':
        if (this.page.url() !== value) {
          throw new Error(`断言失败: URL "${this.page.url()}" 不等于 "${value}"`);
        }
        break;

      case 'title-contains':
        const title = await this.page.title();
        if (!title.includes(value || '')) {
          throw new Error(`断言失败: 页面标题 "${title}" 不包含 "${value}"`);
        }
        break;

      case 'title-equals':
        const pageTitle = await this.page.title();
        if (pageTitle !== value) {
          throw new Error(`断言失败: 页面标题 "${pageTitle}" 不等于 "${value}"`);
        }
        break;

      case 'element-count':
        const count = await this.page.locator(selector).count();
        const expectedCount = parseInt(value || '0', 10);
        if (count !== expectedCount) {
          throw new Error(`断言失败: 元素数量 ${count} 不等于 ${expectedCount}`);
        }
        break;

      case 'attribute-equals':
        const attrName = value?.split('=')[0] || '';
        const expectedAttrValue = value?.split('=')[1] || '';
        const attrValue = await this.page.locator(selector).getAttribute(attrName);
        if (attrValue !== expectedAttrValue) {
          throw new Error(`断言失败: 属性值 "${attrValue}" 不等于 "${expectedAttrValue}"`);
        }
        break;

      case 'value-equals':
        const inputValue = await this.page.locator(selector).inputValue();
        if (inputValue !== value) {
          throw new Error(`断言失败: 输入值 "${inputValue}" 不等于 "${value}"`);
        }
        break;

      case 'checked':
        const isChecked = await this.page.locator(selector).isChecked();
        if (!isChecked) {
          throw new Error(`断言失败: 元素 ${selector} 未被选中`);
        }
        break;

      case 'disabled':
        const isDisabled = await this.page.locator(selector).isDisabled();
        if (!isDisabled) {
          throw new Error(`断言失败: 元素 ${selector} 未被禁用`);
        }
        break;

      case 'enabled':
        const isEnabled = await this.page.locator(selector).isEnabled();
        if (!isEnabled) {
          throw new Error(`断言失败: 元素 ${selector} 未启用`);
        }
        break;

      default:
        throw new Error(`未知的断言类型: ${assertType}`);
    }
  }

  /**
   * 截图
   */
  protected async takeScreenshot(
    caseId: string,
    runId: string,
    stepOrder: number,
    suffix: string = '',
  ): Promise<string> {
    if (!this.page) return '';

    const filename = `${caseId}_${runId}_step${stepOrder}${suffix ? `_${suffix}` : ''}.png`;
    const filepath = path.join(this.config.artifactsDir, filename);

    await this.page.screenshot({ path: filepath, fullPage: true });

    return filepath;
  }

  /**
   * 获取环境信息
   */
  protected getEnvironment(): TestEnvironment {
    return {
      browser: this.config.browser,
      viewport: this.config.viewport,
      os: process.platform,
      network: { online: true },
    };
  }

  /**
   * 获取当前页面
   */
  getPage(): Page | null {
    return this.page;
  }

  /**
   * 获取浏览器上下文
   */
  getContext(): BrowserContext | null {
    return this.context;
  }

  /**
   * 关闭浏览器（带超时保护）
   */
  async close(): Promise<void> {
    const closeLogger = logger.child({ component: 'PcTester' });
    const timeout = 180000; // 3分钟超时

    // 关闭页面
    if (this.page) {
      try {
        await Promise.race([
          this.page.close(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('关闭页面超时')), timeout / 3))
        ]);
      } catch (error) {
        closeLogger.warn('关闭页面失败', { error: String(error) });
      }
      this.page = null;
    }

    // 关闭上下文
    if (this.context) {
      try {
        await Promise.race([
          this.context.close(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('关闭上下文超时')), timeout / 3))
        ]);
      } catch (error) {
        closeLogger.warn('关闭浏览器上下文失败', { error: String(error) });
      }
      this.context = null;
    }

    // 关闭浏览器
    if (this.browser) {
      try {
        await Promise.race([
          this.browser.close(),
          new Promise<void>((_, reject) => setTimeout(() => reject(new Error('关闭浏览器超时')), timeout / 3))
        ]);
      } catch (error) {
        closeLogger.warn('关闭浏览器失败', { error: String(error) });
      }
      this.browser = null;
    }

    // 从管理器注销（如果已注册）
    if (this.browserId) {
      try {
        closeBrowser(this.browserId);
      } catch {
        // 忽略注销错误
      }
      this.browserId = null;
    }

    // 关闭视觉回归管理器
    if (this.visualRegressionManager) {
      try {
        await this.visualRegressionManager.close?.();
      } catch {
        // 忽略关闭错误
      }
      this.visualRegressionManager = null;
    }

    closeLogger.info('🔚 浏览器已关闭');
  }
}

/**
 * 快捷执行函数
 */
export async function runPcTest(
  testCase: TestCase,
  config?: Partial<PcTesterConfig>,
): Promise<TestCaseResult> {
  const tester = new PcTester(config);
  try {
    return await tester.runTest(testCase);
  } finally {
    await tester.close();
  }
}
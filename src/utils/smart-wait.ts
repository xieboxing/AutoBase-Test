/**
 * 智能等待工具类
 * 替代硬等待，提供更稳定的元素检测和状态等待
 */

import { logger } from '@/core/logger.js';

/**
 * WebdriverIO Browser 类型（用于 APP 自动化）
 * 使用 any 类型避免对 webdriverio 的强依赖
 */
type WebdriverIOBrowser = any; // eslint-disable-line @typescript-eslint/no-explicit-any

/**
 * WebdriverIO Element 类型（用于 APP 自动化）
 */
interface WebdriverIOElement {
  isDisplayed: () => Promise<boolean>;
  waitForExist: (opts: { timeout: number }) => Promise<boolean>;
  waitForDisplayed: (opts: { timeout: number }) => Promise<void>;
  click: () => Promise<void>;
}

/**
 * 等待配置
 */
export interface WaitConfig {
  /** 默认超时时间（毫秒） */
  defaultTimeout: number;
  /** 轮询间隔（毫秒） */
  pollInterval: number;
  /** 最大重试次数 */
  maxRetries: number;
}

/**
 * 默认等待配置
 */
const DEFAULT_WAIT_CONFIG: WaitConfig = {
  defaultTimeout: 30000,
  pollInterval: 200,
  maxRetries: 3,
};

/**
 * 智能等待工具类
 */
export class SmartWait {
  private config: WaitConfig;

  constructor(config: Partial<WaitConfig> = {}) {
    this.config = { ...DEFAULT_WAIT_CONFIG, ...config };
  }

  /**
   * 等待条件满足
   * @param condition 条件函数，返回 true 表示条件满足
   * @param timeout 超时时间（毫秒）
   * @param message 等待描述（用于日志）
   */
  async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeout: number = this.config.defaultTimeout,
    message: string = 'condition'
  ): Promise<boolean> {
    const startTime = Date.now();
    const deadline = startTime + timeout;

    while (Date.now() < deadline) {
      try {
        const result = await condition();
        if (result) {
          const elapsed = Date.now() - startTime;
          logger.debug(`⏳ 等待 ${message} 满足，耗时 ${elapsed}ms`);
          return true;
        }
      } catch (error) {
        // 条件检查失败，继续等待
        logger.debug(`⏳ 等待 ${message} 时条件检查异常: ${error}`);
      }

      await this.sleep(this.config.pollInterval);
    }

    const elapsed = Date.now() - startTime;
    logger.warn(`⏳ 等待 ${message} 超时（${elapsed}ms）`);
    return false;
  }

  /**
   * 等待元素出现（APP专用）
   * @param driver WebDriverIO 实例
   * @param selector 元素选择器
   * @param timeout 超时时间
   */
  async waitForElementApp(
    driver: WebdriverIOBrowser,
    selector: string,
    timeout: number = this.config.defaultTimeout
  ): Promise<WebdriverIOElement | null> {
    const startTime = Date.now();

    try {
      const element = await driver.$(selector);

      // 等待元素存在
      const exists = await element.waitForExist({ timeout });
      if (!exists) {
        logger.warn(`⏳ 元素 ${selector} 在 ${Date.now() - startTime}ms 后未出现`);
        return null;
      }

      // 等待元素可见
      const remainingTimeout = Math.max(timeout - (Date.now() - startTime), 1000);
      try {
        await element.waitForDisplayed({ timeout: remainingTimeout });
      } catch {
        logger.warn(`⏳ 元素 ${selector} 存在但不可见`);
      }

      return element;
    } catch (error) {
      logger.warn(`⏳ 等待元素 ${selector} 失败: ${error}`);
      return null;
    }
  }

  /**
   * 等待权限弹窗出现并处理（APP专用）
   * @param driver WebDriverIO 实例
   * @param action 'allow' | 'deny' | 'ignore'
   * @param timeout 等待弹窗出现的超时时间
   */
  async handlePermissionDialog(
    driver: WebdriverIOBrowser,
    action: 'allow' | 'deny' | 'ignore' = 'allow',
    timeout: number = 5000
  ): Promise<boolean> {
    const startTime = Date.now();

    // 权限弹窗可能的按钮文本
    const allowTexts = ['Allow', '允许', 'ALLOW', '总是允许', '仅在使用中允许'];
    const denyTexts = ['Deny', '拒绝', 'DENY', '不再询问'];

    while (Date.now() - startTime < timeout) {
      try {
        // 检查允许按钮
        for (const text of allowTexts) {
          const allowBtn = await driver.$(`//android.widget.Button[@text="${text}" or contains(@text, "${text}")]`);
          if (await allowBtn.isDisplayed().catch(() => false)) {
            if (action === 'allow') {
              await allowBtn.click();
              logger.pass(`✅ 点击权限按钮: ${text}`);
              await this.sleep(500); // 等待弹窗消失
              return true;
            }
          }
        }

        // 检查拒绝按钮
        for (const text of denyTexts) {
          const denyBtn = await driver.$(`//android.widget.Button[@text="${text}" or contains(@text, "${text}")]`);
          if (await denyBtn.isDisplayed().catch(() => false)) {
            if (action === 'deny') {
              await denyBtn.click();
              logger.pass(`✅ 点击权限按钮: ${text}`);
              await this.sleep(500);
              return true;
            }
          }
        }

        // 没有找到弹窗，等待后重试
        await this.sleep(this.config.pollInterval);
      } catch {
        // 继续等待
        await this.sleep(this.config.pollInterval);
      }
    }

    logger.debug(`⏳ 未检测到权限弹窗（等待了 ${Date.now() - startTime}ms）`);
    return false;
  }

  /**
   * 等待应用启动完成（APP专用）
   * @param deviceId 设备ID
   * @param packageName 包名
   * @param timeout 超时时间
   */
  async waitForAppLaunch(
    deviceId: string,
    packageName: string,
    shellFn: (deviceId: string, cmd: string) => Promise<string>,
    timeout: number = 10000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const result = await shellFn(deviceId, `pidof ${packageName}`);
        if (result && result.trim().length > 0) {
          // 进程存在，再等待一小段时间确保应用完全启动
          await this.sleep(500);
          logger.pass(`✅ 应用 ${packageName} 启动完成（PID: ${result.trim()}）`);
          return true;
        }
      } catch {
        // 进程不存在，继续等待
      }

      await this.sleep(this.config.pollInterval);
    }

    logger.warn(`⏳ 应用 ${packageName} 启动超时（${timeout}ms）`);
    return false;
  }

  /**
   * 等待页面稳定（Web专用）
   * @param page Playwright Page 实例
   * @param timeout 超时时间
   */
  async waitForPageStable(
    page: { waitForLoadState: (state: string, options?: { timeout?: number }) => Promise<void> },
    timeout: number = 10000
  ): Promise<boolean> {
    try {
      await page.waitForLoadState('networkidle', { timeout });
      return true;
    } catch {
      logger.warn('⏳ 页面未达到 networkidle 状态');
      return false;
    }
  }

  /**
   * 等待并重试操作
   * @param operation 操作函数
   * @param maxRetries 最大重试次数
   * @param delay 重试间隔
   * @param operationName 操作名称
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.maxRetries,
    delay: number = 1000,
    operationName: string = 'operation'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 1) {
          logger.pass(`✅ ${operationName} 在第 ${attempt} 次尝试成功`);
        }
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`⚠️ ${operationName} 第 ${attempt}/${maxRetries} 次尝试失败: ${lastError.message}`);

        if (attempt < maxRetries) {
          await this.sleep(delay * attempt); // 指数退避
        }
      }
    }

    throw lastError || new Error(`${operationName} 失败，已重试 ${maxRetries} 次`);
  }

  /**
   * 等待异步操作完成
   * @param trigger 触发操作的函数
   * @param verify 验证操作完成的函数
   * @param timeout 超时时间
   */
  async waitForAsyncOperation(
    trigger: () => Promise<void>,
    verify: () => Promise<boolean>,
    timeout: number = this.config.defaultTimeout
  ): Promise<boolean> {
    // 触发操作
    await trigger();

    // 等待验证条件满足
    return this.waitFor(verify, timeout, 'async operation');
  }

  /**
   * 延迟
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 全局智能等待实例
 */
export const smartWait = new SmartWait();

/**
 * 便捷函数：等待条件满足
 */
export function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeout?: number,
  message?: string
): Promise<boolean> {
  return smartWait.waitFor(condition, timeout, message);
}

/**
 * 便捷函数：重试操作
 */
export function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries?: number,
  delay?: number,
  operationName?: string
): Promise<T> {
  return smartWait.retryOperation(operation, maxRetries, delay, operationName);
}
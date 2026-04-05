import { EventEmitter } from 'node:events';
import { logger } from '@/core/logger.js';
import { TestEventType, eventBus } from '@/core/event-bus.js';
import type {
  CrawlerConfig,
  CrawlerResult,
  CrawledPage,
  CrawlerError,
  InteractiveElement,
} from '@/types/crawler.types.js';

/**
 * APP 爬虫配置
 */
export interface AppCrawlerConfig extends CrawlerConfig {
  packageName: string;
  mainActivity?: string;
  apkPath?: string;
  deviceId?: string;
  maxActions?: number; // 最大操作次数
  backStrategy?: 'back-button' | 'restart'; // 返回策略
}

/**
 * APP 页面状态
 */
export interface AppPageState {
  activity: string;
  packageName: string;
  depth: number;
  screenshot?: string;
  elements: InteractiveElement[];
  visitedActions: Set<string>;
}

/**
 * 默认 APP 爬虫配置
 */
const DEFAULT_APP_CONFIG: AppCrawlerConfig = {
  packageName: '',
  maxDepth: 5,
  maxPages: 50,
  maxActions: 100,
  timeout: 30000,
  rateLimit: 300,
  backStrategy: 'back-button',
  excludePatterns: [
    // 系统应用和设置
    /com\.android\./i,
    /com\.google\.android\./i,
    // 认证相关
    /login/i,
    /signup/i,
    /register/i,
    // 设置相关
    /settings/i,
    /preferences/i,
    /about$/i,
  ],
  followExternalLinks: false,
};

/**
 * 系统弹窗配置
 */
const SYSTEM_POPUP_PATTERNS = [
  { buttonSelector: '//*[@text="允许"]', description: '权限允许弹窗' },
  { buttonSelector: '//*[@text="始终允许"]', description: '始终允许弹窗' },
  { buttonSelector: '//*[@text="确定"]', description: '确定弹窗' },
  { buttonSelector: '//*[@text="好的"]', description: '好的弹窗' },
  { buttonSelector: '//*[@text="以后"]', description: '更新提醒弹窗' },
  { buttonSelector: '//*[@text="暂不更新"]', description: '更新弹窗' },
  { buttonSelector: '//*[@text="取消"]', description: '取消弹窗' },
  { buttonSelector: '//*[@text="关闭"]', description: '关闭弹窗' },
];

/**
 * APP 爬虫类（基于 Appium/WebDriverIO）
 */
export class AppCrawler extends EventEmitter {
  private config: AppCrawlerConfig;
  private driver: any = null; // WebDriverIO driver
  private visitedPages: Map<string, AppPageState> = new Map();
  private pages: CrawledPage[] = [];
  private errors: CrawlerError[] = [];
  private startTime: number = 0;
  private actionCount: number = 0;

  constructor(config: Partial<AppCrawlerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_APP_CONFIG, ...config };
  }

  /**
   * 爬取 APP
   */
  async crawl(): Promise<CrawlerResult> {
    this.startTime = Date.now();
    this.visitedPages.clear();
    this.pages = [];
    this.errors = [];
    this.actionCount = 0;

    logger.info('🚀 启动 APP 爬虫', {
      packageName: this.config.packageName,
      maxDepth: this.config.maxDepth,
      maxPages: this.config.maxPages,
      maxActions: this.config.maxActions,
    });

    eventBus.emitSafe(TestEventType.CRAWLER_START, {
      url: this.config.packageName,
      depth: this.config.maxDepth,
    });

    try {
      // 初始化 Appium 驱动
      await this.initDriver();

      // DFS 爬取
      await this.crawlDfs();

      const duration = Date.now() - this.startTime;

      logger.info('✅ APP 爬取完成', {
        totalPages: this.pages.length,
        totalErrors: this.errors.length,
        totalActions: this.actionCount,
        durationMs: duration,
      });

      eventBus.emitSafe(TestEventType.CRAWLER_COMPLETE, {
        totalPages: this.pages.length,
        durationMs: duration,
      });

      return {
        pages: this.pages,
        errors: this.errors,
        stats: {
          totalPages: this.pages.length,
          totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
          duration,
        },
      };
    } finally {
      await this.close();
    }
  }

  /**
   * 初始化 Appium 驱动
   */
  private async initDriver(): Promise<void> {
    logger.step('📍 初始化 Appium 驱动');

    try {
      // 动态导入 webdriverio 以避免在没有安装 Appium 时报错
      const { remote } = await import('webdriverio');

      const capabilities: Record<string, unknown> = {
        platformName: 'Android',
        'appium:automationName': 'UiAutomator2',
        'appium:deviceName': this.config.deviceId || 'Android',
        'appium:appPackage': this.config.packageName,
        'appium:appActivity': this.config.mainActivity || '.MainActivity',
        'appium:noReset': true, // 不重置应用状态
        'appium:fullReset': false,
        'appium:newCommandTimeout': 300,
      };

      // 如果提供了 APK 路径
      if (this.config.apkPath) {
        capabilities['appium:app'] = this.config.apkPath;
      }

      // 如果指定了设备 ID
      if (this.config.deviceId) {
        capabilities['appium:udid'] = this.config.deviceId;
      }

      this.driver = await remote({
        capabilities,
        logLevel: 'error',
        connectionRetryTimeout: this.config.timeout,
        connectionRetryCount: 2,
      });

      logger.pass('✅ Appium 驱动初始化成功');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail('❌ Appium 驱动初始化失败', { error: errorMessage });

      // 记录错误但继续执行（使用模拟模式）
      this.errors.push({
        url: 'init',
        error: `Appium 初始化失败: ${errorMessage}`,
        code: 'APPIUM_INIT_FAILED',
        timestamp: new Date().toISOString(),
      });

      // 设置 driver 为 null 表示没有真正的 Appium 连接
      this.driver = null;

      throw new Error(`Appium 初始化失败: ${errorMessage}`);
    }
  }

  /**
   * DFS 深度优先爬取
   */
  private async crawlDfs(): Promise<void> {
    if (!this.driver) {
      logger.warn('⚠️ 无 Appium 驱动，无法执行实际爬取');
      return;
    }

    // 获取初始页面状态
    const initialState = await this.capturePageState(0);
    if (!initialState) {
      logger.fail('❌ 无法获取初始页面状态');
      return;
    }

    // 开始 DFS 遍历
    await this.explorePage(initialState, 0);
  }

  /**
   * 探索页面（DFS）
   */
  private async explorePage(state: AppPageState, depth: number): Promise<void> {
    // 检查是否超过限制
    if (depth > this.config.maxDepth || this.pages.length >= this.config.maxPages || this.actionCount >= (this.config.maxActions || 100)) {
      return;
    }

    // 获取页面唯一标识
    const pageKey = this.getPageKey(state);
    if (!pageKey) return;

    // 检查是否已访问
    if (this.visitedPages.has(pageKey)) {
      return;
    }

    // 记录已访问
    this.visitedPages.set(pageKey, state);

    logger.step(`📍 探索页面 (深度 ${depth})`, {
      activity: state.activity,
      elements: state.elements.length,
    });

    // 添加到结果
    this.pages.push({
      url: `${state.packageName}/${state.activity}`,
      title: state.activity,
      depth,
      links: state.elements.map(e => e.selector),
    });

    eventBus.emitSafe(TestEventType.CRAWLER_PAGE, {
      url: pageKey,
      title: state.activity,
      depth,
    });

    // 遍历可交互元素
    const clickableElements = state.elements.filter(e => e.clickable && !e.disabled);

    for (const element of clickableElements) {
      // 检查是否已对该元素执行过操作
      const actionKey = `${pageKey}:${element.selector}`;
      if (state.visitedActions.has(actionKey)) {
        continue;
      }

      // 检查是否超过限制
      if (this.actionCount >= (this.config.maxActions || 100)) {
        break;
      }

      // 限速
      if (this.config.rateLimit > 0) {
        await this.delay(this.config.rateLimit);
      }

      // 记录操作
      state.visitedActions.add(actionKey);
      this.actionCount++;

      logger.step(`👉 点击元素`, { selector: element.selector, text: element.text });

      try {
        // 执行点击
        await this.clickElement(element);

        // 等待页面变化
        await this.waitForPageChange();

        // 获取新页面状态
        const newState = await this.capturePageState(depth + 1);

        if (newState && this.isPageChanged(state, newState)) {
          // 探索新页面
          await this.explorePage(newState, depth + 1);

          // 返回上一页
          await this.goBack(state);
        }
      } catch (error) {
        logger.warn('⚠️ 元素点击失败', {
          selector: element.selector,
          error: String(error),
        });

        // 记录错误但继续
        this.errors.push({
          url: `${pageKey}:${element.selector}`,
          error: String(error),
          code: 'ELEMENT_CLICK_FAILED',
          timestamp: new Date().toISOString(),
        });

        // 尝试恢复状态
        await this.goBack(state);
      }
    }
  }

  /**
   * 获取页面状态
   */
  private async capturePageState(depth: number): Promise<AppPageState | null> {
    if (!this.driver) return null;

    try {
      // 获取当前 Activity
      const currentActivity = await this.driver.getCurrentActivity();
      const currentPackage = await this.driver.getCurrentPackage();

      // 获取页面源码
      const source = await this.driver.getPageSource();

      // 截图
      let screenshot: string | undefined;
      try {
        const screenshotBuffer = await this.driver.takeScreenshot();
        screenshot = screenshotBuffer.toString('base64');
      } catch {
        // 截图失败不影响继续
      }

      // 解析可交互元素
      const elements = await this.parseElements(source);

      return {
        activity: currentActivity,
        packageName: currentPackage,
        depth,
        screenshot,
        elements,
        visitedActions: new Set(),
      };
    } catch (error) {
      logger.fail('❌ 获取页面状态失败', { error: String(error) });
      return null;
    }
  }

  /**
   * 解析页面元素
   */
  private async parseElements(_source: string): Promise<InteractiveElement[]> {
    const elements: InteractiveElement[] = [];

    try {
      // 使用 driver 获取元素列表（更可靠）
      if (this.driver) {
        // 获取所有可点击元素
        const clickableElements = await this.driver.$$('//*[@clickable="true"]');

        for (const element of clickableElements) {
          try {
            const bounds = await element.getAttribute('bounds');
            const text = await element.getAttribute('text');
            const resourceId = await element.getAttribute('resource-id');
            const contentDesc = await element.getAttribute('content-desc');
            const className = await element.getAttribute('class');
            const enabled = await element.getAttribute('enabled');
            const displayed = await element.getAttribute('displayed');

            // 解析 bounds（格式: "[x1,y1][x2,y2]"）
            const boundsMatch = bounds?.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
            let position: { x: number; y: number; width: number; height: number } | undefined;
            if (boundsMatch) {
              position = {
                x: parseInt(boundsMatch[1], 10),
                y: parseInt(boundsMatch[2], 10),
                width: parseInt(boundsMatch[3], 10) - parseInt(boundsMatch[1], 10),
                height: parseInt(boundsMatch[4], 10) - parseInt(boundsMatch[2], 10),
              };
            }

            // 构建选择器
            const selectors: string[] = [];
            if (resourceId) {
              selectors.push(`id=${resourceId}`);
            }
            if (contentDesc) {
              selectors.push(`accessibility-id=${contentDesc}`);
            }
            if (text) {
              selectors.push(`//*[@text="${text}"]`);
            }
            if (className) {
              selectors.push(className);
            }

            elements.push({
              tag: className || 'element',
              text: text || undefined,
              selector: selectors[0] || `//*[@clickable="true"]`,
              alternativeSelectors: selectors.slice(1),
              position: position || { x: 0, y: 0, width: 0, height: 0 },
              visible: displayed === 'true',
              clickable: true,
              disabled: enabled !== 'true',
              attributes: {
                resourceId: resourceId || '',
                contentDesc: contentDesc || '',
                className: className || '',
              },
            });
          } catch {
            // 单个元素解析失败不影响整体
          }
        }
      }
    } catch (error) {
      logger.warn('⚠️ 解析元素失败', { error: String(error) });
    }

    return elements;
  }

  /**
   * 处理系统弹窗
   * 尝试关闭可能存在的系统弹窗（权限、更新提醒等）
   * @returns 是否处理了弹窗
   */
  private async handleSystemPopups(): Promise<boolean> {
    if (!this.driver) return false;

    let handled = false;

    for (const popup of SYSTEM_POPUP_PATTERNS) {
      try {
        const button = await this.driver.$(popup.buttonSelector);
        const isDisplayed = await button.isDisplayed().catch(() => false);

        if (isDisplayed) {
          await button.click();
          logger.info(`🛡️ 已处理系统弹窗: ${popup.description}`);
          handled = true;
          // 等待弹窗消失
          await this.driver.pause(300);
        }
      } catch {
        // 弹窗不存在或处理失败，继续检查下一个
      }
    }

    return handled;
  }

  /**
   * 点击元素（带可见性和可点击性检查）
   */
  private async clickElement(element: InteractiveElement): Promise<void> {
    if (!this.driver) return;

    try {
      // 先尝试处理可能存在的系统弹窗
      await this.handleSystemPopups();

      // 尝试多种定位策略
      const selectors = [element.selector, ...element.alternativeSelectors];

      for (const selector of selectors) {
        try {
          let locator: any;

          // 根据选择器类型构建定位器
          if (selector.startsWith('id=')) {
            locator = this.driver.$(`#${selector.slice(3)}`);
          } else if (selector.startsWith('accessibility-id=')) {
            locator = this.driver.$(`~${selector.slice(16)}`);
          } else {
            locator = this.driver.$(selector);
          }

          // 检查元素是否存在、可见、可点击
          const isDisplayed = await locator.isDisplayed().catch(() => false);
          const isEnabled = await locator.isEnabled().catch(() => false);

          if (isDisplayed && isEnabled) {
            await locator.click();
            return;
          }
        } catch {
          // 尝试下一个选择器
        }
      }

      // 如果所有选择器都失败，使用坐标点击（最后手段）
      if (element.position.x > 0 && element.position.y > 0) {
        const centerX = element.position.x + element.position.width / 2;
        const centerY = element.position.y + element.position.height / 2;

        logger.warn(`⚠️ 使用坐标点击元素: (${centerX}, ${centerY})`);
        await this.driver.touchAction({
          action: 'tap',
          x: centerX,
          y: centerY,
        });
      } else {
        throw new Error(`元素不可见或不可点击: ${element.selector}`);
      }
    } catch (error) {
      throw new Error(`点击元素失败: ${element.selector} - ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 等待页面变化（智能等待）
   * 使用轮询机制检测页面状态变化，而非硬等待
   */
  private async waitForPageChange(): Promise<void> {
    if (!this.driver) return;

    const maxWaitTime = 5000; // 最大等待 5 秒
    const pollInterval = 200; // 每 200ms 检查一次
    const startTime = Date.now();

    // 记录初始 Activity 和 Package
    let lastActivity = '';
    let lastPackage = '';
    try {
      lastActivity = await this.driver.getCurrentActivity();
      lastPackage = await this.driver.getCurrentPackage();
    } catch {
      // 无法获取初始状态，使用最小等待
      await this.driver.pause(300);
      return;
    }

    // 轮询等待页面稳定
    let stableCount = 0;
    while (Date.now() - startTime < maxWaitTime) {
      try {
        const currentActivity = await this.driver.getCurrentActivity();
        const currentPackage = await this.driver.getCurrentPackage();

        // 如果 Activity 或 Package 变化，说明页面在加载
        if (currentActivity !== lastActivity || currentPackage !== lastPackage) {
          lastActivity = currentActivity;
          lastPackage = currentPackage;
          stableCount = 0;
          await this.driver.pause(pollInterval);
          continue;
        }

        // 检查加载指示器
        const loadingIndicators = await this.driver.$$('//*[@progress="true" or @loading="true"]');
        if (loadingIndicators.length > 0) {
          stableCount = 0;
          await this.driver.pause(pollInterval);
          continue;
        }

        // 页面已稳定
        stableCount++;
        if (stableCount >= 2) {
          // 连续两次检查稳定才认为加载完成
          break;
        }

        await this.driver.pause(pollInterval);
      } catch {
        // 检查出错，等待后重试
        await this.driver.pause(pollInterval);
      }
    }
  }

  /**
   * 获取页面唯一标识
   */
  private getPageKey(state: AppPageState): string | null {
    if (!state.activity || !state.packageName) {
      return null;
    }
    return `${state.packageName}/${state.activity}`;
  }

  /**
   * 检查页面是否变化
   */
  private isPageChanged(oldState: AppPageState, newState: AppPageState): boolean {
    return oldState.activity !== newState.activity || oldState.packageName !== newState.packageName;
  }

  /**
   * 返回上一页（带状态恢复保护）
   */
  private async goBack(_targetState: AppPageState): Promise<void> {
    if (!this.driver) return;

    logger.step('⬅️ 返回上一页');

    try {
      if (this.config.backStrategy === 'back-button') {
        // 使用系统返回键
        await this.driver.back();

        // 智能等待页面稳定（而非硬等待）
        await this.waitForPageChange();
      } else {
        // 重启应用回到目标页面
        await this.driver.closeApp();
        await this.driver.launchApp();
      }
    } catch (error) {
      logger.warn('⚠️ 返回操作失败', { error: String(error) });

      // 尝试重启应用恢复状态
      try {
        await this.driver.closeApp();
        await this.driver.launchApp();
        // 等待应用启动完成
        await this.waitForPageChange();
      } catch (recoveryError) {
        // 最终恢复失败，记录详细错误
        logger.error('❌ 应用恢复失败，当前测试可能受影响', {
          originalError: String(error),
          recoveryError: String(recoveryError),
        });
      }
    }
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 关闭驱动
   */
  async close(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.deleteSession();
      } catch {
        // 关闭失败不影响
      }
      this.driver = null;
    }
  }

  /**
   * 获取爬取结果
   */
  getResults(): CrawlerResult {
    return {
      pages: this.pages,
      errors: this.errors,
      stats: {
        totalPages: this.pages.length,
        totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
        duration: Date.now() - this.startTime,
      },
    };
  }
}

/**
 * 快捷爬取函数
 */
export async function crawlApp(
  options: Partial<AppCrawlerConfig>,
): Promise<CrawlerResult> {
  const crawler = new AppCrawler(options);
  return crawler.crawl();
}

/**
 * 模拟 APP 爬虫（用于测试环境）
 */
export class MockAppCrawler extends EventEmitter {
  private config: AppCrawlerConfig;
  private pages: CrawledPage[] = [];
  private errors: CrawlerError[] = [];
  private startTime: number = 0;

  constructor(config: Partial<AppCrawlerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_APP_CONFIG, ...config };
  }

  /**
   * 模拟爬取（不依赖真实 Appium）
   */
  async crawl(): Promise<CrawlerResult> {
    this.startTime = Date.now();
    this.pages = [];
    this.errors = [];

    logger.info('🚀 启动模拟 APP 爬虫', { packageName: this.config.packageName });

    // 模拟几个页面
    const mockPages: CrawledPage[] = [
      {
        url: `${this.config.packageName}/.MainActivity`,
        title: 'MainActivity',
        depth: 0,
        links: ['id=button1', 'id=button2'],
      },
      {
        url: `${this.config.packageName}/.DetailActivity`,
        title: 'DetailActivity',
        depth: 1,
        links: ['id=backButton', 'id=shareButton'],
      },
      {
        url: `${this.config.packageName}/.SettingsActivity`,
        title: 'SettingsActivity',
        depth: 1,
        links: ['id=toggle1', 'id=toggle2'],
      },
    ];

    // 添加模拟页面
    this.pages = mockPages.slice(0, this.config.maxPages);

    const duration = Date.now() - this.startTime;

    logger.info('✅ 模拟爬取完成', {
      totalPages: this.pages.length,
      durationMs: duration,
    });

    return {
      pages: this.pages,
      errors: this.errors,
      stats: {
        totalPages: this.pages.length,
        totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
        duration,
      },
    };
  }

  async close(): Promise<void> {
    // 无需关闭
  }

  getResults(): CrawlerResult {
    return {
      pages: this.pages,
      errors: this.errors,
      stats: {
        totalPages: this.pages.length,
        totalLinks: this.pages.reduce((sum, p) => sum + p.links.length, 0),
        duration: Date.now() - this.startTime,
      },
    };
  }
}
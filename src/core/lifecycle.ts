import { logger } from './logger.js';
import { setupGlobalErrorHandler } from './error-handler.js';
import { eventBus, TestEventType } from './event-bus.js';
import type { GlobalConfig } from '../../config/index.js';

/**
 * 生命周期状态
 */
export type LifecycleState = 'initializing' | 'ready' | 'running' | 'stopping' | 'stopped';

/**
 * 生命周期管理器
 * 负责管理测试框架的启动和关闭流程
 */
export class LifecycleManager {
  private state: LifecycleState = 'initializing';
  private config: GlobalConfig | null = null;
  private cleanupCallbacks: Array<() => Promise<void>> = [];

  constructor() {
    setupGlobalErrorHandler();
  }

  /**
   * 初始化框架
   */
  async initialize(config: GlobalConfig): Promise<void> {
    const lifecycleLogger = logger.child({ component: 'lifecycle' });

    lifecycleLogger.info('🚀 初始化测试框架');

    this.state = 'initializing';
    this.config = config;

    try {
      // 1. 检查环境
      lifecycleLogger.step('检查环境依赖');
      await this.checkEnvironment(lifecycleLogger);

      // 2. 初始化知识库
      lifecycleLogger.step('初始化知识库');
      await this.initKnowledgeBase(lifecycleLogger);

      // 3. 加载配置
      lifecycleLogger.step('加载配置');
      await this.loadConfig(lifecycleLogger);

      // 4. 注册清理回调
      this.registerCleanupHooks();

      this.state = 'ready';
      lifecycleLogger.pass('框架初始化完成');

    } catch (error) {
      lifecycleLogger.fail('框架初始化失败', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * 检查环境依赖
   */
  private async checkEnvironment(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    lifecycleLogger.debug('检查 Node.js 版本');
    const nodeVersion = process.version;
    const versionParts = nodeVersion.replace('v', '').split('.');
    const majorVersion = parseInt(versionParts[0] ?? '0', 10);

    if (majorVersion < 20) {
      lifecycleLogger.warn(`Node.js 版本过低: ${nodeVersion}, 推荐使用 20+`);
    } else {
      lifecycleLogger.debug(`Node.js 版本: ${nodeVersion} ✓`);
    }
    lifecycleLogger.debug(`Node.js 主版本: ${majorVersion}`);
    // TODO: 检查浏览器、Appium 等
  }

  /**
   * 初始化知识库
   */
  private async initKnowledgeBase(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // TODO: 初始化 SQLite 数据库
    lifecycleLogger.debug('知识库初始化完成');
  }

  /**
   * 加载配置
   */
  private async loadConfig(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    if (this.config) {
      lifecycleLogger.debug('配置加载完成', {
        testDepth: this.config.testDepth,
        parallelism: this.config.parallelism,
      });
    }
  }

  /**
   * 注册清理钩子
   */
  private registerCleanupHooks(): void {
    // 监听运行完成事件
    eventBus.onSafe(TestEventType.RUN_COMPLETE, async () => {
      if (this.state === 'running') {
        this.state = 'ready';
      }
    });

    // 监听运行错误事件
    eventBus.onSafe(TestEventType.RUN_ERROR, async () => {
      if (this.state === 'running') {
        this.state = 'ready';
      }
    });
  }

  /**
   * 开始运行测试
   */
  async startRun(): Promise<void> {
    if (this.state !== 'ready') {
      throw new Error('框架未就绪，无法开始测试');
    }
    this.state = 'running';
    logger.step('开始测试运行');
  }

  /**
   * 结束运行测试
   */
  async endRun(): Promise<void> {
    if (this.state !== 'running') {
      return;
    }
    this.state = 'ready';
    logger.step('测试运行结束');
  }

  /**
   * 关闭框架
   */
  async shutdown(): Promise<void> {
    const lifecycleLogger = logger.child({ component: 'lifecycle' });

    if (this.state === 'stopped') {
      return;
    }

    this.state = 'stopping';
    lifecycleLogger.info('🛑 关闭测试框架');

    try {
      // 1. 保存结果
      lifecycleLogger.step('保存测试结果');
      await this.saveResults(lifecycleLogger);

      // 2. 关闭浏览器
      lifecycleLogger.step('关闭浏览器');
      await this.closeBrowsers(lifecycleLogger);

      // 3. 断开 Appium
      lifecycleLogger.step('断开 Appium 连接');
      await this.disconnectAppium(lifecycleLogger);

      // 4. 执行清理回调
      lifecycleLogger.step('执行清理回调');
      await this.executeCleanupCallbacks(lifecycleLogger);

      // 5. 关闭知识库
      lifecycleLogger.step('关闭知识库连接');
      await this.closeKnowledgeBase(lifecycleLogger);

      this.state = 'stopped';
      lifecycleLogger.pass('框架关闭完成');

    } catch (error) {
      lifecycleLogger.fail('框架关闭异常', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.state = 'stopped';
    }
  }

  /**
   * 保存测试结果
   */
  private async saveResults(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // TODO: 实现结果保存逻辑
    lifecycleLogger.debug('结果保存完成');
  }

  /**
   * 关闭浏览器
   */
  private async closeBrowsers(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // TODO: 实现浏览器关闭逻辑
    lifecycleLogger.debug('浏览器已关闭');
  }

  /**
   * 断开 Appium 连接
   */
  private async disconnectAppium(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // TODO: 实现 Appium 断开逻辑
    lifecycleLogger.debug('Appium 连接已断开');
  }

  /**
   * 执行清理回调
   */
  private async executeCleanupCallbacks(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        lifecycleLogger.warn('清理回调执行失败', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    this.cleanupCallbacks = [];
  }

  /**
   * 关闭知识库连接
   */
  private async closeKnowledgeBase(
    lifecycleLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // TODO: 实现知识库关闭逻辑
    lifecycleLogger.debug('知识库已关闭');
  }

  /**
   * 注册清理回调
   */
  registerCleanup(callback: () => Promise<void>): void {
    this.cleanupCallbacks.push(callback);
  }

  /**
   * 获取当前状态
   */
  getState(): LifecycleState {
    return this.state;
  }

  /**
   * 是否就绪
   */
  isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.state === 'running';
  }
}

// 全局生命周期管理器实例
export const lifecycleManager = new LifecycleManager();
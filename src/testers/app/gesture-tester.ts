import type { RemoteOptions } from 'webdriverio';
import { remote } from 'webdriverio';
import { logger } from '@/core/logger.js';

/**
 * 手势测试配置
 */
export interface GestureTesterConfig {
  deviceId: string;
  packageName: string;
  mainActivity?: string;
  appiumHost: string;
  appiumPort: number;
  automationTimeout: number;
  artifactsDir: string;
}

/**
 * 手势测试结果
 */
export interface GestureTestResult {
  gesture: string;
  success: boolean;
  duration: number;
  message: string;
}

/**
 * APP 手势测试器
 */
export class GestureTester {
  protected config: GestureTesterConfig;
  protected driver: WebdriverIO.Browser | null = null;

  constructor(config: Partial<GestureTesterConfig>) {
    this.config = {
      deviceId: '',
      packageName: '',
      appiumHost: '127.0.0.1',
      appiumPort: 4723,
      automationTimeout: 30000,
      artifactsDir: './data/screenshots',
      ...config,
    };
  }

  /**
   * 初始化连接
   */
  async initialize(): Promise<void> {
    const capabilities: Record<string, unknown> = {
      platformName: 'Android',
      'appium:deviceName': this.config.deviceId,
      'appium:automationName': 'UiAutomator2',
      'appium:appPackage': this.config.packageName,
      'appium:noReset': true,
    };

    const options: RemoteOptions = {
      hostname: this.config.appiumHost,
      port: this.config.appiumPort,
      path: '/wd/hub',
      capabilities,
    };

    this.driver = await remote(options);
    logger.info('🚀 手势测试器初始化完成');
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.deleteSession();
      this.driver = null;
    }
  }

  /**
   * 测试滑动手势
   */
  async testSwipe(directions: ('up' | 'down' | 'left' | 'right')[] = ['up', 'down', 'left', 'right']): Promise<GestureTestResult[]> {
    if (!this.driver) {
      await this.initialize();
    }

    const results: GestureTestResult[] = [];

    for (const direction of directions) {
      const startTime = Date.now();

      try {
        await this.performSwipe(direction);
        results.push({
          gesture: `swipe-${direction}`,
          success: true,
          duration: Date.now() - startTime,
          message: `Swipe ${direction} completed`,
        });
        logger.pass(`✅ 滑动测试通过: ${direction}`);
      } catch (error) {
        results.push({
          gesture: `swipe-${direction}`,
          success: false,
          duration: Date.now() - startTime,
          message: (error as Error).message,
        });
        logger.fail(`❌ 滑动测试失败: ${direction}`);
      }
    }

    return results;
  }

  /**
   * 执行滑动
   */
  protected async performSwipe(direction: 'up' | 'down' | 'left' | 'right'): Promise<void> {
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
  }

  /**
   * 测试双指缩放
   */
  async testPinchZoom(): Promise<GestureTestResult[]> {
    if (!this.driver) {
      await this.initialize();
    }

    const results: GestureTestResult[] = [];

    // 测试捏合（缩小）
    let startTime = Date.now();
    try {
      await this.performPinch();
      results.push({
        gesture: 'pinch',
        success: true,
        duration: Date.now() - startTime,
        message: 'Pinch gesture completed',
      });
      logger.pass('✅ 捏合手势测试通过');
    } catch (error) {
      results.push({
        gesture: 'pinch',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      });
    }

    // 测试展开（放大）
    startTime = Date.now();
    try {
      await this.performZoom();
      results.push({
        gesture: 'zoom',
        success: true,
        duration: Date.now() - startTime,
        message: 'Zoom gesture completed',
      });
      logger.pass('✅ 展开手势测试通过');
    } catch (error) {
      results.push({
        gesture: 'zoom',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      });
    }

    return results;
  }

  /**
   * 执行捏合
   */
  protected async performPinch(): Promise<void> {
    if (!this.driver) return;

    const { width, height } = await this.driver.getWindowSize();
    const centerX = width / 2;
    const centerY = height / 2;

    // 双指从两侧向中心移动
    await this.driver.touchAction([
      { action: 'press', x: width * 0.2, y: centerY },
      { action: 'moveTo', x: centerX, y: centerY },
    ]);

    await this.driver.touchAction([
      { action: 'press', x: width * 0.8, y: centerY },
      { action: 'moveTo', x: centerX, y: centerY },
      { action: 'release' },
    ]);
  }

  /**
   * 执行展开
   */
  protected async performZoom(): Promise<void> {
    if (!this.driver) return;

    const { width, height } = await this.driver.getWindowSize();
    const centerX = width / 2;
    const centerY = height / 2;

    // 双指从中心向两侧移动
    await this.driver.touchAction([
      { action: 'press', x: centerX, y: centerY },
      { action: 'moveTo', x: width * 0.2, y: centerY },
    ]);

    await this.driver.touchAction([
      { action: 'press', x: centerX, y: centerY },
      { action: 'moveTo', x: width * 0.8, y: centerY },
      { action: 'release' },
    ]);
  }

  /**
   * 测试长按
   */
  async testLongPress(duration: number = 1000): Promise<GestureTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      const { width, height } = await this.driver!.getWindowSize();
      const centerX = width / 2;
      const centerY = height / 2;

      await this.driver!.touchAction([
        { action: 'press', x: centerX, y: centerY },
        { action: 'wait', ms: duration },
        { action: 'release' },
      ]);

      logger.pass('✅ 长按手势测试通过');
      return {
        gesture: 'long-press',
        success: true,
        duration: Date.now() - startTime,
        message: `Long press (${duration}ms) completed`,
      };
    } catch (error) {
      return {
        gesture: 'long-press',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  /**
   * 测试拖拽
   */
  async testDrag(startX: number, startY: number, endX: number, endY: number): Promise<GestureTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      await this.driver!.touchAction([
        { action: 'press', x: startX, y: startY },
        { action: 'wait', ms: 500 },
        { action: 'moveTo', x: endX, y: endY },
        { action: 'release' },
      ]);

      logger.pass('✅ 拖拽手势测试通过');
      return {
        gesture: 'drag',
        success: true,
        duration: Date.now() - startTime,
        message: `Drag from (${startX},${startY}) to (${endX},${endY}) completed`,
      };
    } catch (error) {
      return {
        gesture: 'drag',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  /**
   * 运行完整手势测试
   */
  async runAllGestureTests(): Promise<{
    swipe: GestureTestResult[];
    pinchZoom: GestureTestResult[];
    longPress: GestureTestResult;
  }> {
    logger.info('🤚 开始手势测试');

    const swipe = await this.testSwipe();
    const pinchZoom = await this.testPinchZoom();
    const longPress = await this.testLongPress();

    return {
      swipe,
      pinchZoom,
      longPress,
    };
  }
}

/**
 * 快捷执行函数
 */
export async function runGestureTests(
  deviceId: string,
  packageName: string,
  options?: Partial<GestureTesterConfig>,
): Promise<ReturnType<GestureTester['runAllGestureTests']>> {
  const tester = new GestureTester({
    deviceId,
    packageName,
    ...options,
  });

  try {
    return await tester.runAllGestureTests();
  } finally {
    await tester.close();
  }
}
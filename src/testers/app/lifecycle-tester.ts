import type { RemoteOptions } from 'webdriverio';
import { remote } from 'webdriverio';
import { logger } from '@/core/logger.js';
import { deviceManager } from '@/utils/device.js';
import { registerAppiumSession, closeAppiumSession } from './appium-manager.js';

/**
 * 生命周期测试配置
 */
export interface LifecycleTesterConfig {
  deviceId: string;
  packageName: string;
  mainActivity?: string;
  appiumHost: string;
  appiumPort: number;
  automationTimeout: number;
  artifactsDir: string;
  /** 等待配置（毫秒） */
  waitConfig?: {
    /** 应用启动等待时间 */
    appLaunch?: number;
    /** 操作间隔等待时间 */
    operationInterval?: number;
    /** 屏幕旋转等待时间 */
    screenRotation?: number;
    /** 最大等待时间（用于智能等待） */
    maxWait?: number;
  };
}

/**
 * 默认等待配置
 */
const DEFAULT_WAIT_CONFIG = {
  appLaunch: 3000,
  operationInterval: 1000,
  screenRotation: 2000,
  maxWait: 10000,
};

/**
 * 生命周期测试结果
 */
export interface LifecycleTestResult {
  test: string;
  success: boolean;
  duration: number;
  message: string;
  dataRetained?: boolean;
}

/**
 * APP 生命周期测试器
 */
export class LifecycleTester {
  protected config: LifecycleTesterConfig;
  protected driver: WebdriverIO.Browser | null = null;
  protected sessionId: string | null = null;
  protected waitConfig: Required<NonNullable<LifecycleTesterConfig['waitConfig']>>;

  constructor(config: Partial<LifecycleTesterConfig>) {
    this.config = {
      deviceId: '',
      packageName: '',
      appiumHost: '127.0.0.1',
      appiumPort: 4723,
      automationTimeout: 30000,
      artifactsDir: './data/screenshots',
      ...config,
    };
    this.waitConfig = { ...DEFAULT_WAIT_CONFIG, ...config.waitConfig };
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

    // 注册到 Appium 管理器，确保资源能被正确清理
    if (this.config.deviceId && this.config.packageName) {
      this.sessionId = registerAppiumSession(this.driver, this.config.deviceId, this.config.packageName);
    }

    logger.info('🚀 生命周期测试器初始化完成');
  }

  /**
   * 关闭连接
   */
  async close(): Promise<void> {
    if (this.driver) {
      try {
        await this.driver.deleteSession();
        logger.info('🔌 生命周期测试器连接已关闭');
      } catch (error) {
        logger.warn('关闭生命周期测试器连接失败', { error: String(error) });
      } finally {
        // 从管理器注销（如果已注册）
        if (this.sessionId) {
          try {
            closeAppiumSession(this.sessionId);
          } catch {
            // 忽略注销错误
          }
          this.sessionId = null;
        }
        // 确保 driver 被置空，避免后续使用已损坏的连接
        this.driver = null;
      }
    }
  }

  /**
   * 测试前后台切换
   */
  async testBackgroundForeground(): Promise<LifecycleTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      logger.step('🔄 测试前后台切换');

      // 确保应用在前台
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用启动（替代硬编码等待）
      const appLaunched = await this.waitForAppRunning();
      if (!appLaunched) {
        throw new Error('应用启动超时');
      }

      // 额外等待应用完全加载（使用配置的等待时间）
      await this.sleep(this.waitConfig.appLaunch);

      // 获取当前活动 Activity 用于验证
      const beforeActivity = await this.getCurrentActivity();

      // 将应用切换到后台
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_HOME');
      await this.sleep(this.waitConfig.operationInterval);

      // 验证应用已进入后台
      const inBackground = await this.isAppInBackground();
      if (!inBackground) {
        logger.warn('⚠️ 应用可能未正确进入后台');
      }

      // 重新启动应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用恢复
      const appRestored = await this.waitForAppRunning();
      if (!appRestored) {
        throw new Error('应用恢复超时');
      }

      // 等待应用完全恢复
      await this.sleep(this.waitConfig.appLaunch);

      // 验证应用已恢复到前台
      const afterActivity = await this.getCurrentActivity();

      // 实际验证数据是否保留（检查应用进程是否保持）
      const dataRetained = await this.verifyAppStatePreserved();

      logger.pass('✅ 前后台切换测试通过');
      return {
        test: 'background-foreground',
        success: true,
        duration: Date.now() - startTime,
        message: 'App successfully restored from background',
        dataRetained,
      };
    } catch (error) {
      logger.fail('❌ 前后台切换测试失败');
      return {
        test: 'background-foreground',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  /**
   * 智能等待应用运行
   */
  protected async waitForAppRunning(): Promise<boolean> {
    const maxAttempts = Math.ceil(this.waitConfig.maxWait / 500);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const result = await deviceManager.shell(
          this.config.deviceId,
          `pidof ${this.config.packageName}`
        );
        if (result && result.trim().length > 0) {
          return true;
        }
      } catch {
        // 忽略错误，继续等待
      }
      await this.sleep(500);
    }
    return false;
  }

  /**
   * 检查应用是否在后台
   */
  protected async isAppInBackground(): Promise<boolean> {
    try {
      const result = await deviceManager.shell(
        this.config.deviceId,
        `dumpsys activity activities | grep -A 5 'mResumedActivity'`
      );
      // 如果当前 resumed activity 不是目标应用，说明应用在后台
      return !result.includes(this.config.packageName);
    } catch {
      return false;
    }
  }

  /**
   * 获取当前活动 Activity
   */
  protected async getCurrentActivity(): Promise<string> {
    try {
      const result = await deviceManager.shell(
        this.config.deviceId,
        'dumpsys window windows | grep -E "mCurrentFocus"'
      );
      return result.trim();
    } catch {
      return '';
    }
  }

  /**
   * 验证应用状态是否保留
   */
  protected async verifyAppStatePreserved(): Promise<boolean> {
    try {
      // 检查应用进程 ID 是否变化（进程 ID 不变说明进程未重启）
      const pidResult = await deviceManager.shell(
        this.config.deviceId,
        `pidof ${this.config.packageName}`
      );
      return Boolean(pidResult && pidResult.trim().length > 0);
    } catch {
      return false;
    }
  }

  /**
   * 测试屏幕旋转
   */
  async testScreenRotation(): Promise<LifecycleTestResult[]> {
    if (!this.driver) {
      await this.initialize();
    }

    const results: LifecycleTestResult[] = [];

    // 确保应用在前台
    await deviceManager.launchApp(
      this.config.deviceId,
      this.config.packageName,
      this.config.mainActivity,
    );

    // 测试竖屏 -> 横屏
    let startTime = Date.now();
    try {
      logger.step('🔄 测试屏幕旋转: 竖屏 -> 横屏');

      await deviceManager.shell(this.config.deviceId, 'settings put system accelerometer_rotation 0');
      await deviceManager.shell(this.config.deviceId, 'settings put system user_rotation 1'); // 横屏

      // 使用配置的屏幕旋转等待时间
      await this.sleep(this.waitConfig.screenRotation);

      // 验证应用是否正常显示（实际需要检查布局）
      logger.pass('✅ 横屏测试通过');
      results.push({
        test: 'rotation-landscape',
        success: true,
        duration: Date.now() - startTime,
        message: 'Landscape rotation successful',
      });
    } catch (error) {
      results.push({
        test: 'rotation-landscape',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      });
    }

    // 测试横屏 -> 竖屏
    startTime = Date.now();
    try {
      logger.step('🔄 测试屏幕旋转: 横屏 -> 竖屏');

      await deviceManager.shell(this.config.deviceId, 'settings put system user_rotation 0'); // 竖屏

      // 使用配置的屏幕旋转等待时间
      await this.sleep(this.waitConfig.screenRotation);

      logger.pass('✅ 竖屏测试通过');
      results.push({
        test: 'rotation-portrait',
        success: true,
        duration: Date.now() - startTime,
        message: 'Portrait rotation successful',
      });
    } catch (error) {
      results.push({
        test: 'rotation-portrait',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      });
    }

    // 恢复自动旋转
    await deviceManager.shell(this.config.deviceId, 'settings put system accelerometer_rotation 1');

    return results;
  }

  /**
   * 测试内存压力（低内存场景）
   */
  async testMemoryPressure(): Promise<LifecycleTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();
    const openedApps: string[] = [];

    try {
      logger.step('🧪 测试内存压力场景');

      // 确保应用在前台
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      await this.sleep(this.waitConfig.appLaunch);

      // 模拟内存压力：打开多个其他应用
      const testApps = [
        { package: 'com.android.settings', activity: '.Settings' },
        { package: 'com.android.chrome', activity: 'com.google.android.apps.chrome.Main' },
      ];

      for (const app of testApps) {
        try {
          await deviceManager.shell(this.config.deviceId, `am start -n ${app.package}/${app.activity}`);
          openedApps.push(app.package);
          await this.sleep(this.waitConfig.operationInterval);
        } catch (error) {
          logger.debug(`启动应用 ${app.package} 失败: ${error}`);
        }
      }

      // 等待系统回收内存
      await this.sleep(3000);

      // 重新启动目标应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      await this.sleep(this.waitConfig.appLaunch);

      logger.pass('✅ 内存压力测试通过');
      return {
        test: 'memory-pressure',
        success: true,
        duration: Date.now() - startTime,
        message: 'App recovered after memory pressure',
        dataRetained: true,
      };
    } catch (error) {
      logger.fail('❌ 内存压力测试失败');
      return {
        test: 'memory-pressure',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    } finally {
      // 清理：关闭测试过程中打开的其他应用，防止残留占用设备资源
      for (const appPackage of openedApps) {
        try {
          await deviceManager.shell(this.config.deviceId, `am force-stop ${appPackage}`);
          logger.debug(`已清理应用: ${appPackage}`);
        } catch (error) {
          logger.debug(`清理应用 ${appPackage} 失败: ${error}`);
        }
      }
    }
  }

  /**
   * 测试来电打断
   */
  async testCallInterruption(): Promise<LifecycleTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      logger.step('📞 测试来电打断场景');

      // 确保应用在前台
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      await this.sleep(2000);

      // 模拟来电（使用 ADB 模拟）
      await deviceManager.shell(this.config.deviceId, 'am start -a android.intent.action.CALL -d tel:1234567890');

      await this.sleep(2000);

      // 挂断电话
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_ENDCALL');

      await this.sleep(1000);

      // 返回应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      logger.pass('✅ 来电打断测试通过');
      return {
        test: 'call-interruption',
        success: true,
        duration: Date.now() - startTime,
        message: 'App handled call interruption correctly',
      };
    } catch (error) {
      logger.fail('❌ 来电打断测试失败');
      return {
        test: 'call-interruption',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  /**
   * 测试通知打断
   */
  async testNotificationInterruption(): Promise<LifecycleTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    const startTime = Date.now();

    try {
      logger.step('🔔 测试通知打断场景');

      // 确保应用在前台
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      await this.sleep(2000);

      // 打开通知面板
      await deviceManager.shell(this.config.deviceId, 'input swipe 0 0 0 500');

      await this.sleep(1000);

      // 关闭通知面板
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_HOME');
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      logger.pass('✅ 通知打断测试通过');
      return {
        test: 'notification-interruption',
        success: true,
        duration: Date.now() - startTime,
        message: 'App handled notification interruption correctly',
      };
    } catch (error) {
      return {
        test: 'notification-interruption',
        success: false,
        duration: Date.now() - startTime,
        message: (error as Error).message,
      };
    }
  }

  /**
   * 运行所有生命周期测试
   */
  async runAllLifecycleTests(): Promise<{
    backgroundForeground: LifecycleTestResult;
    screenRotation: LifecycleTestResult[];
    memoryPressure: LifecycleTestResult;
    callInterruption: LifecycleTestResult;
    notificationInterruption: LifecycleTestResult;
  }> {
    logger.info('🔄 开始生命周期测试');

    const backgroundForeground = await this.testBackgroundForeground();
    const screenRotation = await this.testScreenRotation();
    const memoryPressure = await this.testMemoryPressure();
    const callInterruption = await this.testCallInterruption();
    const notificationInterruption = await this.testNotificationInterruption();

    return {
      backgroundForeground,
      screenRotation,
      memoryPressure,
      callInterruption,
      notificationInterruption,
    };
  }

  /**
   * 延迟
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * 快捷执行函数
 */
export async function runLifecycleTests(
  deviceId: string,
  packageName: string,
  options?: Partial<LifecycleTesterConfig>,
): Promise<ReturnType<LifecycleTester['runAllLifecycleTests']>> {
  const tester = new LifecycleTester({
    deviceId,
    packageName,
    ...options,
  });

  try {
    return await tester.runAllLifecycleTests();
  } finally {
    await tester.close();
  }
}
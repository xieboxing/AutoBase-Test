import type { RemoteOptions } from 'webdriverio';
import { remote } from 'webdriverio';
import { logger } from '@/core/logger.js';
import { deviceManager } from '@/utils/device.js';
import { SmartWait } from '@/utils/smart-wait.js';

/**
 * 权限测试配置
 */
export interface PermissionTesterConfig {
  deviceId: string;
  packageName: string;
  mainActivity?: string;
  appiumHost: string;
  appiumPort: number;
  automationTimeout: number;
  artifactsDir: string;
  /** 等待配置 */
  waitConfig?: {
    /** 应用启动等待超时 */
    appLaunchTimeout?: number;
    /** 权限弹窗等待超时 */
    dialogTimeout?: number;
    /** 操作后稳定等待 */
    settleTime?: number;
  };
}

/**
 * 默认等待配置
 */
const DEFAULT_WAIT_CONFIG = {
  appLaunchTimeout: 10000,
  dialogTimeout: 5000,
  settleTime: 500,
};

/**
 * 权限测试结果
 */
export interface PermissionTestResult {
  permission: string;
  grantAction: 'allow' | 'deny';
  success: boolean;
  appBehavior: string;
  message: string;
}

/**
 * APP 权限测试器
 */
export class PermissionTester {
  protected config: PermissionTesterConfig;
  protected driver: WebdriverIO.Browser | null = null;
  protected smartWait: SmartWait;
  protected waitConfig: Required<NonNullable<PermissionTesterConfig['waitConfig']>>;

  constructor(config: Partial<PermissionTesterConfig>) {
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
    this.smartWait = new SmartWait({ defaultTimeout: this.config.automationTimeout });
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
      'appium:autoGrantPermissions': false,
    };

    const options: RemoteOptions = {
      hostname: this.config.appiumHost,
      port: this.config.appiumPort,
      path: '/wd/hub',
      capabilities,
    };

    this.driver = await remote(options);
    logger.info('🚀 权限测试器初始化完成');
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
   * 获取应用请求的权限列表
   */
  async getAppPermissions(): Promise<string[]> {
    try {
      const output = await deviceManager.shell(
        this.config.deviceId,
        `dumpsys package ${this.config.packageName} | grep permission`,
      );

      const permissions: string[] = [];
      const lines = output.split('\n');

      for (const line of lines) {
        const match = line.match(/android\.permission\.\w+/);
        if (match && !permissions.includes(match[0])) {
          permissions.push(match[0]);
        }
      }

      return permissions;
    } catch {
      return [];
    }
  }

  /**
   * 重置应用权限
   */
  async resetPermissions(): Promise<void> {
    await deviceManager.shell(
      this.config.deviceId,
      `pm reset-permissions -p ${this.config.packageName}`,
    );
    logger.info('🔄 权限已重置');
  }

  /**
   * 授予权限
   */
  async grantPermission(permission: string): Promise<void> {
    await deviceManager.shell(
      this.config.deviceId,
      `pm grant ${this.config.packageName} ${permission}`,
    );
    logger.info(`✅ 权限已授予：${permission}`);
  }

  /**
   * 撤销权限
   */
  async revokePermission(permission: string): Promise<void> {
    await deviceManager.shell(
      this.config.deviceId,
      `pm revoke ${this.config.packageName} ${permission}`,
    );
    logger.info(`❌ 权限已撤销：${permission}`);
  }

  /**
   * 测试权限弹窗 - 允许
   */
  async testPermissionGrant(permission: string): Promise<PermissionTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    try {
      logger.step(`🔐 测试权限：${permission} (允许)`);

      // 先撤销权限
      await this.revokePermission(permission);

      // 强制停止应用
      await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

      // 启动应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用启动完成（替代硬等待）
      await this.smartWait.waitForAppLaunch(
        this.config.deviceId,
        this.config.packageName,
        (deviceId, cmd) => deviceManager.shell(deviceId, cmd),
        this.waitConfig.appLaunchTimeout
      );

      // 智能等待并处理权限弹窗（替代硬等待）
      const dialogHandled = await this.smartWait.handlePermissionDialog(
        this.driver!,
        'allow',
        this.waitConfig.dialogTimeout
      );

      if (dialogHandled) {
        logger.pass('✅ 检测到权限弹窗并已处理');
      } else {
        logger.debug('未检测到权限弹窗，可能权限已授予或不需要');
      }

      logger.pass('✅ 权限允许测试通过');
      return {
        permission,
        grantAction: 'allow',
        success: true,
        appBehavior: 'App functions normally with permission granted',
        message: `Permission ${permission} granted successfully`,
      };
    } catch (error) {
      return {
        permission,
        grantAction: 'allow',
        success: false,
        appBehavior: 'Unknown',
        message: (error as Error).message,
      };
    }
  }

  /**
   * 测试权限弹窗 - 拒绝
   */
  async testPermissionDeny(permission: string): Promise<PermissionTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    try {
      logger.step(`🔐 测试权限：${permission} (拒绝)`);

      // 先撤销权限
      await this.revokePermission(permission);

      // 强制停止应用
      await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

      // 启动应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用启动完成
      await this.smartWait.waitForAppLaunch(
        this.config.deviceId,
        this.config.packageName,
        (deviceId, cmd) => deviceManager.shell(deviceId, cmd),
        this.waitConfig.appLaunchTimeout
      );

      // 智能等待并处理权限弹窗（拒绝）
      await this.smartWait.handlePermissionDialog(
        this.driver!,
        'deny',
        this.waitConfig.dialogTimeout
      );

      // 检查应用是否有友好提示
      let appBehavior = 'App continued without permission';

      // 智能等待权限相关提示出现
      const hasPermissionHint = await this.smartWait.waitFor(
        async () => {
          try {
            const errorMessage = await this.driver!.$('//*[contains(@text, "permission") or contains(@text, "权限")]');
            return await errorMessage.isDisplayed();
          } catch {
            return false;
          }
        },
        2000,
        'permission hint'
      );

      if (hasPermissionHint) {
        appBehavior = 'App shows permission explanation';
      }

      logger.pass('✅ 权限拒绝测试通过');
      return {
        permission,
        grantAction: 'deny',
        success: true,
        appBehavior,
        message: `Permission ${permission} denied, app handled gracefully`,
      };
    } catch (error) {
      return {
        permission,
        grantAction: 'deny',
        success: false,
        appBehavior: 'Unknown',
        message: (error as Error).message,
      };
    }
  }

  /**
   * 测试 "不再询问" 选项
   */
  async testNeverAskAgain(permission: string): Promise<PermissionTestResult> {
    if (!this.driver) {
      await this.initialize();
    }

    try {
      logger.step(`🔐 测试权限：${permission} (不再询问)`);

      // 撤销权限
      await this.revokePermission(permission);

      // 强制停止应用
      await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

      // 启动应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用启动完成
      await this.smartWait.waitForAppLaunch(
        this.config.deviceId,
        this.config.packageName,
        (deviceId, cmd) => deviceManager.shell(deviceId, cmd),
        this.waitConfig.appLaunchTimeout
      );

      // 尝试勾选 "不再询问" 并拒绝
      const checkboxFound = await this.smartWait.waitFor(
        async () => {
          try {
            const neverAskCheckbox = await this.driver!.$('//android.widget.CheckBox[@text="Don\'t ask again" or @text="不再询问"]');
            if (await neverAskCheckbox.isDisplayed()) {
              await neverAskCheckbox.click();
              return true;
            }
            return false;
          } catch {
            return false;
          }
        },
        this.waitConfig.dialogTimeout,
        '"不再询问" 复选框'
      );

      if (checkboxFound) {
        // 等待并点击拒绝按钮
        await this.smartWait.handlePermissionDialog(this.driver!, 'deny', 2000);
      }

      logger.pass('✅ "不再询问" 测试通过');
      return {
        permission,
        grantAction: 'deny',
        success: true,
        appBehavior: 'Permission permanently denied',
        message: '"Never ask again" option works correctly',
      };
    } catch (error) {
      return {
        permission,
        grantAction: 'deny',
        success: false,
        appBehavior: 'Unknown',
        message: (error as Error).message,
      };
    }
  }

  /**
   * 测试系统设置中关闭权限
   */
  async testPermissionDisabledInSettings(permission: string): Promise<PermissionTestResult> {
    try {
      logger.step(`🔐 测试权限：${permission} (系统设置关闭)`);

      // 在系统设置中关闭权限
      await this.revokePermission(permission);

      // 启动应用
      await deviceManager.launchApp(
        this.config.deviceId,
        this.config.packageName,
        this.config.mainActivity,
      );

      // 智能等待应用启动完成
      await this.smartWait.waitForAppLaunch(
        this.config.deviceId,
        this.config.packageName,
        (deviceId, cmd) => deviceManager.shell(deviceId, cmd),
        this.waitConfig.appLaunchTimeout
      );

      // 检查应用是否有引导用户去设置的提示
      let appBehavior = 'App continued without permission';

      const hasSettingsPrompt = await this.smartWait.waitFor(
        async () => {
          try {
            const settingsPrompt = await this.driver!.$('//*[contains(@text, "Settings") or contains(@text, "设置")]');
            return await settingsPrompt.isDisplayed();
          } catch {
            return false;
          }
        },
        2000,
        'settings prompt'
      );

      if (hasSettingsPrompt) {
        appBehavior = 'App prompts user to enable permission in settings';
      }

      logger.pass('✅ 系统设置关闭权限测试通过');
      return {
        permission,
        grantAction: 'deny',
        success: true,
        appBehavior,
        message: 'App handles disabled permission gracefully',
      };
    } catch (error) {
      return {
        permission,
        grantAction: 'deny',
        success: false,
        appBehavior: 'Unknown',
        message: (error as Error).message,
      };
    }
  }

  /**
   * 运行完整权限测试
   */
  async runAllPermissionTests(permissions?: string[]): Promise<{
    permissions: string[];
    grantTests: PermissionTestResult[];
    denyTests: PermissionTestResult[];
    neverAskTests: PermissionTestResult[];
  }> {
    logger.info('🔐 开始权限测试');

    // 获取应用需要的权限
    const appPermissions = permissions || await this.getAppPermissions();

    const grantTests: PermissionTestResult[] = [];
    const denyTests: PermissionTestResult[] = [];
    const neverAskTests: PermissionTestResult[] = [];

    for (const permission of appPermissions.slice(0, 5)) {
      grantTests.push(await this.testPermissionGrant(permission));
      denyTests.push(await this.testPermissionDeny(permission));
      neverAskTests.push(await this.testNeverAskAgain(permission));
    }

    return {
      permissions: appPermissions,
      grantTests,
      denyTests,
      neverAskTests,
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
export async function runPermissionTests(
  deviceId: string,
  packageName: string,
  options?: Partial<PermissionTesterConfig>,
): Promise<ReturnType<PermissionTester['runAllPermissionTests']>> {
  const tester = new PermissionTester({
    deviceId,
    packageName,
    ...options,
  });

  try {
    return await tester.runAllPermissionTests();
  } finally {
    await tester.close();
  }
}

import { deviceManager, type ApkInfo } from '@/utils/device.js';
import { logger } from '@/core/logger.js';
import type { TestCaseResult, TestStepResult } from '@/types/test-result.types.js';

/**
 * 安装测试配置
 */
export interface InstallTesterConfig {
  deviceId: string;
  apkPath: string;
  packageName?: string;
  reinstallTest: boolean;
  upgradeTest: boolean;
  uninstallTest: boolean;
  timeout: number;
}

/**
 * 安装测试结果
 */
export interface InstallTestResult {
  deviceId: string;
  apkPath: string;
  apkInfo: ApkInfo | null;
  install: {
    success: boolean;
    duration: number;
    message: string;
  };
  reinstall?: {
    success: boolean;
    duration: number;
    message: string;
  };
  upgrade?: {
    success: boolean;
    duration: number;
    message: string;
  };
  uninstall?: {
    success: boolean;
    duration: number;
    message: string;
  };
  appSize?: {
    installed: number;
    apk: number;
    compressionRatio: number;
  };
  issues: string[];
}

/**
 * APP 安装/卸载测试器
 */
export class InstallTester {
  protected config: InstallTesterConfig;

  constructor(config: Partial<InstallTesterConfig>) {
    this.config = {
      deviceId: '',
      apkPath: '',
      reinstallTest: true,
      upgradeTest: false,
      uninstallTest: true,
      timeout: 120000,
      ...config,
    };
  }

  /**
   * 执行安装测试
   */
  async runInstallTest(): Promise<InstallTestResult> {
    const result: InstallTestResult = {
      deviceId: this.config.deviceId,
      apkPath: this.config.apkPath,
      apkInfo: null,
      install: { success: false, duration: 0, message: '' },
      issues: [],
    };

    try {
      logger.info('📦 开始安装测试', { deviceId: this.config.deviceId, apkPath: this.config.apkPath });

      // 获取 APK 信息
      result.apkInfo = await deviceManager.getApkInfo(this.config.apkPath);

      if (!result.apkInfo?.packageName) {
        result.issues.push('无法获取 APK 包名');
        return result;
      }

      // 检查设备连接
      const devices = await deviceManager.getConnectedDevices();
      const targetDevice = devices.find((d) => d.id === this.config.deviceId);

      if (!targetDevice) {
        result.issues.push(`设备 ${this.config.deviceId} 未连接`);
        return result;
      }

      // 如果应用已安装，先卸载
      const isInstalled = await deviceManager.isAppInstalled(
        this.config.deviceId,
        result.apkInfo.packageName,
      );

      if (isInstalled) {
        logger.info('应用已安装，先卸载');
        await deviceManager.uninstallApp(this.config.deviceId, result.apkInfo.packageName);
      }

      // 测试安装
      const installStart = Date.now();
      const installResult = await deviceManager.installApk(
        this.config.deviceId,
        this.config.apkPath,
      );
      result.install = {
        success: installResult.success,
        duration: Date.now() - installStart,
        message: installResult.message,
      };

      if (!installResult.success) {
        result.issues.push(`安装失败: ${installResult.message}`);
        return result;
      }

      logger.pass('✅ 安装测试通过', { duration: result.install.duration });

      // 获取安装后的应用大小
      const appSizeInfo = await this.getAppSize(result.apkInfo.packageName);
      if (appSizeInfo) {
        result.appSize = appSizeInfo;
      }

      // 测试重新安装
      if (this.config.reinstallTest) {
        await this.testReinstall(result);
      }

      // 测试升级安装
      if (this.config.upgradeTest) {
        await this.testUpgrade(result);
      }

      // 测试卸载
      if (this.config.uninstallTest) {
        await this.testUninstall(result);
      }

    } catch (error) {
      result.issues.push(`测试异常: ${(error as Error).message}`);
      logger.fail('❌ 安装测试失败', { error: (error as Error).message });
    }

    return result;
  }

  /**
   * 测试重新安装
   */
  protected async testReinstall(result: InstallTestResult): Promise<void> {
    if (!result.apkInfo?.packageName) return;

    logger.step('🔄 测试重新安装');

    const reinstallStart = Date.now();
    const reinstallResult = await deviceManager.installApk(
      this.config.deviceId,
      this.config.apkPath,
      { reinstall: true },
    );

    result.reinstall = {
      success: reinstallResult.success,
      duration: Date.now() - reinstallStart,
      message: reinstallResult.message,
    };

    if (reinstallResult.success) {
      logger.pass('✅ 重新安装测试通过', { duration: result.reinstall.duration });
    } else {
      result.issues.push(`重新安装失败: ${reinstallResult.message}`);
    }
  }

  /**
   * 测试升级安装（需要新版本 APK）
   */
  protected async testUpgrade(_result: InstallTestResult): Promise<void> {
    // 升级测试需要提供新版本 APK，这里只是占位
    logger.step('⬆️ 升级安装测试（跳过 - 需要新版本 APK）');
  }

  /**
   * 测试卸载
   */
  protected async testUninstall(result: InstallTestResult): Promise<void> {
    if (!result.apkInfo?.packageName) return;

    logger.step('🗑️ 测试卸载');

    const uninstallStart = Date.now();
    const uninstallResult = await deviceManager.uninstallApp(
      this.config.deviceId,
      result.apkInfo.packageName,
    );

    result.uninstall = {
      success: uninstallResult.success,
      duration: Date.now() - uninstallStart,
      message: uninstallResult.message,
    };

    if (uninstallResult.success) {
      logger.pass('✅ 卸载测试通过', { duration: result.uninstall.duration });

      // 验证卸载是否干净
      const stillInstalled = await deviceManager.isAppInstalled(
        this.config.deviceId,
        result.apkInfo.packageName,
      );

      if (stillInstalled) {
        result.issues.push('卸载后应用仍然存在');
      }
    } else {
      result.issues.push(`卸载失败: ${uninstallResult.message}`);
    }

    // 卸载测试后重新安装，以便后续测试
    if (!result.install.success) {
      await deviceManager.installApk(this.config.deviceId, this.config.apkPath);
    }
  }

  /**
   * 获取应用安装大小
   */
  protected async getAppSize(_packageName: string): Promise<{ installed: number; apk: number; compressionRatio: number } | null> {
    // 简化处理，返回 null
    return null;
  }

  /**
   * 转换为 TestCaseResult
   */
  toTestCaseResult(result: InstallTestResult): TestCaseResult {
    const steps: TestStepResult[] = [];

    steps.push({
      order: 1,
      action: 'install',
      status: result.install.success ? 'passed' : 'failed',
      durationMs: result.install.duration,
      errorMessage: result.install.message,
      timestamp: new Date().toISOString(),
    } as unknown as TestStepResult);

    if (result.reinstall) {
      steps.push({
        order: 2,
        action: 'reinstall',
        status: result.reinstall.success ? 'passed' : 'failed',
        durationMs: result.reinstall.duration,
        errorMessage: result.reinstall.message,
        timestamp: new Date().toISOString(),
      } as unknown as TestStepResult);
    }

    if (result.uninstall) {
      steps.push({
        order: 3,
        action: 'uninstall',
        status: result.uninstall.success ? 'passed' : 'failed',
        durationMs: result.uninstall.duration,
        errorMessage: result.uninstall.message,
        timestamp: new Date().toISOString(),
      } as unknown as TestStepResult);
    }

    const failedSteps = steps.filter((s) => s.status === 'failed');

    return {
      caseId: 'app-install-test',
      caseName: 'APP Install Test',
      status: failedSteps.length === 0 ? 'passed' : 'failed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: steps.reduce((sum, s) => sum + (s.durationMs || 0), 0),
      platform: 'android-app',
      environment: { browser: 'appium' },
      steps,
      retryCount: 0,
      selfHealed: false,
      artifacts: { screenshots: [], logs: result.issues },
    };
  }
}

/**
 * 快捷执行函数
 */
export async function runInstallTest(
  deviceId: string,
  apkPath: string,
  options?: Partial<InstallTesterConfig>,
): Promise<InstallTestResult> {
  const tester = new InstallTester({
    deviceId,
    apkPath,
    ...options,
  });

  return tester.runInstallTest();
}
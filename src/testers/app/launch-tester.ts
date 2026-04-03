import { deviceManager } from '@/utils/device.js';
import { logger } from '@/core/logger.js';
import type { TestCaseResult, TestStepResult } from '@/types/test-result.types.js';

/**
 * 启动测试配置
 */
export interface LaunchTesterConfig {
  deviceId: string;
  packageName: string;
  mainActivity?: string;
  coldStartTest: boolean;
  warmStartTest: boolean;
  hotStartTest: boolean;
  iterations: number;
  timeout: number;
}

/**
 * 启动时间结果
 */
export interface LaunchTimeResult {
  type: 'cold' | 'warm' | 'hot';
  duration: number;
  success: boolean;
  message: string;
}

/**
 * 启动测试结果
 */
export interface LaunchTestResult {
  deviceId: string;
  packageName: string;
  coldStart?: {
    average: number;
    min: number;
    max: number;
    results: LaunchTimeResult[];
    threshold: number;
    passed: boolean;
  };
  warmStart?: {
    average: number;
    min: number;
    max: number;
    results: LaunchTimeResult[];
    threshold: number;
    passed: boolean;
  };
  hotStart?: {
    average: number;
    min: number;
    max: number;
    results: LaunchTimeResult[];
    threshold: number;
    passed: boolean;
  };
  crashDetected: boolean;
  issues: string[];
}

/**
 * 启动时间阈值（毫秒）
 */
const LAUNCH_THRESHOLDS = {
  cold: 3000, // 冷启动 < 3s
  warm: 1000, // 温启动 < 1s
  hot: 500, // 热启动 < 500ms
};

/**
 * APP 启动测试器
 */
export class LaunchTester {
  protected config: LaunchTesterConfig;

  constructor(config: Partial<LaunchTesterConfig>) {
    this.config = {
      deviceId: '',
      packageName: '',
      coldStartTest: true,
      warmStartTest: true,
      hotStartTest: true,
      iterations: 3,
      timeout: 30000,
      ...config,
    };
  }

  /**
   * 执行启动测试
   */
  async runLaunchTest(): Promise<LaunchTestResult> {
    const result: LaunchTestResult = {
      deviceId: this.config.deviceId,
      packageName: this.config.packageName,
      crashDetected: false,
      issues: [],
    };

    try {
      logger.info('🚀 开始启动测试', {
        deviceId: this.config.deviceId,
        packageName: this.config.packageName,
      });

      // 检查应用是否已安装
      const isInstalled = await deviceManager.isAppInstalled(
        this.config.deviceId,
        this.config.packageName,
      );

      if (!isInstalled) {
        result.issues.push(`应用 ${this.config.packageName} 未安装`);
        return result;
      }

      // 测试冷启动
      if (this.config.coldStartTest) {
        result.coldStart = await this.testColdStart();
      }

      // 测试温启动
      if (this.config.warmStartTest) {
        result.warmStart = await this.testWarmStart();
      }

      // 测试热启动
      if (this.config.hotStartTest) {
        result.hotStart = await this.testHotStart();
      }

    } catch (error) {
      result.issues.push(`测试异常：${(error as Error).message}`);
      logger.fail('❌ 启动测试失败', { error: (error as Error).message });
    }

    return result;
  }

  /**
   * 测试冷启动
   * 流程：强制停止 -> 启动 -> 测量时间
   */
  protected async testColdStart(): Promise<LaunchTestResult['coldStart']> {
    logger.step('❄️ 测试冷启动');

    const results: LaunchTimeResult[] = [];
    const threshold = LAUNCH_THRESHOLDS.cold;

    for (let i = 0; i < this.config.iterations; i++) {
      // 强制停止应用
      await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

      // 等待系统稳定
      await this.sleep(1000);

      // 启动并测量时间
      const launchResult = await this.measureLaunchTime('cold');
      results.push(launchResult);

      logger.info(`冷启动第 ${i + 1} 次`, { duration: launchResult.duration, success: launchResult.success });

      // 如果检测到崩溃，停止测试
      if (!launchResult.success) {
        this.logCrash(launchResult.message);
        break;
      }
    }

    const durations = results.filter((r) => r.success).map((r) => r.duration);
    const passed = durations.length > 0 && durations.every((d) => d < threshold);

    if (!passed && durations.length > 0) {
      const avgDuration = this.average(durations);
      logger.warn(`⚠️ 冷启动时间过长：${avgDuration.toFixed(0)}ms > ${threshold}ms`);
    } else if (durations.length > 0) {
      logger.pass(`✅ 冷启动测试通过：平均 ${this.average(durations).toFixed(0)}ms`);
    }

    return {
      average: durations.length > 0 ? this.average(durations) : 0,
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      results,
      threshold,
      passed,
    };
  }

  /**
   * 测试温启动
   * 流程：启动 -> 后台 -> 启动 -> 测量时间
   */
  protected async testWarmStart(): Promise<LaunchTestResult['warmStart']> {
    logger.step('🌡️ 测试温启动');

    const results: LaunchTimeResult[] = [];
    const threshold = LAUNCH_THRESHOLDS.warm;

    // 先启动应用
    await deviceManager.launchApp(
      this.config.deviceId,
      this.config.packageName,
      this.config.mainActivity,
    );

    for (let i = 0; i < this.config.iterations; i++) {
      // 将应用切换到后台（按 Home 键）
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_HOME');

      // 等待后台状态稳定
      await this.sleep(500);

      // 重新启动并测量时间
      const launchResult = await this.measureLaunchTime('warm');
      results.push(launchResult);

      logger.info(`温启动第 ${i + 1} 次`, { duration: launchResult.duration, success: launchResult.success });

      if (!launchResult.success) {
        this.logCrash(launchResult.message);
        break;
      }
    }

    // 清理：关闭应用
    await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

    const durations = results.filter((r) => r.success).map((r) => r.duration);
    const passed = durations.length > 0 && durations.every((d) => d < threshold);

    if (!passed && durations.length > 0) {
      const avgDuration = this.average(durations);
      logger.warn(`⚠️ 温启动时间过长：${avgDuration.toFixed(0)}ms > ${threshold}ms`);
    } else if (durations.length > 0) {
      logger.pass(`✅ 温启动测试通过：平均 ${this.average(durations).toFixed(0)}ms`);
    }

    return {
      average: durations.length > 0 ? this.average(durations) : 0,
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      results,
      threshold,
      passed,
    };
  }

  /**
   * 测试热启动
   * 流程：启动 -> 后台短时间 -> 切回前台 -> 测量时间
   */
  protected async testHotStart(): Promise<LaunchTestResult['hotStart']> {
    logger.step('🔥 测试热启动');

    const results: LaunchTimeResult[] = [];
    const threshold = LAUNCH_THRESHOLDS.hot;

    // 先启动应用
    await deviceManager.launchApp(
      this.config.deviceId,
      this.config.packageName,
      this.config.mainActivity,
    );

    for (let i = 0; i < this.config.iterations; i++) {
      // 将应用切换到后台
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_HOME');

      // 短暂等待（模拟用户快速切换）
      await this.sleep(100);

      // 立即切回前台（使用最近任务）
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_APP_SWITCH');
      await this.sleep(200);
      await deviceManager.shell(this.config.deviceId, 'input keyevent KEYCODE_ENTER');

      // 测量启动时间
      const launchResult = await this.measureLaunchTime('hot');
      results.push(launchResult);

      logger.info(`热启动第 ${i + 1} 次`, { duration: launchResult.duration, success: launchResult.success });

      if (!launchResult.success) {
        this.logCrash(launchResult.message);
        break;
      }
    }

    // 清理
    await deviceManager.forceStopApp(this.config.deviceId, this.config.packageName);

    const durations = results.filter((r) => r.success).map((r) => r.duration);
    const passed = durations.length > 0 && durations.every((d) => d < threshold);

    if (!passed && durations.length > 0) {
      const avgDuration = this.average(durations);
      logger.warn(`⚠️ 热启动时间过长：${avgDuration.toFixed(0)}ms > ${threshold}ms`);
    } else if (durations.length > 0) {
      logger.pass(`✅ 热启动测试通过：平均 ${this.average(durations).toFixed(0)}ms`);
    }

    return {
      average: durations.length > 0 ? this.average(durations) : 0,
      min: durations.length > 0 ? Math.min(...durations) : 0,
      max: durations.length > 0 ? Math.max(...durations) : 0,
      results,
      threshold,
      passed,
    };
  }

  /**
   * 测量启动时间
   */
  protected async measureLaunchTime(type: 'cold' | 'warm' | 'hot'): Promise<LaunchTimeResult> {
    const startTime = Date.now();

    const launchResult = await deviceManager.launchApp(
      this.config.deviceId,
      this.config.packageName,
      this.config.mainActivity,
    );

    const duration = Date.now() - startTime;

    return {
      type,
      duration,
      success: launchResult.success,
      message: launchResult.message,
    };
  }

  /**
   * 记录崩溃
   */
  protected logCrash(message: string): void {
    logger.fail('❌ 检测到崩溃', { message });
  }

  /**
   * 计算平均值
   */
  protected average(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  /**
   * 延迟
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * 转换为 TestCaseResult
   */
  toTestCaseResult(result: LaunchTestResult): TestCaseResult {
    const steps: TestStepResult[] = [];
    let order = 1;

    if (result.coldStart) {
      steps.push({
        order: order++,
        action: 'cold-start',
        status: result.coldStart.passed ? 'passed' : 'failed',
        durationMs: result.coldStart.average,
        errorMessage: result.coldStart.passed ? undefined : `冷启动时间：${result.coldStart.average.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
      } as unknown as TestStepResult);
    }

    if (result.warmStart) {
      steps.push({
        order: order++,
        action: 'warm-start',
        status: result.warmStart.passed ? 'passed' : 'failed',
        durationMs: result.warmStart.average,
        errorMessage: result.warmStart.passed ? undefined : `温启动时间：${result.warmStart.average.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
      } as unknown as TestStepResult);
    }

    if (result.hotStart) {
      steps.push({
        order: order++,
        action: 'hot-start',
        status: result.hotStart.passed ? 'passed' : 'failed',
        durationMs: result.hotStart.average,
        errorMessage: result.hotStart.passed ? undefined : `热启动时间：${result.hotStart.average.toFixed(0)}ms`,
        timestamp: new Date().toISOString(),
      } as unknown as TestStepResult);
    }

    const failedSteps = steps.filter((s) => s.status === 'failed');

    return {
      caseId: 'app-launch-test',
      caseName: 'APP Launch Test',
      status: failedSteps.length === 0 && !result.crashDetected ? 'passed' : 'failed',
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
export async function runLaunchTest(
  deviceId: string,
  packageName: string,
  options?: Partial<LaunchTesterConfig>,
): Promise<LaunchTestResult> {
  const tester = new LaunchTester({
    deviceId,
    packageName,
    ...options,
  });

  return tester.runLaunchTest();
}

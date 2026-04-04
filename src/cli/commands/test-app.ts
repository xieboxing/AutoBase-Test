import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { ConsoleReporter } from '@/reporters/console-reporter.js';
import { ReportGenerator } from '@/reporters/report-generator.js';
import { deviceManager } from '@/utils/device.js';
import { remote } from 'webdriverio';

/**
 * APP 测试命令选项
 */
export interface AppCommandOptions {
  package?: string;
  type?: 'smoke' | 'full' | 'regression' | 'performance' | 'stability' | 'monkey';
  timeout?: number;
  device?: string;
  verbose?: boolean;
  quiet?: boolean;
  noAi?: boolean;
  report?: string;
}

/**
 * 创建 app 命令
 */
export function createAppCommand(): Command {
  const command = new Command('app');

  command
    .description('测试 APP（提供 APK 路径或包名）')
    .argument('[apk-path]', 'APK 文件路径')
    .option('--package <name>', '已安装的包名（代替 APK 路径）')
    .option('--type <type>', '测试类型：smoke, full, regression, performance, stability, monkey', 'smoke')
    .option('--timeout <minutes>', '超时时间（分钟）', '30')
    .option('--device <id>', '指定设备 ID')
    .option('--report <formats>', '报告格式，逗号分隔：html,json,markdown', 'html')
    .action(async (apkPath: string | undefined, options: AppCommandOptions) => {
      // 如果没有提供 APK 路径或包名，交互式提问
      if (!apkPath && !options.package) {
        const answers = await inquirer.prompt([
          {
            type: 'list',
            name: 'inputType',
            message: '选择测试方式:',
            choices: [
              { name: '提供 APK 文件路径', value: 'apk' },
              { name: '测试已安装的应用（提供包名）', value: 'package' },
            ],
          },
          {
            type: 'input',
            name: 'apkPath',
            message: '请输入 APK 文件路径:',
            when: (ans: Record<string, unknown>) => ans.inputType === 'apk',
            validate: (input: string) => {
              if (!input) return 'APK 路径不能为空';
              return true;
            },
          },
          {
            type: 'input',
            name: 'packageName',
            message: '请输入应用包名（如 com.example.app）:',
            when: (ans: Record<string, unknown>) => ans.inputType === 'package',
            validate: (input: string) => {
              if (!input) return '包名不能为空';
              if (!input.includes('.')) return '请输入有效的包名（如 com.example.app）';
              return true;
            },
          },
          {
            type: 'list',
            name: 'type',
            message: '选择测试类型:',
            choices: [
              { name: '冒烟测试（快速验证核心功能）', value: 'smoke' },
              { name: '全量测试（完整测试）', value: 'full' },
              { name: '回归测试（对比上次）', value: 'regression' },
              { name: '性能专项', value: 'performance' },
              { name: '稳定性专项', value: 'stability' },
              { name: 'Monkey 随机测试', value: 'monkey' },
            ],
            default: 'smoke',
          },
          {
            type: 'checkbox',
            name: 'reportFormats',
            message: '选择报告格式:',
            choices: [
              { name: 'HTML（可视化报告）', value: 'html', checked: true },
              { name: 'JSON（数据报告）', value: 'json' },
              { name: 'Markdown（文档报告）', value: 'markdown' },
            ],
          },
        ]);

        apkPath = answers.apkPath as string;
        options.package = answers.packageName as string;
        options.type = answers.type as AppCommandOptions['type'];
        options.report = (answers.reportFormats as string[]).join(',');
      }

      await executeAppTest(apkPath, options);
    });

  return command;
}

/**
 * 执行 APP 测试
 */
async function executeAppTest(apkPath: string | undefined, options: AppCommandOptions): Promise<void> {
  console.log(chalk.blue.bold('🚀 开始 APP 测试'));
  console.log(chalk.gray('─'.repeat(50)));

  if (apkPath) {
    console.log(`${chalk.bold('APK')}: ${apkPath}`);
  } else if (options.package) {
    console.log(`${chalk.bold('包名')}: ${options.package}`);
  }

  console.log(`${chalk.bold('类型')}: ${options.type}`);
  console.log(`${chalk.bold('设备')}: ${options.device || '自动选择'}`);
  console.log(chalk.gray('─'.repeat(50)));

  const consoleReporter = new ConsoleReporter({
    verbose: options.verbose || false,
    showSteps: true,
    progressBars: !options.quiet,
  });

  let driver: any = null;

  try {
    // 检查环境
    console.log(chalk.blue('🏥 检查环境...'));

    // 检查 ADB
    const adbCheck = await deviceManager.checkAdb();
    if (!adbCheck.available) {
      console.log(chalk.red('  ✗ ADB 不可用'));
      process.exit(1);
    }
    console.log(chalk.green(`  ✓ ADB 可用 (v${adbCheck.version})`));

    // 检查设备
    const devices = await deviceManager.getConnectedDevices();
    if (devices.length === 0) {
      console.log(chalk.red('  ✗ 没有连接的设备'));
      console.log(chalk.gray('    提示：请连接 Android 设备或启动模拟器'));
      process.exit(1);
    }
    console.log(chalk.green(`  ✓ 已连接 ${devices.length} 个设备`));

    // 检查 Appium 是否运行
    const appiumUrl = process.env.APPIUM_HOST || 'http://127.0.0.1:4723';
    let appiumRunning = false;
    try {
      const response = await fetch(`${appiumUrl}/status`);
      if (response.ok) {
        console.log(chalk.green('  ✓ Appium 已连接'));
        appiumRunning = true;
      }
    } catch {
      console.log(chalk.yellow('  ⚠ Appium 未运行'));
    }

    // 解析选项
    const reportFormats = options.report?.split(',').map(r => r.trim()) || ['html'];
    const deviceId = options.device || devices[0]?.id;

    if (!deviceId) {
      console.log(chalk.red('错误：无法获取设备 ID'));
      process.exit(1);
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.blue(`📱 使用设备：${deviceId}`));

    // 如果没有 APK 也没有包名，退出
    if (!apkPath && !options.package) {
      console.log(chalk.red('错误：需要提供 APK 路径或包名'));
      process.exit(1);
    }

    // 获取 APK 信息
    let packageName = options.package;
    let mainActivity = '';
    let apkSize = 0;

    if (apkPath) {
      console.log(chalk.blue('\n📦 读取 APK 信息...'));
      const apkInfo = await deviceManager.getApkInfo(apkPath);
      packageName = apkInfo.packageName || packageName;
      mainActivity = apkInfo.mainActivity || '';
      apkSize = apkInfo.size;
      console.log(chalk.green(`  ✓ 包名：${packageName}`));
      console.log(chalk.green(`  ✓ 主 Activity: ${mainActivity || '自动检测'}`));
      console.log(chalk.green(`  ✓ APK 大小：${(apkSize / 1024 / 1024).toFixed(2)} MB`));
    }

    // 开始测试
    consoleReporter.startRun('APP 测试', 3);
    const startTime = Date.now();
    const results: any[] = [];

    // ========== 测试 1: 安装测试 ==========
    if (apkPath) {
      console.log(chalk.blue('\n📦 测试 1: 安装测试...'));
      consoleReporter.startCase('APP 安装测试', 'app-install');

      const installStart = Date.now();
      const installResult = await deviceManager.installApk(deviceId, apkPath);
      const installDuration = Date.now() - installStart;

      if (installResult.success) {
        consoleReporter.endCase({
          caseId: 'app-install',
          caseName: 'APP 安装测试',
          status: 'passed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: installDuration,
          platform: 'android-app',
          environment: { device: deviceId },
          steps: [{ order: 1, action: 'install', status: 'passed', durationMs: installDuration, errorMessage: undefined, timestamp: new Date().toISOString() } as any],
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: [], logs: [] },
        });
        console.log(chalk.green('  ✓ 安装成功'));
        results.push({ status: 'passed' });
      } else {
        consoleReporter.endCase({
          caseId: 'app-install',
          caseName: 'APP 安装测试',
          status: 'failed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: installDuration,
          platform: 'android-app',
          environment: { device: deviceId },
          steps: [{ order: 1, action: 'install', status: 'failed', durationMs: installDuration, errorMessage: installResult.message, timestamp: new Date().toISOString() } as any],
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: [], logs: [] },
        });
        console.log(chalk.red(`  ✗ 安装失败：${installResult.message}`));
        results.push({ status: 'failed' });
      }
    } else {
      console.log(chalk.blue('\n📦 测试 1: 跳过 (使用已安装应用)'));
    }

    // ========== 测试 2: 启动测试 ==========
    if (packageName) {
      console.log(chalk.blue('\n🚀 测试 2: 启动测试...'));
      consoleReporter.startCase('APP 启动测试', 'app-launch');

      const launchStart = Date.now();
      const launchResult = await deviceManager.launchApp(deviceId, packageName, mainActivity || undefined);
      const launchDuration = Date.now() - launchStart;

      // 等待应用完全启动（使用配置的超时）
      await new Promise(resolve => setTimeout(resolve, 2000));

      // 截图
      let screenshotPath = '';
      try {
        screenshotPath = `./data/screenshots/launch-${Date.now()}.png`;
        await deviceManager.takeScreenshot(deviceId, screenshotPath);
      } catch {
        screenshotPath = '';
      }

      if (launchResult.success) {
        consoleReporter.endCase({
          caseId: 'app-launch',
          caseName: 'APP 启动测试',
          status: 'passed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: launchDuration,
          platform: 'android-app',
          environment: { device: deviceId },
          steps: [{ order: 1, action: 'launch', status: 'passed', durationMs: launchDuration, errorMessage: undefined, timestamp: new Date().toISOString() } as any],
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: screenshotPath ? [screenshotPath] : [], logs: [] },
        });
        console.log(chalk.green('  ✓ 启动成功'));
        results.push({ status: 'passed' });
      } else {
        consoleReporter.endCase({
          caseId: 'app-launch',
          caseName: 'APP 启动测试',
          status: 'failed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: launchDuration,
          platform: 'android-app',
          environment: { device: deviceId },
          steps: [{ order: 1, action: 'launch', status: 'failed', durationMs: launchDuration, errorMessage: launchResult.message, timestamp: new Date().toISOString() } as any],
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: [], logs: [] },
        });
        console.log(chalk.red(`  ✗ 启动失败：${launchResult.message}`));
        results.push({ status: 'failed' });
      }

      // ========== 测试 3: UI 冒烟测试 (如果有 Appium) ==========
      if (appiumRunning && launchResult.success) {
        console.log(chalk.blue('\n🖼️ 测试 3: UI 冒烟测试...'));
        consoleReporter.startCase('UI 冒烟测试', 'app-ui-smoke');

        try {
          // 初始化 Appium 驱动
          driver = await remote({
            hostname: process.env.APPIUM_HOST || '127.0.0.1',
            port: parseInt(process.env.APPIUM_PORT || '4723', 10),
            path: '/wd/hub',
            capabilities: {
              platformName: 'Android',
              'appium:deviceName': deviceId,
              'appium:appPackage': packageName,
              'appium:appActivity': mainActivity || '.MainActivity',
              'appium:automationName': 'UiAutomator2',
              'appium:noReset': true,
              'appium:newCommandTimeout': 300,
            } as any,
          });

          await driver.connect();
          console.log(chalk.green('  ✓ Appium 连接成功'));

          // 等待页面加载
          await new Promise(resolve => setTimeout(resolve, 2000));

          // 尝试获取当前页面元素
          let elementCount = 0;
          try {
            const elements = await driver.$$('*');
            elementCount = elements.length;
          } catch {
            // 如果无法获取元素，尝试等待
            await new Promise(resolve => setTimeout(resolve, 3000));
            try {
              const elements = await driver.$$('*');
              elementCount = elements.length;
            } catch {
              elementCount = 0;
            }
          }

          // 截图
          let uiScreenshotPath = '';
          try {
            uiScreenshotPath = `./data/screenshots/ui-smoke-${Date.now()}.png`;
            await deviceManager.takeScreenshot(deviceId, uiScreenshotPath);
          } catch {
            uiScreenshotPath = '';
          }

          const uiDuration = Date.now() - launchStart;

          const uiStatus = elementCount > 0 ? 'passed' : 'failed';
          consoleReporter.endCase({
            caseId: 'app-ui-smoke',
            caseName: 'UI 冒烟测试',
            status: uiStatus,
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: uiDuration,
            platform: 'android-app',
            environment: { device: deviceId },
            steps: [
              { order: 1, action: 'connect-appium', status: 'passed', durationMs: 1000, errorMessage: undefined, timestamp: new Date().toISOString() } as any,
              { order: 2, action: 'find-elements', status: uiStatus, durationMs: uiDuration - 1000, errorMessage: elementCount === 0 ? '未找到 UI 元素' : undefined, timestamp: new Date().toISOString() } as any,
            ],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: uiScreenshotPath ? [uiScreenshotPath] : [], logs: [] },
          });

          if (elementCount > 0) {
            console.log(chalk.green(`  ✓ UI 测试通过 (找到 ${elementCount} 个元素)`));
            results.push({ status: 'passed' });
          } else {
            console.log(chalk.yellow('  ⚠ UI 测试未完成 (未找到元素)'));
            results.push({ status: 'failed' });
          }

          await driver.deleteSession();
          driver = null;
        } catch (error) {
          console.log(chalk.yellow(`  ⚠ UI 测试跳过：${(error as Error).message}`));
          results.push({ status: 'failed' });
        }
      }
    }

    // 生成测试结果
    const passed = results.filter(r => r.status === 'passed').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const total = results.length;

    const testRunResult = {
      runId: `app-${Date.now()}`,
      project: packageName || apkPath || 'unknown',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: Date.now() - startTime,
      platform: 'android-app' as const,
      environment: { device: deviceId },
      summary: {
        total,
        passed,
        failed,
        skipped: 0,
        blocked: 0,
        passRate: total > 0 ? passed / total : 0,
      },
      categories: {
        functional: { total, passed, failed, skipped: 0, blocked: 0, passRate: total > 0 ? passed / total : 0, avgDurationMs: 0 },
        visual: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        performance: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, metrics: {} },
        security: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, issues: [] },
        accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, violations: [] },
        compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
      },
      cases: [],
      aiAnalysis: {
        overallAssessment: 'APP 测试完成',
        criticalIssues: [],
        recommendations: [],
        riskLevel: 'low' as const,
      },
      artifacts: { screenshots: [], videos: [], logs: [] },
    };

    consoleReporter.endRun(testRunResult);

    const reportGenerator = new ReportGenerator({
      formats: reportFormats as ('html' | 'json' | 'markdown')[],
      outputDir: './data/reports',
    });

    const reportPaths = await reportGenerator.generate(testRunResult);

    console.log(chalk.green.bold('\n✅ APP 测试完成'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.white(`测试结果：${passed} 通过，${failed} 失败，通过率 ${(testRunResult.summary.passRate * 100).toFixed(1)}%`));

    for (const [format, path] of Object.entries(reportPaths)) {
      console.log(`${chalk.bold(format.toUpperCase())} 报告：${chalk.cyan(path)}`);
    }

  } catch (error) {
    consoleReporter.showError('APP 测试执行失败', error as Error);
    logger.error('APP 测试执行失败', { error: (error as Error).message });
    process.exit(1);
  } finally {
    // 清理资源
    if (driver) {
      try {
        await driver.deleteSession();
      } catch {
        // 忽略清理错误
      }
    }
  }
}

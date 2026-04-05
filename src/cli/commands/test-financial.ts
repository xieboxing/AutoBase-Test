/**
 * 金融 APP 测试命令
 * 用于执行金融业务流程的自动化测试
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { ConsoleReporter } from '@/reporters/console-reporter.js';
import { deviceManager } from '@/utils/device.js';
import { LanguageRunner } from '@/testers/financial/index.js';
import { FinancialReportGenerator } from '@/reporters/financial-report.js';
import { loadFinancialConfig, validateFinancialConfig } from '@/config/financial-config.js';
import type { FinancialAppConfig } from '@/types/financial.types.js';
import { createEmptyCategories } from '@/types/test-result.types.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 金融测试命令选项
 */
export interface FinancialCommandOptions {
  /** 配置文件路径 */
  config?: string;
  /** APK 文件路径（可选，覆盖配置） */
  apk?: string;
  /** 设备 ID */
  device?: string;
  /** 报告格式 */
  report?: string;
  /** 是否跳过登录 */
  skipLogin?: boolean;
  /** 是否跳过交易 */
  skipTrading?: boolean;
  /** 语言列表（覆盖配置） */
  languages?: string;
  /** 详细输出 */
  verbose?: boolean;
  /** 安静模式 */
  quiet?: boolean;
  /** 无 AI */
  noAi?: boolean;
}

/**
 * 创建 financial 命令
 */
export function createFinancialCommand(): Command {
  const command = new Command('financial');

  command
    .description('金融 APP 业务流程测试')
    .argument('[apk-path]', 'APK 文件路径（可选）')
    .option('--config <path>', '配置文件路径（JSON 格式）')
    .option('--apk <path>', 'APK 文件路径（覆盖配置中的路径）')
    .option('--device <id>', '指定设备 ID')
    .option('--report <formats>', '报告格式，逗号分隔：html,json', 'html,json')
    .option('--skip-login', '跳过登录步骤')
    .option('--skip-trading', '跳过交易步骤')
    .option('--languages <codes>', '语言列表（逗号分隔，如 zh-CN,en-US）')
    .option('--verbose', '详细输出')
    .option('--quiet', '安静模式')
    .option('--no-ai', '禁用 AI 分析')
    .action(async (apkPath: string | undefined, options: FinancialCommandOptions) => {
      await executeFinancialTest(apkPath, options);
    });

  return command;
}

/**
 * 执行金融 APP 测试
 */
async function executeFinancialTest(apkPath: string | undefined, options: FinancialCommandOptions): Promise<void> {
  console.log(chalk.blue.bold('🚀 金融 APP 业务流程测试'));
  console.log(chalk.gray('─'.repeat(50)));

  // 检查环境
  console.log(chalk.blue('🏥 检查环境...'));

  const adbCheck = await deviceManager.checkAdb();
  if (!adbCheck.available) {
    console.log(chalk.red('  ✗ ADB 不可用'));
    console.log(chalk.gray('    请确保 Android SDK 已安装，ADB 在 PATH 中'));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ ADB 可用 (v${adbCheck.version})`));

  // 检查设备
  const devices = await deviceManager.getConnectedDevices();
  if (devices.length === 0) {
    console.log(chalk.red('  ✗ 没有连接的设备'));
    console.log(chalk.gray('    请连接 Android 设备或启动模拟器'));
    process.exit(1);
  }
  console.log(chalk.green(`  ✓ 已连接 ${devices.length} 个设备`));

  // 检查 Appium
  const appiumUrl = process.env.APPIUM_HOST || 'http://127.0.0.1:4723';
  try {
    const response = await fetch(`${appiumUrl}/status`);
    if (response.ok) {
      console.log(chalk.green('  ✓ Appium 已连接'));
    } else {
      console.log(chalk.yellow('  ⚠ Appium 响应异常'));
    }
  } catch {
    console.log(chalk.yellow('  ⚠ Appium 未运行'));
    console.log(chalk.gray('    请启动 Appium Server: appium'));
  }

  // 确定设备
  const deviceId = options.device || devices[0]?.id;
  if (!deviceId) {
    console.log(chalk.red('错误：无法获取设备 ID'));
    process.exit(1);
  }
  console.log(chalk.cyan(`📱 使用设备：${deviceId}`));

  // 加载配置
  let config: FinancialAppConfig;

  if (options.config) {
    console.log(chalk.blue(`\n📋 加载配置文件: ${options.config}`));
    try {
      config = await loadFinancialConfig(options.config);
      const validationErrors = validateFinancialConfig(config);

      if (validationErrors.length > 0) {
        console.log(chalk.red('配置验证失败:'));
        for (const error of validationErrors) {
          console.log(chalk.red(`  ✗ ${error}`));
        }
        process.exit(1);
      }

      console.log(chalk.green('  ✓ 配置验证通过'));
    } catch (error) {
      console.log(chalk.red(`加载配置失败: ${(error as Error).message}`));
      process.exit(1);
    }
  } else {
    // 交互式配置
    config = await interactiveConfig(apkPath);
  }

  // 覆盖配置选项
  if (apkPath) {
    config.app.apkPath = apkPath;
  }
  if (options.apk) {
    config.app.apkPath = options.apk;
  }
  if (options.skipLogin) {
    config.login.required = false;
  }
  if (options.skipTrading) {
    config.trading = undefined;
  }
  if (options.languages) {
    const langCodes = options.languages.split(',').map(l => l.trim());
    config.languages.supportedLanguages = config.languages.supportedLanguages.filter(l => langCodes.includes(l.code));
  }

  // 显示配置摘要
  console.log(chalk.gray('─'.repeat(50)));
  console.log(chalk.white.bold('测试配置:'));
  console.log(chalk.white(`  APP 名称: ${config.app.appName}`));
  console.log(chalk.white(`  包名: ${config.app.packageName}`));
  console.log(chalk.white(`  测试语言: ${config.languages.supportedLanguages.map(l => l.name).join(', ')}`));
  console.log(chalk.white(`  页面数量: ${config.pages.length}`));
  console.log(chalk.white(`  交易流程: ${config.trading ? '已配置' : '未配置'}`));
  console.log(chalk.gray('─'.repeat(50)));

  // 检查账号密码环境变量
  if (config.login.required) {
    const username = process.env[config.login.usernameEnvKey];
    const password = process.env[config.login.passwordEnvKey];

    if (!username || !password) {
      console.log(chalk.yellow('⚠️ 账号密码未配置'));
      console.log(chalk.gray(`  请设置环境变量:`));
      console.log(chalk.gray(`    ${config.login.usernameEnvKey}=用户名`));
      console.log(chalk.gray(`    ${config.login.passwordEnvKey}=密码`));

      // 可以选择继续或退出
      const answer = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continue',
          message: '是否继续执行（跳过登录步骤）？',
          default: false,
        },
      ]);

      if (!answer.continue) {
        process.exit(1);
      }
      config.login.required = false;
    }
  }

  // 创建输出目录
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputDir = join('./data/reports', `financial-${timestamp}`);
  await mkdir(outputDir, { recursive: true });
  console.log(chalk.cyan(`📁 输出目录: ${outputDir}`));

  // 创建报告器
  const consoleReporter = new ConsoleReporter({
    verbose: options.verbose || false,
    showSteps: true,
    progressBars: !options.quiet,
  });

  consoleReporter.startRun(`金融 APP 测试 - ${config.app.appName}`, config.languages.supportedLanguages.length);

  try {
    // 安装 APK（如果提供了）
    if (config.app.apkPath) {
      console.log(chalk.blue('\n📦 安装 APK...'));
      const installResult = await deviceManager.installApk(deviceId, config.app.apkPath);

      if (!installResult.success) {
        console.log(chalk.red(`  ✗ 安装失败: ${installResult.message}`));
        process.exit(1);
      }
      console.log(chalk.green('  ✓ APK 安装成功'));

      // 获取 APK 信息更新配置
      const apkInfo = await deviceManager.getApkInfo(config.app.apkPath);
      if (apkInfo.packageName && !config.app.packageName) {
        config.app.packageName = apkInfo.packageName;
      }
      if (apkInfo.mainActivity && !config.app.launchActivity) {
        config.app.launchActivity = apkInfo.mainActivity;
      }
    }

    // 执行测试
    console.log(chalk.blue.bold('\n🚀 开始执行测试...'));

    const runner = new LanguageRunner({
      config,
      deviceId,
      outputDir,
      appiumConfig: {
        host: process.env.APPIUM_HOST,
        port: parseInt(process.env.APPIUM_PORT || '4723', 10),
      },
    });

    const result = await runner.execute();

    // 生成报告
    console.log(chalk.blue('\n📊 生成测试报告...'));

    const reportFormats = options.report?.split(',').map(r => r.trim()) || ['html', 'json'];
    const reportGenerator = new FinancialReportGenerator({
      formats: reportFormats as ('html' | 'json')[],
      outputDir,
      language: 'zh-CN',
    });

    const reportPaths = await reportGenerator.generate(result);

    // 输出结果摘要
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.green.bold('✅ 测试完成'));
    console.log(chalk.white(`  整体状态: ${result.overallAssessment.status}`));
    console.log(chalk.white(`  通过率: ${(result.overallAssessment.passRate * 100).toFixed(1)}%`));
    console.log(chalk.white(`  总耗时: ${(result.durationMs / 1000).toFixed(2)} 秒`));
    console.log(chalk.white(`  问题总数: ${result.allIssues.length}`));
    console.log(chalk.white(`    - P0: ${result.allIssues.filter(i => i.severity === 'P0').length}`));
    console.log(chalk.white(`    - P1: ${result.allIssues.filter(i => i.severity === 'P1').length}`));
    console.log(chalk.white(`    - P2: ${result.allIssues.filter(i => i.severity === 'P2').length}`));
    console.log(chalk.white(`    - P3: ${result.allIssues.filter(i => i.severity === 'P3').length}`));
    console.log(chalk.white(`  风险等级: ${result.overallAssessment.riskLevel}`));
    console.log(chalk.gray('─'.repeat(50)));

    for (const [format, path] of Object.entries(reportPaths)) {
      console.log(chalk.cyan(`${format.toUpperCase()} 报告: ${path}`));
    }

    consoleReporter.endRun({
      runId: result.runId,
      project: result.appName,
      startTime: result.startTime,
      endTime: result.endTime,
      duration: result.durationMs,
      platform: 'android-app',
      environment: { device: deviceId },
      summary: {
        total: result.languageResults.length,
        passed: result.languageResults.filter(r => r.status === 'passed').length,
        failed: result.languageResults.filter(r => r.status === 'failed').length,
        skipped: 0,
        blocked: 0,
        passRate: result.overallAssessment.passRate,
      },
      categories: createEmptyCategories(),
      cases: [],
      aiAnalysis: {
        overallAssessment: result.overallAssessment.summary,
        criticalIssues: result.allIssues.filter(i => i.severity === 'P0').map(i => i.description),
        recommendations: [],
        riskLevel: result.overallAssessment.riskLevel,
      },
      artifacts: {
        screenshots: [result.artifacts.screenshotsDir],
        videos: [],
        logs: [result.artifacts.logsDir],
      },
    });

    // 如果有严重问题，退出码为 1
    if (result.overallAssessment.status === 'failed') {
      process.exitCode = 1;
    }

  } catch (error) {
    console.log(chalk.red.bold('\n❌ 测试执行失败'));
    console.log(chalk.red((error as Error).message));
    logger.error('金融测试执行失败', { error: (error as Error).message });

    process.exit(1);
  }
}

/**
 * 交互式配置
 */
async function interactiveConfig(apkPath: string | undefined): Promise<FinancialAppConfig> {
  console.log(chalk.yellow('\n未提供配置文件，进入交互式配置模式'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'appName',
      message: 'APP 名称:',
      default: '金融 APP',
      validate: (input: string) => input ? true : '请输入 APP 名称',
    },
    {
      type: 'input',
      name: 'packageName',
      message: '应用包名（如 com.example.app）:',
      validate: (input: string) => {
        if (!input) return '请输入包名';
        if (!input.includes('.')) return '请输入有效的包名';
        return true;
      },
    },
    {
      type: 'input',
      name: 'launchActivity',
      message: '主 Activity（如 .MainActivity）:',
      default: '.MainActivity',
    },
    {
      type: 'confirm',
      name: 'needLogin',
      message: '是否需要登录?',
      default: true,
    },
    {
      type: 'input',
      name: 'usernameEnvKey',
      message: '用户名环境变量名:',
      default: 'APP_USERNAME',
      when: (ans: Record<string, unknown>) => ans.needLogin,
    },
    {
      type: 'input',
      name: 'passwordEnvKey',
      message: '密码环境变量名:',
      default: 'APP_PASSWORD',
      when: (ans: Record<string, unknown>) => ans.needLogin,
    },
    {
      type: 'checkbox',
      name: 'languages',
      message: '选择测试语言:',
      choices: [
        { name: '中文 (zh-CN)', value: 'zh-CN', checked: true },
        { name: '英文 (en-US)', value: 'en-US', checked: true },
        { name: '日文 (ja-JP)', value: 'ja-JP' },
        { name: '韩文 (ko-KR)', value: 'ko-KR' },
        { name: '繁体中文 (zh-TW)', value: 'zh-TW' },
      ],
    },
    {
      type: 'confirm',
      name: 'hasTrading',
      message: '是否配置交易流程?',
      default: false,
    },
    {
      type: 'input',
      name: 'reportFormats',
      message: '报告格式（逗号分隔）:',
      default: 'html,json',
    },
  ]);

  // 构建基础配置
  const config: FinancialAppConfig = {
    version: '1.0.0',
    app: {
      appName: answers.appName as string,
      packageName: answers.packageName as string,
      launchActivity: answers.launchActivity as string,
      platform: 'android',
      apkPath: apkPath,
    },
    login: {
      required: answers.needLogin as boolean,
      usernameLocator: { strategy: 'xpath', value: '//android.widget.EditText[@hint="用户名" or @hint="账号"]', description: '用户名输入框（待补充）' },
      passwordLocator: { strategy: 'xpath', value: '//android.widget.EditText[@hint="密码"]', description: '密码输入框（待补充）' },
      loginButtonLocator: { strategy: 'xpath', value: '//android.widget.Button[contains(@text, "登录")]', description: '登录按钮（待补充）' },
      successIndicator: { strategy: 'xpath', value: '//android.widget.TextView[contains(@text, "首页")]', description: '登录成功指示（待补充）' },
      usernameEnvKey: answers.usernameEnvKey as string || 'APP_USERNAME',
      passwordEnvKey: answers.passwordEnvKey as string || 'APP_PASSWORD',
    },
    pages: [],
    languages: {
      supportedLanguages: (answers.languages as string[]).map(code => ({
        code,
        name: getLanguageName(code),
        fullFlow: true,
      })),
      switchMethod: 'app-internal',
      switchSteps: [],
      restoreDefault: true,
      defaultLanguage: 'zh-CN',
    },
    inspection: {
      autoScreenshot: true,
      savePageSource: true,
      extractText: true,
      basicRules: [],
    },
    report: {
      formats: (answers.reportFormats as string).split(',').map(r => r.trim() as 'html' | 'json'),
      outputDir: './data/reports',
      language: 'zh-CN',
      includeAiAnalysis: !answers.noAi,
    },
  };

  // 如果配置了交易流程
  if (answers.hasTrading) {
    config.trading = {
      instruments: [{ id: 'default', name: '默认品种' }],
      openPosition: {
        actionName: '开仓',
        navigation: [],
        confirmButton: { strategy: 'xpath', value: '//android.widget.Button[contains(@text, "买入")]', description: '开仓确认按钮（待补充）' },
        successIndicator: { strategy: 'xpath', value: '//android.widget.TextView[contains(@text, "成功")]', description: '开仓成功指示（待补充）' },
      },
      viewPosition: {
        navigation: [],
        positionListLocator: { strategy: 'xpath', value: '//android.widget.ListView', description: '持仓列表（待补充）' },
      },
      closePosition: {
        actionName: '平仓',
        navigation: [],
        confirmButton: { strategy: 'xpath', value: '//android.widget.Button[contains(@text, "平仓")]', description: '平仓确认按钮（待补充）' },
        successIndicator: { strategy: 'xpath', value: '//android.widget.TextView[contains(@text, "成功")]', description: '平仓成功指示（待补充）' },
      },
      history: {
        navigation: [],
        historyListLocator: { strategy: 'xpath', value: '//android.widget.ListView', description: '历史记录列表（待补充）' },
      },
      balance: {
        balanceLocator: { strategy: 'xpath', value: '//android.widget.TextView[contains(@text, "余额")]', description: '余额字段（待补充）' },
        checkRules: [{ type: 'positive', description: '余额应为正值', required: true }],
      },
    };
  }

  console.log(chalk.yellow('\n⚠️ 注意: 交互式配置生成的是基础模板，部分定位器需要根据实际 APP 补充'));
  console.log(chalk.gray('   建议保存配置文件并根据 APP 实际结构完善定位器'));

  return config;
}

/**
 * 获取语言名称
 */
function getLanguageName(code: string): string {
  const names: Record<string, string> = {
    'zh-CN': '中文',
    'zh-TW': '繁体中文',
    'en-US': '英文',
    'ja-JP': '日文',
    'ko-KR': '韩文',
    'de-DE': '德文',
    'fr-FR': '法文',
    'es-ES': '西班牙文',
  };
  return names[code] || code;
}
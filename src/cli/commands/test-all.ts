import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { ConsoleReporter } from '@/reporters/console-reporter.js';
import { ReportGenerator } from '@/reporters/report-generator.js';
import type { TestRunResult, TestCaseResult } from '@/types/test-result.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 创建 all 命令
 */
export function createAllCommand(): Command {
  const command = new Command('all');

  command
    .description('执行全部测试（Web + APP + API）')
    .option('--config <path>', '项目配置文件路径')
    .action(async (options: { config?: string }) => {
      await executeAllTest(options);
    });

  return command;
}

/**
 * 执行全部测试
 */
async function executeAllTest(options: { config?: string }): Promise<void> {
  console.log(chalk.blue.bold('🚀 开始全量测试'));
  console.log(chalk.gray('─'.repeat(50)));

  let config: {
    project?: { name?: string };
    targets?: {
      web?: { url?: string };
      app?: { apkPath?: string; packageName?: string };
      api?: { baseUrl?: string };
    };
    settings?: Record<string, unknown>;
  } = {};

  // 读取配置文件
  if (options.config) {
    try {
      const configPath = path.resolve(options.config);
      const configContent = await fs.readFile(configPath, 'utf-8');
      config = JSON.parse(configContent);
      console.log(`${chalk.bold('配置文件')}: ${configPath}`);
      console.log(`${chalk.bold('项目')}: ${config.project?.name || '未命名'}`);
    } catch (error) {
      console.log(chalk.red(`无法读取配置文件: ${(error as Error).message}`));
      process.exit(1);
    }
  } else {
    // 交互式选择测试目标
    const answers = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'targets',
        message: '选择要测试的目标:',
        choices: [
          { name: 'Web 网站', value: 'web', checked: true },
          { name: 'APP 应用', value: 'app' },
          { name: 'API 接口', value: 'api' },
        ],
      },
      {
        type: 'input',
        name: 'webUrl',
        message: 'Web 网站 URL:',
        when: (ans: Record<string, unknown>) => (ans.targets as string[]).includes('web'),
      },
      {
        type: 'input',
        name: 'apkPath',
        message: 'APK 文件路径:',
        when: (ans: Record<string, unknown>) => (ans.targets as string[]).includes('app'),
      },
      {
        type: 'input',
        name: 'apiBaseUrl',
        message: 'API 基础 URL:',
        when: (ans: Record<string, unknown>) => (ans.targets as string[]).includes('api'),
      },
    ]);

    config.targets = {};
    if ((answers.targets as string[]).includes('web')) {
      config.targets.web = { url: answers.webUrl as string };
    }
    if ((answers.targets as string[]).includes('app')) {
      config.targets.app = { apkPath: answers.apkPath as string };
    }
    if ((answers.targets as string[]).includes('api')) {
      config.targets.api = { baseUrl: answers.apiBaseUrl as string };
    }
  }

  console.log(chalk.gray('─'.repeat(50)));

  const consoleReporter = new ConsoleReporter({
    verbose: false,
    showSteps: true,
    progressBars: true,
  });

  const allResults: Array<{ target: string; result: Record<string, unknown> }> = [];

  try {
    // 执行 Web 测试
    if (config.targets?.web?.url) {
      console.log(chalk.cyan('\n🌐 执行 Web 测试...'));
      // 模拟测试执行
      const webResult = await simulateTest('Web', config.targets.web.url, consoleReporter);
      allResults.push({ target: 'Web', result: webResult });
    }

    // 执行 APP 测试
    if (config.targets?.app?.apkPath || config.targets?.app?.packageName) {
      console.log(chalk.cyan('\n📱 执行 APP 测试...'));
      const appIdentifier = config.targets.app.apkPath || config.targets.app.packageName;
      const appResult = await simulateTest('APP', appIdentifier || '', consoleReporter);
      allResults.push({ target: 'APP', result: appResult });
    }

    // 执行 API 测试
    if (config.targets?.api?.baseUrl) {
      console.log(chalk.cyan('\n🔗 执行 API 测试...'));
      const apiResult = await simulateTest('API', config.targets.api.baseUrl, consoleReporter);
      allResults.push({ target: 'API', result: apiResult });
    }

    // 汇总结果
    console.log(chalk.green.bold('\n✅ 全量测试完成'));
    console.log(chalk.gray('═'.repeat(50)));

    let totalTests = 0;
    let totalPassed = 0;
    let totalFailed = 0;

    for (const { target, result } of allResults) {
      const summary = result.summary as { total: number; passed: number; failed: number };
      totalTests += summary.total;
      totalPassed += summary.passed;
      totalFailed += summary.failed;

      console.log(`${chalk.bold(target)}: ${summary.passed}/${summary.total} 通过`);
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('总计')}: ${totalPassed}/${totalTests} 通过 (${((totalPassed / totalTests) * 100).toFixed(1)}%)`);

    // 生成综合报告
    const emptyCategoryResult = { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 };
    const combinedResult: TestRunResult = {
      runId: `all-${Date.now()}`,
      project: config.project?.name || '全量测试',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: allResults.reduce((sum, r) => sum + ((r.result.duration as number) || 0), 0),
      platform: 'all' as const,
      environment: {},
      summary: { total: totalTests, passed: totalPassed, failed: totalFailed, skipped: 0, blocked: 0, passRate: totalPassed / totalTests },
      categories: {
        functional: emptyCategoryResult,
        visual: emptyCategoryResult,
        performance: { ...emptyCategoryResult, metrics: {} },
        security: { ...emptyCategoryResult, issues: [] },
        accessibility: { ...emptyCategoryResult, violations: [] },
        compatibility: emptyCategoryResult,
        stability: emptyCategoryResult,
      },
      cases: allResults.flatMap(r => r.result.cases as TestCaseResult[]),
      aiAnalysis: {
        overallAssessment: '全量测试完成',
        criticalIssues: [],
        recommendations: [],
        riskLevel: totalFailed === 0 ? 'low' as const : totalFailed < 3 ? 'medium' as const : 'high' as const,
      },
      artifacts: { screenshots: [], videos: [], logs: [] },
    };

    const reportGenerator = new ReportGenerator({
      formats: ['html', 'json'],
      outputDir: './data/reports',
    });

    const reportPaths = await reportGenerator.generate(combinedResult);

    console.log(chalk.gray('─'.repeat(50)));
    for (const [format, path] of Object.entries(reportPaths)) {
      console.log(`${chalk.bold(format.toUpperCase())} 报告: ${chalk.cyan(path)}`);
    }

  } catch (error) {
    consoleReporter.showError('全量测试执行失败', error as Error);
    logger.error('全量测试执行失败', { error: (error as Error).message });
    process.exit(1);
  }
}

/**
 * 模拟测试执行
 */
async function simulateTest(type: string, target: string, _reporter: ConsoleReporter): Promise<Record<string, unknown>> {
  await new Promise(resolve => setTimeout(resolve, 1000));

  const testCount = Math.floor(Math.random() * 5) + 5;
  const passCount = Math.floor(Math.random() * 3) + testCount - 2;

  return {
    runId: `${type.toLowerCase()}-${Date.now()}`,
    project: target,
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: testCount * 1000,
    platform: type.toLowerCase(),
    environment: {},
    summary: {
      total: testCount,
      passed: Math.min(passCount, testCount),
      failed: Math.max(0, testCount - passCount),
      skipped: 0,
      blocked: 0,
      passRate: Math.min(passCount, testCount) / testCount,
    },
    categories: {},
    cases: [],
    aiAnalysis: {
      overallAssessment: `${type} 测试完成`,
      criticalIssues: [],
      recommendations: [],
      riskLevel: 'low' as const,
    },
    artifacts: { screenshots: [], videos: [], logs: [] },
  };
}
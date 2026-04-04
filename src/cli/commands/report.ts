import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import Table from 'cli-table3';
import { logger } from '@/core/logger.js';
import { JsonReporter } from '@/reporters/json-reporter.js';
import { DiffReporter } from '@/reporters/diff-reporter.js';
import { TrendReporter } from '@/reporters/trend-reporter.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 创建 report 命令
 */
export function createReportCommand(): Command {
  const command = new Command('report');

  command
    .description('查看测试报告')
    .option('--latest', '打开最新报告')
    .option('--list', '列出历史报告')
    .option('--diff <runIds>', '对比两次报告，逗号分隔')
    .option('--trend', '查看趋势分析')
    .option('--last <number>', '最近N次测试', '10')
    .action(async (options: { latest?: boolean; list?: boolean; diff?: string; trend?: boolean; last?: string }) => {
      await executeReport(options);
    });

  return command;
}

/**
 * 执行报告命令
 */
async function executeReport(options: { latest?: boolean; list?: boolean; diff?: string; trend?: boolean; last?: string }): Promise<void> {
  const reportDir = './data/reports';
  const jsonReporter = new JsonReporter({ outputDir: reportDir });

  try {
    // 如果没有指定选项，交互式选择
    if (!options.latest && !options.list && !options.diff && !options.trend) {
      const answers = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: '选择操作:',
          choices: [
            { name: '查看最新报告', value: 'latest' },
            { name: '列出历史报告', value: 'list' },
            { name: '对比两次报告', value: 'diff' },
            { name: '查看趋势分析', value: 'trend' },
          ],
        },
      ]);

      const action = answers.action as 'latest' | 'list' | 'diff' | 'trend';
      if (action === 'latest') options.latest = true;
      else if (action === 'list') options.list = true;
      else if (action === 'diff') options.diff = 'prompt';
      else if (action === 'trend') options.trend = true;
    }

    // 查看最新报告
    if (options.latest) {
      await showLatestReport(reportDir);
    }

    // 列出历史报告
    if (options.list) {
      await listReports(jsonReporter);
    }

    // 对比报告
    if (options.diff) {
      const runIds = options.diff.split(',').map(r => r.trim());
      if (runIds.length !== 2) {
        console.log(chalk.red('请提供两个运行 ID 进行对比'));
        return;
      }
      const runId1 = runIds[0];
      const runId2 = runIds[1];
      if (!runId1 || !runId2) {
        console.log(chalk.red('请提供有效的运行 ID'));
        return;
      }
      await diffReports(reportDir, runId1, runId2);
    }

    // 趋势分析
    if (options.trend) {
      const lastN = parseInt(options.last || '10', 10);
      await showTrend(reportDir, lastN);
    }

  } catch (error) {
    console.log(chalk.red(`报告操作失败: ${(error as Error).message}`));
    logger.error('报告操作失败', { error: (error as Error).message });
    process.exit(1);
  }
}

/**
 * 显示最新报告
 */
async function showLatestReport(reportDir: string): Promise<void> {
  console.log(chalk.blue.bold('📊 最新报告'));
  console.log(chalk.gray('─'.repeat(50)));

  const reports = await listReportFiles(reportDir);
  if (reports.length === 0) {
    console.log(chalk.yellow('没有找到测试报告'));
    return;
  }

  const latestReport = reports[0];
  if (!latestReport) {
    console.log(chalk.yellow('没有找到测试报告'));
    return;
  }
  console.log(`${chalk.bold('运行 ID')}: ${latestReport.runId}`);
  console.log(`${chalk.bold('时间')}: ${latestReport.time}`);
  console.log(`${chalk.bold('报告路径')}: ${latestReport.path}`);

  // 读取报告内容
  try {
    const content = await fs.readFile(latestReport.path, 'utf-8');
    const report = JSON.parse(content);

    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('项目')}: ${report.project}`);
    console.log(`${chalk.bold('平台')}: ${report.platform}`);
    console.log(`${chalk.bold('总用例')}: ${report.summary.total}`);
    console.log(`${chalk.bold('通过')}: ${chalk.green(report.summary.passed)}`);
    console.log(`${chalk.bold('失败')}: ${chalk.red(report.summary.failed)}`);
    console.log(`${chalk.bold('通过率')}: ${(report.summary.passRate * 100).toFixed(1)}%`);

    if (report.aiAnalysis) {
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.bold('AI 评价') + `: ${report.aiAnalysis.overallAssessment}`);
      console.log(chalk.bold('风险等级') + `: ${report.aiAnalysis.riskLevel.toUpperCase()}`);
    }

    // 如果有 HTML 报告，尝试打开
    const htmlPath = latestReport.path.replace('.json', '.html');
    try {
      await fs.access(htmlPath);
      console.log(chalk.gray('─'.repeat(50)));
      console.log(chalk.cyan(`HTML 报告: ${htmlPath}`));
      // 可以使用 open 包打开浏览器
      // await import('open').then(m => m.default(htmlPath));
    } catch {
      // HTML 报告不存在
    }

  } catch (error) {
    console.log(chalk.red(`读取报告失败: ${(error as Error).message}`));
  }
}

/**
 * 列出历史报告
 */
async function listReports(jsonReporter: JsonReporter): Promise<void> {
  console.log(chalk.blue.bold('📋 历史报告列表'));
  console.log(chalk.gray('─'.repeat(50)));

  const summaries = await jsonReporter.listWithSummary();

  if (summaries.length === 0) {
    console.log(chalk.yellow('没有找到测试报告'));
    return;
  }

  const table = new Table({
    head: [chalk.white('运行 ID'), chalk.white('项目'), chalk.white('平台'), chalk.white('通过/总数'), chalk.white('通过率'), chalk.white('风险')],
    colWidths: [20, 15, 12, 12, 10, 8],
  });

  for (const summary of summaries.slice(0, 20)) {
    const passRate = (summary.passRate * 100).toFixed(1) + '%';
    const riskColor = summary.riskLevel === 'low' ? chalk.green :
      summary.riskLevel === 'medium' ? chalk.yellow : chalk.red;

    table.push([
      summary.runId.slice(0, 18),
      summary.project?.slice(0, 13) || '-',
      summary.platform || '-',
      `${summary.passed}/${summary.totalCases}`,
      passRate,
      riskColor(summary.riskLevel?.toUpperCase() || '-'),
    ]);
  }

  console.log(table.toString());
  console.log(chalk.gray(`\n共 ${summaries.length} 份报告`));
}

/**
 * 对比两次报告
 */
async function diffReports(reportDir: string, runId1: string, runId2: string): Promise<void> {
  console.log(chalk.blue.bold('📊 报告对比'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`对比: ${runId1} vs ${runId2}`);
  console.log(chalk.gray('─'.repeat(50)));

  const diffReporter = new DiffReporter();

  try {
    const diff = await diffReporter.compareFiles(
      path.join(reportDir, `report-${runId1}.json`),
      path.join(reportDir, `report-${runId2}.json`),
    );

    if (!diff) {
      console.log(chalk.red('无法对比报告'));
      return;
    }

    // 通过率变化
    const passRateChange = diff.changes.passRateChange;
    const changeStr = passRateChange >= 0
      ? chalk.green(`+${(passRateChange * 100).toFixed(1)}%`)
      : chalk.red(`${(passRateChange * 100).toFixed(1)}%`);

    console.log(`\n${chalk.bold('通过率变化')}: ${changeStr}`);

    // 新增的失败
    if (diff.changes.newFailures && diff.changes.newFailures.length > 0) {
      console.log(`\n${chalk.bold.red('新增失败')} (${diff.changes.newFailures.length} 个):`);
      for (const item of diff.changes.newFailures.slice(0, 5)) {
        console.log(chalk.red(`  • ${item}`));
      }
    }

    // 修复的问题
    if (diff.changes.fixedIssues && diff.changes.fixedIssues.length > 0) {
      console.log(`\n${chalk.bold.green('已修复')} (${diff.changes.fixedIssues.length} 个):`);
      for (const item of diff.changes.fixedIssues.slice(0, 5)) {
        console.log(chalk.green(`  • ${item}`));
      }
    }

    // 持续失败
    if (diff.changes.persistentFailures && diff.changes.persistentFailures.length > 0) {
      console.log(`\n${chalk.bold.yellow('持续失败')} (${diff.changes.persistentFailures.length} 个):`);
      for (const item of diff.changes.persistentFailures.slice(0, 5)) {
        console.log(chalk.yellow(`  • ${item}`));
      }
    }

  } catch (error) {
    console.log(chalk.red(`对比失败: ${(error as Error).message}`));
  }
}

/**
 * 显示趋势分析
 */
async function showTrend(reportDir: string, lastN: number): Promise<void> {
  console.log(chalk.blue.bold('📈 趋势分析'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`最近 ${lastN} 次测试`);
  console.log(chalk.gray('─'.repeat(50)));

  const trendReporter = new TrendReporter();

  try {
    const trend = await trendReporter.analyze(reportDir, lastN);

    // 通过率趋势
    console.log(`\n${chalk.bold('通过率趋势')}:`);
    const maxBars = 20;
    for (const point of trend.passRates.slice(-10)) {
      const bars = Math.round(point.passRate * maxBars);
      const barStr = '█'.repeat(bars) + '░'.repeat(maxBars - bars);
      const color = point.passRate >= 0.8 ? chalk.green : point.passRate >= 0.5 ? chalk.yellow : chalk.red;
      console.log(`  ${point.date.slice(5, 10)} ${color(barStr)} ${(point.passRate * 100).toFixed(0)}%`);
    }

    // 问题数趋势
    if (trend.issueCounts && trend.issueCounts.length > 0) {
      console.log(`\n${chalk.bold('问题数趋势')}:`);
      for (const point of trend.issueCounts.slice(-10)) {
        console.log(`  ${point.date.slice(5, 10)} ${chalk.red(point.failedCases + ' 个问题')}`);
      }
    }

    // 统计摘要
    if (trend.summary) {
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`${chalk.bold('统计摘要')}:`);
      console.log(`  平均通过率: ${(trend.summary.avgPassRate * 100).toFixed(1)}%`);
      console.log(`  最高通过率: ${(trend.summary.maxPassRate * 100).toFixed(1)}%`);
      console.log(`  最低通过率: ${(trend.summary.minPassRate * 100).toFixed(1)}%`);
    }

  } catch (error) {
    console.log(chalk.red(`趋势分析失败: ${(error as Error).message}`));
  }
}

/**
 * 列出报告文件
 */
async function listReportFiles(reportDir: string): Promise<Array<{ runId: string; time: string; path: string }>> {
  const files = await fs.readdir(reportDir).catch(() => [] as string[]);
  const jsonFiles = files.filter(f => f.startsWith('report-') && f.endsWith('.json'));

  const reports: Array<{ runId: string; time: string; path: string }> = [];

  for (const file of jsonFiles) {
    const filePath = path.join(reportDir, file);
    const stat = await fs.stat(filePath);
    reports.push({
      runId: file.replace('report-', '').replace('.json', ''),
      time: stat.mtime.toISOString(),
      path: filePath,
    });
  }

  // 按时间排序（最新的在前）
  return reports.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
}
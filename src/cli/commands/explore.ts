/**
 * 探索式测试命令
 * 让 AI 主动漫游应用，发现异常和未知问题
 */

import { Command } from 'commander';
import { chromium } from 'playwright';
import { logger } from '@/core/logger.js';
import { ExplorationRunner, createExplorationRunner } from '@/core/exploration-runner.js';
import { initializeDatabase } from '@/knowledge/db/index.js';
import { AiClient } from '@/ai/client.js';
import type { ExplorationReport } from '@/types/exploration.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

interface ExploreOptions {
  platform: 'pc-web' | 'h5-web';
  maxSteps: number;
  maxDuration: number;
  strategy: 'random' | 'breadth-first' | 'depth-first' | 'reward-based' | 'ai-guided';
  output: string;
  report: string;
  screenshot: boolean;
  video: boolean;
  stopOnAnomaly: boolean;
  stopOnNewState: boolean;
  headless: boolean;
}

/**
 * 运行探索测试
 */
async function runExplore(target: string, options: ExploreOptions): Promise<void> {
  const startTime = Date.now();

  console.log('\n🔍 探索式测试');
  console.log('─'.repeat(50));
  console.log(`目标: ${target}`);
  console.log(`平台: ${options.platform}`);
  console.log(`策略: ${options.strategy}`);
  console.log(`最大步数: ${options.maxSteps}`);
  console.log(`最大时长: ${options.maxDuration}秒`);
  console.log('─'.repeat(50));

  // 初始化数据库
  let db;
  try {
    db = await initializeDatabase({ dbPath: './db/sqlite.db' });
    logger.pass('✅ 数据库初始化完成');
  } catch (error) {
    logger.warn('⚠️ 数据库初始化失败，将不使用持久化');
  }

  // 初始化 AI 客户端
  const aiClient = new AiClient({
    enabled: process.env.AI_API_KEY ? true : false,
    apiKey: process.env.AI_API_KEY,
    provider: 'anthropic',
    model: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
  });

  if (aiClient) {
    try {
      await aiClient.initialize();
      logger.pass('✅ AI 客户端初始化完成');
    } catch {
      logger.warn('⚠️ AI 客户端初始化失败');
    }
  }

  // 创建探索执行器
  const runner = createExplorationRunner({
    explorationConfig: {
      platform: options.platform,
      maxSteps: options.maxSteps,
      maxDuration: options.maxDuration,
      strategy: options.strategy,
      recordScreenshots: options.screenshot,
      recordVideo: options.video,
      stopOnAnomaly: options.stopOnAnomaly,
      stopOnNewState: options.stopOnNewState,
    },
    aiClient: aiClient || undefined,
    db: db || undefined,
    screenshotDir: './data/screenshots/exploration',
  });

  // 设置事件监听
  runner.on('exploration:start', (data) => {
    console.log(`\n🚀 探索开始: ${data.trajectoryId}`);
  });

  runner.on('exploration:new-state', (data) => {
    console.log(`  📍 发现新状态: ${data.stateHash}`);
  });

  runner.on('exploration:anomaly', (anomaly) => {
    const icon = anomaly.severity === 'critical' ? '🔴' : anomaly.severity === 'high' ? '🟠' : '🟡';
    console.log(`  ${icon} 异常 [${anomaly.type}]: ${anomaly.description.slice(0, 60)}...`);
  });

  runner.on('exploration:complete', (data) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n✅ 探索完成 (${duration}s)`);
  });

  // 启动浏览器
  console.log('\n启动浏览器...');
  const browser = await chromium.launch({
    headless: options.headless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  });

  runner.setBrowser(browser);

  try {
    // 执行探索
    const report = await runner.explore(target, {
      platform: options.platform,
    });

    // 打印摘要
    printReport(report);

    // 保存报告
    await saveReport(report, options.output, options.report);

    console.log('\n🎉 探索测试完成！');

  } catch (error) {
    console.error('\n❌ 探索失败:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await browser.close();
    if (db) db.close();
  }
}

/**
 * 打印探索报告
 */
function printReport(report: ExplorationReport): void {
  console.log('\n📊 探索报告');
  console.log('═'.repeat(60));
  console.log(`轨迹 ID: ${report.trajectoryId}`);
  console.log(`项目: ${report.projectId}`);
  console.log(`平台: ${report.platform}`);
  console.log(`时间: ${report.startedAt} - ${report.endedAt}`);

  console.log('\n📈 摘要');
  console.log('─'.repeat(40));
  console.log(`总步数: ${report.summary.totalSteps}`);
  console.log(`发现新状态: ${report.summary.newStatesCount}`);
  console.log(`发现异常: ${report.summary.anomaliesCount}`);
  console.log(`总奖励: ${report.summary.totalReward.toFixed(1)}`);
  console.log(`平均奖励: ${report.summary.avgReward.toFixed(2)}`);
  console.log(`生成用例: ${report.summary.generatedCasesCount}`);

  if (report.summary.anomaliesCount > 0) {
    console.log('\n⚠️ 异常统计');
    console.log('─'.repeat(40));
    console.log('按严重级别:');
    console.log(`  严重: ${report.summary.anomaliesBySeverity.critical}`);
    console.log(`  高: ${report.summary.anomaliesBySeverity.high}`);
    console.log(`  中: ${report.summary.anomaliesBySeverity.medium}`);
    console.log(`  低: ${report.summary.anomaliesBySeverity.low}`);
  }

  if (report.anomalies.length > 0) {
    console.log('\n🔴 发现的异常');
    console.log('─'.repeat(40));
    for (const anomaly of report.anomalies.slice(0, 10)) {
      const icon = anomaly.severity === 'critical' ? '🔴' : anomaly.severity === 'high' ? '🟠' : '🟡';
      console.log(`${icon} [${anomaly.type}] ${anomaly.description.slice(0, 50)}...`);
      console.log(`   URL: ${anomaly.pageUrl}`);
    }
    if (report.anomalies.length > 10) {
      console.log(`   ... 还有 ${report.anomalies.length - 10} 个异常`);
    }
  }

  if (report.generatedCases.length > 0) {
    console.log('\n📝 生成的回归用例');
    console.log('─'.repeat(40));
    for (const testCase of report.generatedCases.slice(0, 5)) {
      console.log(`[${testCase.priority}] ${testCase.caseName}`);
    }
    if (report.generatedCases.length > 5) {
      console.log(`   ... 还有 ${report.generatedCases.length - 5} 个用例`);
    }
  }
}

/**
 * 保存报告
 */
async function saveReport(
  report: ExplorationReport,
  outputDir: string,
  format: string,
): Promise<void> {
  await fs.mkdir(outputDir, { recursive: true });

  const formats = format.split(',');

  for (const fmt of formats) {
    switch (fmt.trim()) {
      case 'json': {
        const jsonPath = path.join(outputDir, `exploration-${report.trajectoryId}.json`);
        await fs.writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
        console.log(`\n📄 JSON 报告已保存: ${jsonPath}`);
        break;
      }
      case 'markdown':
      case 'md': {
        const mdPath = path.join(outputDir, `exploration-${report.trajectoryId}.md`);
        const mdContent = generateMarkdownReport(report);
        await fs.writeFile(mdPath, mdContent, 'utf-8');
        console.log(`\n📄 Markdown 报告已保存: ${mdPath}`);
        break;
      }
    }
  }
}

/**
 * 生成 Markdown 报告
 */
function generateMarkdownReport(report: ExplorationReport): string {
  const lines: string[] = [
    `# 探索测试报告`,
    '',
    `**轨迹 ID**: ${report.trajectoryId}`,
    `**项目**: ${report.projectId}`,
    `**平台**: ${report.platform}`,
    `**时间**: ${report.startedAt} - ${report.endedAt}`,
    '',
    `## 摘要`,
    '',
    `| 指标 | 值 |`,
    `|------|-----|`,
    `| 总步数 | ${report.summary.totalSteps} |`,
    `| 发现新状态 | ${report.summary.newStatesCount} |`,
    `| 发现异常 | ${report.summary.anomaliesCount} |`,
    `| 总奖励 | ${report.summary.totalReward.toFixed(1)} |`,
    `| 生成用例 | ${report.summary.generatedCasesCount} |`,
    '',
  ];

  if (report.anomalies.length > 0) {
    lines.push(`## 发现的异常`, '');
    lines.push(`| 严重级别 | 类型 | 描述 | URL |`);
    lines.push(`|----------|------|------|-----|`);
    for (const anomaly of report.anomalies) {
      lines.push(`| ${anomaly.severity} | ${anomaly.type} | ${anomaly.description.slice(0, 50)} | ${anomaly.pageUrl} |`);
    }
    lines.push('');
  }

  if (report.generatedCases.length > 0) {
    lines.push(`## 生成的回归用例`, '');
    for (const testCase of report.generatedCases) {
      lines.push(`### ${testCase.caseName}`);
      lines.push(``);
      lines.push(`- **优先级**: ${testCase.priority}`);
      lines.push(`- **描述**: ${testCase.description}`);
      lines.push(`- **触发异常**: ${testCase.anomalyId}`);
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * 注册 explore 命令
 */
export function createExploreCommand(): Command {
  const command = new Command('explore')
    .description('探索式测试 - AI 主动漫游应用，发现异常和未知问题')
    .argument('<target>', '起始 URL 或应用标识')
    .option('-p, --platform <platform>', '测试平台', 'pc-web')
    .option('-s, --max-steps <number>', '最大探索步数', '100')
    .option('-d, --max-duration <seconds>', '最大探索时长（秒）', '1800')
    .option('--strategy <strategy>', '探索策略', 'reward-based')
    .option('-o, --output <dir>', '报告输出目录', './data/reports/exploration')
    .option('-r, --report <format>', '报告格式 (json,markdown)', 'json,markdown')
    .option('--no-screenshot', '不记录截图')
    .option('--no-video', '不记录视频')
    .option('--stop-on-anomaly', '发现异常时停止', true)
    .option('--stop-on-new-state', '发现新状态时停止', false)
    .option('--no-headless', '显示浏览器窗口')
    .action(async (target: string, options: any) => {
      const exploreOptions: ExploreOptions = {
        platform: options.platform,
        maxSteps: parseInt(options.maxSteps, 10),
        maxDuration: parseInt(options.maxDuration, 10),
        strategy: options.strategy,
        output: options.output,
        report: options.report,
        screenshot: options.screenshot,
        video: options.video,
        stopOnAnomaly: options.stopOnAnomaly,
        stopOnNewState: options.stopOnNewState,
        headless: options.headless,
      };

      await runExplore(target, exploreOptions);
    });

  return command;
}
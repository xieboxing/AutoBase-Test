/**
 * 视觉回归管理命令
 */

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { VisualRegressionManager } from '@/testers/visual/visual-regression-manager.js';
import { getDatabase } from '@/knowledge/db/index.js';

/**
 * 视觉命令选项
 */
export interface VisualCommandOptions {
  project?: string;
  platform?: string;
  baselineDir?: string;
  diffDir?: string;
  threshold?: number;
}

/**
 * 创建视觉回归命令
 */
export function createVisualCommand(): Command {
  const command = new Command('visual');

  command
    .description('视觉回归测试管理')
    .addCommand(createListCommand())
    .addCommand(createCompareCommand())
    .addCommand(createUpdateCommand())
    .addCommand(createDeleteCommand())
    .addCommand(createStatsCommand());

  return command;
}

/**
 * 创建 list 子命令
 */
function createListCommand(): Command {
  const command = new Command('list');

  command
    .description('列出所有视觉基线')
    .option('-p, --project <project>', '项目 ID')
    .option('--platform <platform>', '平台: pc-web, h5-web')
    .action(async (options: VisualCommandOptions) => {
      try {
        const manager = new VisualRegressionManager();
        await manager.initialize();

        const baselines = await manager.listBaselines({
          projectId: options.project,
          platform: options.platform as any,
        });

        if (baselines.length === 0) {
          console.log(chalk.yellow('未找到任何视觉基线'));
          return;
        }

        console.log(chalk.bold('\n📷 视觉基线列表:\n'));
        console.log(chalk.gray('─'.repeat(80)));

        for (const baseline of baselines) {
          console.log(`${chalk.green(baseline.id)}`);
          console.log(`  项目: ${baseline.projectId} | 平台: ${baseline.platform}`);
          console.log(`  URL: ${baseline.pageUrl}`);
          console.log(`  视口: ${baseline.viewportWidth}x${baseline.viewportHeight}`);
          if (baseline.browser) console.log(`  浏览器: ${baseline.browser}`);
          if (baseline.device) console.log(`  设备: ${baseline.device}`);
          console.log(`  创建: ${baseline.createdAt}`);
          console.log(chalk.gray('─'.repeat(80)));
        }

        console.log(`\n共 ${baselines.length} 个基线\n`);
      } catch (error) {
        logger.fail(`列出基线失败: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * 创建 compare 子命令
 */
function createCompareCommand(): Command {
  const command = new Command('compare');

  command
    .description('对比截图与基线')
    .argument('<screenshot>', '当前截图路径')
    .option('-b, --baseline <baselineId>', '基线 ID')
    .option('-p, --project <project>', '项目 ID', 'default')
    .option('--platform <platform>', '平台', 'pc-web')
    .option('--url <url>', '页面 URL', '')
    .option('-t, --threshold <threshold>', '差异阈值 (%)', '0.5')
    .action(async (screenshot: string, options: VisualCommandOptions & { baseline?: string; url?: string; threshold?: string }) => {
      try {
        const threshold = parseFloat(options.threshold || '0.5');
        const manager = new VisualRegressionManager({ percentageThreshold: threshold });
        await manager.initialize();

        console.log(chalk.blue('\n🔍 执行视觉对比...\n'));

        const result = await manager.compare(screenshot, {
          projectId: options.project || 'default',
          platform: (options.platform || 'pc-web') as any,
          pageUrl: options.url || '',
          baselineId: options.baseline,
        });

        if (!result) {
          console.log(chalk.green('✅ 新基线已自动创建'));
          return;
        }

        if (result.passed) {
          console.log(chalk.green(`✅ 视觉对比通过`));
          console.log(`   差异: ${result.diffPercentage.toFixed(2)}%`);
        } else {
          console.log(chalk.red(`❌ 视觉对比失败`));
          console.log(`   差异: ${result.diffPercentage.toFixed(2)}%`);
          console.log(`   阈值: ${threshold}%`);
          if (result.diffImagePath) {
            console.log(`   差异图: ${result.diffImagePath}`);
          }
        }

        console.log(`   基线 ID: ${result.baselineId}`);
        console.log(`   差异像素: ${result.diffPixels || 0}`);
      } catch (error) {
        logger.fail(`视觉对比失败: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * 创建 update 子命令
 */
function createUpdateCommand(): Command {
  const command = new Command('update');

  command
    .description('更新视觉基线')
    .argument('<baselineId>', '基线 ID')
    .argument('<screenshot>', '新截图路径')
    .option('-r, --reason <reason>', '更新原因', 'CLI 更新')
    .action(async (baselineId: string, screenshot: string, options: { reason?: string }) => {
      try {
        const manager = new VisualRegressionManager();
        await manager.initialize();

        console.log(chalk.blue('\n📸 更新视觉基线...\n'));

        const updated = await manager.updateBaseline(baselineId, screenshot, options.reason);

        console.log(chalk.green(`✅ 基线已更新: ${updated.id}`));
        console.log(`   更新时间: ${updated.updatedAt}`);
      } catch (error) {
        logger.fail(`更新基线失败: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * 创建 delete 子命令
 */
function createDeleteCommand(): Command {
  const command = new Command('delete');

  command
    .description('删除视觉基线')
    .argument('<baselineId>', '基线 ID')
    .option('-f, --force', '强制删除，无需确认')
    .action(async (baselineId: string, options: { force?: boolean }) => {
      try {
        const manager = new VisualRegressionManager();
        await manager.initialize();

        // 检查基线是否存在
        const baseline = await manager.getBaseline(baselineId);
        if (!baseline) {
          console.log(chalk.yellow(`⚠️ 基线不存在: ${baselineId}`));
          return;
        }

        // 确认删除
        if (!options.force) {
          const { confirm } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'confirm',
              message: `确定要删除基线 "${baselineId}" 吗？`,
              default: false,
            },
          ]);

          if (!confirm) {
            console.log(chalk.gray('已取消'));
            return;
          }
        }

        await manager.deleteBaseline(baselineId);
        console.log(chalk.green(`✅ 基线已删除: ${baselineId}`));
      } catch (error) {
        logger.fail(`删除基线失败: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}

/**
 * 创建 stats 子命令
 */
function createStatsCommand(): Command {
  const command = new Command('stats');

  command
    .description('显示视觉回归统计信息')
    .action(async () => {
      try {
        const manager = new VisualRegressionManager();
        await manager.initialize();

        const stats = manager.getStats();

        console.log(chalk.bold('\n📊 视觉回归统计:\n'));
        console.log(`  总基线数: ${stats.totalBaselines}`);
        console.log(`  总对比数: ${stats.totalDiffs}`);

        if (Object.keys(stats.byBrowser).length > 0) {
          console.log('\n  按浏览器:');
          for (const [browser, count] of Object.entries(stats.byBrowser)) {
            console.log(`    ${browser}: ${count}`);
          }
        }

        if (Object.keys(stats.byViewport).length > 0) {
          console.log('\n  按视口:');
          for (const [viewport, count] of Object.entries(stats.byViewport)) {
            console.log(`    ${viewport}: ${count}`);
          }
        }

        console.log('');
      } catch (error) {
        logger.fail(`获取统计信息失败: ${error instanceof Error ? error.message : String(error)}`);
        process.exit(1);
      }
    });

  return command;
}
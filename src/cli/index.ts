#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import boxen from 'boxen';
import {
  createWebCommand,
  createAppCommand,
  createApiCommand,
  createAllCommand,
  createOptimizeCommand,
  createReportCommand,
  createRecordCommand,
  createDoctorCommand,
  createInitCommand,
  createScheduleCommand,
  createSetupCommand,
} from './commands/index.js';

const program = new Command();

// Banner
const banner = boxen(
  chalk.blue.bold('Auto Test Platform') + '\n' +
  chalk.gray('AI驱动的全自动化测试平台') + '\n' +
  chalk.gray('Version: 0.1.0'),
  {
    padding: 1,
    margin: 1,
    borderStyle: 'round',
    borderColor: 'blue',
  }
);

program
  .name('autotest')
  .description('AI驱动的全自动化测试平台 - 给我一个URL或APK，全自动完成专业级测试')
  .version('0.1.0')
  .option('--verbose', '显示详细日志')
  .option('--quiet', '静默模式，只输出结果')
  .option('--config <path>', '指定配置文件路径')
  .option('--no-ai', '禁用AI，使用规则引擎')
  .hook('preAction', () => {
    if (!program.opts().quiet) {
      console.log(banner);
    }
  });

// 注册命令
program.addCommand(createWebCommand());
program.addCommand(createAppCommand());
program.addCommand(createApiCommand());
program.addCommand(createAllCommand());
program.addCommand(createOptimizeCommand());
program.addCommand(createReportCommand());
program.addCommand(createRecordCommand());
program.addCommand(createDoctorCommand());
program.addCommand(createSetupCommand());
program.addCommand(createInitCommand());
program.addCommand(createScheduleCommand());

// 清理命令（简单实现）
program
  .command('clean')
  .description('清理临时数据')
  .option('--all', '清理所有临时数据')
  .option('--screenshots', '清理截图')
  .option('--videos', '清理录屏')
  .option('--logs', '清理日志')
  .option('--reports', '清理报告')
  .action(async (options: { all?: boolean; screenshots?: boolean; videos?: boolean; logs?: boolean; reports?: boolean }) => {
    console.log(chalk.blue.bold('🧹 清理临时数据'));
    console.log(chalk.gray('─'.repeat(50)));

    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const dirs = [
      { name: 'screenshots', path: './data/screenshots', clean: options.all || options.screenshots },
      { name: 'videos', path: './data/videos', clean: options.all || options.videos },
      { name: 'logs', path: './data/logs', clean: options.all || options.logs },
      { name: 'reports', path: './data/reports', clean: options.all || options.reports },
    ];

    // 如果没有指定选项，清理所有
    if (!options.all && !options.screenshots && !options.videos && !options.logs && !options.reports) {
      dirs.forEach(d => d.clean = true);
    }

    for (const dir of dirs) {
      if (dir.clean) {
        try {
          const files = await fs.readdir(dir.path).catch(() => [] as string[]);
          let count = 0;

          for (const file of files) {
            if (file === '.gitkeep') continue;
            await fs.rm(path.join(dir.path, file), { recursive: true, force: true });
            count++;
          }

          console.log(chalk.green(`  ✓ ${dir.name}: 清理 ${count} 个文件`));
        } catch (error) {
          console.log(chalk.yellow(`  ⚠ ${dir.name}: ${(error as Error).message}`));
        }
      }
    }

    console.log(chalk.green.bold('\n✅ 清理完成'));
  });

// 解析命令行参数
program.parse();
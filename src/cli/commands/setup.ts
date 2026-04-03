import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

/**
 * 创建 setup 命令
 */
export function createSetupCommand(): Command {
  const command = new Command('setup');

  command
    .description('安装浏览器驱动')
    .option('--browser <name>', '指定浏览器: chromium, firefox, webkit, all', 'all')
    .action(async (options: { browser?: string }) => {
      await runSetup(options);
    });

  return command;
}

/**
 * 运行安装
 */
async function runSetup(options: { browser?: string }): Promise<void> {
  console.log(chalk.blue.bold('🔧 安装浏览器驱动'));
  console.log(chalk.gray('─'.repeat(50)));

  const browser = options.browser || 'all';
  console.log(`${chalk.bold('目标')}: ${browser}`);

  try {
    // 检查 Playwright 是否安装
    console.log(chalk.gray('\n检查 Playwright...'));

    try {
      // 运行 playwright install
      console.log(chalk.blue('\n安装浏览器驱动...'));
      console.log(chalk.gray('运行: npx playwright install' + (browser !== 'all' ? ` ${browser}` : '')));

      const command = browser === 'all'
        ? 'npx playwright install'
        : `npx playwright install ${browser}`;

      const { stdout, stderr } = await execAsync(command, {
        cwd: process.cwd(),
        env: process.env,
      });

      if (stdout) console.log(stdout);
      if (stderr) console.error(stderr);

      console.log(chalk.green.bold('\n✅ 浏览器驱动安装完成'));

    } catch (error) {
      console.log(chalk.red(`安装失败: ${(error as Error).message}`));
      console.log(chalk.yellow('\n请尝试手动运行:'));
      console.log(chalk.cyan('  npx playwright install'));
      process.exit(1);
    }

  } catch (error) {
    console.log(chalk.red(`安装失败: ${(error as Error).message}`));
    process.exit(1);
  }
}
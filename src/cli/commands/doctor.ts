import { Command } from 'commander';
import chalk from 'chalk';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execAsync = promisify(exec);

/**
 * 创建 doctor 命令
 */
export function createDoctorCommand(): Command {
  const command = new Command('doctor');

  command
    .description('检查环境依赖是否就绪')
    .option('--fix', '自动修复可修复的问题')
    .action(async (options: { fix?: boolean }) => {
      await runDoctor(options);
    });

  return command;
}

/**
 * 运行环境检查
 */
async function runDoctor(options: { fix?: boolean }): Promise<void> {
  console.log(chalk.blue.bold('🏥 环境检查'));
  console.log(chalk.gray('═'.repeat(50)));

  const results: Array<{ name: string; status: 'ok' | 'warning' | 'error'; message: string; fix?: string }> = [];

  // 检查 Node.js 版本
  console.log(chalk.gray('\n检查 Node.js 版本...'));
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (nodeMajor >= 20) {
    results.push({ name: 'Node.js', status: 'ok', message: `版本 ${nodeVersion} ✓` });
    console.log(chalk.green(`  ✓ Node.js ${nodeVersion}`));
  } else {
    results.push({ name: 'Node.js', status: 'error', message: `版本 ${nodeVersion}，需要 >= 20.0.0`, fix: '升级 Node.js 到 v20 或更高版本' });
    console.log(chalk.red(`  ✗ Node.js ${nodeVersion}（需要 >= 20.0.0）`));
  }

  // 检查 npm
  console.log(chalk.gray('\n检查 npm...'));
  try {
    const { stdout } = await execAsync('npm --version');
    results.push({ name: 'npm', status: 'ok', message: `版本 ${stdout.trim()} ✓` });
    console.log(chalk.green(`  ✓ npm ${stdout.trim()}`));
  } catch {
    results.push({ name: 'npm', status: 'error', message: '未安装', fix: '安装 Node.js 会自动安装 npm' });
    console.log(chalk.red('  ✗ npm 未安装'));
  }

  // 检查浏览器
  console.log(chalk.gray('\n检查浏览器...'));
  const browsers = await checkBrowsers();
  for (const browser of browsers) {
    if (browser.installed) {
      results.push({ name: browser.name, status: 'ok', message: `已安装 ✓` });
      console.log(chalk.green(`  ✓ ${browser.name} 已安装`));
    } else {
      results.push({ name: browser.name, status: 'warning', message: '未安装', fix: `运行 npx playwright install ${browser.name.toLowerCase()}` });
      console.log(chalk.yellow(`  ⚠ ${browser.name} 未安装`));
    }
  }

  // 检查 Playwright
  console.log(chalk.gray('\n检查 Playwright...'));
  try {
    const playwrightPath = path.join(process.cwd(), 'node_modules', 'playwright');
    await fs.access(playwrightPath);
    results.push({ name: 'Playwright', status: 'ok', message: '已安装 ✓' });
    console.log(chalk.green('  ✓ Playwright 已安装'));
  } catch {
    results.push({ name: 'Playwright', status: 'error', message: '未安装', fix: '运行 npm install' });
    console.log(chalk.red('  ✗ Playwright 未安装'));
  }

  // 检查 Appium（可选）
  console.log(chalk.gray('\n检查 Appium（可选，APP 测试需要）...'));
  try {
    const { stdout } = await execAsync('appium --version').catch(() => ({ stdout: '' }));
    if (stdout.trim()) {
      results.push({ name: 'Appium', status: 'ok', message: `版本 ${stdout.trim()} ✓` });
      console.log(chalk.green(`  ✓ Appium ${stdout.trim()}`));
    } else {
      throw new Error('Not installed');
    }
  } catch {
    results.push({ name: 'Appium', status: 'warning', message: '未安装（APP 测试可选）', fix: '运行 npm install -g appium' });
    console.log(chalk.yellow('  ⚠ Appium 未安装（APP 测试可选）'));
  }

  // 检查 ADB（可选）
  console.log(chalk.gray('\n检查 ADB（可选，Android 测试需要）...'));
  try {
    const { stdout } = await execAsync('adb version').catch(() => ({ stdout: '' }));
    if (stdout.includes('Android Debug Bridge')) {
      const version = stdout.split('\n')[0].split(' ')[3];
      results.push({ name: 'ADB', status: 'ok', message: `版本 ${version} ✓` });
      console.log(chalk.green(`  ✓ ADB ${version}`));
    } else {
      throw new Error('Not installed');
    }
  } catch {
    results.push({ name: 'ADB', status: 'warning', message: '未安装（Android 测试可选）', fix: '安装 Android SDK Platform Tools' });
    console.log(chalk.yellow('  ⚠ ADB 未安装（Android 测试可选）'));
  }

  // 检查 AI API Key
  console.log(chalk.gray('\n检查 AI API Key...'));
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    results.push({ name: 'Anthropic API Key', status: 'ok', message: '已配置 ✓' });
    console.log(chalk.green('  ✓ ANTHROPIC_API_KEY 已配置'));
  } else {
    results.push({ name: 'Anthropic API Key', status: 'warning', message: '未配置', fix: '在 .env 文件中设置 ANTHROPIC_API_KEY' });
    console.log(chalk.yellow('  ⚠ ANTHROPIC_API_KEY 未配置'));
  }

  if (openaiKey) {
    results.push({ name: 'OpenAI API Key', status: 'ok', message: '已配置 ✓' });
    console.log(chalk.green('  ✓ OPENAI_API_KEY 已配置'));
  } else {
    results.push({ name: 'OpenAI API Key', status: 'warning', message: '未配置', fix: '在 .env 文件中设置 OPENAI_API_KEY' });
    console.log(chalk.yellow('  ⚠ OPENAI_API_KEY 未配置'));
  }

  if (!anthropicKey && !openaiKey) {
    console.log(chalk.gray('    提示: 没有AI Key也可以运行测试，会使用规则引擎降级'));
  }

  // 检查数据目录
  console.log(chalk.gray('\n检查数据目录...'));
  const dataDirs = ['./data', './data/screenshots', './data/reports', './data/logs'];
  for (const dir of dataDirs) {
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log(chalk.green(`  ✓ ${dir}`));
    } catch {
      console.log(chalk.red(`  ✗ ${dir} 无法创建`));
    }
  }

  // 汇总结果
  console.log(chalk.gray('\n' + '═'.repeat(50)));
  console.log(chalk.bold('检查结果汇总'));
  console.log(chalk.gray('─'.repeat(50)));

  const errors = results.filter(r => r.status === 'error');
  const warnings = results.filter(r => r.status === 'warning');
  const oks = results.filter(r => r.status === 'ok');

  console.log(`${chalk.green('✓ 通过')}: ${oks.length}`);
  console.log(`${chalk.yellow('⚠ 警告')}: ${warnings.length}`);
  console.log(`${chalk.red('✗ 错误')}: ${errors.length}`);

  if (errors.length > 0) {
    console.log(chalk.red.bold('\n❌ 发现必须修复的问题:'));
    for (const error of errors) {
      console.log(chalk.red(`  • ${error.name}: ${error.message}`));
      if (error.fix) {
        console.log(chalk.gray(`    修复: ${error.fix}`));
      }
    }
  }

  if (warnings.length > 0) {
    console.log(chalk.yellow('\n⚠ 警告（可选）:'));
    for (const warning of warnings) {
      console.log(chalk.yellow(`  • ${warning.name}: ${warning.message}`));
      if (warning.fix) {
        console.log(chalk.gray(`    建议: ${warning.fix}`));
      }
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log(chalk.green.bold('\n✅ 环境检查通过，可以开始测试！'));
  } else if (errors.length === 0) {
    console.log(chalk.yellow('\n⚠️ 环境基本就绪，建议处理警告项以获得更好体验'));
  } else {
    console.log(chalk.red('\n❌ 请修复上述错误后再运行测试'));
    process.exit(1);
  }
}

/**
 * 检查浏览器安装情况
 */
async function checkBrowsers(): Promise<Array<{ name: string; installed: boolean }>> {
  const browsers = [
    { name: 'Chromium', command: 'npx playwright install chromium' },
    { name: 'Firefox', command: 'npx playwright install firefox' },
    { name: 'WebKit', command: 'npx playwright install webkit' },
  ];

  const results: Array<{ name: string; installed: boolean }> = [];

  // 检查 Playwright 浏览器
  try {
    const playwrightPath = path.join(process.cwd(), 'node_modules', 'playwright');
    const browsersPath = path.join(playwrightPath, 'browsers');

    for (const browser of browsers) {
      try {
        // 检查浏览器是否安装
        const browserCheckPath = path.join(browsersPath, browser.name.toLowerCase());
        const stat = await fs.stat(browserCheckPath).catch(() => null);
        results.push({ name: browser.name, installed: !!stat });
      } catch {
        results.push({ name: browser.name, installed: false });
      }
    }
  } catch {
    // Playwright 未安装，所有浏览器都标记为未安装
    for (const browser of browsers) {
      results.push({ name: browser.name, installed: false });
    }
  }

  return results;
}
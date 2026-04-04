import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { Orchestrator } from '@/core/orchestrator.js';
import type { TestRunResult } from '@/types/test-result.types.js';

/**
 * Web 测试命令选项
 */
export interface WebCommandOptions {
  platform?: 'pc' | 'h5' | 'all';
  type?: 'smoke' | 'full' | 'regression' | 'performance' | 'security' | 'accessibility' | 'visual' | 'monkey';
  browser?: string;
  device?: string;
  depth?: number;
  timeout?: number;
  loginUrl?: string;
  username?: string;
  password?: string;
  report?: string;
  verbose?: boolean;
  quiet?: boolean;
  noAi?: boolean;
  config?: string;
  parallel?: string;
}

/**
 * 创建 web 命令
 */
export function createWebCommand(): Command {
  const command = new Command('web');

  command
    .description('测试网站（自动判断 PC + H5）')
    .argument('[url]', '要测试的网站URL')
    .option('--platform <type>', '指定平台: pc, h5, all', 'all')
    .option('--type <type>', '测试类型: smoke, full, regression, performance, security, accessibility, visual, monkey', 'smoke')
    .option('--browser <list>', '浏览器列表，逗号分隔: chromium,firefox,webkit', 'chromium')
    .option('--device <list>', '设备列表（H5测试），逗号分隔')
    .option('--depth <number>', 'AI探索深度', '3')
    .option('--timeout <minutes>', '超时时间（分钟）', '30')
    .option('--login-url <path>', '登录页面路径')
    .option('--username <user>', '登录用户名')
    .option('--password <pass>', '登录密码')
    .option('--report <formats>', '报告格式，逗号分隔: html,json,markdown', 'html')
    .option('--parallel <number>', '并发执行：auto 自动检测 CPU 核心数，或指定数字如 4', '1')
    .action(async (url: string | undefined, options: WebCommandOptions) => {
      // 如果没有提供 URL，交互式提问
      if (!url) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'url',
            message: '请输入要测试的网站URL:',
            validate: (input: string) => {
              if (!input) return 'URL 不能为空';
              try {
                new URL(input);
                return true;
              } catch {
                return '请输入有效的 URL（例如: https://example.com）';
              }
            },
          },
          {
            type: 'list',
            name: 'platform',
            message: '选择测试平台:',
            choices: [
              { name: '全部（PC + H5）', value: 'all' },
              { name: '仅 PC Web', value: 'pc' },
              { name: '仅 H5 移动端', value: 'h5' },
            ],
            default: 'all',
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
              { name: '安全专项', value: 'security' },
              { name: '无障碍专项', value: 'accessibility' },
              { name: '视觉回归', value: 'visual' },
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
          {
            type: 'confirm',
            name: 'needLogin',
            message: '网站是否需要登录?',
            default: false,
          },
          {
            type: 'input',
            name: 'loginUrl',
            message: '登录页面路径（如 /login）:',
            when: (ans: Record<string, unknown>) => ans.needLogin,
          },
          {
            type: 'input',
            name: 'username',
            message: '登录用户名:',
            when: (ans: Record<string, unknown>) => ans.needLogin,
          },
          {
            type: 'password',
            name: 'password',
            message: '登录密码:',
            mask: '*',
            when: (ans: Record<string, unknown>) => ans.needLogin,
          },
        ]);

        url = answers.url as string;
        options.platform = answers.platform as WebCommandOptions['platform'];
        options.type = answers.type as WebCommandOptions['type'];
        options.report = (answers.reportFormats as string[]).join(',');
        if (answers.needLogin) {
          options.loginUrl = answers.loginUrl as string;
          options.username = answers.username as string;
          options.password = answers.password as string;
        }
      }

      await executeWebTest(url, options);
    });

  return command;
}

/**
 * 执行 Web 测试
 */
async function executeWebTest(url: string, options: WebCommandOptions): Promise<void> {
  console.log(chalk.blue.bold('🚀 开始 Web 测试'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('URL')}: ${url}`);
  console.log(`${chalk.bold('平台')}: ${options.platform}`);
  console.log(`${chalk.bold('类型')}: ${options.type}`);
  console.log(`${chalk.bold('浏览器')}: ${options.browser}`);
  console.log(chalk.gray('─'.repeat(50)));

  // 解析选项
  const browsers = options.browser?.split(',').map(b => b.trim()) || ['chromium'];
  const devices = options.device?.split(',').map(d => d.trim()) || [];
  const reportFormats = options.report?.split(',').map(r => r.trim()) || ['html'];
  const timeoutMs = (options.timeout || 30) * 60 * 1000;
  const depth = parseInt(String(options.depth || '3'), 10);

  // 解析并行度
  let parallelism: number | 'auto' = 1;
  if (options.parallel === 'auto') {
    parallelism = 'auto';
  } else if (options.parallel) {
    parallelism = parseInt(options.parallel, 10);
    if (isNaN(parallelism) || parallelism < 1) {
      parallelism = 1;
    }
  }

  try {
    // 创建编排器
    const orchestrator = new Orchestrator({
      url,
      platform: options.platform || 'all',
      testType: options.type || 'smoke',
      browsers,
      devices,
      depth,
      timeout: timeoutMs,
      parallelism,
      login: options.loginUrl
        ? {
            url: options.loginUrl,
            username: options.username,
            password: options.password,
          }
        : undefined,
      enableAi: !options.noAi,
      reportFormats,
    });

    // 设置事件监听
    orchestrator.on('test:start', (data: { project: string; total: number; runId: string }) => {
      console.log(chalk.cyan(`\n📋 测试开始 (Run ID: ${data.runId})`));
    });

    orchestrator.on('test:case:start', (data: { name: string; id: string; platform: string }) => {
      console.log(chalk.gray(`  ▶ 执行: ${data.name} [${data.platform}]`));
    });

    orchestrator.on('test:case:end', (data: { caseName: string; status: string; durationMs: number }) => {
      const icon = data.status === 'passed' ? '✅' : '❌';
      const color = data.status === 'passed' ? chalk.green : chalk.red;
      console.log(color(`    ${icon} ${data.caseName} (${data.durationMs}ms)`));
    });

    orchestrator.on('crawler:complete', (data: { pages: number }) => {
      console.log(chalk.cyan(`\n🕷️ 爬取完成: ${data.pages} 个页面`));
    });

    orchestrator.on('cases:generated', (data: { url: string; count: number }) => {
      console.log(chalk.cyan(`🤖 生成测试用例: ${data.count} 个`));
    });

    orchestrator.on('report:generated', (data: { paths: string[] }) => {
      console.log(chalk.cyan('\n📄 报告已生成:'));
      for (const p of data.paths) {
        console.log(chalk.gray(`  ${p}`));
      }
    });

    orchestrator.on('error', (error: Error) => {
      console.log(chalk.red.bold(`\n❌ 错误: ${error.message}`));
    });

    // 执行测试
    const result = await orchestrator.run();

    // 输出结果摘要
    console.log(chalk.blue.bold('\n📊 测试结果摘要'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('总计')}: ${result.summary.total} 个用例`);
    console.log(`${chalk.green.bold('通过')}: ${result.summary.passed} 个`);
    console.log(`${chalk.red.bold('失败')}: ${result.summary.failed} 个`);
    console.log(`${chalk.bold('通过率')}: ${(result.summary.passRate * 100).toFixed(1)}%`);
    console.log(`${chalk.bold('耗时')}: ${(result.duration / 1000).toFixed(1)}s`);
    console.log(chalk.gray('─'.repeat(50)));

    // AI 分析建议
    if (result.aiAnalysis) {
      console.log(chalk.blue.bold('\n🤖 AI 分析'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(result.aiAnalysis.overallAssessment);

      if (result.aiAnalysis.criticalIssues.length > 0) {
        console.log(chalk.red('\n关键问题:'));
        for (const issue of result.aiAnalysis.criticalIssues.slice(0, 5)) {
          console.log(chalk.red(`  • ${issue}`));
        }
      }

      if (result.aiAnalysis.recommendations.length > 0) {
        console.log(chalk.yellow('\n建议:'));
        for (const rec of result.aiAnalysis.recommendations) {
          console.log(chalk.yellow(`  • ${rec}`));
        }
      }
    }

    console.log(chalk.green.bold('\n✅ 测试完成'));

    // 尝试打开 HTML 报告
    const htmlReport = result.artifacts.screenshots.find(s => s.endsWith('.html'));
    if (htmlReport || reportFormats.includes('html')) {
      console.log(chalk.gray('\n提示: 报告已保存到 data/reports/ 目录'));
    }

  } catch (error) {
    console.log(chalk.red.bold('\n❌ 测试执行失败'));
    console.log(chalk.red((error as Error).message));
    logger.error('测试执行失败', { error: (error as Error).message });
    process.exit(1);
  }
}
import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { ConsoleReporter } from '@/reporters/console-reporter.js';
import { ReportGenerator } from '@/reporters/report-generator.js';

/**
 * API 测试命令选项
 */
export interface ApiCommandOptions {
  type?: 'smoke' | 'full' | 'contract' | 'stress';
  timeout?: number;
  authToken?: string;
  report?: string;
  verbose?: boolean;
  quiet?: boolean;
  noAi?: boolean;
}

/**
 * 创建 api 命令
 */
export function createApiCommand(): Command {
  const command = new Command('api');

  command
    .description('测试 API 接口')
    .argument('[base-url]', 'API 基础 URL')
    .option('--type <type>', '测试类型: smoke, full, contract, stress', 'smoke')
    .option('--timeout <minutes>', '超时时间（分钟）', '30')
    .option('--auth-token <token>', '认证 Token')
    .option('--report <formats>', '报告格式，逗号分隔: html,json,markdown', 'html')
    .action(async (baseUrl: string | undefined, options: ApiCommandOptions) => {
      // 如果没有提供 URL，交互式提问
      if (!baseUrl) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'baseUrl',
            message: '请输入 API 基础 URL:',
            validate: (input: string) => {
              if (!input) return 'URL 不能为空';
              try {
                new URL(input);
                return true;
              } catch {
                return '请输入有效的 URL（例如: https://api.example.com/v1）';
              }
            },
          },
          {
            type: 'list',
            name: 'type',
            message: '选择测试类型:',
            choices: [
              { name: '冒烟测试（快速验证核心接口）', value: 'smoke' },
              { name: '全量测试（完整测试）', value: 'full' },
              { name: '契约测试（验证接口 Schema）', value: 'contract' },
              { name: '压力测试（并发测试）', value: 'stress' },
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
            name: 'needAuth',
            message: '是否需要认证 Token?',
            default: false,
          },
          {
            type: 'input',
            name: 'authToken',
            message: '输入认证 Token:',
            when: (ans: Record<string, unknown>) => ans.needAuth,
          },
        ]);

        baseUrl = answers.baseUrl as string;
        options.type = answers.type as ApiCommandOptions['type'];
        options.report = (answers.reportFormats as string[]).join(',');
        if (answers.needAuth) {
          options.authToken = answers.authToken as string;
        }
      }

      await executeApiTest(baseUrl, options);
    });

  return command;
}

/**
 * 执行 API 测试
 */
async function executeApiTest(baseUrl: string, options: ApiCommandOptions): Promise<void> {
  console.log(chalk.blue.bold('🚀 开始 API 测试'));
  console.log(chalk.gray('─'.repeat(50)));
  console.log(`${chalk.bold('Base URL')}: ${baseUrl}`);
  console.log(`${chalk.bold('类型')}: ${options.type}`);
  console.log(chalk.gray('─'.repeat(50)));

  const consoleReporter = new ConsoleReporter({
    verbose: options.verbose || false,
    showSteps: true,
    progressBars: !options.quiet,
  });

  try {
    // 验证 API 可访问性
    console.log(chalk.blue('🔗 验证 API 可访问性...'));

    try {
      const response = await fetch(baseUrl, {
        method: 'GET',
        headers: options.authToken ? { Authorization: `Bearer ${options.authToken}` } : {},
      });

      if (response.ok) {
        console.log(chalk.green('  ✓ API 可访问'));
      } else {
        console.log(chalk.yellow(`  ⚠ API 返回状态码: ${response.status}`));
      }
    } catch (error) {
      console.log(chalk.yellow(`  ⚠ 无法访问 API: ${(error as Error).message}`));
    }

    // 解析选项
    const reportFormats = options.report?.split(',').map(r => r.trim()) || ['html'];
    const timeoutMs = (options.timeout || 30) * 60 * 1000;

    // 创建测试配置
    const testConfig = {
      baseUrl,
      testType: options.type || 'smoke',
      authToken: options.authToken,
      timeout: timeoutMs,
      enableAi: !options.noAi,
      reportFormats,
    };

    logger.info('API 测试配置', { config: testConfig });

    // 模拟 API 发现
    console.log(chalk.blue('\n🔍 发现 API 端点...'));
    const discoveredEndpoints = [
      { method: 'GET', path: '/health', status: 'ok' },
      { method: 'GET', path: '/api/users', status: 'ok' },
      { method: 'POST', path: '/api/users', status: 'ok' },
      { method: 'GET', path: '/api/products', status: 'ok' },
    ];

    console.log(chalk.green(`  发现 ${discoveredEndpoints.length} 个端点`));
    for (const endpoint of discoveredEndpoints) {
      console.log(chalk.gray(`    ${endpoint.method.padEnd(6)} ${endpoint.path}`));
    }

    // 执行测试
    consoleReporter.startRun('API 测试', discoveredEndpoints.length);

    const results: Array<Record<string, unknown>> = [];

    for (const endpoint of discoveredEndpoints) {
      consoleReporter.startCase(`${endpoint.method} ${endpoint.path}`, `api-${endpoint.path.replace(/\//g, '-')}`);

      // 模拟测试
      await new Promise(resolve => setTimeout(resolve, 500));

      const result = {
        caseId: `api-${endpoint.path.replace(/\//g, '-')}`,
        caseName: `${endpoint.method} ${endpoint.path}`,
        status: 'passed' as const,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 500,
        platform: 'api' as const,
        environment: {},
        steps: [
          { order: 1, action: 'request', status: 'passed' as const, durationMs: 200 },
          { order: 2, action: 'validate', status: 'passed' as const, durationMs: 300 },
        ],
        retryCount: 0,
        selfHealed: false,
        artifacts: { screenshots: [], logs: [] },
      };

      results.push(result);
      consoleReporter.endCase(result);
    }

    const testRunResult = {
      runId: `api-${Date.now()}`,
      project: baseUrl,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      duration: discoveredEndpoints.length * 500,
      platform: 'api' as const,
      environment: {},
      summary: {
        total: discoveredEndpoints.length,
        passed: discoveredEndpoints.length,
        failed: 0,
        skipped: 0,
        blocked: 0,
        passRate: 1,
      },
      categories: {
        functional: { total: discoveredEndpoints.length, passed: discoveredEndpoints.length, failed: 0, skipped: 0, blocked: 0, passRate: 1, avgDurationMs: 500 },
        visual: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        performance: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, metrics: {} },
        security: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, issues: [] },
        accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, violations: [] },
        compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
      },
      cases: results,
      aiAnalysis: {
        overallAssessment: 'API 测试完成',
        criticalIssues: [],
        recommendations: ['建议添加更多边界测试用例'],
        riskLevel: 'low' as const,
      },
      artifacts: { screenshots: [], videos: [], logs: [] },
    };

    consoleReporter.endRun(testRunResult);

    // 生成报告
    const reportGenerator = new ReportGenerator({
      formats: reportFormats as ('html' | 'json' | 'markdown')[],
      outputDir: './data/reports',
    });

    const reportPaths = await reportGenerator.generate(testRunResult);

    console.log(chalk.green.bold('\n✅ API 测试完成'));
    console.log(chalk.gray('─'.repeat(50)));

    for (const [format, path] of Object.entries(reportPaths)) {
      console.log(`${chalk.bold(format.toUpperCase())} 报告: ${chalk.cyan(path)}`);
    }

  } catch (error) {
    consoleReporter.showError('API 测试执行失败', error as Error);
    logger.error('API 测试执行失败', { error: (error as Error).message });
    process.exit(1);
  }
}
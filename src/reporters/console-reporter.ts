import chalk from 'chalk';
import cliTable3 from 'cli-table3';
import ora from 'ora';
import { logger } from '@/core/logger.js';
import type { TestRunResult, TestCaseResult } from '@/types/index.js';
import type { TestStatus } from '@/types/test-case.types.js';

/**
 * 终端报告器配置
 */
export interface ConsoleReporterConfig {
  verbose: boolean;
  showSteps: boolean;
  progressBars: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONSOLE_REPORTER_CONFIG: ConsoleReporterConfig = {
  verbose: false,
  showSteps: true,
  progressBars: true,
};

/**
 * 终端实时报告器
 * 测试执行时实时输出进度
 */
export class ConsoleReporter {
  private config: ConsoleReporterConfig;
  private spinner: ReturnType<typeof ora> | null = null;
  private currentCase: string = '';
  private totalCases: number = 0;
  private completedCases: number = 0;

  constructor(config: Partial<ConsoleReporterConfig> = {}) {
    this.config = { ...DEFAULT_CONSOLE_REPORTER_CONFIG, ...config };
  }

  /**
   * 开始测试运行
   */
  startRun(project: string, totalCases: number): void {
    this.totalCases = totalCases;
    this.completedCases = 0;

    console.log('');
    console.log(chalk.bold.cyan('🧪 测试运行开始'));
    console.log(chalk.gray('─'.repeat(50)));
    console.log(`${chalk.bold('项目')}: ${project}`);
    console.log(`${chalk.bold('用例数')}: ${totalCases}`);
    console.log(chalk.gray('─'.repeat(50)));
    console.log('');
  }

  /**
   * 开始测试用例
   */
  startCase(caseName: string, caseId: string): void {
    this.currentCase = caseName;
    this.spinner = ora({
      text: `⏳ ${caseName}`,
      spinner: 'dots',
    }).start();
  }

  /**
   * 完成测试用例
   */
  endCase(result: TestCaseResult): void {
    this.completedCases++;

    if (this.spinner) {
      this.spinner.stop();
    }

    const status = this.getStatusDisplay(result.status);
    const duration = chalk.gray(`${result.durationMs}ms`);

    console.log(`${status} ${result.caseName} ${duration}`);

    // 显示步骤
    if (this.config.showSteps && result.steps.length > 0) {
      for (const step of result.steps) {
        const stepStatus = step.status === 'passed' ? chalk.green('  ✓') : chalk.red('  ✗');
        console.log(`${stepStatus} 步骤 ${step.order}: ${step.action}`);
        if (step.errorMessage) {
          console.log(chalk.red(`    错误: ${step.errorMessage.slice(0, 100)}`));
        }
      }
    }

    // 显示截图
    if (result.artifacts.screenshots.length > 0) {
      console.log(chalk.gray(`    📷 截图: ${result.artifacts.screenshots.length} 张`));
    }

    // 进度
    if (this.config.progressBars) {
      const progress = Math.round((this.completedCases / this.totalCases) * 100);
      const bar = this.progressBar(progress, 20);
      console.log(chalk.gray(`    进度: ${bar} ${progress}% (${this.completedCases}/${this.totalCases})`));
    }

    console.log('');
  }

  /**
   * 完成测试运行
   */
  endRun(result: TestRunResult): void {
    console.log('');
    console.log(chalk.bold.cyan('📊 测试结果'));
    console.log(chalk.gray('═'.repeat(50)));

    // 汇总表格
    const table = new cliTable3({
      head: [chalk.white('指标'), chalk.white('值')],
      colWidths: [20, 30],
    });

    table.push(
      ['总用例数', result.summary.total.toString()],
      ['通过', chalk.green(result.summary.passed.toString())],
      ['失败', chalk.red(result.summary.failed.toString())],
      ['跳过', chalk.yellow(result.summary.skipped.toString())],
      ['阻塞', chalk.gray(result.summary.blocked.toString())],
      ['通过率', this.getPassRateDisplay(result.summary.passRate)],
      ['总耗时', this.formatDuration(result.duration)],
    );

    console.log(table.toString());
    console.log('');

    // AI 分析摘要
    if (result.aiAnalysis) {
      console.log(chalk.bold.cyan('🤖 AI 分析'));
      console.log(chalk.gray('─'.repeat(50)));
      console.log(`风险等级: ${this.getRiskDisplay(result.aiAnalysis.riskLevel)}`);
      console.log(`总体评价: ${result.aiAnalysis.overallAssessment}`);
      console.log('');

      if (result.aiAnalysis.criticalIssues.length > 0) {
        console.log(chalk.bold.red('关键问题:'));
        for (const issue of result.aiAnalysis.criticalIssues) {
          console.log(chalk.red(`  • ${issue}`));
        }
        console.log('');
      }

      if (result.aiAnalysis.recommendations.length > 0) {
        console.log(chalk.bold.yellow('改进建议:'));
        for (const rec of result.aiAnalysis.recommendations) {
          console.log(chalk.yellow(`  • ${rec}`));
        }
        console.log('');
      }
    }

    // 分类结果
    console.log(chalk.bold.cyan('📋 分类结果'));
    console.log(chalk.gray('─'.repeat(50)));

    const categoryTable = new cliTable3({
      head: [chalk.white('分类'), chalk.white('总数'), chalk.white('通过'), chalk.white('失败'), chalk.white('通过率')],
      colWidths: [15, 8, 8, 8, 10],
    });

    const categories = [
      { name: '功能测试', data: result.categories.functional },
      { name: '视觉测试', data: result.categories.visual },
      { name: '性能测试', data: result.categories.performance },
      { name: '安全测试', data: result.categories.security },
      { name: '无障碍测试', data: result.categories.accessibility },
      { name: '兼容性测试', data: result.categories.compatibility },
      { name: '稳定性测试', data: result.categories.stability },
    ];

    for (const cat of categories) {
      if (cat.data.total > 0) {
        categoryTable.push([
          cat.name,
          cat.data.total.toString(),
          chalk.green(cat.data.passed.toString()),
          chalk.red(cat.data.failed.toString()),
          this.getPassRateDisplay(cat.data.passRate),
        ]);
      }
    }

    console.log(categoryTable.toString());
    console.log('');

    // 最终状态
    const finalStatus = result.summary.passRate >= 0.8
      ? chalk.bold.green('✅ 测试通过')
      : result.summary.passRate >= 0.5
        ? chalk.bold.yellow('⚠️ 部分测试失败')
        : chalk.bold.red('❌ 测试失败');

    console.log(chalk.gray('═'.repeat(50)));
    console.log(finalStatus);
    console.log('');
  }

  /**
   * 显示错误
   */
  showError(message: string, error?: Error): void {
    if (this.spinner) {
      this.spinner.fail();
    }
    console.log(chalk.red(`❌ ${message}`));
    if (error) {
      console.log(chalk.red(error.message));
      if (this.config.verbose && error.stack) {
        console.log(chalk.gray(error.stack));
      }
    }
  }

  /**
   * 获取状态显示
   */
  private getStatusDisplay(status: TestStatus): string {
    switch (status) {
      case 'passed': return chalk.green('✅');
      case 'failed': return chalk.red('❌');
      case 'skipped': return chalk.yellow('⏭️');
      case 'blocked': return chalk.gray('🚫');
      case 'pending': return chalk.blue('⏳');
      default: return '❓';
    }
  }

  /**
   * 获取通过率显示
   */
  private getPassRateDisplay(rate: number): string {
    const percent = (rate * 100).toFixed(1) + '%';
    if (rate >= 0.8) return chalk.green(percent);
    if (rate >= 0.5) return chalk.yellow(percent);
    return chalk.red(percent);
  }

  /**
   * 获取风险显示
   */
  private getRiskDisplay(level: string): string {
    switch (level) {
      case 'low': return chalk.green('🟢 低风险');
      case 'medium': return chalk.yellow('🟡 中风险');
      case 'high': return chalk.hex('#f97316')('🟠 高风险');
      case 'critical': return chalk.red('🔴 严重风险');
      default: return '⚪ 未知';
    }
  }

  /**
   * 进度条
   */
  private progressBar(percent: number, width: number): string {
    // Handle edge cases
    if (!Number.isFinite(percent) || percent < 0) {
      percent = 0;
    } else if (percent > 100) {
      percent = 100;
    }

    const filled = Math.round((percent / 100) * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }
}

/**
 * 快捷函数：创建终端报告器
 */
export function createConsoleReporter(config?: Partial<ConsoleReporterConfig>): ConsoleReporter {
  return new ConsoleReporter(config);
}
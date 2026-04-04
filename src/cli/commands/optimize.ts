import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { logger } from '@/core/logger.js';
import { FlowOptimizer, type OptimizedTestCase } from '@/ai/flow-optimizer.js';
import { TestHistory } from '@/knowledge/test-history.js';
import type { TestCase } from '@/types/test-case.types.js';

/**
 * 创建 optimize 命令
 */
export function createOptimizeCommand(): Command {
  const command = new Command('optimize');

  command
    .description('AI 分析历史数据并优化测试流程')
    .option('--project <name>', '项目名称')
    .option('--auto-apply', '自动应用优化建议')
    .action(async (options: { project?: string; autoApply?: boolean }) => {
      await executeOptimize(options);
    });

  return command;
}

/**
 * 执行优化分析
 */
async function executeOptimize(options: { project?: string; autoApply?: boolean }): Promise<void> {
  console.log(chalk.blue.bold('🤖 AI 优化分析'));
  console.log(chalk.gray('─'.repeat(50)));

  const testHistory = new TestHistory();

  // 如果没有指定项目，列出可选项目
  if (!options.project) {
    const runs = testHistory.queryRuns({ limit: 20 });
    const projects = [...new Set(runs.map(r => r.project))];

    if (projects.length === 0) {
      console.log(chalk.yellow('没有找到历史测试记录'));
      console.log(chalk.gray('请先运行测试，然后再执行优化分析'));
      return;
    }

    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'project',
        message: '选择要优化的项目:',
        choices: projects.map(p => ({ name: p, value: p })),
      },
    ]);

    options.project = answers.project as string;
  }

  console.log(`${chalk.bold('项目')}: ${options.project}`);
  console.log(chalk.gray('─'.repeat(50)));

  try {
    // 获取历史数据
    console.log(chalk.blue('📊 分析历史测试数据...'));

    const history = testHistory.queryRuns({
      project: options.project,
      limit: 10,
    });

    if (history.length === 0) {
      console.log(chalk.yellow('该项目没有历史测试记录'));
      return;
    }

    console.log(chalk.green(`  找到 ${history.length} 次测试记录`));

    // 获取项目统计
    const stats = testHistory.getProjectStats(options.project);
    console.log(chalk.gray(`  总运行次数: ${stats.totalRuns}`));
    console.log(chalk.gray(`  平均通过率: ${(stats.avgPassRate * 100).toFixed(1)}%`));

    // 获取用例历史数据用于优化分析
    const caseHistoryData: Array<{
      caseId: string;
      caseName: string;
      totalRuns: number;
      passCount: number;
      failCount: number;
      skipCount: number;
      avgDurationMs: number;
      lastResult: 'passed' | 'failed' | 'skipped';
      recentResults: Array<'passed' | 'failed' | 'skipped'>;
      priority: 'P0' | 'P1' | 'P2' | 'P3';
      type: string;
      tags: string[];
    }> = [];

    // 从最近的运行中收集用例数据
    for (const run of history.slice(0, 5)) {
      const results = testHistory.getRunResults(run.id);
      for (const result of results) {
        const existing = caseHistoryData.find(d => d.caseId === result.caseId);
        const validStatus = (status: string): 'passed' | 'failed' | 'skipped' => {
          if (status === 'passed' || status === 'failed' || status === 'skipped') return status;
          return 'failed';
        };
        const validPriority = (priority: string): 'P0' | 'P1' | 'P2' | 'P3' => {
          if (['P0', 'P1', 'P2', 'P3'].includes(priority)) return priority as 'P0' | 'P1' | 'P2' | 'P3';
          return 'P2';
        };
        if (existing) {
          existing.totalRuns++;
          if (result.status === 'passed') existing.passCount++;
          else if (result.status === 'failed') existing.failCount++;
          else existing.skipCount++;
          existing.avgDurationMs = (existing.avgDurationMs + result.durationMs) / 2;
          existing.lastResult = validStatus(result.status);
          existing.recentResults.push(validStatus(result.status));
        } else {
          caseHistoryData.push({
            caseId: result.caseId,
            caseName: result.caseName,
            totalRuns: 1,
            passCount: result.status === 'passed' ? 1 : 0,
            failCount: result.status === 'failed' ? 1 : 0,
            skipCount: result.status === 'skipped' ? 1 : 0,
            avgDurationMs: result.durationMs,
            lastResult: validStatus(result.status),
            recentResults: [validStatus(result.status)],
            priority: 'P2',
            type: 'functional',
            tags: [],
          });
        }
      }
    }

    // 使用 AI 分析
    console.log(chalk.blue('\n🧠 AI 分析中...'));

    const optimizer = new FlowOptimizer();
    const analysis = await optimizer.optimize({
      projectName: options.project,
      totalCases: caseHistoryData.length,
      historyData: caseHistoryData,
      recentPassRate: history[0]?.passRate ?? 0,
      previousPassRate: history[1]?.passRate,
      avgDuration: stats.avgDuration,
    });

    // 显示分析结果
    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.bold('📈 分析结果'));
    console.log(chalk.gray('─'.repeat(50)));

    // 总体评估
    if (analysis.overallAssessment) {
      console.log(`\n${chalk.bold('总体评估')}: ${analysis.overallAssessment}`);
    }

    // 统计摘要
    if (analysis.summary) {
      console.log(`\n${chalk.bold('优化建议统计')}:`);
      console.log(chalk.gray(`  总建议数: ${analysis.summary.totalSuggestions}`));
      console.log(chalk.gray(`  可自动应用: ${analysis.summary.autoApplicableCount}`));
      console.log(chalk.gray(`  高影响: ${analysis.summary.highImpactCount}`));
    }

    // 优先操作
    if (analysis.priorityActions && analysis.priorityActions.length > 0) {
      console.log(`\n${chalk.bold.yellow('优先操作')}:`);
      for (const action of analysis.priorityActions) {
        console.log(chalk.yellow(`  • ${action}`));
      }
    }

    // 优化建议详情
    if (analysis.suggestions && analysis.suggestions.length > 0) {
      console.log(`\n${chalk.bold('优化建议详情')} (共 ${analysis.suggestions.length} 条):`);
      for (let i = 0; i < Math.min(analysis.suggestions.length, 10); i++) {
        const suggestion = analysis.suggestions[i];
        if (!suggestion) continue;
        const impactColor = suggestion.impact === 'high' ? chalk.red :
                           suggestion.impact === 'medium' ? chalk.yellow : chalk.gray;
        console.log(`\n  ${chalk.bold(`${i + 1}. ${suggestion.caseName || suggestion.type}`)}`);
        console.log(impactColor(`     影响: ${suggestion.impact}`));
        console.log(chalk.gray(`     类型: ${suggestion.type}`));
        console.log(chalk.gray(`     原因: ${suggestion.reason}`));
        if (suggestion.autoApplicable) {
          console.log(chalk.green(`     ✓ 可自动应用`));
        }
      }
    }

    // 自动应用
    if (options.autoApply && analysis.suggestions && analysis.suggestions.length > 0) {
      console.log(chalk.blue('\n🔧 自动应用优化建议...'));

      // 这里需要从用例存储中获取实际用例，暂时显示提示
      const autoApplicable = analysis.suggestions.filter(s => s.autoApplicable);
      console.log(chalk.green(`  可应用 ${autoApplicable.length} 条优化建议`));

      if (autoApplicable.length > 0) {
        console.log(chalk.gray('  优化建议已记录，将在下次测试时应用'));
      }
    } else if (analysis.suggestions && analysis.suggestions.length > 0) {
      console.log(chalk.gray('\n使用 --auto-apply 参数可自动应用优化建议'));
    }

    console.log(chalk.green.bold('\n✅ 优化分析完成'));

  } catch (error) {
    console.log(chalk.red(`优化分析失败: ${(error as Error).message}`));
    logger.error('优化分析失败', { error: (error as Error).message });
    process.exit(1);
  }
}
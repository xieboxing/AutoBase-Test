import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import type { TestRunResult, TestCaseResult } from '@/types/index.js';

/**
 * Markdown 报告配置
 */
export interface MarkdownReporterConfig {
  outputDir: string;
  language: 'zh-CN' | 'en-US';
}

/**
 * 默认配置
 */
const DEFAULT_MARKDOWN_REPORTER_CONFIG: MarkdownReporterConfig = {
  outputDir: './data/reports',
  language: 'zh-CN',
};

/**
 * Markdown 报告生成器
 * 生成中文 Markdown 格式报告
 */
export class MarkdownReporter {
  private config: MarkdownReporterConfig;

  constructor(config: Partial<MarkdownReporterConfig> = {}) {
    this.config = { ...DEFAULT_MARKDOWN_REPORTER_CONFIG, ...config };
  }

  /**
   * 生成 Markdown 报告
   */
  async generate(result: TestRunResult): Promise<string> {
    await fs.mkdir(this.config.outputDir, { recursive: true });

    const fileName = `report-${result.runId}.md`;
    const filePath = path.join(this.config.outputDir, fileName);

    const content = this.buildMarkdown(result);
    await fs.writeFile(filePath, content, 'utf-8');

    logger.pass('✅ Markdown 报告已生成', { path: filePath });
    return filePath;
  }

  /**
   * 构建 Markdown 内容
   */
  private buildMarkdown(result: TestRunResult): string {
    const lines: string[] = [];

    // 标题
    lines.push(`# 测试报告 - ${result.project}`);
    lines.push('');
    lines.push(`> 运行 ID: ${result.runId}`);
    lines.push('');

    // 测试概览
    lines.push('## 📊 测试概览');
    lines.push('');
    lines.push('| 指标 | 值 |');
    lines.push('|------|------|');
    lines.push(`| 测试时间 | ${result.startTime}|`);
    lines.push(`| 总耗时 | ${this.formatDuration(result.duration)}|`);
    lines.push(`| 总用例数 | ${result.summary.total}|`);
    lines.push(`| 通过 | ✅ ${result.summary.passed}|`);
    lines.push(`| 失败 | ❌ ${result.summary.failed}|`);
    lines.push(`| 跳过 | ⏭️ ${result.summary.skipped}|`);
    lines.push(`| 阻塞 | 🚫 ${result.summary.blocked}|`);
    lines.push(`| 通过率 | ${this.formatPercent(result.summary.passRate)}|`);
    lines.push('');

    // AI 分析摘要
    if (result.aiAnalysis) {
      lines.push('## 🤖 AI 分析');
      lines.push('');
      lines.push(`**总体评价**: ${result.aiAnalysis.overallAssessment}`);
      lines.push('');
      lines.push(`**风险等级**: ${this.getRiskEmoji(result.aiAnalysis.riskLevel)} ${result.aiAnalysis.riskLevel}`);
      lines.push('');

      if (result.aiAnalysis.criticalIssues.length > 0) {
        lines.push('### 🔴 关键问题');
        lines.push('');
        for (const issue of result.aiAnalysis.criticalIssues) {
          lines.push(`- ${issue}`);
        }
        lines.push('');
      }

      if (result.aiAnalysis.recommendations.length > 0) {
        lines.push('### 💡 改进建议');
        lines.push('');
        for (const rec of result.aiAnalysis.recommendations) {
          lines.push(`- ${rec}`);
        }
        lines.push('');
      }
    }

    // 分类结果
    lines.push('## 📋 分类结果');
    lines.push('');
    lines.push('| 分类 | 总数 | 通过 | 失败 | 通过率 |');
    lines.push('|------|------|------|------|--------|');

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
        lines.push(`| ${cat.name} | ${cat.data.total} | ${cat.data.passed} | ${cat.data.failed} | ${this.formatPercent(cat.data.passRate)} |`);
      }
    }
    lines.push('');

    // 失败用例详情
    const failedCases = result.cases.filter(c => c.status === 'failed');
    if (failedCases.length > 0) {
      lines.push('## ❌ 失败用例');
      lines.push('');

      for (const testCase of failedCases) {
        lines.push(`### ${testCase.caseName}`);
        lines.push('');
        lines.push(`- **用例 ID**: ${testCase.caseId}`);
        lines.push(`- **状态**: ${testCase.status}`);
        lines.push(`- **耗时**: ${testCase.durationMs}ms`);
        lines.push('');

        // 失败步骤
        const failedSteps = testCase.steps.filter(s => s.status === 'failed');
        if (failedSteps.length > 0) {
          lines.push('**失败步骤**:');
          lines.push('');
          for (const step of failedSteps) {
            lines.push(`- 步骤 ${step.order}: ${step.action}`);
            if (step.errorMessage) {
              lines.push(`  - 错误: \`${step.errorMessage}\``);
            }
          }
          lines.push('');
        }

        // 截图
        if (testCase.artifacts.screenshots.length > 0) {
          lines.push('**截图**:');
          lines.push('');
          for (const screenshot of testCase.artifacts.screenshots) {
            lines.push(`- ![](${screenshot})`);
          }
          lines.push('');
        }

        lines.push('---');
        lines.push('');
      }
    }

    // 环境信息
    lines.push('## 🖥️ 测试环境');
    lines.push('');
    lines.push('| 项目 | 值 |');
    lines.push('|------|------|');
    lines.push(`| 平台 | ${result.platform}|`);
    if (result.environment.browser) {
      lines.push(`| 浏览器 | ${result.environment.browser}${result.environment.browserVersion ? ` ${result.environment.browserVersion}` : ''}|`);
    }
    if (result.environment.device) {
      lines.push(`| 设备 | ${result.environment.device}|`);
    }
    if (result.environment.viewport) {
      lines.push(`| 视口 | ${result.environment.viewport.width}x${result.environment.viewport.height}|`);
    }
    lines.push('');

    // 生成信息
    lines.push('---');
    lines.push('');
    lines.push(`*报告生成时间: ${new Date().toISOString()}*`);

    return lines.join('\n');
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

  /**
   * 格式化百分比
   */
  private formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
  }

  /**
   * 获取风险等级 Emoji
   */
  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🟠';
      case 'critical': return '🔴';
      default: return '⚪';
    }
  }
}

/**
 * 快捷函数：生成 Markdown 报告
 */
export async function generateMarkdownReport(
  result: TestRunResult,
  config?: Partial<MarkdownReporterConfig>,
): Promise<string> {
  const reporter = new MarkdownReporter(config);
  return reporter.generate(result);
}
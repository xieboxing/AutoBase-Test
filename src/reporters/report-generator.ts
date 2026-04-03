import type { TestRunResult } from '@/types/index.js';
import type { ReportFormat, ReportOptions } from '@/types/report.types.js';
import { JsonReporter } from './json-reporter.js';
import { MarkdownReporter } from './markdown-reporter.js';
import { HtmlReporter } from './html-reporter.js';
import { ConsoleReporter } from './console-reporter.js';
import { DiffReporter } from './diff-reporter.js';
import { TrendReporter } from './trend-reporter.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';

/**
 * 报告生成器配置
 */
export interface ReportGeneratorConfig {
  outputDir: string;
  formats: ReportFormat[];
  language: 'zh-CN' | 'en-US';
  openOnComplete: boolean;
  embedScreenshots: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_REPORT_GENERATOR_CONFIG: ReportGeneratorConfig = {
  outputDir: './data/reports',
  formats: ['html', 'json'],
  language: 'zh-CN',
  openOnComplete: false,
  embedScreenshots: true,
};

/**
 * 报告生成结果
 */
export interface ReportGenerationResult {
  runId: string;
  files: string[];
  summary: {
    totalCases: number;
    passed: number;
    failed: number;
    passRate: number;
  };
}

/**
 * 报告生成器（主入口）
 */
export class ReportGenerator {
  private config: ReportGeneratorConfig;
  private jsonReporter: JsonReporter;
  private markdownReporter: MarkdownReporter;
  private htmlReporter: HtmlReporter;
  private consoleReporter: ConsoleReporter;
  private diffReporter: DiffReporter;

  constructor(config: Partial<ReportGeneratorConfig> = {}) {
    this.config = { ...DEFAULT_REPORT_GENERATOR_CONFIG, ...config };

    this.jsonReporter = new JsonReporter({ outputDir: this.config.outputDir });
    this.markdownReporter = new MarkdownReporter({
      outputDir: this.config.outputDir,
      language: this.config.language,
    });
    this.htmlReporter = new HtmlReporter({
      outputDir: this.config.outputDir,
      openOnComplete: this.config.openOnComplete,
      embedScreenshots: this.config.embedScreenshots,
    });
    this.consoleReporter = new ConsoleReporter();
    this.diffReporter = new DiffReporter({ reportsDir: this.config.outputDir });
  }

  /**
   * 生成报告
   */
  async generate(result: TestRunResult, options?: ReportOptions): Promise<ReportGenerationResult> {
    const files: string[] = [];
    const formats = options?.format ?? this.config.formats;

    logger.step('📄 生成测试报告', { formats: formats.join(', '), runId: result.runId });

    // 生成各类报告
    for (const format of formats) {
      try {
        const filePath = await this.generateByFormat(result, format);
        if (filePath) {
          files.push(filePath);
        }
      } catch (error) {
        logger.fail(`❌ 生成 ${format} 报告失败`, { error });
      }
    }

    // 输出终端报告
    this.consoleReporter.endRun(result);

    logger.pass('✅ 报告生成完成', { files: files.length });

    return {
      runId: result.runId,
      files,
      summary: {
        totalCases: result.summary.total,
        passed: result.summary.passed,
        failed: result.summary.failed,
        passRate: result.summary.passRate,
      },
    };
  }

  /**
   * 按格式生成报告
   */
  private async generateByFormat(result: TestRunResult, format: ReportFormat): Promise<string | null> {
    switch (format) {
      case 'json':
        return this.jsonReporter.generate(result);

      case 'markdown':
        return this.markdownReporter.generate(result);

      case 'html':
        return this.htmlReporter.generate(result);

      case 'console':
        // Console report is handled separately
        return null;

      default:
        logger.warn(`⚠️ 不支持的报告格式: ${format}`);
        return null;
    }
  }

  /**
   * 生成对比报告
   */
  async generateDiff(current: TestRunResult): Promise<string | null> {
    const diff = await this.diffReporter.compareWithLast(current);
    if (!diff) return null;

    return this.diffReporter.generateMarkdown(diff);
  }

  /**
   * 生成趋势报告
   */
  generateTrend(project: string, days: number = 10): string {
    const trendReporter = new TrendReporter(undefined, { days });
    const report = trendReporter.generateReport(project);
    return trendReporter.generateMarkdown(report);
  }

  /**
   * 获取报告列表
   */
  async listReports(): Promise<Array<{
    fileName: string;
    runId: string;
    project: string;
    startTime: string;
    passRate: number;
    totalCases: number;
  }>> {
    return this.jsonReporter.listWithSummary();
  }

  /**
   * 获取最新报告
   */
  async getLatestReport(): Promise<TestRunResult | null> {
    return this.jsonReporter.getLatest();
  }

  /**
   * 打开报告
   */
  async openReport(filePath: string): Promise<void> {
    const { default: open } = await import('open');
    await open(filePath);
  }

  /**
   * 清理旧报告
   */
  async cleanup(maxReports: number = 50): Promise<number> {
    return this.jsonReporter.cleanup(maxReports);
  }

  /**
   * 快速生成报告（便捷方法）
   */
  static async quickGenerate(
    result: TestRunResult,
    formats: ReportFormat[] = ['html', 'json'],
  ): Promise<ReportGenerationResult> {
    const generator = new ReportGenerator({ formats });
    return generator.generate(result);
  }
}

/**
 * 快捷函数：生成报告
 */
export async function generateReport(
  result: TestRunResult,
  config?: Partial<ReportGeneratorConfig>,
): Promise<ReportGenerationResult> {
  const generator = new ReportGenerator(config);
  return generator.generate(result);
}
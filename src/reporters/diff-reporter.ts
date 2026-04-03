import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import type { TestRunResult } from '@/types/index.js';
import type { ReportDiff } from '@/types/report.types.js';
import { JsonReporter } from './json-reporter.js';

/**
 * 对比报告配置
 */
export interface DiffReporterConfig {
  reportsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_DIFF_REPORTER_CONFIG: DiffReporterConfig = {
  reportsDir: './data/reports',
};

/**
 * 对比报告生成器
 * 对比两次测试结果
 */
export class DiffReporter {
  private config: DiffReporterConfig;
  private jsonReporter: JsonReporter;

  constructor(config: Partial<DiffReporterConfig> = {}) {
    this.config = { ...DEFAULT_DIFF_REPORTER_CONFIG, ...config };
    this.jsonReporter = new JsonReporter({ outputDir: this.config.reportsDir });
  }

  /**
   * 对比两次测试结果
   */
  async compare(current: TestRunResult, previous: TestRunResult): Promise<ReportDiff> {
    const currentCaseIds = new Set(current.cases.map(c => c.caseId));
    const previousCaseIds = new Set(previous.cases.map(c => c.caseId));

    const currentFailed = new Set(
      current.cases.filter(c => c.status === 'failed').map(c => c.caseId)
    );
    const previousFailed = new Set(
      previous.cases.filter(c => c.status === 'failed').map(c => c.caseId)
    );

    // 新增的失败
    const newFailures: string[] = [];
    for (const caseId of currentFailed) {
      if (!previousFailed.has(caseId)) {
        const testCase = current.cases.find(c => c.caseId === caseId);
        newFailures.push(`${testCase?.caseName || caseId}`);
      }
    }

    // 修复的问题
    const fixedIssues: string[] = [];
    for (const caseId of previousFailed) {
      if (!currentFailed.has(caseId)) {
        const testCase = previous.cases.find(c => c.caseId === caseId);
        fixedIssues.push(`${testCase?.caseName || caseId}`);
      }
    }

    // 持续存在的问题
    const persistentIssues: string[] = [];
    for (const caseId of currentFailed) {
      if (previousFailed.has(caseId)) {
        const testCase = current.cases.find(c => c.caseId === caseId);
        persistentIssues.push(`${testCase?.caseName || caseId}`);
      }
    }

    const passRateChange = current.summary.passRate - previous.summary.passRate;
    const durationChange = current.duration - previous.duration;

    return {
      current: {
        runId: current.runId,
        project: current.project,
        startTime: current.startTime,
        endTime: current.endTime,
        duration: current.duration,
        passRate: current.summary.passRate,
        totalCases: current.summary.total,
        passedCases: current.summary.passed,
        failedCases: current.summary.failed,
        riskLevel: current.aiAnalysis?.riskLevel || 'low',
      },
      previous: {
        runId: previous.runId,
        project: previous.project,
        startTime: previous.startTime,
        endTime: previous.endTime,
        duration: previous.duration,
        passRate: previous.summary.passRate,
        totalCases: previous.summary.total,
        passedCases: previous.summary.passed,
        failedCases: previous.summary.failed,
        riskLevel: previous.aiAnalysis?.riskLevel || 'low',
      },
      changes: {
        newFailures,
        fixedIssues,
        persistentIssues,
        passRateChange,
        durationChange,
      },
    };
  }

  /**
   * 对比当前结果与上一次运行
   */
  async compareWithLast(current: TestRunResult): Promise<ReportDiff | null> {
    const reports = await this.jsonReporter.list();
    if (reports.length < 2) {
      logger.warn('⚠️ 没有足够的历史报告进行对比');
      return null;
    }

    // 找到同项目的上一次报告
    for (const fileName of reports) {
      const filePath = path.join(this.config.reportsDir, fileName);
      const previous = await this.jsonReporter.read(filePath);

      if (previous && previous.runId !== current.runId && previous.project === current.project) {
        return this.compare(current, previous);
      }
    }

    logger.warn('⚠️ 没有找到同项目的历史报告');
    return null;
  }

  /**
   * 按运行 ID 对比
   */
  async compareByIds(currentRunId: string, previousRunId: string): Promise<ReportDiff | null> {
    const currentPath = path.join(this.config.reportsDir, `report-${currentRunId}.json`);
    const previousPath = path.join(this.config.reportsDir, `report-${previousRunId}.json`);

    const current = await this.jsonReporter.read(currentPath);
    const previous = await this.jsonReporter.read(previousPath);

    if (!current || !previous) {
      logger.fail('❌ 无法读取报告文件');
      return null;
    }

    return this.compare(current, previous);
  }

  /**
   * 生成对比报告 Markdown
   */
  generateMarkdown(diff: ReportDiff): string {
    const lines: string[] = [];

    lines.push('# 测试对比报告');
    lines.push('');

    // 对比概览
    lines.push('## 📊 对比概览');
    lines.push('');
    lines.push('| 指标 | 当前运行 | 上次运行 | 变化 |');
    lines.push('|------|----------|----------|------|');
    lines.push(`| 通过率 | ${(diff.current.passRate * 100).toFixed(1)}% | ${(diff.previous.passRate * 100).toFixed(1)}% | ${this.formatChange(diff.changes.passRateChange, true)}|`);
    lines.push(`| 总用例数 | ${diff.current.totalCases} | ${diff.previous.totalCases} | ${diff.current.totalCases - diff.previous.totalCases}|`);
    lines.push(`| 失败用例 | ${diff.current.failedCases} | ${diff.previous.failedCases} | ${diff.current.failedCases - diff.previous.failedCases}|`);
    lines.push(`| 耗时 | ${this.formatDuration(diff.current.duration)} | ${this.formatDuration(diff.previous.duration)} | ${this.formatDurationChange(diff.changes.durationChange)}|`);
    lines.push('');

    // 变化摘要
    lines.push('## 📈 变化摘要');
    lines.push('');

    if (diff.changes.fixedIssues.length > 0) {
      lines.push(`### ✅ 修复的问题 (${diff.changes.fixedIssues.length})`);
      lines.push('');
      for (const issue of diff.changes.fixedIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    if (diff.changes.newFailures.length > 0) {
      lines.push(`### ❌ 新增的失败 (${diff.changes.newFailures.length})`);
      lines.push('');
      for (const failure of diff.changes.newFailures) {
        lines.push(`- ${failure}`);
      }
      lines.push('');
    }

    if (diff.changes.persistentIssues.length > 0) {
      lines.push(`### ⚠️ 持续存在的问题 (${diff.changes.persistentIssues.length})`);
      lines.push('');
      for (const issue of diff.changes.persistentIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    // 结论
    lines.push('## 🎯 结论');
    lines.push('');

    if (diff.changes.passRateChange > 0) {
      lines.push(`✅ 测试质量有所提升，通过率提高了 ${(diff.changes.passRateChange * 100).toFixed(1)}%`);
    } else if (diff.changes.passRateChange < 0) {
      lines.push(`❌ 测试质量有所下降，通过率降低了 ${(Math.abs(diff.changes.passRateChange) * 100).toFixed(1)}%`);
    } else {
      lines.push(`➡️ 测试质量保持稳定`);
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * 格式化变化
   */
  private formatChange(value: number, isPercent: boolean = false): string {
    const prefix = value > 0 ? '+' : '';
    if (isPercent) {
      return `${prefix}${(value * 100).toFixed(1)}%`;
    }
    return `${prefix}${value}`;
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
   * 格式化持续时间变化
   */
  private formatDurationChange(ms: number): string {
    const prefix = ms > 0 ? '+' : '';
    return `${prefix}${this.formatDuration(Math.abs(ms))}`;
  }
}

/**
 * 快捷函数：创建对比报告器
 */
export function createDiffReporter(config?: Partial<DiffReporterConfig>): DiffReporter {
  return new DiffReporter(config);
}
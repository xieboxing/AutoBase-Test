import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import type { TrendDataPoint, TrendReport } from '@/types/report.types.js';
import { getDatabase, type KnowledgeDatabase } from '@/knowledge/db/index.js';
import { JsonReporter } from './json-reporter.js';

/**
 * 趋势报告配置
 */
export interface TrendReporterConfig {
  days: number;
}

/**
 * 默认配置
 */
const DEFAULT_TREND_REPORTER_CONFIG: TrendReporterConfig = {
  days: 10,
};

/**
 * 趋势报告生成器
 * 分析多次测试的趋势
 */
export class TrendReporter {
  private config: TrendReporterConfig;
  private db: KnowledgeDatabase;

  constructor(db?: KnowledgeDatabase, config: Partial<TrendReporterConfig> = {}) {
    this.config = { ...DEFAULT_TREND_REPORTER_CONFIG, ...config };
    this.db = db ?? getDatabase();
  }

  /**
   * 获取项目趋势数据
   */
  getTrendData(project: string, days?: number): TrendDataPoint[] {
    const queryDays = days ?? this.config.days;

    const rows = this.db.query<{
      run_id: string;
      date: string;
      pass_rate: number;
      total_cases: number;
      failed_cases: number;
      avg_duration: number;
    }>(`
      SELECT
        id as run_id,
        date(start_time) as date,
        pass_rate,
        total_cases,
        failed,
        duration_ms as avg_duration
      FROM test_runs
      WHERE project = ? AND start_time > datetime('now', '-${queryDays} days')
      ORDER BY start_time ASC
    `, [project]);

    return rows.map(row => ({
      runId: row.run_id,
      date: row.date,
      passRate: row.pass_rate,
      totalCases: row.total_cases,
      failedCases: row.failed_cases,
      avgDuration: row.avg_duration,
    }));
  }

  /**
   * 生成趋势报告
   */
  generateReport(project: string, days?: number): TrendReport {
    const dataPoints = this.getTrendData(project, days);

    const analysis = this.analyzeTrend(dataPoints);

    const periodStart = dataPoints.length > 0 ? dataPoints[0]!.date : new Date().toISOString();
    const periodEnd = dataPoints.length > 0 ? dataPoints[dataPoints.length - 1]!.date : new Date().toISOString();

    return {
      project,
      period: {
        start: periodStart,
        end: periodEnd,
      },
      dataPoints,
      analysis,
    };
  }

  /**
   * 分析趋势
   */
  private analyzeTrend(dataPoints: TrendDataPoint[]): TrendReport['analysis'] {
    if (dataPoints.length === 0) {
      return {
        overallTrend: 'stable',
        avgPassRate: 0,
        avgDuration: 0,
        commonIssues: [],
      };
    }

    // 计算平均通过率
    const avgPassRate = dataPoints.reduce((sum, d) => sum + d.passRate, 0) / dataPoints.length;

    // 计算平均耗时
    const avgDuration = dataPoints.reduce((sum, d) => sum + d.avgDuration, 0) / dataPoints.length;

    // 判断趋势
    let overallTrend: 'improving' | 'stable' | 'declining' = 'stable';

    if (dataPoints.length >= 3) {
      const firstHalf = dataPoints.slice(0, Math.floor(dataPoints.length / 2));
      const secondHalf = dataPoints.slice(Math.floor(dataPoints.length / 2));

      const firstAvg = firstHalf.reduce((sum, d) => sum + d.passRate, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, d) => sum + d.passRate, 0) / secondHalf.length;

      const change = secondAvg - firstAvg;

      if (change > 0.05) {
        overallTrend = 'improving';
      } else if (change < -0.05) {
        overallTrend = 'declining';
      }
    }

    // 常见问题（从失败用例中提取）
    const commonIssues: string[] = [];

    // 如果有数据库连接，查询失败模式
    try {
      const failurePatterns = this.db.query<{
        description: string;
        frequency: number;
      }>(`
        SELECT description, frequency
        FROM failure_patterns
        ORDER BY frequency DESC
        LIMIT 5
      `);

      for (const pattern of failurePatterns) {
        commonIssues.push(pattern.description);
      }
    } catch {
      // 数据库可能没有数据
    }

    return {
      overallTrend,
      avgPassRate,
      avgDuration,
      commonIssues,
    };
  }

  /**
   * 生成趋势报告 Markdown
   */
  generateMarkdown(report: TrendReport): string {
    const lines: string[] = [];

    lines.push(`# 测试趋势报告 - ${report.project}`);
    lines.push('');
    lines.push(`**时间范围**: ${report.period.start} 至 ${report.period.end}`);
    lines.push('');

    // 趋势分析
    lines.push('## 📈 趋势分析');
    lines.push('');

    const trendEmoji = report.analysis.overallTrend === 'improving' ? '📈'
      : report.analysis.overallTrend === 'declining' ? '📉'
        : '➡️';

    lines.push(`**整体趋势**: ${trendEmoji} ${report.analysis.overallTrend === 'improving' ? '逐步改善' : report.analysis.overallTrend === 'declining' ? '有所下降' : '保持稳定'}`);
    lines.push('');
    lines.push(`- 平均通过率: ${(report.analysis.avgPassRate * 100).toFixed(1)}%`);
    lines.push(`- 平均耗时: ${this.formatDuration(report.analysis.avgDuration)}`);
    lines.push('');

    // 数据点表格
    if (report.dataPoints.length > 0) {
      lines.push('## 📊 运行历史');
      lines.push('');
      lines.push('| 日期 | 运行 ID | 用例数 | 通过率 | 失败数 |');
      lines.push('|------|---------|--------|--------|--------|');

      for (const point of report.dataPoints) {
        const passRateDisplay = (point.passRate * 100).toFixed(1) + '%';
        lines.push(`| ${point.date} | ${point.runId} | ${point.totalCases} | ${passRateDisplay} | ${point.failedCases} |`);
      }
      lines.push('');
    }

    // 常见问题
    if (report.analysis.commonIssues.length > 0) {
      lines.push('## ⚠️ 常见问题');
      lines.push('');
      for (const issue of report.analysis.commonIssues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }

    // 建议
    lines.push('## 💡 建议');
    lines.push('');

    if (report.analysis.overallTrend === 'improving') {
      lines.push('✅ 测试质量正在稳步提升，继续保持当前的测试策略。');
    } else if (report.analysis.overallTrend === 'declining') {
      lines.push('❌ 测试质量有所下降，建议关注以下方面：');
      lines.push('');
      lines.push('1. 检查最近的代码变更是否引入了回归问题');
      lines.push('2. 增加对新功能的测试覆盖');
      lines.push('3. 修复已知的稳定性问题');
    } else {
      lines.push('➡️ 测试质量保持稳定，可以考虑：');
      lines.push('');
      lines.push('1. 增加测试覆盖范围');
      lines.push('2. 优化测试执行效率');
      lines.push('3. 关注持续存在的问题');
    }

    lines.push('');

    return lines.join('\n');
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * 分析报告目录中的趋势
   */
  async analyze(reportDir: string, lastN: number): Promise<{
    passRates: TrendDataPoint[];
    issueCounts: TrendDataPoint[];
    summary: {
      avgPassRate: number;
      maxPassRate: number;
      minPassRate: number;
    };
  }> {
    const jsonReporter = new JsonReporter({ outputDir: reportDir });
    const reports = await jsonReporter.list();
    const recentReports = reports.slice(0, lastN);

    const passRates: TrendDataPoint[] = [];
    const issueCounts: TrendDataPoint[] = [];

    for (const fileName of recentReports) {
      const filePath = path.join(reportDir, fileName);
      const result = await jsonReporter.read(filePath);

      if (result) {
        passRates.push({
          runId: result.runId,
          date: result.startTime,
          passRate: result.summary.passRate,
          totalCases: result.summary.total,
          failedCases: result.summary.failed,
          avgDuration: result.duration,
        });

        issueCounts.push({
          runId: result.runId,
          date: result.startTime,
          passRate: result.summary.passRate,
          totalCases: result.summary.total,
          failedCases: result.summary.failed,
          avgDuration: result.duration,
        });
      }
    }

    const passRateValues = passRates.map(p => p.passRate);
    const avgPassRate = passRateValues.length > 0
      ? passRateValues.reduce((sum, r) => sum + r, 0) / passRateValues.length
      : 0;
    const maxPassRate = passRateValues.length > 0 ? Math.max(...passRateValues) : 0;
    const minPassRate = passRateValues.length > 0 ? Math.min(...passRateValues) : 0;

    return {
      passRates,
      issueCounts,
      summary: {
        avgPassRate,
        maxPassRate,
        minPassRate,
      },
    };
  }
}

/**
 * 快捷函数：创建趋势报告器
 */
export function createTrendReporter(db?: KnowledgeDatabase, config?: Partial<TrendReporterConfig>): TrendReporter {
  return new TrendReporter(db, config);
}
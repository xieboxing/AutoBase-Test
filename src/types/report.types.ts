/**
 * 报告格式
 */
export type ReportFormat = 'html' | 'json' | 'markdown' | 'console';

/**
 * 报告配置
 */
export interface ReportConfig {
  formats: ReportFormat[];
  outputDir: string;
  language: 'zh-CN' | 'en-US';
  includeScreenshots: boolean;
  includeVideos: boolean;
  openOnComplete: boolean;
}

/**
 * 报告生成选项
 */
export interface ReportOptions {
  runId: string;
  project?: string;
  format?: ReportFormat[];
  outputDir?: string;
  compareWith?: string;
}

/**
 * 报告摘要
 */
export interface ReportSummary {
  runId: string;
  project: string;
  startTime: string;
  endTime: string;
  duration: number;
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * 报告对比结果
 */
export interface ReportDiff {
  current: ReportSummary;
  previous: ReportSummary;
  changes: {
    newFailures: string[];
    fixedIssues: string[];
    persistentIssues: string[];
    passRateChange: number;
    durationChange: number;
  };
}

/**
 * 趋势数据点
 */
export interface TrendDataPoint {
  runId: string;
  date: string;
  passRate: number;
  totalCases: number;
  failedCases: number;
  avgDuration: number;
}

/**
 * 趋势报告
 */
export interface TrendReport {
  project: string;
  period: {
    start: string;
    end: string;
  };
  dataPoints: TrendDataPoint[];
  analysis: {
    overallTrend: 'improving' | 'stable' | 'declining';
    avgPassRate: number;
    avgDuration: number;
    commonIssues: string[];
  };
}
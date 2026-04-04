/**
 * 知识库相关类型定义
 */

import type { TestStatus, Platform, TestCasePriority } from './test-case.types.js';

/**
 * 用例历史统计
 */
export interface CaseStatistics {
  caseId: string;
  caseName?: string;
  projectId: string;
  platform: Platform;
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  passRate: number;
  failRate: number;
  consecutivePasses: number;
  consecutiveFailures: number;
  stabilityScore: number;
  isStable: boolean;
  lastRunTime: string | null;
  lastResult: TestStatus | null;
  avgDurationMs: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 历史上下文（用于测试生成和执行）
 */
export interface HistoricalContext {
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 上次通过的用例列表 */
  previousPassedCases: Array<{
    caseId: string;
    caseName: string;
    passRate: number;
    lastRunTime?: string;
  }>;
  /** 上次失败的用例及原因 */
  previousFailedCases: Array<{
    caseId: string;
    caseName: string;
    errorMessage: string;
    failureType: string;
    failureReason?: string;
    urlPattern?: string;
    failedStep?: {
      order: number;
      action: string;
      target?: string;
      description?: string;
    };
  }>;
  /** 用例统计数据 */
  caseStatistics: CaseStatistics[];
  /** 覆盖薄弱区域 */
  uncoveredFeatures: Array<{
    featureName: string;
    featureArea?: string;
    urlPattern?: string;
    coverage: number;
    coverageRate?: number;
    importance: 'high' | 'medium' | 'low';
  }>;
  /** 覆盖薄弱区域（别名，用于兼容） */
  weakCoverageAreas: Array<{
    urlPattern: string;
    featureArea: string;
    coverageRate: number;
  }>;
  /** 历史失败模式摘要 */
  failurePatterns: Array<{
    patternType: string;
    patternKey: string;
    description?: string;
    frequency: number;
    lastOccurrence: string;
  }>;
  /** 稳定用例列表 */
  stableCases: Array<{
    caseId: string;
    caseName?: string;
    consecutivePasses: number;
    passRate: number;
  }>;
  /** 高风险用例列表 */
  highRiskCases: Array<{
    caseId: string;
    caseName?: string;
    riskScore: number;
    reason: string;
  }>;
  /** 优化建议 */
  optimizationSuggestions: Array<{
    suggestionType: string;
    caseId?: string;
    suggestion: string;
    reason?: string;
    confidence: number;
    autoApplicable: boolean;
    applied?: boolean;
    suggestionValue?: string;
  }>;
  /** 加载时间 */
  loadedAt: string;
}

/**
 * 失败模式匹配结果
 */
export interface FailurePatternMatch {
  patternId: string;
  patternType: FailurePatternType;
  patternKey: string;
  description: string;
  frequency: number;
  confidence: number;
  autoFixConfig: AutoFixConfig | null;
  rootCause: string | null;
  solution: string | null;
}

/**
 * 失败模式类型
 */
export type FailurePatternType =
  | 'element_not_found'
  | 'timeout'
  | 'assertion_failed'
  | 'navigation_error'
  | 'network_error'
  | 'js_error'
  | 'crash'
  | 'permission_denied'
  | 'unexpected_popup'
  | 'state_mismatch';

/**
 * 自动修复配置
 */
export interface AutoFixConfig {
  /** 修复类型 */
  fixType: 'increase-timeout' | 'add-wait' | 'retry' | 'update-selector' | 'skip' | 'custom';
  /** 修复参数 */
  fixValue?: number | string;
  /** 修复步骤 */
  fixSteps?: string[];
  /** 最大重试次数 */
  maxRetries?: number;
  /** 是否需要人工确认 */
  requireManualConfirm?: boolean;
}

/**
 * 自动修复结果
 */
export interface AutoFixResult {
  success: boolean;
  patternId: string;
  fixType: string;
  appliedFix: string;
  retryCount: number;
  newSelector?: string;
  newTimeout?: number;
  errorMessage?: string;
  fixedAt: string;
}

/**
 * 元素映射记录
 */
export interface ElementMappingRecord {
  id: string;
  projectId: string;
  platform: Platform;
  pageUrl: string;
  pageName?: string;
  elementName?: string;
  elementDescription?: string;
  originalSelector: string;
  alternativeSelectors: string[];
  lastWorkingSelector: string;
  selectorType: 'css' | 'xpath' | 'accessibility-id' | 'id' | 'text';
  successCount: number;
  failureCount: number;
  successRate: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  aiSuggested: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * 优化建议记录
 */
export interface OptimizationSuggestionRecord {
  id: string;
  projectId: string;
  platform: Platform | null;
  caseId: string | null;
  suggestionType: OptimizationType;
  suggestionValue: string | number;
  reason: string;
  confidence: number;
  autoApplicable: boolean;
  applied: boolean;
  appliedAt: string | null;
  effectivenessScore: number | null;
  createdAt: string;
}

/**
 * 优化类型
 */
export type OptimizationType =
  | 'increase-timeout'
  | 'decrease-timeout'
  | 'add-wait'
  | 'remove-wait'
  | 'add-retry'
  | 'update-selector'
  | 'skip-case'
  | 'reduce-frequency'
  | 'merge-cases'
  | 'split-case';

/**
 * 知识库查询选项
 */
export interface KnowledgeQueryOptions {
  projectId?: string;
  platform?: Platform;
  caseId?: string;
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  minPassRate?: number;
  maxPassRate?: number;
  stabilityThreshold?: number;
}

/**
 * 知识库统计摘要
 */
export interface KnowledgeStats {
  totalRuns: number;
  totalCases: number;
  totalPatterns: number;
  totalMappings: number;
  avgPassRate: number;
  stableCaseCount: number;
  highRiskCaseCount: number;
  uncoveredFeatureCount: number;
  byPlatform: Record<Platform, {
    runs: number;
    cases: number;
    avgPassRate: number;
  }>;
}
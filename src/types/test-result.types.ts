import type { TestStatus, Platform } from './test-case.types.js';
import type { VisualRegressionTestResult } from './visual.types.js';

/**
 * RAG 记忆使用记录
 */
export interface RagMemoryUsage {
  memoryId: string;
  memoryType: string;
  similarity: number;
  summary: string;
  wasHelpful?: boolean;
}

/**
 * 单个测试步骤结果
 */
export interface TestStepResult {
  order: number;
  action: string;
  target?: string;
  status: TestStatus;
  durationMs: number;
  errorMessage?: string;
  errorStack?: string;
  screenshot?: string;
  timestamp?: string;
}

/**
 * 创建测试步骤结果
 */
export function createTestStepResult(options: {
  order: number;
  action: string;
  status: TestStatus;
  durationMs: number;
  target?: string;
  errorMessage?: string;
  screenshot?: string;
}): TestStepResult {
  return {
    order: options.order,
    action: options.action,
    status: options.status,
    durationMs: options.durationMs,
    target: options.target,
    errorMessage: options.errorMessage,
    screenshot: options.screenshot,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 单个测试用例结果
 */
export interface TestCaseResult {
  caseId: string;
  caseName: string;
  status: TestStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  platform: Platform;
  environment: TestEnvironment;
  steps: TestStepResult[];
  retryCount: number;
  selfHealed: boolean;
  selfHealSelector?: string;
  aiAnalysis?: string;
  /** RAG 记忆使用记录（用于可解释性） */
  ragMemoryUsed?: RagMemoryUsage[];
  /** 失败模式匹配信息 */
  matchedPattern?: {
    patternId: string;
    patternType: string;
    autoFixApplied: boolean;
  };
  /** 视觉回归测试结果 */
  visualRegression?: VisualRegressionTestResult;
  artifacts: {
    screenshots: string[];
    video?: string;
    logs: string[];
  };
}

/**
 * 测试环境信息
 */
export interface TestEnvironment {
  browser?: string;
  browserVersion?: string;
  device?: string;
  os?: string;
  osVersion?: string;
  viewport?: {
    width: number;
    height: number;
  };
  network?: {
    online: boolean;
    type?: 'wifi' | '3g' | '4g' | 'offline';
  };
}

/**
 * 分类测试结果摘要
 */
export interface CategoryResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  avgDurationMs: number;
}

/**
 * 性能测试结果
 */
export interface PerformanceResult extends CategoryResult {
  metrics: {
    performanceScore?: number;
    lcp?: number;
    fid?: number;
    inp?: number;
    cls?: number;
    fcp?: number;
    tti?: number;
    tbt?: number;
    speedIndex?: number;
  };
}

/**
 * 安全测试结果
 */
export interface SecurityResult extends CategoryResult {
  issues: SecurityIssue[];
}

/**
 * 安全问题
 */
export interface SecurityIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  recommendation?: string;
}

/**
 * 无障碍测试结果
 */
export interface AccessibilityResult extends CategoryResult {
  violations: AccessibilityViolation[];
}

/**
 * 无障碍违规项
 */
export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: string[];
}

/**
 * 创建空的分类结果
 */
export function createEmptyCategoryResult(): CategoryResult {
  return {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    blocked: 0,
    passRate: 0,
    avgDurationMs: 0,
  };
}

/**
 * 创建空的性能测试结果
 */
export function createEmptyPerformanceResult(): PerformanceResult {
  return {
    ...createEmptyCategoryResult(),
    metrics: {},
  };
}

/**
 * 创建空的安全测试结果
 */
export function createEmptySecurityResult(): SecurityResult {
  return {
    ...createEmptyCategoryResult(),
    issues: [],
  };
}

/**
 * 创建空的无障碍测试结果
 */
export function createEmptyAccessibilityResult(): AccessibilityResult {
  return {
    ...createEmptyCategoryResult(),
    violations: [],
  };
}

/**
 * 创建空的测试运行分类结果
 */
export function createEmptyCategories(): TestRunResult['categories'] {
  return {
    functional: createEmptyCategoryResult(),
    visual: createEmptyCategoryResult(),
    performance: createEmptyPerformanceResult(),
    security: createEmptySecurityResult(),
    accessibility: createEmptyAccessibilityResult(),
    compatibility: createEmptyCategoryResult(),
    stability: createEmptyCategoryResult(),
  };
}

/**
 * 测试运行结果
 */
export interface TestRunResult {
  runId: string;
  project: string;
  startTime: string;
  endTime: string;
  duration: number;
  platform: Platform;
  environment: TestEnvironment;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;
  };
  categories: {
    functional: CategoryResult;
    visual: CategoryResult;
    performance: PerformanceResult;
    security: SecurityResult;
    accessibility: AccessibilityResult;
    compatibility: CategoryResult;
    stability: CategoryResult;
  };
  cases: TestCaseResult[];
  aiAnalysis: {
    overallAssessment: string;
    criticalIssues: string[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  /** 历史知识加载与策略 */
  historicalContext?: {
    loaded: boolean;
    passedCasesCount: number;
    failedCasesCount: number;
    stableCasesCount: number;
    highRiskCasesCount: number;
    strategyApplied: string;
  };
  /** 智能调度结果 */
  schedulingResult?: {
    scheduledCount: number;
    skippedCount: number;
    highRiskCount: number;
    strategy: string;
    skippedCases: Array<{ caseId: string; caseName: string; reason: string }>;
  };
  /** 失败模式与自动修复 */
  autoFixSummary?: {
    totalAttempts: number;
    successCount: number;
    failureCount: number;
    patternsMatched: Array<{ patternId: string; patternType: string; count: number }>;
  };
  /** RAG 记忆统计（可解释性） */
  ragMemoryStats?: {
    totalMemoriesUsed: number;
    byType: Record<string, number>;
    avgSimilarity: number;
    topMemories: Array<{
      memoryId: string;
      memoryType: string;
      summary: string;
      usageCount: number;
    }>;
  };
  /** 状态图谱摘要 */
  stateGraphSummary?: {
    totalStates: number;
    newStatesDiscovered: number;
    totalTransitions: number;
    coveragePercent: number;
  };
  /** 业务流测试摘要 */
  businessFlowSummary?: {
    totalFlowsDetected: number;
    flowsTested: number;
    flowsPassed: number;
    flowsFailed: number;
  };
  /** 并发执行统计 */
  parallelExecutionStats?: {
    enabled: boolean;
    workerCount: number;
    totalDurationMs: number;
    serialEstimatedMs: number;
    efficiencyPercent: number;
  };
  artifacts: {
    screenshots: string[];
    videos: string[];
    logs: string[];
  };
}
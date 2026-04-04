/**
 * 调度器相关类型定义
 */

import type { TestCase, TestCasePriority, TestType } from './test-case.types.js';
import type { CaseStatistics } from './knowledge.types.js';

/**
 * 调度选项
 */
export interface ScheduleOptions {
  /** 测试类型 */
  testType: TestType;
  /** 最大用例数 */
  maxCases?: number;
  /** 并行度 */
  parallelism?: number;
  /** 是否启用降频 */
  enableSkipStable?: boolean;
  /** 稳定用例阈值（连续通过次数） */
  stableThreshold?: number;
  /** 最大跳过比例 */
  maxSkipRatio?: number;
  /** 是否优先高失败率用例 */
  prioritizeHighRisk?: boolean;
  /** 是否包含新用例 */
  includeNewCases?: boolean;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: string;
}

/**
 * 调度结果
 */
export interface ScheduleResult {
  /** 调度后的用例列表 */
  scheduledCases: ScheduledCase[];
  /** 调度摘要 */
  summary: ScheduleSummary;
  /** 跳过的用例 */
  skippedCases: SkippedCase[];
  /** 调度决策记录 */
  decisions: ScheduleDecision[];
  /** 调度时间 */
  scheduledAt: string;
}

/**
 * 调度后的用例
 */
export interface ScheduledCase {
  /** 测试用例 */
  testCase: TestCase;
  /** 调度顺序 */
  order: number;
  /** 风险分数 (0-1) */
  riskScore: number;
  /** 调度原因 */
  reason: string;
  /** 历史统计 */
  statistics?: CaseStatistics;
  /** 是否为新用例 */
  isNew: boolean;
  /** 优先级 */
  priority: TestCasePriority;
}

/**
 * 跳过的用例
 */
export interface SkippedCase {
  /** 测试用例 */
  testCase: TestCase;
  /** 跳过原因 */
  reason: string;
  /** 连续通过次数 */
  consecutivePasses: number;
  /** 稳定性分数 */
  stabilityScore: number;
}

/**
 * 调度摘要
 */
export interface ScheduleSummary {
  /** 总用例数 */
  totalCases: number;
  /** 调度用例数 */
  scheduledCount: number;
  /** 跳过用例数 */
  skippedCount: number;
  /** 新用例数 */
  newCaseCount: number;
  /** 高风险用例数 */
  highRiskCount: number;
  /** 稳定用例数 */
  stableCount: number;
  /** 平均风险分数 */
  avgRiskScore: number;
  /** 按优先级分布 */
  byPriority: Record<TestCasePriority, number>;
  /** 调度策略 */
  strategy: ScheduleStrategy;
}

/**
 * 调度策略
 */
export type ScheduleStrategy =
  | 'risk-first'      // 风险优先
  | 'priority-first'  // 优先级优先
  | 'balanced'        // 平衡策略
  | 'fast-smoke'      // 快速冒烟
  | 'full-regression'; // 完整回归

/**
 * 调度决策
 */
export interface ScheduleDecision {
  /** 用例 ID */
  caseId: string;
  /** 决策类型 */
  decision: 'schedule' | 'skip' | 'defer';
  /** 风险分数 */
  riskScore: number;
  /** 决策因素 */
  factors: DecisionFactors;
  /** 决策原因 */
  reason: string;
}

/**
 * 决策因素
 */
export interface DecisionFactors {
  /** 历史通过率权重 (0-1) */
  passRateWeight: number;
  /** 上次状态权重 (0-1) */
  lastStatusWeight: number;
  /** 优先级权重 (0-1) */
  priorityWeight: number;
  /** 老化权重 (0-1) */
  agingWeight: number;
  /** 新用例权重 (0-1) */
  newCaseWeight: number;
}

/**
 * 风险分数计算参数
 */
export interface RiskScoreParams {
  /** 历史通过率 (0-1) */
  passRate: number;
  /** 上次状态 */
  lastStatus: 'passed' | 'failed' | 'skipped' | 'unknown';
  /** 优先级 */
  priority: TestCasePriority;
  /** 距上次运行天数 */
  daysSinceLastRun: number;
  /** 是否为新用例 */
  isNew: boolean;
  /** 连续失败次数 */
  consecutiveFailures: number;
  /** 连续通过次数 */
  consecutivePasses: number;
}

/**
 * 调度器配置
 */
export interface SchedulerConfig {
  /** 风险分数权重配置 */
  weights: {
    passRate: number;
    lastStatus: number;
    priority: number;
    aging: number;
    newCase: number;
  };
  /** 优先级排序权重 */
  priorityWeights: Record<TestCasePriority, number>;
  /** 稳定用例阈值 */
  stableThreshold: number;
  /** 最大跳过比例 */
  maxSkipRatio: number;
  /** 各测试类型最大用例数 */
  maxCasesByType: Record<TestType, number>;
  /** 是否记录决策 */
  recordDecisions: boolean;
}

/**
 * 默认调度器配置
 */
export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  weights: {
    passRate: 0.4,
    lastStatus: 0.25,
    priority: 0.2,
    aging: 0.15,
    newCase: 0.1,
  },
  priorityWeights: {
    P0: 4,
    P1: 3,
    P2: 2,
    P3: 1,
  },
  stableThreshold: 30,
  maxSkipRatio: 0.2,
  maxCasesByType: {
    smoke: 20,
    full: 100,
    regression: 50,
    performance: 30,
    security: 30,
    accessibility: 20,
    visual: 30,
    monkey: 10,
  },
  recordDecisions: true,
};
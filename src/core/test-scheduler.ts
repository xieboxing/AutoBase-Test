/**
 * 智能测试调度器
 * 基于历史数据和风险分数智能排序测试用例
 */

import type { TestCase, TestCasePriority, TestType, Platform } from '@/types/test-case.types.js';
import type { HistoricalContext, CaseStatistics } from '@/types/knowledge.types.js';
import type {
  ScheduleOptions,
  ScheduleResult,
  ScheduledCase,
  SkippedCase,
  ScheduleDecision,
  ScheduleSummary,
  RiskScoreParams,
  SchedulerConfig,
} from '@/types/scheduler.types.js';
import { DEFAULT_SCHEDULER_CONFIG } from '@/types/scheduler.types.js';
import { KnowledgeRepository } from '@/knowledge/repository.js';
import { eventBus, TestEventType } from './event-bus.js';
import { logger } from './logger.js';

/**
 * 智能测试调度器类
 */
export class TestScheduler {
  private config: SchedulerConfig;
  private repository: KnowledgeRepository | null = null;

  constructor(
    config: Partial<SchedulerConfig> = {},
    repository?: KnowledgeRepository
  ) {
    this.config = { ...DEFAULT_SCHEDULER_CONFIG, ...config };
    this.repository = repository ?? null;
  }

  /**
   * 设置知识库仓储
   */
  setRepository(repository: KnowledgeRepository): void {
    this.repository = repository;
  }

  /**
   * 调度测试用例
   * @param testCases 待调度的测试用例
   * @param historicalContext 历史上下文
   * @param options 调度选项
   */
  schedule(
    testCases: TestCase[],
    historicalContext: HistoricalContext | null,
    options: ScheduleOptions
  ): ScheduleResult {
    const startTime = Date.now();
    logger.info('🎯 开始智能调度', {
      totalCases: testCases.length,
      testType: options.testType,
      projectId: options.projectId,
    });

    // 构建调度数据
    const scheduleData = this.buildScheduleData(testCases, historicalContext);

    // 计算风险分数
    const scoredCases = this.calculateRiskScores(scheduleData);

    // 排序用例
    const sortedCases = this.sortCases(scoredCases);

    // 应用降频策略
    const { scheduled, skipped } = this.applySkipStrategy(sortedCases, options);

    // 限制用例数量
    const finalCases = this.limitCases(scheduled, options);

    // 构建调度结果
    const result = this.buildScheduleResult(finalCases, skipped, testCases.length);

    // 记录调度决策
    this.recordDecisions(result.decisions, options);

    const duration = Date.now() - startTime;
    logger.pass(`✅ 调度完成 (${duration}ms)`, {
      scheduled: result.scheduledCases.length,
      skipped: result.skippedCases.length,
      highRisk: result.summary.highRiskCount,
      avgRiskScore: result.summary.avgRiskScore.toFixed(3),
    });

    // 发出调度完成事件
    eventBus.emitSafe(TestEventType.SCHEDULING_COMPLETE, {
      projectId: options.projectId,
      platform: options.platform,
      summary: result.summary,
      duration,
    });

    return result;
  }

  /**
   * 构建调度数据
   */
  private buildScheduleData(
    testCases: TestCase[],
    historicalContext: HistoricalContext | null
  ): Array<{
    testCase: TestCase;
    statistics: CaseStatistics | null;
    isNew: boolean;
    lastStatus: 'passed' | 'failed' | 'skipped' | 'unknown';
    daysSinceLastRun: number;
  }> {
    const statsMap = new Map<string, CaseStatistics>();
    const knownCaseIds = new Set<string>();

    if (historicalContext) {
      for (const stats of historicalContext.caseStatistics) {
        statsMap.set(stats.caseId, stats);
        knownCaseIds.add(stats.caseId);
      }
    }

    return testCases.map(tc => {
      const stats = statsMap.get(tc.id);
      const isNew = !knownCaseIds.has(tc.id);

      let lastStatus: 'passed' | 'failed' | 'skipped' | 'unknown' = 'unknown';
      let daysSinceLastRun = 999; // 默认很久未运行

      if (stats && stats.lastResult) {
        // 映射 TestStatus 到允许的状态
        if (stats.lastResult === 'passed' || stats.lastResult === 'failed' || stats.lastResult === 'skipped') {
          lastStatus = stats.lastResult;
        }
        if (stats.lastRunTime) {
          const lastRun = new Date(stats.lastRunTime).getTime();
          daysSinceLastRun = Math.floor((Date.now() - lastRun) / (1000 * 60 * 60 * 24));
        }
      }

      return {
        testCase: tc,
        statistics: stats ?? null,
        isNew,
        lastStatus,
        daysSinceLastRun,
      };
    });
  }

  /**
   * 计算风险分数
   * 风险分 = 失败率 40% + 上次状态 25% + 优先级 20% + 老化 15%
   */
  private calculateRiskScores(
    data: Array<{
      testCase: TestCase;
      statistics: CaseStatistics | null;
      isNew: boolean;
      lastStatus: 'passed' | 'failed' | 'skipped' | 'unknown';
      daysSinceLastRun: number;
    }>
  ): Array<ScheduledCase & { data: typeof data[0] }> {
    const { weights, priorityWeights } = this.config;

    return data.map(item => {
      const { testCase, statistics, isNew, lastStatus, daysSinceLastRun } = item;

      // 失败率权重 (越高越危险)
      const passRate = statistics?.passRate ?? 0.5;
      const failRateWeight = (1 - passRate) * weights.passRate;

      // 上次状态权重
      let lastStatusWeight = 0;
      if (lastStatus === 'failed') {
        lastStatusWeight = weights.lastStatus;
      } else if (lastStatus === 'skipped') {
        lastStatusWeight = weights.lastStatus * 0.5;
      } else if (lastStatus === 'passed') {
        lastStatusWeight = 0;
      } else {
        lastStatusWeight = weights.lastStatus * 0.3; // 未知状态中等风险
      }

      // 优先级权重 (P0 最高)
      const priorityWeight = (priorityWeights[testCase.priority] / 4) * weights.priority;

      // 老化权重 (越久未运行越需要测试)
      const agingWeight = Math.min(daysSinceLastRun / 30, 1) * weights.aging;

      // 新用例权重
      const newCaseWeight = isNew ? weights.newCase : 0;

      // 计算总风险分数
      const riskScore = Math.min(failRateWeight + lastStatusWeight + priorityWeight + agingWeight + newCaseWeight, 1);

      // 生成调度原因
      const reasons: string[] = [];
      if (statistics?.failRate && statistics.failRate > 0.3) reasons.push('高失败率');
      if (lastStatus === 'failed') reasons.push('上次失败');
      if (testCase.priority === 'P0') reasons.push('P0优先级');
      if (daysSinceLastRun > 7) reasons.push('久未测试');
      if (isNew) reasons.push('新用例');
      if (statistics?.consecutivePasses && statistics.consecutivePasses >= 30) reasons.push('稳定用例');

      return {
        testCase,
        order: 0,
        riskScore,
        reason: reasons.length > 0 ? reasons.join(', ') : '常规调度',
        statistics: statistics ?? undefined,
        isNew,
        priority: testCase.priority,
        data: item,
      };
    });
  }

  /**
   * 排序用例
   * 风险分数降序，分数相同按优先级排序
   */
  private sortCases(
    scoredCases: Array<ScheduledCase & { data: any }>
  ): Array<ScheduledCase & { data: any }> {
    const priorityOrder: Record<TestCasePriority, number> = {
      P0: 0,
      P1: 1,
      P2: 2,
      P3: 3,
    };

    // 分离新用例和已知用例
    const newCases = scoredCases.filter(sc => sc.isNew);
    const knownCases = scoredCases.filter(sc => !sc.isNew);

    // 已知用例按风险分数降序排序
    knownCases.sort((a, b) => {
      // 风险分数降序
      if (b.riskScore !== a.riskScore) {
        return b.riskScore - a.riskScore;
      }
      // 分数相同按优先级排序
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    // 新用例按优先级排序
    newCases.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // 新用例插入中间位置
    const insertPosition = Math.floor(knownCases.length / 2);
    const sortedCases = [
      ...knownCases.slice(0, insertPosition),
      ...newCases,
      ...knownCases.slice(insertPosition),
    ];

    // 更新顺序
    return sortedCases.map((sc, index) => ({
      ...sc,
      order: index + 1,
    }));
  }

  /**
   * 应用降频策略
   */
  private applySkipStrategy(
    sortedCases: Array<ScheduledCase & { data: any }>,
    options: ScheduleOptions
  ): {
    scheduled: ScheduledCase[];
    skipped: SkippedCase[];
  } {
    const scheduled: ScheduledCase[] = [];
    const skipped: SkippedCase[] = [];

    const enableSkip = options.enableSkipStable ?? true;
    const stableThreshold = options.stableThreshold ?? this.config.stableThreshold;
    const maxSkipRatio = options.maxSkipRatio ?? this.config.maxSkipRatio;

    const totalCases = sortedCases.length;
    let skipCount = 0;
    const maxSkipCount = Math.floor(totalCases * maxSkipRatio);

    for (const sc of sortedCases) {
      const stats = sc.statistics;
      const consecutivePasses = stats?.consecutivePasses ?? 0;
      const stabilityScore = stats?.stabilityScore ?? 0;

      // 判断是否为稳定用例
      const isStable = consecutivePasses >= stableThreshold && stabilityScore >= 0.9;

      // 决定是否跳过
      if (enableSkip && isStable && skipCount < maxSkipCount && sc.riskScore < 0.2) {
        skipped.push({
          testCase: sc.testCase,
          reason: `连续通过 ${consecutivePasses} 次，稳定性 ${stabilityScore.toFixed(2)}`,
          consecutivePasses,
          stabilityScore,
        });
        skipCount++;
      } else {
        // 移除内部 data 字段
        const { data, ...scheduledCase } = sc;
        scheduled.push(scheduledCase);
      }
    }

    return { scheduled, skipped };
  }

  /**
   * 限制用例数量
   */
  private limitCases(scheduled: ScheduledCase[], options: ScheduleOptions): ScheduledCase[] {
    let maxCases = options.maxCases;

    // 根据测试类型确定最大用例数
    if (maxCases === undefined) {
      maxCases = this.config.maxCasesByType[options.testType as TestType] ?? 100;
    }

    if (scheduled.length <= maxCases) {
      return scheduled;
    }

    // 截取前 maxCases 个
    return scheduled.slice(0, maxCases).map((sc, index) => ({
      ...sc,
      order: index + 1,
    }));
  }

  /**
   * 构建调度结果
   */
  private buildScheduleResult(
    scheduled: ScheduledCase[],
    skipped: SkippedCase[],
    originalCount: number
  ): ScheduleResult {
    // 计算摘要
    const highRiskCount = scheduled.filter(sc => sc.riskScore >= 0.7).length;
    const newCaseCount = scheduled.filter(sc => sc.isNew).length;
    const stableCount = scheduled.filter(sc => sc.reason.includes('稳定用例')).length;
    const avgRiskScore = scheduled.length > 0
      ? scheduled.reduce((sum, sc) => sum + sc.riskScore, 0) / scheduled.length
      : 0;

    // 按优先级统计
    const byPriority: Record<TestCasePriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const sc of scheduled) {
      byPriority[sc.priority]++;
    }

    // 构建决策记录
    const decisions: ScheduleDecision[] = scheduled.map(sc => ({
      caseId: sc.testCase.id,
      decision: 'schedule' as const,
      riskScore: sc.riskScore,
      factors: {
        passRateWeight: this.config.weights.passRate,
        lastStatusWeight: this.config.weights.lastStatus,
        priorityWeight: this.config.weights.priority,
        agingWeight: this.config.weights.aging,
        newCaseWeight: sc.isNew ? this.config.weights.newCase : 0,
      },
      reason: sc.reason,
    }));

    // 跳过的决策
    for (const sk of skipped) {
      decisions.push({
        caseId: sk.testCase.id,
        decision: 'skip' as const,
        riskScore: 0,
        factors: {
          passRateWeight: 0,
          lastStatusWeight: 0,
          priorityWeight: 0,
          agingWeight: 0,
          newCaseWeight: 0,
        },
        reason: sk.reason,
      });
    }

    // 确定调度策略
    let strategy = 'balanced' as ScheduleSummary['strategy'];
    if (highRiskCount > scheduled.length * 0.5) {
      strategy = 'risk-first';
    } else if (byPriority.P0 > scheduled.length * 0.3) {
      strategy = 'priority-first';
    } else if (scheduled.length <= 20) {
      strategy = 'fast-smoke';
    }

    const summary: ScheduleSummary = {
      totalCases: originalCount,
      scheduledCount: scheduled.length,
      skippedCount: skipped.length,
      newCaseCount,
      highRiskCount,
      stableCount,
      avgRiskScore,
      byPriority,
      strategy,
    };

    return {
      scheduledCases: scheduled,
      summary,
      skippedCases: skipped,
      decisions,
      scheduledAt: new Date().toISOString(),
    };
  }

  /**
   * 记录调度决策到知识库
   */
  private recordDecisions(decisions: ScheduleDecision[], options: ScheduleOptions): void {
    if (!this.repository || !this.config.recordDecisions) {
      return;
    }

    // 写入调度决策到数据库
    for (const decision of decisions) {
      eventBus.emitSafe(TestEventType.SCHEDULER_DECISION, {
        caseId: decision.caseId,
        decision: decision.decision,
        riskScore: decision.riskScore,
        reason: decision.reason,
      });
    }
  }

  /**
   * 计算单个用例的风险分数
   */
  calculateRiskScore(params: RiskScoreParams): number {
    const { weights, priorityWeights } = this.config;

    // 失败率权重
    const failRate = 1 - params.passRate;
    const failRateWeight = failRate * weights.passRate;

    // 上次状态权重
    let lastStatusWeight = 0;
    if (params.lastStatus === 'failed') {
      lastStatusWeight = weights.lastStatus;
    } else if (params.lastStatus === 'skipped') {
      lastStatusWeight = weights.lastStatus * 0.5;
    }

    // 优先级权重
    const priorityWeight = (priorityWeights[params.priority] / 4) * weights.priority;

    // 老化权重
    const agingWeight = Math.min(params.daysSinceLastRun / 30, 1) * weights.aging;

    // 新用例权重
    const newCaseWeight = params.isNew ? weights.newCase : 0;

    return Math.min(failRateWeight + lastStatusWeight + priorityWeight + agingWeight + newCaseWeight, 1);
  }

  /**
   * 更新调度配置
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }
}

/**
 * 创建调度器实例
 */
export function createTestScheduler(
  config?: Partial<SchedulerConfig>,
  repository?: KnowledgeRepository
): TestScheduler {
  return new TestScheduler(config, repository);
}
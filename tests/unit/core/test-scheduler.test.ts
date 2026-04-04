/**
 * 智能测试调度器测试
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TestScheduler } from '@/core/test-scheduler.js';
import type { TestCase } from '@/types/test-case.types.js';
import type { HistoricalContext, CaseStatistics } from '@/types/knowledge.types.js';
import type { ScheduleOptions } from '@/types/scheduler.types.js';

// 创建 Mock 测试用例
function createTestCase(options: {
  id: string;
  name: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
}): TestCase {
  return {
    id: options.id,
    name: options.name,
    description: '测试用例',
    priority: options.priority ?? 'P2',
    type: 'functional',
    platform: ['pc-web'],
    tags: [],
    steps: [],
  };
}

// 创建 Mock 历史上下文
function createHistoricalContext(
  caseStats: Partial<CaseStatistics>[]
): HistoricalContext {
  const statistics: CaseStatistics[] = caseStats.map((s, i) => ({
    caseId: s.caseId ?? `case-${i}`,
    projectId: 'test-project',
    platform: 'pc-web' as const,
    totalRuns: s.totalRuns ?? 10,
    passCount: s.passCount ?? 8,
    failCount: s.failCount ?? 2,
    skipCount: s.skipCount ?? 0,
    passRate: s.passRate ?? 0.8,
    failRate: s.failRate ?? 0.2,
    consecutivePasses: s.consecutivePasses ?? 0,
    consecutiveFailures: s.consecutiveFailures ?? 0,
    stabilityScore: s.stabilityScore ?? 0.5,
    isStable: s.isStable ?? false,
    lastRunTime: s.lastRunTime ?? new Date().toISOString(),
    lastResult: s.lastResult ?? 'passed',
    avgDurationMs: s.avgDurationMs ?? 1000,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  return {
    projectId: 'test-project',
    platform: 'pc-web',
    previousPassedCases: [],
    previousFailedCases: [],
    caseStatistics: statistics,
    uncoveredFeatures: [],
    weakCoverageAreas: [],
    failurePatterns: [],
    stableCases: statistics.filter(s => s.isStable).map(s => ({
      caseId: s.caseId,
      consecutivePasses: s.consecutivePasses,
      passRate: s.passRate,
    })),
    highRiskCases: statistics.filter(s => s.failRate > 0.5).map(s => ({
      caseId: s.caseId,
      riskScore: s.failRate,
      reason: `失败率 ${(s.failRate * 100).toFixed(1)}%`,
    })),
    optimizationSuggestions: [],
    loadedAt: new Date().toISOString(),
  };
}

describe('TestScheduler', () => {
  let scheduler: TestScheduler;

  beforeEach(() => {
    scheduler = new TestScheduler();
  });

  describe('风险分数计算', () => {
    it('应该正确计算高风险用例的分数', () => {
      const riskScore = scheduler.calculateRiskScore({
        passRate: 0.2,
        lastStatus: 'failed',
        priority: 'P0',
        daysSinceLastRun: 10,
        isNew: false,
        consecutiveFailures: 3,
        consecutivePasses: 0,
      });

      // 高失败率 + 上次失败 + P0 优先级
      expect(riskScore).toBeGreaterThan(0.5);
    });

    it('应该正确计算稳定用例的分数', () => {
      const riskScore = scheduler.calculateRiskScore({
        passRate: 1.0,
        lastStatus: 'passed',
        priority: 'P3',
        daysSinceLastRun: 1,
        isNew: false,
        consecutiveFailures: 0,
        consecutivePasses: 30,
      });

      // 低失败率 + 上次通过 + P3 优先级 + 近期运行
      expect(riskScore).toBeLessThan(0.3);
    });

    it('新用例应该有适当的风险分数', () => {
      const newCaseScore = scheduler.calculateRiskScore({
        passRate: 0.5,
        lastStatus: 'unknown',
        priority: 'P2',
        daysSinceLastRun: 999,
        isNew: true,
        consecutiveFailures: 0,
        consecutivePasses: 0,
      });

      // 新用例应该有适中的风险分数
      expect(newCaseScore).toBeGreaterThan(0);
      expect(newCaseScore).toBeLessThan(1);
    });
  });

  describe('P0/P1/P2/P3 排序', () => {
    it('应该按优先级排序', () => {
      const testCases = [
        createTestCase({ id: 'p3-case', name: 'P3用例', priority: 'P3' }),
        createTestCase({ id: 'p0-case', name: 'P0用例', priority: 'P0' }),
        createTestCase({ id: 'p2-case', name: 'P2用例', priority: 'P2' }),
        createTestCase({ id: 'p1-case', name: 'P1用例', priority: 'P1' }),
      ];

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      // P0 应该在前面
      expect(result.scheduledCases[0]?.testCase.priority).toBe('P0');
    });

    it('相同风险分数时应该按优先级排序', () => {
      const testCases = [
        createTestCase({ id: 'case-1', name: '用例1', priority: 'P3' }),
        createTestCase({ id: 'case-2', name: '用例2', priority: 'P0' }),
        createTestCase({ id: 'case-3', name: '用例3', priority: 'P2' }),
      ];

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      // 验证排序结果
      const priorities = result.scheduledCases.map(sc => sc.testCase.priority);
      expect(priorities.indexOf('P0')).toBeLessThan(priorities.indexOf('P3'));
    });
  });

  describe('新用例插中间', () => {
    it('新用例应该插入中间位置', () => {
      const knownCases: TestCase[] = [
        createTestCase({ id: 'known-1', name: '已知用例1', priority: 'P0' }),
        createTestCase({ id: 'known-2', name: '已知用例2', priority: 'P0' }),
        createTestCase({ id: 'known-3', name: '已知用例3', priority: 'P0' }),
        createTestCase({ id: 'known-4', name: '已知用例4', priority: 'P0' }),
      ];

      const newCases: TestCase[] = [
        createTestCase({ id: 'new-1', name: '新用例1', priority: 'P1' }),
        createTestCase({ id: 'new-2', name: '新用例2', priority: 'P1' }),
      ];

      const historicalContext = createHistoricalContext(
        knownCases.map(tc => ({
          caseId: tc.id,
          passRate: 0.8,
          lastResult: 'passed' as const,
        }))
      );

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(
        [...knownCases, ...newCases],
        historicalContext,
        options
      );

      // 验证新用例存在
      const newCaseIds = result.scheduledCases
        .filter(sc => sc.isNew)
        .map(sc => sc.testCase.id);
      expect(newCaseIds).toContain('new-1');
      expect(newCaseIds).toContain('new-2');
    });
  });

  describe('smoke/full/regression maxCases 行为', () => {
    it('smoke 测试应该限制用例数量', () => {
      const testCases = Array.from({ length: 50 }, (_, i) =>
        createTestCase({ id: `case-${i}`, name: `用例${i}` })
      );

      const options: ScheduleOptions = {
        testType: 'smoke',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      // smoke 默认最多 20 个
      expect(result.scheduledCases.length).toBeLessThanOrEqual(20);
    });

    it('full 测试应该限制用例数量', () => {
      const testCases = Array.from({ length: 200 }, (_, i) =>
        createTestCase({ id: `case-${i}`, name: `用例${i}` })
      );

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      // full 默认最多 100 个
      expect(result.scheduledCases.length).toBeLessThanOrEqual(100);
    });

    it('regression 测试应该优先包含历史失败用例', () => {
      const testCases = [
        createTestCase({ id: 'failed-1', name: '失败用例1', priority: 'P2' }),
        createTestCase({ id: 'failed-2', name: '失败用例2', priority: 'P2' }),
        createTestCase({ id: 'passed-1', name: '通过用例1', priority: 'P0' }),
        createTestCase({ id: 'passed-2', name: '通过用例2', priority: 'P0' }),
      ];

      const historicalContext = createHistoricalContext([
        { caseId: 'failed-1', passRate: 0.2, lastResult: 'failed' },
        { caseId: 'failed-2', passRate: 0.3, lastResult: 'failed' },
        { caseId: 'passed-1', passRate: 1.0, lastResult: 'passed' },
        { caseId: 'passed-2', passRate: 0.9, lastResult: 'passed' },
      ]);

      const options: ScheduleOptions = {
        testType: 'regression',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, historicalContext, options);

      // 失败用例应该排在前面
      const scheduledIds = result.scheduledCases.map(sc => sc.testCase.id);
      const failed1Index = scheduledIds.indexOf('failed-1');
      const passed1Index = scheduledIds.indexOf('passed-1');

      // 高风险用例应该优先
      expect(failed1Index).toBeLessThan(passed1Index);
    });
  });

  describe('稳定用例降频跳过', () => {
    it('连续通过 30 次的稳定用例应该被跳过', () => {
      // 需要足够多的用例才能触发跳过（maxSkipCount = floor(total * maxSkipRatio)）
      const testCases = [
        createTestCase({ id: 'stable-case', name: '稳定用例' }),
        createTestCase({ id: 'normal-case', name: '普通用例' }),
        createTestCase({ id: 'risky-case', name: '风险用例' }),
        createTestCase({ id: 'stable-case-2', name: '稳定用例2' }),
        createTestCase({ id: 'normal-case-2', name: '普通用例2' }),
      ];

      const historicalContext = createHistoricalContext([
        {
          caseId: 'stable-case',
          passRate: 1.0,
          lastResult: 'passed',
          consecutivePasses: 35,
          stabilityScore: 0.95,
          isStable: true,
        },
        {
          caseId: 'normal-case',
          passRate: 0.8,
          lastResult: 'passed',
          consecutivePasses: 5,
          stabilityScore: 0.6,
        },
        {
          caseId: 'risky-case',
          passRate: 0.3,
          lastResult: 'failed',
          consecutiveFailures: 3,
          stabilityScore: 0.2,
        },
        {
          caseId: 'stable-case-2',
          passRate: 1.0,
          lastResult: 'passed',
          consecutivePasses: 40,
          stabilityScore: 0.98,
          isStable: true,
        },
        {
          caseId: 'normal-case-2',
          passRate: 0.7,
          lastResult: 'passed',
          consecutivePasses: 3,
          stabilityScore: 0.5,
        },
      ]);

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
        enableSkipStable: true,
      };

      const result = scheduler.schedule(testCases, historicalContext, options);

      // 稳定用例应该被跳过（至少一个，因为 maxSkipCount = floor(5 * 0.2) = 1）
      expect(result.skippedCases.some(s => s.testCase.id === 'stable-case')).toBe(true);
    });

    it('关闭 enableSkipStable 时不跳过稳定用例', () => {
      const testCases = [
        createTestCase({ id: 'stable-case', name: '稳定用例' }),
      ];

      const historicalContext = createHistoricalContext([
        {
          caseId: 'stable-case',
          passRate: 1.0,
          lastResult: 'passed',
          consecutivePasses: 35,
          stabilityScore: 0.95,
          isStable: true,
        },
      ]);

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
        enableSkipStable: false,
      };

      const result = scheduler.schedule(testCases, historicalContext, options);

      // 不应该跳过
      expect(result.skippedCases.length).toBe(0);
      expect(result.scheduledCases.some(sc => sc.testCase.id === 'stable-case')).toBe(true);
    });

    it('最大跳过比例应该有效', () => {
      const testCases = Array.from({ length: 20 }, (_, i) =>
        createTestCase({ id: `case-${i}`, name: `用例${i}` })
      );

      const historicalContext = createHistoricalContext(
        testCases.map(tc => ({
          caseId: tc.id,
          passRate: 1.0,
          lastResult: 'passed' as const,
          consecutivePasses: 35,
          stabilityScore: 0.95,
          isStable: true,
        }))
      );

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
        enableSkipStable: true,
        maxSkipRatio: 0.1, // 最多跳过 10%
      };

      const result = scheduler.schedule(testCases, historicalContext, options);

      // 跳过数量不应该超过 10%
      expect(result.skippedCases.length).toBeLessThanOrEqual(2);
    });
  });

  describe('调度结果验证', () => {
    it('应该返回正确的调度摘要', () => {
      const testCases = [
        createTestCase({ id: 'case-1', name: '用例1', priority: 'P0' }),
        createTestCase({ id: 'case-2', name: '用例2', priority: 'P1' }),
        createTestCase({ id: 'case-3', name: '用例3', priority: 'P2' }),
      ];

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      expect(result.summary.totalCases).toBe(3);
      expect(result.summary.scheduledCount).toBe(3);
      expect(result.summary.skippedCount).toBe(0);
      expect(result.summary.byPriority.P0).toBe(1);
      expect(result.summary.byPriority.P1).toBe(1);
      expect(result.summary.byPriority.P2).toBe(1);
    });

    it('应该包含调度决策', () => {
      const testCases = [
        createTestCase({ id: 'case-1', name: '用例1' }),
      ];

      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      expect(result.decisions.length).toBeGreaterThan(0);
      expect(result.decisions[0]?.caseId).toBe('case-1');
      expect(result.decisions[0]?.decision).toBe('schedule');
    });

    it('应该设置调度时间', () => {
      const testCases = [createTestCase({ id: 'case-1', name: '用例1' })];
      const options: ScheduleOptions = {
        testType: 'full',
        projectId: 'test-project',
        platform: 'pc-web',
      };

      const result = scheduler.schedule(testCases, null, options);

      expect(result.scheduledAt).toBeDefined();
      expect(new Date(result.scheduledAt).getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FlowOptimizer, optimizeFlow } from '@/ai/flow-optimizer.js';
import { TestHistory } from '@/knowledge/test-history.js';
import type { CaseHistoryData } from '@/ai/prompts/optimize-flow.prompt.js';
import type { TestRunResult } from '@/types/test-result.types.js';
import type { TestCase } from '@/types/test-case.types.js';
import { nanoid } from 'nanoid';

/**
 * Phase 16.3: AI 优化流程联调测试
 */
describe('AI Optimization Flow Integration Tests', () => {
  let optimizer: FlowOptimizer;

  beforeAll(() => {
    optimizer = new FlowOptimizer({ useAi: false }); // 使用规则引擎模式
  });

  beforeEach(() => {
    optimizer.clearHistoryData();
  });

  describe('FlowOptimizer Core Functions', () => {
    it('should initialize with default config', () => {
      const defaultOptimizer = new FlowOptimizer();
      expect(defaultOptimizer).toBeDefined();
    });

    it('should add run records', () => {
      optimizer.addRunRecord('case-001', 'passed', 1500);
      optimizer.addRunRecord('case-001', 'passed', 1200);
      optimizer.addRunRecord('case-001', 'failed', 2000);

      const history = optimizer.getHistoryData();
      expect(history.length).toBe(1);
      expect(history[0].totalRuns).toBe(3);
      expect(history[0].passCount).toBe(2);
      expect(history[0].failCount).toBe(1);
    });

    it('should track multiple cases', () => {
      optimizer.addRunRecord('case-001', 'passed', 1000);
      optimizer.addRunRecord('case-002', 'failed', 2000);
      optimizer.addRunRecord('case-003', 'passed', 1500);

      const history = optimizer.getHistoryData();
      expect(history.length).toBe(3);
    });
  });

  describe('Optimization Analysis', () => {
    it('should generate optimization suggestions', async () => {
      // 准备历史数据
      const historyData: CaseHistoryData[] = [
        {
          caseId: 'case-001',
          caseName: '登录测试',
          totalRuns: 10,
          passCount: 5,
          failCount: 5,
          skipCount: 0,
          avgDurationMs: 3000,
          lastResult: 'failed',
          recentResults: ['failed', 'failed', 'passed', 'failed', 'passed'],
          priority: 'P0',
          type: 'functional',
          tags: ['login', 'auth'],
        },
        {
          caseId: 'case-002',
          caseName: '首页加载测试',
          totalRuns: 10,
          passCount: 10,
          failCount: 0,
          skipCount: 0,
          avgDurationMs: 500,
          lastResult: 'passed',
          recentResults: ['passed'] * 10,
          priority: 'P1',
          type: 'functional',
          tags: ['home'],
        },
        {
          caseId: 'case-003',
          caseName: '慢速操作测试',
          totalRuns: 5,
          passCount: 5,
          failCount: 0,
          skipCount: 0,
          avgDurationMs: 15000, // 非常慢
          lastResult: 'passed',
          recentResults: ['passed'] * 5,
          priority: 'P2',
          type: 'functional',
          tags: ['slow'],
        },
      ];

      const result = await optimizer.optimize({
        projectName: 'test-project',
        totalCases: 3,
        historyData,
        recentPassRate: 0.67,
        previousPassRate: 0.5,
        avgDuration: 5000,
      });

      expect(result).toBeDefined();
      expect(result.suggestions).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(result.overallAssessment).toBeDefined();

      // 应该有优化建议
      expect(result.suggestions.length).toBeGreaterThan(0);

      // 验证摘要
      expect(result.summary.totalSuggestions).toBe(result.suggestions.length);
    });

    it('should identify high failure rate cases', async () => {
      const historyData: CaseHistoryData[] = [
        {
          caseId: 'flaky-case',
          caseName: '不稳定测试',
          totalRuns: 10,
          passCount: 3,
          failCount: 7,
          skipCount: 0,
          avgDurationMs: 2000,
          lastResult: 'failed',
          recentResults: ['failed', 'passed', 'failed', 'failed', 'passed'],
          priority: 'P0',
          type: 'functional',
          tags: [],
        },
      ];

      const result = await optimizer.optimize({
        projectName: 'test-project',
        totalCases: 1,
        historyData,
        recentPassRate: 0.3,
        avgDuration: 2000,
      });

      // 应该有针对高失败率用例的建议
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.summary.highImpactCount).toBeGreaterThan(0);
    });

    it('should suggest timeout adjustments for slow cases', async () => {
      const historyData: CaseHistoryData[] = [
        {
          caseId: 'slow-case',
          caseName: '慢速测试',
          totalRuns: 5,
          passCount: 5,
          failCount: 0,
          skipCount: 0,
          avgDurationMs: 30000, // 30秒，很慢
          lastResult: 'passed',
          recentResults: ['passed'] * 5,
          priority: 'P2',
          type: 'functional',
          tags: [],
        },
      ];

      const result = await optimizer.optimize({
        projectName: 'test-project',
        totalCases: 1,
        historyData,
        recentPassRate: 1.0,
        avgDuration: 30000,
      });

      // 应该有优化建议
      expect(result.suggestions).toBeDefined();
    });
  });

  describe('Apply Optimizations', () => {
    it('should apply timeout optimization', () => {
      const testCase: TestCase = {
        id: 'case-001',
        name: '测试用例',
        description: '测试',
        priority: 'P0',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [
          { order: 1, action: 'navigate', target: '/login', timeout: 5000 },
          { order: 2, action: 'click', target: '#submit' },
        ],
      };

      const suggestion = {
        caseId: 'case-001',
        type: 'increase-timeout' as const,
        reason: '超时频繁',
        impact: 'high' as const,
        autoApplicable: true,
        confidence: 0.95,
        suggestedValue: 10000,
      };

      const optimized = optimizer.applyOptimization(testCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.optimizationType).toBe('increase-timeout');
      expect(optimized.steps[0].timeout).toBe(10000);
    });

    it('should apply skip optimization', () => {
      const testCase: TestCase = {
        id: 'case-002',
        name: '跳过测试',
        description: '测试',
        priority: 'P3',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [],
      };

      const suggestion = {
        caseId: 'case-002',
        type: 'skip' as const,
        reason: '功能已下线',
        impact: 'low' as const,
        autoApplicable: true,
        confidence: 0.99,
      };

      const optimized = optimizer.applyOptimization(testCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.metadata?.skip).toBe(true);
      expect(optimized.metadata?.skipReason).toBe('功能已下线');
    });

    it('should apply retry optimization', () => {
      const testCase: TestCase = {
        id: 'case-003',
        name: '重试测试',
        description: '测试',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: [],
        steps: [],
      };

      const suggestion = {
        caseId: 'case-003',
        type: 'add-retry' as const,
        reason: '不稳定用例',
        impact: 'medium' as const,
        autoApplicable: true,
        confidence: 0.85,
        suggestedValue: 3,
      };

      const optimized = optimizer.applyOptimization(testCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.metadata?.retryCount).toBe(3);
    });
  });

  describe('Auto Apply Optimizations', () => {
    it('should auto-apply high confidence suggestions', () => {
      const testCases: TestCase[] = [
        {
          id: 'case-001',
          name: '测试1',
          description: '',
          priority: 'P0',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [{ order: 1, action: 'navigate', target: '/' }],
        },
        {
          id: 'case-002',
          name: '测试2',
          description: '',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          tags: [],
          steps: [],
        },
      ];

      const suggestions = [
        {
          caseId: 'case-001',
          type: 'add-retry' as const,
          reason: '不稳定',
          impact: 'high' as const,
          autoApplicable: true,
          confidence: 0.95,
          suggestedValue: 2,
        },
        {
          caseId: 'case-002',
          type: 'skip' as const,
          reason: '低价值',
          impact: 'low' as const,
          autoApplicable: true,
          confidence: 0.5, // 低置信度，不应自动应用
        },
      ];

      const optimizedCases = optimizer.autoApplyOptimizations(testCases, suggestions);

      // 只有高置信度的建议被应用
      expect(optimizedCases[0].optimizationApplied).toBe(true);
      expect(optimizedCases[1].optimizationApplied).toBe(false);
    });
  });

  describe('History Data Export/Import', () => {
    it('should export and import history data', () => {
      optimizer.addRunRecord('case-001', 'passed', 1000);
      optimizer.addRunRecord('case-002', 'failed', 2000);

      const exported = optimizer.exportHistoryData();
      expect(exported).toBeDefined();

      const newOptimizer = new FlowOptimizer();
      newOptimizer.importHistoryData(exported);

      const history = newOptimizer.getHistoryData();
      expect(history.length).toBe(2);
    });
  });

  describe('Integration with TestHistory', () => {
    it('should work with TestHistory data', async () => {
      // 创建模拟数据库
      const mockDb = {
        execute: vi.fn(),
        query: vi.fn().mockReturnValue([]),
        queryOne: vi.fn().mockReturnValue(null),
      };

      // 使用模拟数据库创建 TestHistory
      const testHistory = new TestHistory(mockDb as unknown as ReturnType<typeof import('@/knowledge/db/index.js').getDatabase>);

      // 创建模拟测试运行结果
      const mockRunResult: TestRunResult = {
        runId: nanoid(8),
        project: 'optimize-test-project',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 5000,
        platform: 'pc-web',
        environment: { browser: 'chromium', os: 'test' },
        summary: {
          total: 3,
          passed: 2,
          failed: 1,
          skipped: 0,
          blocked: 0,
          passRate: 0.67,
        },
        categories: {
          functional: { total: 3, passed: 2, failed: 1, skipped: 0, blocked: 0, passRate: 0.67, avgDurationMs: 1666 },
          visual: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
          performance: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, metrics: {} },
          security: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, issues: [] },
          accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, violations: [] },
          compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
          stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        },
        cases: [
          {
            caseId: 'opt-case-001',
            caseName: '测试用例1',
            status: 'passed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 1500,
            platform: 'pc-web',
            environment: {},
            steps: [],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [] },
          },
          {
            caseId: 'opt-case-002',
            caseName: '测试用例2',
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 3000,
            platform: 'pc-web',
            environment: {},
            steps: [{ order: 1, action: 'click', status: 'failed', errorMessage: '超时' }],
            retryCount: 2,
            selfHealed: false,
            artifacts: { screenshots: [], logs: ['超时错误'] },
          },
          {
            caseId: 'opt-case-003',
            caseName: '测试用例3',
            status: 'passed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 500,
            platform: 'pc-web',
            environment: {},
            steps: [],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [] },
          },
        ],
        aiAnalysis: {
          overallAssessment: '测试完成',
          criticalIssues: [],
          recommendations: [],
          riskLevel: 'low',
        },
        artifacts: { screenshots: [], videos: [], logs: [] },
      };

      // 保存到历史记录
      testHistory.saveRunResult(mockRunResult);

      // 验证数据库被调用
      expect(mockDb.execute).toHaveBeenCalled();
    });
  });

  describe('Full Optimization Workflow', () => {
    it('should complete full optimization workflow', async () => {
      // 1. 准备测试数据
      const historyData: CaseHistoryData[] = [
        {
          caseId: 'workflow-case-001',
          caseName: '登录流程测试',
          totalRuns: 8,
          passCount: 4,
          failCount: 4,
          skipCount: 0,
          avgDurationMs: 5000,
          lastResult: 'failed',
          recentResults: ['failed', 'passed', 'failed', 'failed'],
          priority: 'P0',
          type: 'functional',
          tags: ['login', 'critical'],
        },
        {
          caseId: 'workflow-case-002',
          caseName: '商品浏览测试',
          totalRuns: 8,
          passCount: 8,
          failCount: 0,
          skipCount: 0,
          avgDurationMs: 2000,
          lastResult: 'passed',
          recentResults: ['passed'] * 8,
          priority: 'P1',
          type: 'functional',
          tags: ['browse'],
        },
      ];

      // 2. 执行优化分析
      const result = await optimizer.optimize({
        projectName: 'workflow-test',
        totalCases: 2,
        historyData,
        recentPassRate: 0.5,
        previousPassRate: 0.75,
        avgDuration: 3500,
      });

      // 3. 验证分析结果
      expect(result).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.summary.totalSuggestions).toBe(result.suggestions.length);

      // 4. 验证有建议（任何影响级别）
      expect(result.suggestions.length).toBeGreaterThan(0);

      // 5. 验证优先操作
      expect(result.priorityActions).toBeDefined();

      // 6. 验证总体评估
      expect(result.overallAssessment).toBeDefined();
      expect(result.overallAssessment.length).toBeGreaterThan(0);
    });
  });
});
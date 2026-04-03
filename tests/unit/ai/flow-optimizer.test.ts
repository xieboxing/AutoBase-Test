import { describe, it, expect, beforeEach } from 'vitest';
import { FlowOptimizer, optimizeFlow } from '@/ai/flow-optimizer.js';
import { buildOptimizeFlowPrompt, parseFlowOptimizationResult, generateQuickOptimizations } from '@/ai/prompts/optimize-flow.prompt.js';
import type { CaseHistoryData } from '@/ai/prompts/optimize-flow.prompt.js';
import type { TestCase } from '@/types/test-case.types.js';

// Define mock data at file level for all test blocks
const defaultMockHistoryData: CaseHistoryData[] = [
  {
    caseId: 'tc-stable',
    caseName: 'Stable Test',
    totalRuns: 10,
    passCount: 10,
    failCount: 0,
    skipCount: 0,
    avgDurationMs: 500,
    lastResult: 'passed',
    recentResults: ['passed', 'passed', 'passed', 'passed', 'passed'],
    priority: 'P1',
    type: 'functional',
    tags: ['smoke'],
  },
  {
    caseId: 'tc-flaky',
    caseName: 'Flaky Test',
    totalRuns: 10,
    passCount: 3,
    failCount: 7,
    skipCount: 0,
    avgDurationMs: 2000,
    lastResult: 'failed',
    recentResults: ['passed', 'failed', 'passed', 'failed', 'failed'],
    priority: 'P0',
    type: 'functional',
    tags: [],
    lastError: 'Element not found',
  },
  {
    caseId: 'tc-slow',
    caseName: 'Slow Test',
    totalRuns: 5,
    passCount: 5,
    failCount: 0,
    skipCount: 0,
    avgDurationMs: 45000, // 45 seconds
    lastResult: 'passed',
    recentResults: ['passed', 'passed', 'passed', 'passed', 'passed'],
    priority: 'P2',
    type: 'functional',
    tags: [],
  },
];

const defaultMockTestCase: TestCase = {
  id: 'tc-stable',
  name: 'Stable Test',
  description: 'A stable test case',
  priority: 'P1',
  type: 'functional',
  platform: ['pc-web'],
  tags: ['smoke'],
  steps: [
    { order: 1, action: 'navigate', value: 'https://example.com', description: 'Open page' },
    { order: 2, action: 'wait', value: '5000', description: 'Wait 5 seconds' },
  ],
};

describe('FlowOptimizer', () => {
  let optimizer: FlowOptimizer;
  let mockHistoryData: CaseHistoryData[];
  let mockTestCase: TestCase;

  beforeEach(() => {
    optimizer = new FlowOptimizer({ useAi: false });
    mockHistoryData = JSON.parse(JSON.stringify(defaultMockHistoryData));
    mockTestCase = { ...defaultMockTestCase };
  });

  describe('optimize', () => {
    it('should generate optimization suggestions', async () => {
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData: mockHistoryData,
        recentPassRate: 0.67,
        avgDuration: 5000,
      });

      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.overallAssessment).toBeDefined();
      expect(result.summary).toBeDefined();
    });

    it('should suggest reducing frequency for stable tests', async () => {
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData: mockHistoryData,
        recentPassRate: 0.9,
        avgDuration: 5000,
      });

      const reduceFreq = result.suggestions.find(s => s.type === 'reduce-frequency');
      expect(reduceFreq).toBeDefined();
      expect(reduceFreq?.caseId).toBe('tc-stable');
    });

    it('should suggest fixing flaky tests', async () => {
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData: mockHistoryData,
        recentPassRate: 0.5,
        avgDuration: 5000,
      });

      const fixSelector = result.suggestions.find(s => s.type === 'fix-selector');
      expect(fixSelector).toBeDefined();
      expect(fixSelector?.impact).toBe('high');
    });

    it('should suggest optimizing slow tests', async () => {
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData: mockHistoryData,
        recentPassRate: 0.9,
        avgDuration: 5000,
      });

      const adjustWait = result.suggestions.find(s => s.type === 'adjust-wait');
      expect(adjustWait).toBeDefined();
      expect(adjustWait?.caseId).toBe('tc-slow');
    });

    it('should provide priority actions', async () => {
      const result = await optimizer.optimize({
        projectName: 'Test Project',
        totalCases: 3,
        historyData: mockHistoryData,
        recentPassRate: 0.5,
        avgDuration: 5000,
      });

      expect(result.priorityActions.length).toBeGreaterThan(0);
    });
  });

  describe('applyOptimization', () => {
    it('should apply increase-timeout optimization', () => {
      const suggestion = {
        type: 'increase-timeout' as const,
        caseId: 'tc-stable',
        caseName: 'Stable Test',
        reason: 'Test needs more time',
        suggestedValue: 30000,
        confidence: 0.9,
        autoApplicable: true,
        impact: 'medium' as const,
        description: 'Increase timeout',
      };

      const optimized = optimizer.applyOptimization(mockTestCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.steps[0].timeout).toBe(30000);
    });

    it('should apply skip optimization', () => {
      const suggestion = {
        type: 'skip' as const,
        caseId: 'tc-stable',
        caseName: 'Stable Test',
        reason: 'Low value test',
        confidence: 0.8,
        autoApplicable: true,
        impact: 'low' as const,
        description: 'Skip this test',
      };

      const optimized = optimizer.applyOptimization(mockTestCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.metadata?.skip).toBe(true);
    });

    it('should apply reduce-frequency optimization', () => {
      const suggestion = {
        type: 'reduce-frequency' as const,
        caseId: 'tc-stable',
        caseName: 'Stable Test',
        reason: 'Stable test, run less often',
        suggestedValue: 'daily',
        confidence: 0.9,
        autoApplicable: true,
        impact: 'low' as const,
        description: 'Reduce frequency',
      };

      const optimized = optimizer.applyOptimization(mockTestCase, suggestion);

      expect(optimized.optimizationApplied).toBe(true);
      expect(optimized.metadata?.executionFrequency).toBe('daily');
    });
  });

  describe('autoApplyOptimizations', () => {
    it('should auto apply high confidence suggestions', () => {
      const testCases = [mockTestCase];
      const suggestions = [
        {
          type: 'reduce-frequency' as const,
          caseId: 'tc-stable',
          caseName: 'Stable Test',
          reason: 'Stable',
          suggestedValue: 'weekly',
          confidence: 0.95,
          autoApplicable: true,
          impact: 'low' as const,
          description: 'Reduce',
        },
      ];

      const optimized = optimizer.autoApplyOptimizations(testCases, suggestions);

      expect(optimized[0].optimizationApplied).toBe(true);
    });

    it('should not apply low confidence suggestions', () => {
      const testCases = [mockTestCase];
      const suggestions = [
        {
          type: 'skip' as const,
          caseId: 'tc-stable',
          caseName: 'Stable Test',
          reason: 'Maybe skip',
          confidence: 0.5,
          autoApplicable: true,
          impact: 'high' as const,
          description: 'Low confidence',
        },
      ];

      const optimized = optimizer.autoApplyOptimizations(testCases, suggestions);

      expect(optimized[0].optimizationApplied).toBe(false);
    });
  });

  describe('history data management', () => {
    it('should add run records', () => {
      optimizer.addRunRecord('tc-new', 'passed', 1000);

      const history = optimizer.getHistoryData();
      const newRecord = history.find(h => h.caseId === 'tc-new');

      expect(newRecord).toBeDefined();
      expect(newRecord?.totalRuns).toBe(1);
      expect(newRecord?.passCount).toBe(1);
    });

    it('should update existing records', () => {
      // Import existing data
      optimizer.importHistoryData(JSON.stringify(mockHistoryData));

      // Add new run
      optimizer.addRunRecord('tc-stable', 'passed', 500);

      const history = optimizer.getHistoryData();
      const updated = history.find(h => h.caseId === 'tc-stable');

      expect(updated?.totalRuns).toBe(11);
    });

    it('should export and import history data', () => {
      optimizer.importHistoryData(JSON.stringify(mockHistoryData));
      const exported = optimizer.exportHistoryData();

      expect(exported).toBeDefined();
      const parsed = JSON.parse(exported);
      expect(parsed.length).toBe(3);
    });

    it('should clear history data', () => {
      optimizer.importHistoryData(JSON.stringify(mockHistoryData));
      optimizer.clearHistoryData();

      const history = optimizer.getHistoryData();
      expect(history.length).toBe(0);
    });
  });
});

describe('optimizeFlow', () => {
  it('should be a shortcut function', async () => {
    const result = await optimizeFlow({
      projectName: 'Test',
      totalCases: 1,
      historyData: [],
      recentPassRate: 0.9,
      avgDuration: 1000,
    }, { useAi: false });

    expect(result.suggestions).toBeDefined();
    expect(result.overallAssessment).toBeDefined();
  });
});

describe('optimize-flow.prompt', () => {
  describe('buildOptimizeFlowPrompt', () => {
    it('should build prompt with all parameters', () => {
      const prompt = buildOptimizeFlowPrompt({
        projectName: 'Test Project',
        totalCases: 10,
        historyData: defaultMockHistoryData,
        recentPassRate: 0.8,
        previousPassRate: 0.7,
        avgDuration: 5000,
      });

      expect(prompt).toContain('Test Project');
      expect(prompt).toContain('80.0%');
      expect(prompt).toContain('上升');
    });

    it('should handle no previous pass rate', () => {
      const prompt = buildOptimizeFlowPrompt({
        projectName: 'Test',
        totalCases: 10,
        historyData: defaultMockHistoryData,
        recentPassRate: 0.8,
        avgDuration: 5000,
      });

      expect(prompt).toContain('无历史数据对比');
    });
  });

  describe('parseFlowOptimizationResult', () => {
    it('should parse valid JSON', () => {
      const json = JSON.stringify({
        suggestions: [
          {
            type: 'skip',
            caseId: 'tc-001',
            caseName: 'Test',
            reason: 'Low value',
            confidence: 0.9,
            autoApplicable: true,
            impact: 'low',
            description: 'Skip',
          },
        ],
        summary: {
          totalSuggestions: 1,
          autoApplicableCount: 1,
          highImpactCount: 0,
          byType: { skip: 1 },
        },
        overallAssessment: 'Good',
        priorityActions: ['Action 1'],
      });

      const result = parseFlowOptimizationResult(json);

      expect(result.suggestions.length).toBe(1);
      expect(result.summary.totalSuggestions).toBe(1);
    });

    it('should parse JSON in code block', () => {
      const content = '```json\n{"suggestions":[],"summary":{"totalSuggestions":0,"autoApplicableCount":0,"highImpactCount":0,"byType":{}},"overallAssessment":"OK","priorityActions":[]}\n```';

      const result = parseFlowOptimizationResult(content);

      expect(result.suggestions.length).toBe(0);
    });
  });

  describe('generateQuickOptimizations', () => {
    it('should generate optimizations from history', () => {
      const suggestions = generateQuickOptimizations(defaultMockHistoryData);

      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should suggest reduce-frequency for stable tests', () => {
      const suggestions = generateQuickOptimizations(defaultMockHistoryData);

      const reduceFreq = suggestions.find(s => s.type === 'reduce-frequency');
      expect(reduceFreq).toBeDefined();
    });

    it('should suggest fix for high failure tests', () => {
      const suggestions = generateQuickOptimizations(defaultMockHistoryData);

      const fix = suggestions.find(s => s.type === 'fix-selector');
      expect(fix).toBeDefined();
    });

    it('should suggest adjust-wait for slow tests', () => {
      const suggestions = generateQuickOptimizations(defaultMockHistoryData);

      const adjust = suggestions.find(s => s.type === 'adjust-wait');
      expect(adjust).toBeDefined();
    });
  });
});
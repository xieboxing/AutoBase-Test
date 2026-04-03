import type { TestCase } from '@/types/test-case.types.js';
import { AiClient, getAiClient } from './client.js';
import {
  buildOptimizeFlowPrompt,
  parseFlowOptimizationResult,
  generateQuickOptimizations,
  type FlowOptimizationResult,
  type OptimizationSuggestion,
  type CaseHistoryData,
} from './prompts/optimize-flow.prompt.js';
import { logger } from '@/core/logger.js';

/**
 * 流程优化器配置
 */
export interface FlowOptimizerConfig {
  useAi: boolean;
  minRunsForAnalysis: number;
  autoApplyThreshold: number;
}

/**
 * 默认配置
 */
const DEFAULT_FLOW_OPTIMIZER_CONFIG: FlowOptimizerConfig = {
  useAi: true,
  minRunsForAnalysis: 3,
  autoApplyThreshold: 0.9,
};

/**
 * 优化后的测试用例
 */
export interface OptimizedTestCase extends TestCase {
  optimizationApplied: boolean;
  optimizationType?: string;
  optimizationReason?: string;
}

/**
 * 流程优化器类
 */
export class FlowOptimizer {
  private config: FlowOptimizerConfig;
  private aiClient: AiClient;
  private historyData: Map<string, CaseHistoryData> = new Map();

  constructor(config: Partial<FlowOptimizerConfig> = {}, aiClient?: AiClient) {
    this.config = { ...DEFAULT_FLOW_OPTIMIZER_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
  }

  /**
   * 分析并生成优化建议
   */
  async optimize(params: {
    projectName: string;
    totalCases: number;
    historyData: CaseHistoryData[];
    recentPassRate: number;
    previousPassRate?: number;
    avgDuration: number;
  }): Promise<FlowOptimizationResult> {
    logger.ai('🤖 开始优化测试流程', { project: params.projectName });

    // 保存历史数据
    for (const data of params.historyData) {
      this.historyData.set(data.caseId, data);
    }

    // 检查是否使用 AI
    if (!this.config.useAi || !this.aiClient.isEnabled() || !this.aiClient.isConfigured()) {
      logger.info('📍 使用规则引擎优化（AI 降级模式）');
      return this.optimizeWithRules(params);
    }

    try {
      // 使用 AI 优化
      return await this.optimizeWithAi(params);
    } catch (error) {
      logger.warn('⚠️ AI 优化失败，降级到规则引擎', { error: String(error) });
      return this.optimizeWithRules(params);
    }
  }

  /**
   * 使用 AI 优化
   */
  private async optimizeWithAi(params: {
    projectName: string;
    totalCases: number;
    historyData: CaseHistoryData[];
    recentPassRate: number;
    previousPassRate?: number;
    avgDuration: number;
  }): Promise<FlowOptimizationResult> {
    const prompt = buildOptimizeFlowPrompt(params);

    const response = await this.aiClient.chatWithRetry(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json' },
    );

    const result = parseFlowOptimizationResult(response.content);

    logger.ai('✅ AI 流程优化完成', {
      suggestions: result.suggestions.length,
      autoApplicable: result.summary.autoApplicableCount,
    });

    return result;
  }

  /**
   * 使用规则引擎优化
   */
  private optimizeWithRules(params: {
    projectName: string;
    totalCases: number;
    historyData: CaseHistoryData[];
    recentPassRate: number;
    previousPassRate?: number;
    avgDuration: number;
  }): FlowOptimizationResult {
    const suggestions = generateQuickOptimizations(params.historyData);

    // 统计摘要
    const byType: Record<string, number> = {};
    for (const s of suggestions) {
      byType[s.type] = (byType[s.type] || 0) + 1;
    }

    const autoApplicableCount = suggestions.filter(s => s.autoApplicable).length;
    const highImpactCount = suggestions.filter(s => s.impact === 'high').length;

    // 生成总体评估
    let overallAssessment = '基于历史数据的规则分析结果。';
    if (params.recentPassRate < 0.7) {
      overallAssessment += '通过率偏低，建议优先处理高频失败用例。';
    } else if (params.recentPassRate < 0.9) {
      overallAssessment += '通过率中等，建议优化不稳定用例的等待策略。';
    } else {
      overallAssessment += '通过率良好，可以关注执行效率优化。';
    }

    // 生成优先操作
    const priorityActions: string[] = [];
    const highFailures = suggestions.filter(s => s.impact === 'high');
    if (highFailures.length > 0) {
      priorityActions.push(`优先检查 ${highFailures.length} 个高影响用例`);
    }
    const slowCases = suggestions.filter(s => s.type === 'adjust-wait');
    if (slowCases.length > 0) {
      priorityActions.push(`优化 ${slowCases.length} 个慢速用例的等待时间`);
    }

    return {
      suggestions,
      summary: {
        totalSuggestions: suggestions.length,
        autoApplicableCount,
        highImpactCount,
        byType,
      },
      overallAssessment,
      priorityActions,
    };
  }

  /**
   * 应用优化建议到测试用例
   */
  applyOptimization(testCase: TestCase, suggestion: OptimizationSuggestion): OptimizedTestCase {
    const optimizedCase: OptimizedTestCase = {
      ...testCase,
      optimizationApplied: true,
      optimizationType: suggestion.type,
      optimizationReason: suggestion.reason,
    };

    switch (suggestion.type) {
      case 'increase-timeout':
        // 增加超时时间
        optimizedCase.steps = testCase.steps.map(step => ({
          ...step,
          timeout: suggestion.suggestedValue as number,
        }));
        break;

      case 'adjust-wait':
        // 调整等待时间
        optimizedCase.steps = testCase.steps.map(step => {
          if (step.action === 'wait' && step.value) {
            const currentWait = parseInt(step.value as string, 10);
            const newWait = Math.min(currentWait, suggestion.suggestedValue as number);
            return { ...step, value: String(newWait) };
          }
          return step;
        });
        break;

      case 'add-retry':
        // 添加重试配置
        optimizedCase.metadata = {
          ...testCase.metadata,
          retryCount: suggestion.suggestedValue as number,
        };
        break;

      case 'skip':
        // 标记跳过
        optimizedCase.metadata = {
          ...testCase.metadata,
          skip: Boolean(suggestion.suggestedValue ?? true),
          skipReason: suggestion.reason,
        };
        break;

      case 'reduce-frequency':
        // 降低执行频率
        optimizedCase.metadata = {
          ...testCase.metadata,
          executionFrequency: String(suggestion.suggestedValue),
        };
        break;

      default:
        // 其他优化类型暂不自动应用
        optimizedCase.optimizationApplied = false;
    }

    return optimizedCase;
  }

  /**
   * 自动应用高置信度的优化建议
   */
  autoApplyOptimizations(
    testCases: TestCase[],
    suggestions: OptimizationSuggestion[],
  ): OptimizedTestCase[] {
    const optimizedCases: OptimizedTestCase[] = [];
    const suggestionMap = new Map(suggestions.map(s => [s.caseId, s]));

    for (const testCase of testCases) {
      const suggestion = suggestionMap.get(testCase.id);

      if (suggestion && suggestion.autoApplicable && suggestion.confidence >= this.config.autoApplyThreshold) {
        logger.info('📍 自动应用优化', {
          caseId: testCase.id,
          type: suggestion.type,
          reason: suggestion.reason,
        });
        optimizedCases.push(this.applyOptimization(testCase, suggestion));
      } else {
        optimizedCases.push({
          ...testCase,
          optimizationApplied: false,
        });
      }
    }

    return optimizedCases;
  }

  /**
   * 添加运行记录
   */
  addRunRecord(caseId: string, result: 'passed' | 'failed' | 'skipped', durationMs: number): void {
    const existing = this.historyData.get(caseId);

    if (existing) {
      existing.totalRuns++;
      if (result === 'passed') existing.passCount++;
      else if (result === 'failed') existing.failCount++;
      else existing.skipCount++;

      existing.avgDurationMs = (existing.avgDurationMs + durationMs) / existing.totalRuns;
      existing.lastResult = result;
      existing.recentResults.push(result);

      // 保持最近10条记录
      if (existing.recentResults.length > 10) {
        existing.recentResults.shift();
      }
    } else {
      // 创建新记录
      const newRecord: CaseHistoryData = {
        caseId,
        caseName: caseId,
        totalRuns: 1,
        passCount: result === 'passed' ? 1 : 0,
        failCount: result === 'failed' ? 1 : 0,
        skipCount: result === 'skipped' ? 1 : 0,
        avgDurationMs: durationMs,
        lastResult: result,
        recentResults: [result],
        priority: 'P2',
        type: 'functional',
        tags: [],
      };
      this.historyData.set(caseId, newRecord);
    }
  }

  /**
   * 获取历史数据
   */
  getHistoryData(): CaseHistoryData[] {
    return Array.from(this.historyData.values());
  }

  /**
   * 清理历史数据
   */
  clearHistoryData(): void {
    this.historyData.clear();
  }

  /**
   * 导出历史数据
   */
  exportHistoryData(): string {
    return JSON.stringify(Array.from(this.historyData.values()), null, 2);
  }

  /**
   * 导入历史数据
   */
  importHistoryData(data: string): void {
    try {
      const parsed = JSON.parse(data) as CaseHistoryData[];
      for (const record of parsed) {
        this.historyData.set(record.caseId, record);
      }
    } catch (error) {
      logger.fail('❌ 导入历史数据失败', { error: String(error) });
    }
  }
}

/**
 * 快捷优化函数
 */
export async function optimizeFlow(
  params: {
    projectName: string;
    totalCases: number;
    historyData: CaseHistoryData[];
    recentPassRate: number;
    previousPassRate?: number;
    avgDuration: number;
  },
  options?: Partial<FlowOptimizerConfig>,
): Promise<FlowOptimizationResult> {
  const optimizer = new FlowOptimizer(options);
  return optimizer.optimize(params);
}
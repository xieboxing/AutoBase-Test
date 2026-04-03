import { z } from 'zod';

/**
 * 优化建议 Schema
 */
export const optimizationSuggestionSchema = z.object({
  type: z.enum([
    'skip',
    'reduce-frequency',
    'adjust-wait',
    'merge',
    'add',
    'fix-selector',
    'increase-timeout',
    'add-retry',
    'split-case',
  ]).describe('优化类型'),
  caseId: z.string().describe('用例ID'),
  caseName: z.string().describe('用例名称'),
  reason: z.string().describe('优化原因'),
  suggestedValue: z.union([z.string(), z.number()]).optional().describe('建议的值'),
  confidence: z.number().min(0).max(1).describe('置信度'),
  autoApplicable: z.boolean().describe('是否可自动应用'),
  impact: z.enum(['high', 'medium', 'low']).describe('影响程度'),
  description: z.string().describe('详细描述'),
  lastError: z.string().optional().describe('最后错误信息'),
});

export type OptimizationSuggestion = z.infer<typeof optimizationSuggestionSchema>;

/**
 * 流程优化结果 Schema
 */
export const flowOptimizationSchema = z.object({
  suggestions: z.array(optimizationSuggestionSchema).describe('优化建议列表'),
  summary: z.object({
    totalSuggestions: z.number().describe('总建议数'),
    autoApplicableCount: z.number().describe('可自动应用的数量'),
    highImpactCount: z.number().describe('高影响数量'),
    byType: z.record(z.number()).describe('按类型统计'),
  }).describe('统计摘要'),
  overallAssessment: z.string().describe('总体评估'),
  priorityActions: z.array(z.string()).describe('优先执行的操作'),
});

export type FlowOptimizationResult = z.infer<typeof flowOptimizationSchema>;

/**
 * 用例历史数据
 */
export interface CaseHistoryData {
  caseId: string;
  caseName: string;
  totalRuns: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  avgDurationMs: number;
  lastResult: 'passed' | 'failed' | 'skipped';
  lastError?: string;
  recentResults: Array<'passed' | 'failed' | 'skipped'>;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: string;
  tags: string[];
}

/**
 * 构建流程优化 Prompt
 */
export function buildOptimizeFlowPrompt(params: {
  projectName: string;
  totalCases: number;
  historyData: CaseHistoryData[];
  recentPassRate: number;
  previousPassRate?: number;
  avgDuration: number;
}): string {
  // 按失败次数排序
  const topFailures = params.historyData
    .filter(h => h.failCount > 0)
    .sort((a, b) => b.failCount - a.failCount)
    .slice(0, 20);

  // 稳定通过的用例
  const stableCases = params.historyData
    .filter(h => h.passCount >= 5 && h.failCount === 0);

  // 执行时间长的用例
  const slowCases = params.historyData
    .filter(h => h.avgDurationMs > 10000)
    .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
    .slice(0, 10);

  const trendInfo = params.previousPassRate
    ? `上次通过率: ${(params.previousPassRate * 100).toFixed(1)}%，${params.recentPassRate > params.previousPassRate ? '上升' : '下降'} ${Math.abs(params.recentPassRate - params.previousPassRate) * 100 | 0}%`
    : '无历史数据对比';

  return `你是一位资深的QA测试专家。请分析测试历史数据，提供优化建议。

## 项目概览
- 项目名称: ${params.projectName}
- 总用例数: ${params.totalCases}
- 最近通过率: ${(params.recentPassRate * 100).toFixed(1)}%
- ${trendInfo}
- 平均执行时间: ${(params.avgDuration / 1000).toFixed(1)}s

## 高频失败用例（前20个）
\`\`\`json
${JSON.stringify(topFailures.map(h => ({
  caseId: h.caseId,
  caseName: h.caseName,
  failCount: h.failCount,
  passCount: h.passCount,
  passRate: (h.passCount / h.totalRuns * 100).toFixed(1) + '%',
  lastError: h.lastError?.slice(0, 100),
  recentResults: h.recentResults.slice(-5),
})), null, 2)}
\`\`\`

## 稳定通过的用例
共 ${stableCases.length} 个用例连续通过（建议降低执行频率）

## 执行时间较长的用例（前10个）
\`\`\`json
${JSON.stringify(slowCases.map(h => ({
  caseId: h.caseId,
  caseName: h.caseName,
  avgDuration: (h.avgDurationMs / 1000).toFixed(1) + 's',
  priority: h.priority,
})), null, 2)}
\`\`\`

## 优化类型说明

1. **skip**: 跳过低价值用例
2. **reduce-frequency**: 降低执行频率（稳定通过的用例）
3. **adjust-wait**: 调整等待时间
4. **merge**: 合并相似用例
5. **add**: 建议新增用例
6. **fix-selector**: 修复选择器问题
7. **increase-timeout**: 增加超时时间
8. **add-retry**: 添加重试机制
9. **split-case**: 拆分过大的用例

## 分析要求

请输出优化建议（JSON格式）：

1. 每个建议包含：
   - type: 优化类型
   - caseId: 用例ID
   - caseName: 用例名称
   - reason: 具体原因
   - suggestedValue: 建议的值（如等待时间、执行频率等）
   - confidence: 置信度 0-1
   - autoApplicable: 是否可自动应用
   - impact: 影响程度 high/medium/low
   - description: 详细描述

2. 提供：
   - 总体评估
   - 优先执行的操作列表

请用中文回答，输出严格的JSON格式。`;
}

/**
 * 解析优化结果
 */
export function parseFlowOptimizationResult(content: string): FlowOptimizationResult {
  try {
    const parsed = JSON.parse(content);
    return flowOptimizationSchema.parse(parsed);
  } catch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return flowOptimizationSchema.parse(parsed);
    }

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return flowOptimizationSchema.parse(parsed);
    }

    throw new Error('无法解析优化结果');
  }
}

/**
 * 基于规则的快速优化建议（无需 AI）
 */
export function generateQuickOptimizations(historyData: CaseHistoryData[]): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = [];

  for (const data of historyData) {
    // 稳定通过的用例建议降低频率
    if (data.passCount >= 5 && data.failCount === 0 && data.totalRuns >= 5) {
      suggestions.push({
        type: 'reduce-frequency',
        caseId: data.caseId,
        caseName: data.caseName,
        reason: `连续 ${data.passCount} 次通过，建议降低执行频率`,
        suggestedValue: '每次构建只执行一次',
        confidence: 0.9,
        autoApplicable: true,
        impact: 'low',
        description: '该用例非常稳定，可以考虑只在关键节点执行',
      });
    }

    // 高失败率用例
    if (data.failCount > data.passCount && data.totalRuns >= 3) {
      suggestions.push({
        type: 'fix-selector',
        caseId: data.caseId,
        caseName: data.caseName,
        reason: `失败率 ${(data.failCount / data.totalRuns * 100).toFixed(0)}%，需要检查`,
        lastError: data.lastError?.slice(0, 50),
        confidence: 0.7,
        autoApplicable: false,
        impact: 'high',
        description: data.lastError || '需要人工检查失败原因',
      });
    }

    // 执行时间过长
    if (data.avgDurationMs > 30000) {
      suggestions.push({
        type: 'adjust-wait',
        caseId: data.caseId,
        caseName: data.caseName,
        reason: `平均执行时间 ${(data.avgDurationMs / 1000).toFixed(1)}s，可能存在不必要的等待`,
        suggestedValue: 10000, // 建议最大等待 10s
        confidence: 0.6,
        autoApplicable: true,
        impact: 'medium',
        description: '检查是否有硬编码的等待时间可以优化',
      });
    }
  }

  return suggestions;
}
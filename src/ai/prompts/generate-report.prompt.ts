import { z } from 'zod';

/**
 * 测试报告摘要 Schema
 */
export const reportSummarySchema = z.object({
  overallAssessment: z.string().describe('总体评估'),
  qualityScore: z.number().min(0).max(100).describe('质量评分 0-100'),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']).describe('风险等级'),
  criticalIssues: z.array(z.object({
    description: z.string().describe('问题描述'),
    impact: z.string().describe('影响范围'),
    suggestion: z.string().describe('修复建议'),
  })).describe('关键问题'),
  recommendations: z.array(z.string()).describe('改进建议'),
  nextSteps: z.array(z.string()).describe('下一步行动'),
  highlights: z.array(z.string()).describe('亮点（通过的测试）'),
});

export type ReportSummary = z.infer<typeof reportSummarySchema>;

/**
 * 测试结果摘要
 */
export interface TestResultSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  duration: number;
  platform: string;
}

/**
 * 失败用例信息
 */
export interface FailedCaseInfo {
  caseId: string;
  caseName: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  errorMessage: string;
  failedStep?: string;
}

/**
 * 构建报告生成 Prompt
 */
export function buildGenerateReportPrompt(params: {
  projectName: string;
  runId: string;
  startTime: string;
  endTime: string;
  summary: TestResultSummary;
  failedCases: FailedCaseInfo[];
  performanceData?: {
    avgPageLoadTime: number;
    slowPages: string[];
  };
  categories?: Record<string, { passed: number; failed: number; total: number }>;
}): string {
  const durationMinutes = Math.round(params.summary.duration / 60000);

  const categorySummary = params.categories
    ? Object.entries(params.categories)
        .map(([name, data]) => `- ${name}: ${data.passed}/${data.total} 通过 (${((data.passed / data.total) * 100).toFixed(0)}%)`)
        .join('\n')
    : '无分类数据';

  const failedCasesSummary = params.failedCases
    .slice(0, 20)
    .map(c => `- [${c.priority}] ${c.caseName}: ${c.errorMessage.slice(0, 100)}`)
    .join('\n');

  return `你是一位资深的QA测试专家。请根据测试结果生成一份简洁、专业的中文测试报告摘要。

## 测试运行信息
- 项目名称: ${params.projectName}
- 运行ID: ${params.runId}
- 开始时间: ${params.startTime}
- 结束时间: ${params.endTime}
- 运行时长: ${durationMinutes} 分钟
- 测试平台: ${params.summary.platform}

## 测试结果概览
- 总用例数: ${params.summary.total}
- 通过: ${params.summary.passed}
- 失败: ${params.summary.failed}
- 跳过: ${params.summary.skipped}
- 阻塞: ${params.summary.blocked}
- 通过率: ${(params.summary.passRate * 100).toFixed(1)}%

## 分类结果
${categorySummary}

## 失败用例（前20个）
${failedCasesSummary || '无失败用例'}

${params.performanceData ? `## 性能数据
- 平均页面加载时间: ${params.performanceData.avgPageLoadTime.toFixed(0)}ms
- 较慢页面: ${params.performanceData.slowPages.slice(0, 5).join(', ') || '无'}` : ''}

## 生成要求

请输出JSON格式的报告摘要：

1. **总体评估**：2-3句话总结测试结果
2. **质量评分**：0-100的评分
3. **风险等级**：low/medium/high/critical
4. **关键问题**：P0/P1 级别的失败用例摘要
5. **改进建议**：针对性的改进建议
6. **下一步行动**：具体的行动项
7. **亮点**：通过的测试亮点

注意：
- 使用专业但易懂的语言
- 关注产品经理关心的内容
- 突出关键问题
- 给出可操作的建议

请用中文回答，输出严格的JSON格式。`;
}

/**
 * 解析报告摘要
 */
export function parseReportSummary(content: string): ReportSummary {
  try {
    const parsed = JSON.parse(content);
    return reportSummarySchema.parse(parsed);
  } catch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return reportSummarySchema.parse(parsed);
    }

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return reportSummarySchema.parse(parsed);
    }

    throw new Error('无法解析报告摘要');
  }
}

/**
 * 构建对比报告 Prompt
 */
export function buildCompareReportPrompt(params: {
  currentRun: {
    runId: string;
    passRate: number;
    totalCases: number;
    passed: number;
    failed: number;
  };
  previousRun: {
    runId: string;
    passRate: number;
    totalCases: number;
    passed: number;
    failed: number;
  };
  newFailures: Array<{ caseId: string; caseName: string; error: string }>;
  fixedIssues: Array<{ caseId: string; caseName: string }>;
  persistentIssues: Array<{ caseId: string; caseName: string; failCount: number }>;
}): string {
  const passRateChange = params.currentRun.passRate - params.previousRun.passRate;
  const passRateTrend = passRateChange > 0 ? '上升' : passRateChange < 0 ? '下降' : '持平';

  return `请对比两次测试运行结果，生成分析报告。

## 当前运行
- 运行ID: ${params.currentRun.runId}
- 通过率: ${(params.currentRun.passRate * 100).toFixed(1)}%
- 通过/总数: ${params.currentRun.passed}/${params.currentRun.totalCases}

## 上次运行
- 运行ID: ${params.previousRun.runId}
- 通过率: ${(params.previousRun.passRate * 100).toFixed(1)}%
- 通过/总数: ${params.previousRun.passed}/${params.previousRun.totalCases}

## 变化趋势
- 通过率${passRateTrend} ${Math.abs(passRateChange * 100).toFixed(1)}%

## 新增失败（${params.newFailures.length}个）
${params.newFailures.slice(0, 10).map(f => `- ${f.caseName}: ${f.error.slice(0, 50)}`).join('\n') || '无'}

## 已修复问题（${params.fixedIssues.length}个）
${params.fixedIssues.slice(0, 10).map(f => `- ${f.caseName}`).join('\n') || '无'}

## 持续问题（${params.persistentIssues.length}个）
${params.persistentIssues.slice(0, 10).map(f => `- ${f.caseName} (失败 ${f.failCount} 次)`).join('\n') || '无'}

请输出JSON格式的对比分析报告，包含：
1. 总体评估
2. 质量评分
3. 风险等级
4. 关键问题（重点关注新增失败）
5. 改进建议
6. 下一步行动
7. 亮点（已修复的问题）

用中文回答，输出严格的JSON格式。`;
}
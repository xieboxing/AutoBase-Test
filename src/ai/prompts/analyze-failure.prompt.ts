import { z } from 'zod';

/**
 * 失败分析结果 Schema
 */
export const failureAnalysisSchema = z.object({
  possibleCauses: z.array(z.string()).describe('可能的失败原因'),
  isProductBug: z.boolean().describe('是否是产品Bug'),
  isTestIssue: z.boolean().describe('是否是测试问题'),
  confidence: z.number().min(0).max(1).describe('置信度 0-1'),
  fixSuggestions: z.array(z.string()).describe('修复建议'),
  relatedPatterns: z.array(z.string()).optional().describe('相关的失败模式'),
  severity: z.enum(['critical', 'high', 'medium', 'low']).describe('严重程度'),
  category: z.enum([
    'element-not-found',
    'timeout',
    'assertion-failed',
    'network-error',
    'permission-denied',
    'unexpected-state',
    'other',
  ]).describe('失败类别'),
});

export type FailureAnalysisResult = z.infer<typeof failureAnalysisSchema>;

/**
 * 失败上下文
 */
export interface FailureContext {
  testCaseId: string;
  testCaseName: string;
  projectId?: string;
  failedStep: {
    order: number;
    action: string;
    target?: string;
    value?: string;
    description: string;
  };
  errorMessage: string;
  errorStack?: string;
  screenshotBase64?: string;
  pageUrl?: string;
  pageTitle?: string;
  timestamp: string;
  retryCount: number;
  previousSteps?: Array<{
    order: number;
    action: string;
    status: 'passed' | 'failed';
  }>;
}

/**
 * 构建失败分析 Prompt
 */
export function buildAnalyzeFailurePrompt(params: {
  context: FailureContext;
  pageHtml?: string;
  interactiveElements?: Array<{ selector: string; text?: string; visible: boolean }>;
  similarMemories?: string;
}): string {
  const previousStepsSummary = params.context.previousSteps
    ?.map(s => `${s.order}. ${s.action} - ${s.status}`)
    .join('\n') || '无';

  const elementsSummary = params.interactiveElements
    ?.slice(0, 20)
    .map(el => `- ${el.selector}: ${el.text || '(无文本)'} [${el.visible ? '可见' : '不可见'}]`)
    .join('\n') || '无元素信息';

  const memorySection = params.similarMemories
    ? `\n${params.similarMemories}\n**注意**: 请参考以上历史案例，如果有相似情况，可以复用之前的解决方案。\n`
    : '';

  return `你是一位资深的QA测试专家。请分析以下测试失败的原因。
${memorySection}
## 测试用例信息
- 用例ID: ${params.context.testCaseId}
- 用例名称: ${params.context.testCaseName}
- 失败时间: ${params.context.timestamp}
- 重试次数: ${params.context.retryCount}

## 失败步骤
- 步骤顺序: ${params.context.failedStep.order}
- 动作类型: ${params.context.failedStep.action}
- 目标元素: ${params.context.failedStep.target || '(无)'}
- 输入值: ${params.context.failedStep.value || '(无)'}
- 步骤描述: ${params.context.failedStep.description}

## 错误信息
\`\`\`
${params.context.errorMessage}
\`\`\`

${params.context.errorStack ? `## 错误堆栈\n\`\`\`\n${params.context.errorStack}\n\`\`\`` : ''}

## 页面信息
- URL: ${params.context.pageUrl || '(未知)'}
- 标题: ${params.context.pageTitle || '(未知)'}

## 之前的步骤
${previousStepsSummary}

## 当前页面元素
${elementsSummary}

${params.pageHtml ? `## 页面HTML片段\n\`\`\`html\n${params.pageHtml.slice(0, 3000)}\n\`\`\`` : ''}

## 分析要求

请分析失败原因并输出JSON格式结果：

1. **可能的失败原因**：列出2-5个可能的原因，按可能性排序
2. **是否是产品Bug**：true/false
3. **是否是测试问题**：true/false（例如选择器过时、等待时间不足等）
4. **置信度**：0-1之间的数值
5. **修复建议**：具体的修复步骤
6. **相关失败模式**：如果有类似的失败模式
7. **严重程度**：critical/high/medium/low
8. **失败类别**：
   - element-not-found: 元素未找到
   - timeout: 超时
   - assertion-failed: 断言失败
   - network-error: 网络错误
   - permission-denied: 权限被拒绝
   - unexpected-state: 意外状态
   - other: 其他

请用中文回答，输出严格的JSON格式。`;
}

/**
 * 构建带截图的失败分析 Prompt
 */
export function buildAnalyzeFailureWithScreenshotPrompt(params: {
  context: FailureContext;
  pageHtml?: string;
  interactiveElements?: Array<{ selector: string; text?: string; visible: boolean }>;
  screenshotBase64: string;
  similarMemories?: string;
}): Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }> {
  const textPrompt = buildAnalyzeFailurePrompt({
    context: params.context,
    pageHtml: params.pageHtml,
    interactiveElements: params.interactiveElements,
    similarMemories: params.similarMemories,
  });

  return [
    { type: 'text', text: textPrompt },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: params.screenshotBase64,
      },
    },
    {
      type: 'text',
      text: '\n\n以上是失败时的页面截图，请结合截图分析失败原因。',
    },
  ];
}

/**
 * 解析失败分析结果
 */
export function parseFailureAnalysisResult(content: string): FailureAnalysisResult {
  try {
    const parsed = JSON.parse(content);
    return failureAnalysisSchema.parse(parsed);
  } catch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return failureAnalysisSchema.parse(parsed);
    }

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return failureAnalysisSchema.parse(parsed);
    }

    throw new Error('无法解析失败分析结果');
  }
}

/**
 * 快速失败分类（无需 AI）
 */
export function classifyFailureQuick(errorMessage: string): FailureAnalysisResult['category'] {
  const lowerError = errorMessage.toLowerCase();

  if (lowerError.includes('not found') || lowerError.includes('no element') || lowerError.includes('无法找到')) {
    return 'element-not-found';
  }
  if (lowerError.includes('timeout') || lowerError.includes('timed out') || lowerError.includes('超时')) {
    return 'timeout';
  }
  if (lowerError.includes('assertion') || lowerError.includes('assert') || lowerError.includes('断言')) {
    return 'assertion-failed';
  }
  if (lowerError.includes('network') || lowerError.includes('fetch') || lowerError.includes('网络')) {
    return 'network-error';
  }
  if (lowerError.includes('permission') || lowerError.includes('denied') || lowerError.includes('权限')) {
    return 'permission-denied';
  }

  return 'other';
}
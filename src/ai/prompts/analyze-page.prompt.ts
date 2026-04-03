import { z } from 'zod';
import type { PageSnapshot, InteractiveElement, FormInfo } from '@/types/crawler.types.js';

/**
 * 页面分析结果 Schema
 */
export const pageAnalysisSchema = z.object({
  pageDescription: z.string().describe('页面功能描述（一句话）'),
  testableFeatures: z.array(z.object({
    name: z.string().describe('功能名称'),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']).describe('优先级'),
    description: z.string().describe('功能描述'),
    suggestedSteps: z.array(z.string()).describe('建议的测试步骤'),
    type: z.enum(['functional', 'visual', 'interaction']).describe('功能类型'),
  })).describe('可测试的功能点列表'),
  potentialRisks: z.array(z.string()).describe('潜在风险点'),
  suggestedTestData: z.record(z.array(z.string())).describe('建议的测试数据'),
});

export type PageAnalysisResult = z.infer<typeof pageAnalysisSchema>;

/**
 * 构建页面分析 Prompt
 */
export function buildAnalyzePagePrompt(params: {
  url: string;
  title: string;
  html: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  platform: 'pc' | 'h5';
}): string {
  const elementsSummary = params.interactiveElements.slice(0, 50).map(el => ({
    tag: el.tag,
    text: el.text?.slice(0, 50),
    selector: el.selector,
    type: el.type,
    visible: el.visible,
    disabled: el.disabled,
  }));

  const formsSummary = params.forms.map(form => ({
    selector: form.selector,
    action: form.action,
    fields: form.fields.map(f => ({
      type: f.type,
      name: f.name,
      label: f.label,
      required: f.required,
    })),
  }));

  return `你是一位资深的QA测试专家。请分析以下页面，识别所有可测试的功能点。

## 页面信息
- URL: ${params.url}
- 标题: ${params.title}
- 平台: ${params.platform === 'pc' ? 'PC桌面端' : 'H5移动端'}

## 页面HTML结构（精简版）
\`\`\`html
${params.html.slice(0, 5000)}
\`\`\`

## 可交互元素列表（前50个）
\`\`\`json
${JSON.stringify(elementsSummary, null, 2)}
\`\`\`

## 表单列表
\`\`\`json
${JSON.stringify(formsSummary, null, 2)}
\`\`\`

## 分析要求

请根据以上信息，输出以下内容（严格的JSON格式）：

1. **页面功能描述**：用一句话描述页面的主要功能
2. **可测试功能点列表**：每个功能点包含
   - 名称：简洁的功能名称
   - 优先级：P0（阻塞级）到 P3（轻微）
   - 描述：功能的详细说明
   - 建议的测试步骤：数组形式的步骤列表
   - 类型：functional（功能）/ visual（视觉）/ interaction（交互）
3. **潜在风险点**：可能存在问题的地方
4. **建议的测试数据**：按字段名组织的测试数据

## 优先级说明
- P0: 阻塞级，核心功能，必须测试
- P1: 严重级，重要功能，应该测试
- P2: 一般级，普通功能，建议测试
- P3: 轻微级，边缘场景，可选测试

请用中文回答，输出严格的JSON格式。`;
}

/**
 * 构建带截图的页面分析 Prompt
 */
export function buildAnalyzePageWithScreenshotPrompt(params: {
  url: string;
  title: string;
  html: string;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  platform: 'pc' | 'h5';
  screenshotBase64: string;
}): Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }> {
  const textPrompt = buildAnalyzePagePrompt(params);

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
      text: '\n\n以上是页面的截图，请结合截图和HTML结构进行分析。',
    },
  ];
}

/**
 * 解析页面分析结果
 */
export function parsePageAnalysisResult(content: string): PageAnalysisResult {
  try {
    // 尝试直接解析
    const parsed = JSON.parse(content);
    return pageAnalysisSchema.parse(parsed);
  } catch {
    // 尝试提取 JSON 代码块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return pageAnalysisSchema.parse(parsed);
    }

    // 尝试提取纯 JSON
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return pageAnalysisSchema.parse(parsed);
    }

    throw new Error('无法解析页面分析结果');
  }
}
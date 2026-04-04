/**
 * 业务流分析 Prompt
 * 基于页面截图和结构分析业务流程，生成端到端测试用例
 */

import { z } from 'zod';
import type { InteractiveElement, FormInfo } from '@/types/crawler.types.js';

/**
 * 业务步骤 Schema
 */
export const businessStepSchema = z.object({
  stepId: z.string().describe('步骤 ID'),
  name: z.string().describe('步骤名称'),
  description: z.string().describe('步骤描述'),
  action: z.enum(['navigate', 'click', 'fill', 'select', 'wait', 'assert', 'scroll', 'hover']).describe('动作类型'),
  target: z.string().optional().describe('目标元素选择器'),
  value: z.string().optional().describe('输入值'),
  expectedOutcome: z.string().describe('预期结果'),
  criticalStep: z.boolean().describe('是否关键步骤'),
});

export type BusinessStep = z.infer<typeof businessStepSchema>;

/**
 * 业务流 Schema
 */
export const businessFlowSchema = z.object({
  flowId: z.string().describe('业务流 ID'),
  flowName: z.string().describe('业务流名称'),
  flowType: z.enum(['user-journey', 'transaction', 'form-submission', 'navigation', 'authentication', 'shopping', 'search', 'crud']).describe('业务流类型'),
  description: z.string().describe('业务流描述'),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).describe('优先级'),
  entryPoint: z.string().describe('入口页面 URL'),
  exitPoint: z.string().optional().describe('出口页面 URL'),
  steps: z.array(businessStepSchema).describe('业务步骤'),
  preconditions: z.array(z.string()).describe('前置条件'),
  postconditions: z.array(z.string()).describe('后置条件'),
  testData: z.record(z.string()).optional().describe('测试数据'),
  confidence: z.number().min(0).max(1).describe('置信度'),
});

export type BusinessFlow = z.infer<typeof businessFlowSchema>;

/**
 * 页面业务分析结果 Schema
 */
export const pageBusinessAnalysisSchema = z.object({
  pageName: z.string().describe('页面名称'),
  pagePurpose: z.string().describe('页面用途'),
  businessScenarios: z.array(z.object({
    name: z.string().describe('业务场景名称'),
    description: z.string().describe('场景描述'),
    userGoal: z.string().describe('用户目标'),
    involvedElements: z.array(z.string()).describe('涉及元素'),
  })).describe('业务场景列表'),
  potentialFlows: z.array(businessFlowSchema).describe('潜在业务流'),
  criticalElements: z.array(z.object({
    selector: z.string().describe('元素选择器'),
    elementName: z.string().describe('元素名称'),
    businessValue: z.string().describe('业务价值'),
    risk: z.string().optional().describe('风险'),
  })).describe('关键业务元素'),
  recommendations: z.array(z.string()).describe('测试建议'),
});

export type PageBusinessAnalysis = z.infer<typeof pageBusinessAnalysisSchema>;

/**
 * 构建业务流分析 Prompt（仅文本）
 */
export function buildBusinessFlowPrompt(params: {
  url: string;
  title: string;
  platform: 'pc-web' | 'h5-web';
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  previousPages?: Array<{ url: string; title: string }>;
}): string {
  const elementsSummary = params.interactiveElements.slice(0, 30).map(el => ({
    tag: el.tag,
    text: el.text?.slice(0, 50),
    selector: el.selector,
    type: el.type,
    attributes: {
      href: el.attributes?.href,
      name: el.attributes?.name,
      placeholder: el.attributes?.placeholder,
      'aria-label': el.attributes?.['aria-label'],
    },
  }));

  const formsSummary = params.forms.map(form => ({
    selector: form.selector,
    action: form.action,
    method: form.method,
    fields: form.fields.map(f => ({
      type: f.type,
      name: f.name,
      label: f.label,
      required: f.required,
    })),
  }));

  return `你是一位资深的产品经理和业务分析师。请从业务流程角度分析以下页面。

## 页面信息
- URL: ${params.url}
- 标题: ${params.title}
- 平台: ${params.platform}

## 可交互元素（前30个）
\`\`\`json
${JSON.stringify(elementsSummary, null, 2)}
\`\`\`

## 表单信息
\`\`\`json
${JSON.stringify(formsSummary, null, 2)}
\`\`\`

${params.previousPages && params.previousPages.length > 0 ? `
## 已访问页面
${params.previousPages.map(p => `- ${p.title}: ${p.url}`).join('\n')}
` : ''}

## 分析要求

请从**业务流程**角度分析页面，输出以下内容（严格的JSON格式）：

1. **页面名称**：简短标识
2. **页面用途**：描述页面的业务价值
3. **业务场景列表**：
   - 识别用户在页面上可能完成的业务场景
   - 每个场景包含：名称、描述、用户目标、涉及元素
4. **潜在业务流**：
   - 基于元素和场景，构建完整的端到端业务流
   - 每个业务流包含：
     - flowId: 唯一标识（如 "login-flow", "checkout-flow"）
     - flowName: 业务流名称
     - flowType: 类型（user-journey/transaction/form-submission/navigation/authentication/shopping/search/crud）
     - description: 详细描述
     - priority: 优先级（P0-P3）
     - entryPoint: 入口页面
     - steps: 步骤数组（每步包含 stepId, name, description, action, target, value, expectedOutcome, criticalStep）
     - preconditions: 前置条件
     - postconditions: 后置条件
     - testData: 测试数据
     - confidence: 置信度（0-1）
5. **关键业务元素**：列出对业务最重要的元素
6. **测试建议**：针对业务流的测试建议

## 业务流类型说明
- user-journey: 用户旅程（注册、登录、个人中心等）
- transaction: 交易流程（支付、转账等）
- form-submission: 表单提交（联系表单、反馈表单等）
- navigation: 导航流程（菜单浏览、面包屑等）
- authentication: 认证流程（登录、注册、找回密码等）
- shopping: 购物流程（浏览、加购、结算等）
- search: 搜索流程（搜索、筛选、结果浏览等）
- crud: 增删改查操作

请用中文回答，输出严格的JSON格式。`;
}

/**
 * 构建带截图的业务流分析 Prompt
 */
export function buildBusinessFlowWithScreenshotPrompt(params: {
  url: string;
  title: string;
  platform: 'pc-web' | 'h5-web';
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  screenshotBase64: string;
  previousPages?: Array<{ url: string; title: string }>;
}): Array<{ type: 'text' | 'image'; text?: string; source?: { type: 'base64'; media_type: string; data: string } }> {
  const textPrompt = buildBusinessFlowPrompt(params);

  return [
    { type: 'text', text: textPrompt },
    {
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: params.screenshotBase64,
      },
    },
    {
      type: 'text',
      text: '\n\n以上是页面的截图，请结合截图分析页面的业务流程和用户交互逻辑。',
    },
  ];
}

/**
 * 解析业务流分析结果
 */
export function parseBusinessFlowAnalysis(content: string): PageBusinessAnalysis {
  try {
    // 尝试直接解析
    const parsed = JSON.parse(content);
    return pageBusinessAnalysisSchema.parse(parsed);
  } catch {
    // 尝试提取 JSON 代码块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return pageBusinessAnalysisSchema.parse(parsed);
    }

    // 尝试提取纯 JSON
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return pageBusinessAnalysisSchema.parse(parsed);
    }

    throw new Error('无法解析业务流分析结果');
  }
}

/**
 * 构建跨页面业务流分析 Prompt
 */
export function buildCrossPageFlowPrompt(params: {
  pages: Array<{
    url: string;
    title: string;
    screenshotBase64?: string;
    keyElements: string[];
  }>;
  platform: 'pc-web' | 'h5-web';
}): string {
  const pagesSummary = params.pages.map((p, i) => ({
    index: i + 1,
    url: p.url,
    title: p.title,
    keyElements: p.keyElements.slice(0, 10),
  }));

  return `你是一位资深的产品经理和业务分析师。请分析以下页面序列，识别完整的跨页面业务流。

## 平台
${params.platform}

## 页面序列
\`\`\`json
${JSON.stringify(pagesSummary, null, 2)}
\`\`\`

## 分析要求

请识别以下内容（严格的JSON格式）：

1. **整体业务流程**：
   - 这些页面共同完成了什么业务目标？
   - 用户的核心路径是什么？

2. **完整业务流**：
   \`\`\`json
   {
     "flowId": "string",
     "flowName": "string",
     "flowType": "user-journey|transaction|form-submission|navigation|authentication|shopping|search|crud",
     "description": "string",
     "priority": "P0|P1|P2|P3",
     "steps": [
       {
         "stepId": "string",
         "name": "string",
         "description": "string",
         "action": "navigate|click|fill|select|wait|assert|scroll|hover",
         "target": "selector (optional)",
         "value": "string (optional)",
         "expectedOutcome": "string",
         "criticalStep": true|false
       }
     ],
     "preconditions": ["string"],
     "postconditions": ["string"],
     "testData": { "field": "value" },
     "confidence": 0.0-1.0
   }
   \`\`\`

3. **关键断言点**：在哪些步骤需要验证什么

4. **潜在风险点**：可能失败的地方

请用中文回答，输出严格的JSON格式。`;
}
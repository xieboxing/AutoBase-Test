import { z } from 'zod';
import type { PageAnalysisResult } from './analyze-page.prompt.js';
import type { InteractiveElement, FormInfo } from '@/types/crawler.types.js';
import type { HistoricalContext } from '@/types/knowledge.types.js';

/**
 * 测试步骤 Schema
 */
export const testStepSchema = z.object({
  order: z.number().describe('步骤顺序'),
  action: z.enum([
    'navigate',
    'click',
    'fill',
    'select',
    'hover',
    'scroll',
    'wait',
    'screenshot',
    'assert',
  ]).describe('动作类型'),
  target: z.string().optional().describe('目标元素选择器'),
  value: z.string().optional().describe('输入值或断言值'),
  description: z.string().describe('步骤描述'),
  assertType: z.enum([
    'element-visible',
    'element-hidden',
    'text-contains',
    'url-contains',
    'title-equals',
    'element-count',
    'attribute-equals',
  ]).optional().describe('断言类型'),
});

/**
 * 测试用例 Schema
 */
export const testCaseSchema = z.object({
  id: z.string().describe('用例ID，格式: tc-{category}-{number}'),
  name: z.string().describe('用例名称'),
  description: z.string().describe('用例描述'),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']).describe('优先级'),
  type: z.enum(['functional', 'visual', 'performance', 'security', 'accessibility']).describe('用例类型'),
  platform: z.array(z.enum(['pc-web', 'h5-web', 'android-app'])).describe('适用平台'),
  tags: z.array(z.string()).describe('标签'),
  preconditions: z.array(z.string()).optional().describe('前置条件'),
  steps: z.array(testStepSchema).describe('测试步骤'),
  cleanup: z.array(testStepSchema).optional().describe('清理步骤'),
});

export type TestStep = z.infer<typeof testStepSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;

/**
 * 测试用例生成结果 Schema
 */
export const generateCasesResultSchema = z.object({
  cases: z.array(testCaseSchema).describe('生成的测试用例列表'),
  summary: z.object({
    total: z.number().describe('总用例数'),
    byPriority: z.record(z.number()).describe('按优先级统计'),
    byType: z.record(z.number()).describe('按类型统计'),
  }).describe('统计摘要'),
});

export type GenerateCasesResult = z.infer<typeof generateCasesResultSchema>;

/**
 * 构建生成测试用例 Prompt
 */
export function buildGenerateCasesPrompt(params: {
  pageUrl: string;
  pageTitle: string;
  platform: 'pc-web' | 'h5-web' | 'android-app';
  pageAnalysis: PageAnalysisResult;
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
  /** 历史测试上下文（可选） */
  historicalContext?: HistoricalContext;
  /** 相似历史记忆（可选） */
  similarMemories?: string;
}): string {
  // 构建元素选择器映射
  const elementSelectors = params.interactiveElements.slice(0, 30).map(el => ({
    description: el.text || el.attributes['aria-label'] || el.tag,
    selector: el.selector,
    alternatives: el.alternativeSelectors.slice(0, 2),
  }));

  const formData = params.forms.map(form => ({
    selector: form.selector,
    fields: form.fields.map(f => ({
      selector: f.selector,
      type: f.type,
      name: f.name,
      label: f.label,
      required: f.required,
      placeholder: f.placeholder,
    })),
  }));

  // 构建历史上下文段落
  let historicalContextSection = '';
  if (params.historicalContext) {
    const ctx = params.historicalContext;

    // 上次通过的用例
    const passedCasesSummary = ctx.previousPassedCases.slice(0, 10).map(c => ({
      id: c.caseId,
      name: c.caseName,
      passRate: c.passRate,
    }));

    // 上次失败的用例
    const failedCasesSummary = ctx.previousFailedCases.slice(0, 10).map(c => ({
      id: c.caseId,
      name: c.caseName,
      reason: c.failureReason,
      step: c.failedStep?.description,
    }));

    // 覆盖薄弱区域
    const weakCoverageSummary = ctx.weakCoverageAreas.slice(0, 5).map(a => ({
      url: a.urlPattern,
      feature: a.featureArea,
      coverage: a.coverageRate,
    }));

    // 历史失败模式摘要
    const failurePatternsSummary = ctx.failurePatterns.slice(0, 5).map(p => ({
      type: p.patternType,
      description: p.description,
      frequency: p.frequency,
    }));

    historicalContextSection = `
## 历史测试上下文

### 上次通过的用例（避免重复生成）
\`\`\`json
${JSON.stringify(passedCasesSummary, null, 2)}
\`\`\`

### 上次失败的用例（重点补测）
\`\`\`json
${JSON.stringify(failedCasesSummary, null, 2)}
\`\`\`

### 覆盖薄弱区域（优先补充）
\`\`\`json
${JSON.stringify(weakCoverageSummary, null, 2)}
\`\`\`

### 常见失败模式（注意防范）
\`\`\`json
${JSON.stringify(failurePatternsSummary, null, 2)}
\`\`\`

### 历史优化建议（已自动应用的）
${ctx.optimizationSuggestions.filter(s => s.autoApplicable && s.applied).slice(0, 3).map(s =>
  `- ${s.suggestion}: ${s.reason}`
).join('\n') || '无已应用的优化建议'}

---

**重要提示**:
1. 对于上次失败的用例，请生成新的测试步骤来验证问题是否已修复
2. 对于覆盖薄弱区域，请优先生成针对性测试用例
3. 对于上次通过的用例，避免生成完全重复的测试，可以生成边界或衍生测试
4. 注意防范常见失败模式，在测试步骤中加入适当的等待和验证
`;
  }

  // 相似历史记忆部分
  const similarMemoriesSection = params.similarMemories
    ? `\n${params.similarMemories}\n**注意**: 请参考这些历史案例，复用成功的测试策略。\n`
    : '';

  return `你是一位资深的QA测试专家。请根据页面分析结果，生成详细的测试用例。
${similarMemoriesSection}
## 页面信息
- URL: ${params.pageUrl}
- 标题: ${params.pageTitle}
- 平台: ${params.platform}

## 页面分析结果
\`\`\`json
${JSON.stringify(params.pageAnalysis, null, 2)}
\`\`\`

## 可用元素选择器
\`\`\`json
${JSON.stringify(elementSelectors, null, 2)}
\`\`\`

## 表单字段
\`\`\`json
${JSON.stringify(formData, null, 2)}
\`\`\`
${historicalContextSection}

## 生成要求

请生成完整的测试用例，输出严格的JSON格式：

1. **用例ID格式**: \`tc-{category}-{number}\`，例如 \`tc-login-001\`
2. **用例名称**: 简洁明了，能表达测试意图
3. **优先级**:
   - P0: 核心功能，阻断性问题
   - P1: 重要功能，严重问题
   - P2: 一般功能，普通问题
   - P3: 边缘场景，轻微问题
4. **用例类型**: functional / visual / performance / security / accessibility
5. **测试步骤**: 使用以下动作类型
   - \`navigate\`: 导航到URL，需要提供 value 为目标URL
   - \`click\`: 点击元素，需要提供 target 选择器
   - \`fill\`: 填写输入框，需要提供 target 和 value
   - \`select\`: 选择下拉选项
   - \`hover\`: 悬停元素
   - \`scroll\`: 滚动页面
   - \`wait\`: 等待时间或元素
   - \`screenshot\`: 截图
   - \`assert\`: 断言，需要提供 assertType 和 value
6. **断言类型**:
   - \`element-visible\`: 元素可见
   - \`element-hidden\`: 元素隐藏
   - \`text-contains\`: 文本包含
   - \`url-contains\`: URL包含
   - \`title-equals\`: 标题相等
   - \`element-count\`: 元素数量
   - \`attribute-equals\`: 属性值相等

## 需要生成的用例类型

1. **冒烟测试**（P0）：验证页面能正常打开、关键元素存在
2. **功能测试**（P1-P2）：表单提交、按钮点击、导航跳转
3. **边界测试**（P2）：空输入、超长输入、特殊字符
4. **异常测试**（P2-P3）：错误处理、网络异常

请用中文编写用例，输出严格的JSON格式。`;
}

/**
 * 构建简化版生成用例 Prompt（无 AI 降级时使用）
 */
export function buildSimpleCasesPrompt(params: {
  pageUrl: string;
  platform: 'pc-web' | 'h5-web' | 'android-app';
  interactiveElements: InteractiveElement[];
  forms: FormInfo[];
}): string {
  return `请根据页面的交互元素和表单，生成基础的测试用例。

## 页面信息
- URL: ${params.pageUrl}
- 平台: ${params.platform}

## 交互元素数量: ${params.interactiveElements.length}
## 表单数量: ${params.forms.length}

## 元素摘要
${params.interactiveElements.slice(0, 20).map(el => `- ${el.tag}: ${el.text || el.selector}`).join('\n')}

## 表单摘要
${params.forms.map(f => `- 表单: ${f.fields.length} 个字段`).join('\n')}

请生成基础的冒烟测试用例，验证：
1. 页面能正常打开
2. 关键元素可见
3. 表单可以填写提交

输出JSON格式的测试用例。`;
}

/**
 * 解析测试用例生成结果
 */
export function parseGenerateCasesResult(content: string): GenerateCasesResult {
  try {
    // 尝试直接解析
    const parsed = JSON.parse(content);
    return generateCasesResultSchema.parse(parsed);
  } catch {
    // 尝试提取 JSON 代码块
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return generateCasesResultSchema.parse(parsed);
    }

    // 尝试提取纯 JSON
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return generateCasesResultSchema.parse(parsed);
    }

    throw new Error('无法解析测试用例生成结果');
  }
}

/**
 * 根据功能点生成单个测试用例
 */
export function generateSingleCasePrompt(params: {
  featureName: string;
  featureDescription: string;
  suggestedSteps: string[];
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  pageUrl: string;
  platform: 'pc-web' | 'h5-web' | 'android-app';
  availableSelectors: Array<{ description: string; selector: string }>;
}): string {
  return `请根据以下功能点，生成一个详细的测试用例。

## 功能信息
- 名称: ${params.featureName}
- 描述: ${params.featureDescription}
- 优先级: ${params.priority}
- 页面URL: ${params.pageUrl}
- 平台: ${params.platform}

## 建议的测试步骤
${params.suggestedSteps.map((s, i) => `${i + 1}. ${s}`).join('\n')}

## 可用选择器
\`\`\`json
${JSON.stringify(params.availableSelectors, null, 2)}
\`\`\`

请输出一个完整的测试用例（JSON格式），包含：
- id: 用例ID
- name: 用例名称
- description: 用例描述
- priority: 优先级
- type: 用例类型
- platform: 适用平台
- tags: 标签数组
- steps: 测试步骤数组

输出严格的JSON格式。`;
}
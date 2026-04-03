import { z } from 'zod';

/**
 * 无障碍检查结果 Schema
 */
export const accessibilityCheckSchema = z.object({
  summary: z.string().describe('无障碍评估摘要'),
  score: z.number().min(0).max(100).describe('无障碍评分'),
  violations: z.array(z.object({
    rule: z.string().describe('违反的规则'),
    impact: z.enum(['critical', 'serious', 'moderate', 'minor']).describe('影响程度'),
    description: z.string().describe('问题描述'),
    element: z.string().describe('受影响的元素'),
    suggestion: z.string().describe('修复建议'),
    wcagLevel: z.enum(['A', 'AA', 'AAA']).optional().describe('WCAG 级别'),
  })).describe('违规项列表'),
  warnings: z.array(z.object({
    description: z.string().describe('警告描述'),
    element: z.string().describe('相关元素'),
    suggestion: z.string().describe('建议'),
  })).describe('警告列表'),
  recommendations: z.array(z.string()).describe('改进建议'),
});

export type AccessibilityCheckResult = z.infer<typeof accessibilityCheckSchema>;

/**
 * 构建无障碍检查 Prompt
 */
export function buildAccessibilityCheckPrompt(params: {
  pageUrl: string;
  pageTitle: string;
  html: string;
  axeViolations?: Array<{
    id: string;
    impact: string;
    description: string;
    help: string;
    nodes: Array<{ html: string }>;
  }>;
  interactiveElements?: Array<{
    selector: string;
    tag: string;
    text?: string;
    hasAccessibleName: boolean;
    tabIndex?: number;
  }>;
}): string {
  const violationsSummary = params.axeViolations
    ?.map(v => `- [${v.impact}] ${v.id}: ${v.description}`)
    .join('\n') || '无自动化检测结果';

  const elementsSummary = params.interactiveElements
    ?.slice(0, 30)
    .map(el => `- ${el.selector}: ${el.hasAccessibleName ? '✓ 有可访问名称' : '✗ 缺少可访问名称'}`)
    .join('\n') || '无元素信息';

  return `你是一位无障碍测试专家。请分析页面的无障碍问题。

## 页面信息
- URL: ${params.pageUrl}
- 标题: ${params.pageTitle}

## 自动化检测结果
${violationsSummary}

## 交互元素可访问性
${elementsSummary}

## 页面HTML片段
\`\`\`html
${params.html.slice(0, 5000)}
\`\`\`

## 检查要点

请检查以下无障碍问题：

1. **键盘可访问性**
   - 所有交互元素是否可通过键盘操作
   - Tab 顺序是否合理
   - 焦点是否可见

2. **屏幕阅读器兼容性**
   - 图片是否有 alt 属性
   - 表单字段是否有 label
   - 按钮是否有可访问名称
   - ARIA 属性是否正确使用

3. **颜色对比度**
   - 文字与背景的对比度是否足够

4. **语义化**
   - 标题层级是否正确
   - 是否使用语义化标签

5. **WCAG 合规性**
   - 是否符合 A 级要求
   - 是否符合 AA 级要求

请输出JSON格式的分析结果，包含：
1. 摘要评估
2. 无障碍评分 0-100
3. 违规项列表
4. 警告列表
5. 改进建议

用中文回答，输出严格的JSON格式。`;
}

/**
 * 解析无障碍检查结果
 */
export function parseAccessibilityCheckResult(content: string): AccessibilityCheckResult {
  try {
    const parsed = JSON.parse(content);
    return accessibilityCheckSchema.parse(parsed);
  } catch {
    const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      const parsed = JSON.parse(jsonMatch[1]);
      return accessibilityCheckSchema.parse(parsed);
    }

    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const jsonStr = content.slice(jsonStart, jsonEnd + 1);
      const parsed = JSON.parse(jsonStr);
      return accessibilityCheckSchema.parse(parsed);
    }

    throw new Error('无法解析无障碍检查结果');
  }
}

/**
 * 快速无障碍检查（无需 AI）
 */
export function quickAccessibilityCheck(params: {
  interactiveElements: Array<{
    selector: string;
    tag: string;
    text?: string;
    attributes: Record<string, string>;
  }>;
  images: Array<{ selector: string; alt?: string }>;
  forms: Array<{
    selector: string;
    fields: Array<{ selector: string; name?: string; label?: string }>;
  }>;
}): AccessibilityCheckResult {
  const violations: AccessibilityCheckResult['violations'] = [];
  const warnings: AccessibilityCheckResult['warnings'] = [];

  // 检查交互元素的可访问名称
  for (const el of params.interactiveElements) {
    const hasAccessibleName = !!(
      el.text ||
      el.attributes['aria-label'] ||
      el.attributes['aria-labelledby'] ||
      el.attributes['title'] ||
      (el.tag === 'input' && el.attributes['value']) ||
      (el.tag === 'img' && el.attributes['alt'])
    );

    if (!hasAccessibleName && ['button', 'a', 'input', 'select', 'textarea'].includes(el.tag)) {
      violations.push({
        rule: 'accessible-name',
        impact: 'serious',
        description: '交互元素缺少可访问名称',
        element: el.selector,
        suggestion: '添加 aria-label、aria-labelledby 或 title 属性',
        wcagLevel: 'A',
      });
    }
  }

  // 检查图片 alt 属性
  for (const img of params.images) {
    if (!img.alt) {
      warnings.push({
        description: '图片缺少 alt 属性',
        element: img.selector,
        suggestion: '添加描述性的 alt 属性，装饰性图片可使用 alt=""',
      });
    }
  }

  // 检查表单字段 label
  for (const form of params.forms) {
    for (const field of form.fields) {
      if (!field.label && !field.name) {
        warnings.push({
          description: '表单字段缺少标签',
          element: field.selector,
          suggestion: '添加 label 元素或 aria-label 属性',
        });
      }
    }
  }

  const score = Math.max(0, 100 - violations.length * 10 - warnings.length * 5);

  return {
    summary: `发现 ${violations.length} 个违规项和 ${warnings.length} 个警告`,
    score,
    violations,
    warnings,
    recommendations: violations.length > 0
      ? ['优先修复 critical 和 serious 级别的问题', '确保所有交互元素有可访问名称']
      : ['页面无障碍性良好，建议保持'],
  };
}
# AI Prompt 设计说明

本文档介绍 AutoBase-Test 中 AI Prompt 的设计思路和各 Prompt 的用途。

## 设计原则

1. **输出标准化**：所有 AI 输出必须是严格的 JSON 格式
2. **中文友好**：输出使用中文，便于非技术人员理解
3. **降级设计**：AI 不可用时自动降级到规则引擎
4. **Zod 校验**：使用 Zod 对 AI 输出进行运行时校验

## Prompt 模板列表

| 文件 | 用途 | 输入 | 输出 |
|------|------|------|------|
| analyze-page.prompt.ts | 分析页面结构 | 页面快照 | 功能点列表 |
| generate-cases.prompt.ts | 生成测试用例 | 页面分析结果 | 测试用例 JSON |
| analyze-failure.prompt.ts | 分析失败原因 | 失败信息 | 原因和建议 |
| optimize-flow.prompt.ts | 优化测试流程 | 历史数据 | 优化建议 |
| generate-report.prompt.ts | 生成报告摘要 | 测试结果 | 中文摘要 |
| accessibility-check.prompt.ts | 无障碍分析 | 页面信息 | 违规项 |
| security-check.prompt.ts | 安全分析 | 页面信息 | 安全问题 |

## Prompt 详细说明

### 1. analyze-page.prompt.ts - 页面分析

**用途**：分析页面结构，识别所有可测试的功能点。

**输入**：
- URL
- 精简 HTML 结构
- 截图（base64）
- 可交互元素列表
- 平台类型（PC/H5）

**输出**：
```typescript
interface PageAnalysisResult {
  pageDescription: string;           // 页面功能描述
  features: Feature[];               // 可测试功能点
  riskPoints: string[];              // 潜在风险点
  suggestedTestData: TestSuggestion[]; // 建议的测试数据
}

interface Feature {
  name: string;                      // 功能名称
  priority: 'P0' | 'P1' | 'P2' | 'P3'; // 优先级
  testSteps: TestStep[];             // 测试步骤
}
```

**Prompt 设计要点**：
- 提供足够的上下文（HTML + 截图）
- 明确输出 JSON 格式要求
- 请求中文输出
- 强调识别所有可测试点

### 2. generate-cases.prompt.ts - 测试用例生成

**用途**：根据页面分析结果生成标准格式的测试用例。

**输入**：
- 页面分析结果
- 平台类型
- 测试类型偏好

**输出**：
```typescript
interface GeneratedCases {
  cases: TestCase[];  // 测试用例列表
}

interface TestCase {
  id: string;
  name: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  type: 'functional' | 'visual' | 'performance' | 'security';
  platform: string[];
  tags: string[];
  steps: TestStep[];
}
```

**Prompt 设计要点**：
- 强调步骤的可执行性
- 要求生成多种类型用例（冒烟、功能、边界）
- 自动标注优先级

### 3. analyze-failure.prompt.ts - 失败分析

**用途**：分析测试失败的原因，判断是产品 Bug 还是测试问题。

**输入**：
- 失败步骤信息
- 截图
- 错误日志
- 页面 URL

**输出**：
```typescript
interface FailureAnalysisResult {
  rootCause: string;                  // 根本原因
  isProductBug: boolean;              // 是否产品 Bug
  isTestIssue: boolean;               // 是否测试问题
  severity: 'critical' | 'high' | 'medium' | 'low';
  suggestedFix: string;               // 修复建议
  selfHealPossible: boolean;          // 是否可自愈
  newSelector?: string;               // 新选择器（如可自愈）
}
```

**Prompt 设计要点**：
- 提供完整的错误上下文
- 要求区分 Bug 和测试问题
- 提供修复建议

### 4. optimize-flow.prompt.ts - 流程优化

**用途**：分析历史数据，给出测试流程优化建议。

**输入**：
- 项目名称
- 用例历史数据（运行次数、通过率、耗时）
- 最近通过率
- 之前通过率

**输出**：
```typescript
interface FlowOptimizationResult {
  suggestions: OptimizationSuggestion[];
  summary: {
    totalSuggestions: number;
    autoApplicableCount: number;
    highImpactCount: number;
  };
  overallAssessment: string;
  priorityActions: string[];
}

interface OptimizationSuggestion {
  caseId: string;
  caseName: string;
  type: 'increase-timeout' | 'adjust-wait' | 'add-retry' | 'skip' | 'reduce-frequency';
  reason: string;
  impact: 'high' | 'medium' | 'low';
  autoApplicable: boolean;
  confidence: number;
  suggestedValue?: number | string;
}
```

**Prompt 设计要点**：
- 分析历史趋势
- 识别不稳定用例
- 建议具体优化措施
- 标注可自动应用的建议

### 5. generate-report.prompt.ts - 报告生成

**用途**：生成测试报告的中文摘要和 AI 分析。

**输入**：
- 测试结果汇总
- 失败用例列表
- 性能数据

**输出**：
```typescript
interface ReportSummary {
  overallAssessment: string;     // 总体评价
  criticalIssues: string[];      // 关键问题
  recommendations: string[];     // 改进建议
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
```

**Prompt 设计要点**：
- 使用通俗易懂的中文
- 突出关键问题
- 给出可操作的建议

### 6. accessibility-check.prompt.ts - 无障碍检查

**用途**：分析页面的无障碍问题。

**输入**：
- 页面 HTML
- axe-core 检测结果

**输出**：
```typescript
interface AccessibilityAnalysis {
  issues: AccessibilityIssue[];
  wcagLevel: 'A' | 'AA' | 'AAA';
  overallScore: number;
}

interface AccessibilityIssue {
  element: string;
  rule: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  fixSuggestion: string;
}
```

### 7. security-check.prompt.ts - 安全检查

**用途**：分析页面的安全问题。

**输入**：
- HTTP 响应头
- 页面源码
- 网络请求

**输出**：
```typescript
interface SecurityAnalysis {
  issues: SecurityIssue[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  recommendations: string[];
}

interface SecurityIssue {
  type: 'xss' | 'csrf' | 'sensitive-data' | 'insecure-header' | 'ssl';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location: string;
  fixSuggestion: string;
}
```

## 降级策略

当 AI 不可用时，系统自动降级到规则引擎：

| AI 功能 | 降级方案 |
|---------|----------|
| 页面分析 | 基于规则识别表单、链接、按钮 |
| 用例生成 | 使用预设模板生成基础用例 |
| 失败分析 | 返回错误信息和堆栈 |
| 流程优化 | 基于统计数据给出建议 |
| 报告生成 | 使用模板生成基础报告 |

## Zod 校验

每个 AI 输出都用 Zod Schema 进行校验：

```typescript
import { z } from 'zod';

const PageAnalysisSchema = z.object({
  pageDescription: z.string(),
  features: z.array(z.object({
    name: z.string(),
    priority: z.enum(['P0', 'P1', 'P2', 'P3']),
    testSteps: z.array(z.any()),
  })),
  riskPoints: z.array(z.string()),
  suggestedTestData: z.array(z.any()).optional(),
});

// 校验
const result = PageAnalysisSchema.parse(aiOutput);
```

## Token 优化

为了节省 Token 消耗：

1. **精简 HTML**：只传递关键元素，移除注释、空白
2. **限制截图大小**：压缩截图，限制分辨率
3. **分批处理**：大量数据分批发送
4. **缓存结果**：相同页面复用分析结果
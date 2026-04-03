// 页面分析
export {
  buildAnalyzePagePrompt,
  buildAnalyzePageWithScreenshotPrompt,
  parsePageAnalysisResult,
  pageAnalysisSchema,
} from './analyze-page.prompt.js';
export type { PageAnalysisResult } from './analyze-page.prompt.js';

// 测试用例生成
export {
  buildGenerateCasesPrompt,
  buildSimpleCasesPrompt,
  parseGenerateCasesResult,
  generateSingleCasePrompt,
  testCaseSchema,
  testStepSchema,
  generateCasesResultSchema,
} from './generate-cases.prompt.js';
export type { TestCase, TestStep, GenerateCasesResult } from './generate-cases.prompt.js';

// 失败分析
export {
  buildAnalyzeFailurePrompt,
  buildAnalyzeFailureWithScreenshotPrompt,
  parseFailureAnalysisResult,
  failureAnalysisSchema,
  classifyFailureQuick,
} from './analyze-failure.prompt.js';
export type { FailureAnalysisResult, FailureContext } from './analyze-failure.prompt.js';

// 流程优化
export {
  buildOptimizeFlowPrompt,
  parseFlowOptimizationResult,
  generateQuickOptimizations,
  flowOptimizationSchema,
  optimizationSuggestionSchema,
} from './optimize-flow.prompt.js';
export type { FlowOptimizationResult, OptimizationSuggestion, CaseHistoryData } from './optimize-flow.prompt.js';

// 报告生成
export {
  buildGenerateReportPrompt,
  buildCompareReportPrompt,
  parseReportSummary,
  reportSummarySchema,
} from './generate-report.prompt.js';
export type { ReportSummary, TestResultSummary, FailedCaseInfo } from './generate-report.prompt.js';

// 无障碍检查
export {
  buildAccessibilityCheckPrompt,
  parseAccessibilityCheckResult,
  quickAccessibilityCheck,
  accessibilityCheckSchema,
} from './accessibility-check.prompt.js';
export type { AccessibilityCheckResult } from './accessibility-check.prompt.js';

// 安全检查
export {
  buildSecurityCheckPrompt,
  parseSecurityCheckResult,
  quickSecurityCheck,
  securityCheckSchema,
  XSS_VECTORS,
  SENSITIVE_PATTERNS,
} from './security-check.prompt.js';
export type { SecurityCheckResult } from './security-check.prompt.js';
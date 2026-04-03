/**
 * AI 提供商类型
 */
export type AiProvider = 'anthropic' | 'openai' | 'local';

/**
 * AI 分析请求
 */
export interface AiAnalyzeRequest {
  type: 'page' | 'failure' | 'optimization' | 'report';
  data: Record<string, unknown>;
  context?: Record<string, unknown>;
}

/**
 * AI 分析响应
 */
export interface AiAnalyzeResponse {
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  tokensUsed?: {
    input: number;
    output: number;
    total: number;
  };
}

/**
 * 页面分析结果
 */
export interface PageAnalysisResult {
  pageDescription: string;
  testableFeatures: TestableFeature[];
  potentialRisks: string[];
  suggestedTestData: Record<string, string[]>;
}

/**
 * 可测试功能点
 */
export interface TestableFeature {
  name: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  description: string;
  suggestedSteps: string[];
  type: 'functional' | 'visual' | 'interaction';
}

/**
 * 失败分析结果
 */
export interface FailureAnalysisResult {
  possibleCauses: string[];
  isProductBug: boolean;
  isTestIssue: boolean;
  confidence: number;
  fixSuggestions: string[];
  relatedPatterns?: string[];
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  type: 'skip' | 'reduce-frequency' | 'adjust-wait' | 'merge' | 'add' | 'fix-selector';
  caseId: string;
  reason: string;
  suggestedValue?: number | string;
  confidence: number;
  autoApplicable: boolean;
}

/**
 * AI 使用统计
 */
export interface AiUsageStats {
  totalRequests: number;
  totalTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  avgResponseTime: number;
  errorCount: number;
  byProvider: Record<AiProvider, {
    requests: number;
    tokens: number;
    errors: number;
  }>;
}
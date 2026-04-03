// AI 模块入口文件

// AI 客户端
export { AiClient, getAiClient, resetAiClient, type AiClientConfig, type ChatMessage, type ChatOptions, type ChatResponse } from './client.js';

// 页面分析器
export { PageAnalyzer, analyzePage, type AnalyzerConfig } from './analyzer.js';

// 测试用例生成器
export { CaseGenerator, generateTestCases, type CaseGeneratorConfig } from './case-generator.js';

// 失败分析器
export { FailureAnalyzer, analyzeFailure, type FailureAnalyzerConfig, type ExtendedFailureAnalysisResult } from './failure-analyzer.js';

// 自愈引擎
export { SelfHealer, selfHealElement, type SelfHealerConfig, type ElementMapping, type SelfHealResult } from './self-healer.js';

// 流程优化器
export { FlowOptimizer, optimizeFlow, type FlowOptimizerConfig, type OptimizedTestCase } from './flow-optimizer.js';

// Prompts 导出
export * from './prompts/index.js';
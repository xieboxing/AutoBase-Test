import type { PageSnapshot } from '@/types/crawler.types.js';
import { AiClient, getAiClient } from './client.js';
import {
  buildAnalyzeFailurePrompt,
  buildAnalyzeFailureWithScreenshotPrompt,
  parseFailureAnalysisResult,
  classifyFailureQuick,
  type FailureContext,
  type FailureAnalysisResult,
} from './prompts/analyze-failure.prompt.js';
import { logger } from '@/core/logger.js';
import { FailurePatternLibrary, createFailurePatternLibrary } from '@/knowledge/failure-pattern-library.js';
import type { FailurePatternWithFix } from '@/knowledge/failure-pattern-library.js';
import type { AutoFixConfig } from '@/types/knowledge.types.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';
import { createRagMemoryEngine } from '@/knowledge/rag-memory.js';
import type { RagMemoryEngine } from '@/knowledge/rag-memory.js';
import type { RagMemory, RagRetrievalResult } from '@/types/rag.types.js';
import type { KnowledgeDatabase } from '@/knowledge/db/index.js';
import { getDatabase } from '@/knowledge/db/index.js';

/**
 * 失败分析器配置
 */
export interface FailureAnalyzerConfig {
  useAi: boolean;
  useScreenshot: boolean;
  maxHtmlLength: number;
  usePatternLibrary: boolean;
  minPatternFrequency: number;
  useRagMemory: boolean;
  ragMemoryLimit: number;
}

/**
 * 默认配置
 */
const DEFAULT_FAILURE_ANALYZER_CONFIG: FailureAnalyzerConfig = {
  useAi: true,
  useScreenshot: true,
  maxHtmlLength: 3000,
  usePatternLibrary: true,
  minPatternFrequency: 3,
  useRagMemory: true,
  ragMemoryLimit: 3,
};

/**
 * 失败分析结果（扩展版）
 */
export interface ExtendedFailureAnalysisResult extends FailureAnalysisResult {
  analyzedAt: string;
  analyzerType: 'ai' | 'rules' | 'pattern';
  autoFixable: boolean;
  autoFixConfig?: AutoFixConfig;
  matchedPattern?: FailurePatternWithFix;
}

/**
 * 失败分析器类
 */
export class FailureAnalyzer {
  private config: FailureAnalyzerConfig;
  private aiClient: AiClient;
  private patternLibrary: FailurePatternLibrary;
  private ragMemory: RagMemoryEngine | null = null;

  constructor(
    config: Partial<FailureAnalyzerConfig> = {},
    aiClient?: AiClient,
    patternLibrary?: FailurePatternLibrary,
    ragMemory?: RagMemoryEngine | KnowledgeDatabase,
  ) {
    this.config = { ...DEFAULT_FAILURE_ANALYZER_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
    this.patternLibrary = patternLibrary ?? createFailurePatternLibrary();

    // 初始化 RAG 记忆引擎
    if (ragMemory) {
      // 检查是否已经是 RagMemoryEngine 实例（有 store 方法）
      if (typeof (ragMemory as RagMemoryEngine).store === 'function') {
        this.ragMemory = ragMemory as RagMemoryEngine;
      } else {
        this.ragMemory = createRagMemoryEngine(ragMemory as KnowledgeDatabase);
      }
    } else if (this.config.useRagMemory) {
      try {
        this.ragMemory = createRagMemoryEngine(getDatabase());
      } catch {
        logger.warn('⚠️ RAG 记忆引擎初始化失败');
      }
    }
  }

  /**
   * 分析失败原因
   */
  async analyze(context: FailureContext, snapshot?: PageSnapshot): Promise<ExtendedFailureAnalysisResult> {
    logger.ai('🤖 开始分析失败原因', { caseId: context.testCaseId });

    // 1. 首先尝试匹配失败模式库
    if (this.config.usePatternLibrary) {
      const matchResult = this.patternLibrary.matchPattern(context.errorMessage, {
        patternType: this.classifyToPatternType(context.errorMessage),
        selector: context.failedStep.target,
        url: context.pageUrl,
      });

      if (matchResult.matched && matchResult.pattern) {
        const pattern = matchResult.pattern;

        // 高频模式直接返回，不走 AI
        if (pattern.frequency >= this.config.minPatternFrequency || pattern.id.startsWith('builtin-')) {
          logger.info('🎯 命中失败模式库，跳过 AI 分析', {
            patternId: pattern.id,
            frequency: pattern.frequency,
            confidence: matchResult.confidence,
          });

          // 发出模式匹配事件
          eventBus.emitSafe(TestEventType.FAILURE_PATTERN_MATCHED, {
            patternId: pattern.id,
            patternType: pattern.patternType,
            frequency: pattern.frequency,
            autoFixable: pattern.autoFixConfig !== null,
          });

          return this.buildPatternResult(pattern, matchResult.confidence);
        }
      }
    }

    // 2. 检查是否使用 AI
    if (!this.config.useAi || !this.aiClient.isEnabled() || !this.aiClient.isConfigured()) {
      logger.info('📍 使用规则引擎分析失败（AI 降级模式）');
      return this.analyzeWithRules(context);
    }

    // 3. 检索相似历史记忆（新增）
    let similarMemories: RagRetrievalResult[] = [];
    if (this.config.useRagMemory && this.ragMemory) {
      similarMemories = this.retrieveSimilarMemories(context);
      if (similarMemories.length > 0) {
        logger.info('📚 检索到相似历史记忆', {
          count: similarMemories.length,
          topSimilarity: similarMemories[0]?.similarity.toFixed(2),
        });

        // 发出 RAG 检索事件
        eventBus.emitSafe(TestEventType.RAG_RETRIEVING, {
          queryType: 'failure',
          projectId: context.projectId ?? 'unknown',
          limit: this.config.ragMemoryLimit,
        });
      }
    }

    try {
      // 4. 使用 AI 分析（注入历史记忆）
      const result = await this.analyzeWithAi(context, snapshot, similarMemories);

      // 5. 将 AI 分析结果写入模式库
      this.recordPatternFromAiResult(context, result);

      return result;
    } catch (error) {
      logger.warn('⚠️ AI 分析失败，降级到规则引擎', { error: String(error) });
      return this.analyzeWithRules(context);
    }
  }

  /**
   * 检索相似历史记忆
   */
  private retrieveSimilarMemories(context: FailureContext): RagRetrievalResult[] {
    if (!this.ragMemory) return [];

    const queryText = [
      context.errorMessage,
      context.failedStep.target,
      context.pageUrl,
    ].filter(Boolean).join(' ');

    return this.ragMemory.search({
      queryText,
      projectId: context.projectId,
      memoryTypes: ['failure', 'self_heal', 'auto_fix'],
      limit: this.config.ragMemoryLimit,
      minSimilarity: 0.3,
    });
  }

  /**
   * 基于匹配的模式构建分析结果
   */
  private buildPatternResult(pattern: FailurePatternWithFix, confidence: number): ExtendedFailureAnalysisResult {
    const category = this.patternTypeToCategory(pattern.patternType);

    return {
      possibleCauses: pattern.rootCause ? [pattern.rootCause] : ['已知失败模式'],
      isProductBug: false,
      isTestIssue: pattern.patternType !== 'assertion_failed',
      confidence,
      fixSuggestions: pattern.solution ? [pattern.solution] : ['应用自动修复'],
      category,
      severity: pattern.frequency >= 5 ? 'critical' : 'high',
      analyzedAt: new Date().toISOString(),
      analyzerType: 'pattern',
      autoFixable: pattern.autoFixConfig !== null,
      autoFixConfig: pattern.autoFixConfig ?? undefined,
      matchedPattern: pattern,
    };
  }

  /**
   * 记录 AI 分析结果到模式库
   */
  private recordPatternFromAiResult(context: FailureContext, result: ExtendedFailureAnalysisResult): void {
    try {
      const patternType = this.classifyToPatternType(context.errorMessage);
      const patternKey = `${patternType}:${context.failedStep.target ?? 'unknown'}:${context.pageUrl ?? 'unknown'}`;

      const autoFixConfig = result.autoFixable ? this.generateAutoFixConfig(result.category) : undefined;

      this.patternLibrary.addPattern({
        patternType,
        patternKey,
        description: context.errorMessage.slice(0, 200),
        autoFixConfig,
        rootCause: result.possibleCauses[0],
        solution: result.fixSuggestions[0],
      });

      logger.info('📝 已记录失败模式', { patternKey });
    } catch (error) {
      logger.warn('记录失败模式失败', { error: String(error) });
    }
  }

  /**
   * 根据失败类型生成自动修复配置
   */
  private generateAutoFixConfig(category: string): AutoFixConfig | undefined {
    switch (category) {
      case 'element-not-found':
        return { fixType: 'add-wait', fixValue: 2000, maxRetries: 3 };
      case 'timeout':
        return { fixType: 'increase-timeout', fixValue: 1.5, maxRetries: 2 };
      case 'network-error':
        return { fixType: 'retry', fixValue: 3, maxRetries: 3 };
      default:
        return undefined;
    }
  }

  /**
   * 分类错误消息到模式类型
   */
  private classifyToPatternType(errorMessage: string): import('@/types/knowledge.types.js').FailurePatternType {
    const category = classifyFailureQuick(errorMessage);
    return this.categoryToPatternType(category);
  }

  /**
   * 分类名称转模式类型
   */
  private categoryToPatternType(category: string): import('@/types/knowledge.types.js').FailurePatternType {
    const mapping: Record<string, import('@/types/knowledge.types.js').FailurePatternType> = {
      'element-not-found': 'element_not_found',
      'timeout': 'timeout',
      'assertion-failed': 'assertion_failed',
      'network-error': 'network_error',
      'permission-denied': 'permission_denied',
      'navigation-error': 'navigation_error',
      'js-error': 'js_error',
    };
    return mapping[category] ?? 'timeout';
  }

  /**
   * 模式类型转分类名称
   */
  private patternTypeToCategory(patternType: string): FailureAnalysisResult['category'] {
    const mapping: Record<string, FailureAnalysisResult['category']> = {
      'element_not_found': 'element-not-found',
      'timeout': 'timeout',
      'assertion_failed': 'assertion-failed',
      'network_error': 'network-error',
      'permission_denied': 'permission-denied',
      'navigation_error': 'other',
      'js_error': 'other',
    };
    return mapping[patternType] ?? 'other';
  }

  /**
   * 使用 AI 分析失败
   */
  private async analyzeWithAi(
    context: FailureContext,
    snapshot?: PageSnapshot,
    similarMemories: RagRetrievalResult[] = [],
  ): Promise<ExtendedFailureAnalysisResult> {
    // 准备页面信息
    const pageHtml = snapshot?.html?.slice(0, this.config.maxHtmlLength);
    const interactiveElements = snapshot?.interactiveElements?.slice(0, 20).map(el => ({
      selector: el.selector,
      text: el.text,
      visible: el.visible,
    }));

    // 准备历史记忆上下文
    const memoryContext = this.buildMemoryContext(similarMemories);

    // 决定是否使用截图
    const useScreenshot = this.config.useScreenshot && context.screenshotBase64;

    let messages: any[];

    if (useScreenshot) {
      // 带截图的分析
      const content = buildAnalyzeFailureWithScreenshotPrompt({
        context,
        pageHtml,
        interactiveElements,
        screenshotBase64: context.screenshotBase64!,
        similarMemories: memoryContext,
      });

      messages = [{ role: 'user' as const, content }];
    } else {
      // 纯文本分析
      const prompt = buildAnalyzeFailurePrompt({
        context,
        pageHtml,
        interactiveElements,
        similarMemories: memoryContext,
      });

      messages = [{ role: 'user' as const, content: prompt }];
    }

    // 调用 AI
    const response = await this.aiClient.chatWithRetry(messages, {
      responseFormat: 'json',
    });

    // 解析结果
    const result = parseFailureAnalysisResult(response.content);

    logger.ai('✅ AI 失败分析完成', {
      category: result.category,
      isProductBug: result.isProductBug,
      confidence: result.confidence,
      usedMemories: similarMemories.length,
    });

    // 发出 RAG 检索完成事件
    if (similarMemories.length > 0) {
      eventBus.emitSafe(TestEventType.RAG_RETRIEVED, {
        queryType: 'failure',
        memoriesCount: similarMemories.length,
        avgSimilarity: similarMemories.reduce((sum, m) => sum + m.similarity, 0) / similarMemories.length,
        retrievalMethod: 'text',
        durationMs: 0,
      });
    }

    return {
      ...result,
      analyzedAt: new Date().toISOString(),
      analyzerType: 'ai',
      autoFixable: this.isAutoFixable(result),
    };
  }

  /**
   * 构建历史记忆上下文文本
   */
  private buildMemoryContext(memories: RagRetrievalResult[]): string {
    if (memories.length === 0) return '';

    const contextParts: string[] = ['## 历史相似案例（供参考）\n'];

    for (const { memory, similarity } of memories) {
      contextParts.push(`### 案例 ${memory.id}（相似度: ${similarity.toFixed(2)}）`);
      contextParts.push(`- 类型: ${memory.memoryType}`);
      if (memory.contextUrl) contextParts.push(`- URL: ${memory.contextUrl}`);
      contextParts.push(`- 执行结果: ${memory.executionResult.slice(0, 200)}`);
      if (memory.solutionStrategy) contextParts.push(`- 解决策略: ${memory.solutionStrategy}`);
      if (memory.solutionSteps) contextParts.push(`- 解决步骤: ${memory.solutionSteps.join(', ')}`);
      contextParts.push('');
    }

    return contextParts.join('\n');
  }

  /**
   * 使用规则引擎分析失败
   */
  private analyzeWithRules(context: FailureContext): ExtendedFailureAnalysisResult {
    // 快速分类
    const category = classifyFailureQuick(context.errorMessage);

    // 基于规则的简单分析
    const possibleCauses: string[] = [];
    const fixSuggestions: string[] = [];
    let isProductBug = false;
    let isTestIssue = false;

    switch (category) {
      case 'element-not-found':
        possibleCauses.push('元素选择器已过时');
        possibleCauses.push('页面结构发生变化');
        possibleCauses.push('元素尚未加载完成');
        fixSuggestions.push('更新元素选择器');
        fixSuggestions.push('增加等待时间');
        fixSuggestions.push('使用更稳定的选择器策略');
        isTestIssue = true;
        break;

      case 'timeout':
        possibleCauses.push('页面加载过慢');
        possibleCauses.push('网络延迟');
        possibleCauses.push('后端响应慢');
        fixSuggestions.push('增加超时时间');
        fixSuggestions.push('检查网络状态');
        fixSuggestions.push('优化页面加载性能');
        isTestIssue = true;
        break;

      case 'assertion-failed':
        possibleCauses.push('预期值与实际值不符');
        possibleCauses.push('页面状态变化');
        possibleCauses.push('数据不一致');
        fixSuggestions.push('检查断言逻辑');
        fixSuggestions.push('验证测试数据');
        isProductBug = true;
        break;

      case 'network-error':
        possibleCauses.push('网络连接中断');
        possibleCauses.push('服务器无响应');
        possibleCauses.push('DNS 解析失败');
        fixSuggestions.push('检查网络连接');
        fixSuggestions.push('验证服务器状态');
        fixSuggestions.push('使用代理或备用网络');
        isTestIssue = true;
        break;

      case 'permission-denied':
        possibleCauses.push('缺少必要权限');
        possibleCauses.push('权限弹窗未处理');
        fixSuggestions.push('添加权限处理逻辑');
        fixSuggestions.push('检查应用权限设置');
        isTestIssue = true;
        break;

      default:
        possibleCauses.push('未知错误');
        fixSuggestions.push('需要人工分析');
        fixSuggestions.push('查看详细日志');
    }

    // 判断置信度
    const confidence = category === 'other' ? 0.5 : 0.7;

    // 判断严重程度
    const severity = context.failedStep.order === 1 ? 'critical' : 'high';

    return {
      possibleCauses,
      isProductBug,
      isTestIssue,
      confidence,
      fixSuggestions,
      category,
      severity,
      analyzedAt: new Date().toISOString(),
      analyzerType: 'rules',
      autoFixable: category === 'element-not-found' || category === 'timeout',
    };
  }

  /**
   * 判断是否可自动修复
   */
  private isAutoFixable(result: FailureAnalysisResult): boolean {
    // 元素未找到可以尝试自愈
    if (result.category === 'element-not-found') {
      return true;
    }

    // 超时问题可以自动调整等待时间
    if (result.category === 'timeout') {
      return true;
    }

    // 高置信度的测试问题可以自动修复
    if (result.isTestIssue && result.confidence > 0.8) {
      return true;
    }

    return false;
  }

  /**
   * 批量分析失败
   */
  async analyzeBatch(
    contexts: Array<{ context: FailureContext; snapshot?: PageSnapshot }>,
  ): Promise<ExtendedFailureAnalysisResult[]> {
    const results: ExtendedFailureAnalysisResult[] = [];

    for (const { context, snapshot } of contexts) {
      try {
        const result = await this.analyze(context, snapshot);
        results.push(result);
      } catch (error) {
        logger.fail('❌ 失败分析出错', { caseId: context.testCaseId, error: String(error) });
        // 返回默认结果
        results.push({
          possibleCauses: ['分析过程出错'],
          isProductBug: false,
          isTestIssue: false,
          confidence: 0,
          fixSuggestions: ['需要人工分析'],
          category: 'other',
          severity: 'medium',
          analyzedAt: new Date().toISOString(),
          analyzerType: 'rules',
          autoFixable: false,
        });
      }
    }

    return results;
  }
}

/**
 * 快捷分析函数
 */
export async function analyzeFailure(
  context: FailureContext,
  snapshot?: PageSnapshot,
  options?: Partial<FailureAnalyzerConfig>,
): Promise<ExtendedFailureAnalysisResult> {
  const analyzer = new FailureAnalyzer(options);
  return analyzer.analyze(context, snapshot);
}
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

/**
 * 失败分析器配置
 */
export interface FailureAnalyzerConfig {
  useAi: boolean;
  useScreenshot: boolean;
  maxHtmlLength: number;
}

/**
 * 默认配置
 */
const DEFAULT_FAILURE_ANALYZER_CONFIG: FailureAnalyzerConfig = {
  useAi: true,
  useScreenshot: true,
  maxHtmlLength: 3000,
};

/**
 * 失败分析结果（扩展版）
 */
export interface ExtendedFailureAnalysisResult extends FailureAnalysisResult {
  analyzedAt: string;
  analyzerType: 'ai' | 'rules';
  autoFixable: boolean;
}

/**
 * 失败分析器类
 */
export class FailureAnalyzer {
  private config: FailureAnalyzerConfig;
  private aiClient: AiClient;

  constructor(config: Partial<FailureAnalyzerConfig> = {}, aiClient?: AiClient) {
    this.config = { ...DEFAULT_FAILURE_ANALYZER_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
  }

  /**
   * 分析失败原因
   */
  async analyze(context: FailureContext, snapshot?: PageSnapshot): Promise<ExtendedFailureAnalysisResult> {
    logger.ai('🤖 开始分析失败原因', { caseId: context.testCaseId });

    // 检查是否使用 AI
    if (!this.config.useAi || !this.aiClient.isEnabled() || !this.aiClient.isConfigured()) {
      logger.info('📍 使用规则引擎分析失败（AI 降级模式）');
      return this.analyzeWithRules(context);
    }

    try {
      // 使用 AI 分析
      return await this.analyzeWithAi(context, snapshot);
    } catch (error) {
      logger.warn('⚠️ AI 分析失败，降级到规则引擎', { error: String(error) });
      return this.analyzeWithRules(context);
    }
  }

  /**
   * 使用 AI 分析失败
   */
  private async analyzeWithAi(
    context: FailureContext,
    snapshot?: PageSnapshot,
  ): Promise<ExtendedFailureAnalysisResult> {
    // 准备页面信息
    const pageHtml = snapshot?.html?.slice(0, this.config.maxHtmlLength);
    const interactiveElements = snapshot?.interactiveElements?.slice(0, 20).map(el => ({
      selector: el.selector,
      text: el.text,
      visible: el.visible,
    }));

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
      });

      messages = [{ role: 'user' as const, content }];
    } else {
      // 纯文本分析
      const prompt = buildAnalyzeFailurePrompt({
        context,
        pageHtml,
        interactiveElements,
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
    });

    return {
      ...result,
      analyzedAt: new Date().toISOString(),
      analyzerType: 'ai',
      autoFixable: this.isAutoFixable(result),
    };
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
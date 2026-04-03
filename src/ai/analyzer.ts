import type { PageSnapshot } from '@/types/crawler.types.js';
import type { PageAnalysisResult } from '@/types/ai.types.js';
import { AiClient, getAiClient } from './client.js';
import {
  buildAnalyzePagePrompt,
  buildAnalyzePageWithScreenshotPrompt,
  parsePageAnalysisResult,
} from './prompts/analyze-page.prompt.js';
import { logger } from '@/core/logger.js';

/**
 * 页面分析器配置
 */
export interface AnalyzerConfig {
  useAi: boolean;
  useScreenshot: boolean;
  maxElements: number;
  maxHtmlLength: number;
}

/**
 * 默认配置
 */
const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  useAi: true,
  useScreenshot: true,
  maxElements: 50,
  maxHtmlLength: 5000,
};

/**
 * 页面分析器类
 */
export class PageAnalyzer {
  private config: AnalyzerConfig;
  private aiClient: AiClient;

  constructor(config: Partial<AnalyzerConfig> = {}, aiClient?: AiClient) {
    this.config = { ...DEFAULT_ANALYZER_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
  }

  /**
   * 分析页面快照
   */
  async analyze(snapshot: PageSnapshot): Promise<PageAnalysisResult> {
    logger.ai('🤖 开始分析页面', { url: snapshot.url });

    // 检查是否使用 AI
    if (!this.config.useAi || !this.aiClient.isEnabled()) {
      logger.info('📍 使用规则引擎分析页面（AI 降级模式）');
      return this.analyzeWithRules(snapshot);
    }

    // 检查是否配置了 API Key
    if (!this.aiClient.isConfigured()) {
      logger.warn('⚠️ AI 客户端未配置，使用规则引擎分析');
      return this.analyzeWithRules(snapshot);
    }

    try {
      // 使用 AI 分析
      return await this.analyzeWithAi(snapshot);
    } catch (error) {
      logger.warn('⚠️ AI 分析失败，降级到规则引擎', { error: String(error) });
      return this.analyzeWithRules(snapshot);
    }
  }

  /**
   * 使用 AI 分析页面
   */
  private async analyzeWithAi(snapshot: PageSnapshot): Promise<PageAnalysisResult> {
    const platform = this.detectPlatform(snapshot);

    // 限制元素数量和 HTML 长度
    const limitedElements = snapshot.interactiveElements.slice(0, this.config.maxElements);
    const limitedHtml = snapshot.html.slice(0, this.config.maxHtmlLength);

    // 决定是否使用截图
    const useScreenshot = this.config.useScreenshot && snapshot.screenshot?.viewport;

    let messages: any[];

    if (useScreenshot) {
      // 带截图的分析
      const content = buildAnalyzePageWithScreenshotPrompt({
        url: snapshot.url,
        title: snapshot.title,
        html: limitedHtml,
        interactiveElements: limitedElements,
        forms: snapshot.forms,
        platform,
        screenshotBase64: snapshot.screenshot.viewport,
      });

      messages = [
        { role: 'user' as const, content },
      ];
    } else {
      // 纯文本分析
      const prompt = buildAnalyzePagePrompt({
        url: snapshot.url,
        title: snapshot.title,
        html: limitedHtml,
        interactiveElements: limitedElements,
        forms: snapshot.forms,
        platform,
      });

      messages = [
        { role: 'user' as const, content: prompt },
      ];
    }

    // 调用 AI
    const response = await this.aiClient.chatWithRetry(messages, {
      responseFormat: 'json',
    });

    // 解析结果
    const result = parsePageAnalysisResult(response.content);

    logger.ai('✅ AI 页面分析完成', {
      features: result.testableFeatures.length,
      risks: result.potentialRisks.length,
    });

    return result;
  }

  /**
   * 使用规则引擎分析页面（降级模式）
   */
  private analyzeWithRules(snapshot: PageSnapshot): PageAnalysisResult {
    const features: PageAnalysisResult['testableFeatures'] = [];
    const risks: string[] = [];
    const testData: Record<string, string[]> = {};

    // 分析交互元素
    const buttons = snapshot.interactiveElements.filter(el => el.tag === 'button');
    const links = snapshot.interactiveElements.filter(el => el.tag === 'a');
    const inputs = snapshot.interactiveElements.filter(el => el.tag === 'input');
    const selects = snapshot.interactiveElements.filter(el => el.tag === 'select');

    // 生成按钮测试
    if (buttons.length > 0) {
      features.push({
        name: '按钮交互测试',
        priority: 'P1',
        description: `测试页面上的 ${buttons.length} 个按钮`,
        suggestedSteps: [
          '检查所有按钮是否可见',
          '点击每个按钮，验证响应',
          '检查禁用状态的按钮',
        ],
        type: 'interaction',
      });

      testData['button'] = ['点击测试'];
    }

    // 生成链接测试
    if (links.length > 0) {
      features.push({
        name: '链接导航测试',
        priority: 'P1',
        description: `测试页面上的 ${links.length} 个链接`,
        suggestedSteps: [
          '检查所有链接是否有有效的 href',
          '验证外部链接是否有 target="_blank"',
          '点击链接验证导航正确',
        ],
        type: 'functional',
      });
    }

    // 分析表单
    for (const form of snapshot.forms) {
      features.push({
        name: '表单提交测试',
        priority: 'P0',
        description: `测试表单 ${form.selector} 的提交功能`,
        suggestedSteps: [
          '填写所有必填字段',
          '提交表单',
          '验证提交成功或错误提示',
        ],
        type: 'functional',
      });

      // 生成测试数据
      for (const field of form.fields) {
        if (field.type === 'email') {
          testData[field.name || 'email'] = ['test@example.com', 'invalid-email', ''];
        } else if (field.type === 'text') {
          testData[field.name || 'text'] = ['正常文本', '', '超长文本'.repeat(100)];
        } else if (field.type === 'password') {
          testData[field.name || 'password'] = ['Password123!', '', 'short'];
        }
      }

      // 检查必填字段
      const requiredFields = form.fields.filter(f => f.required);
      if (requiredFields.length > 0) {
        features.push({
          name: '必填字段验证',
          priority: 'P1',
          description: `验证 ${requiredFields.length} 个必填字段的验证`,
          suggestedSteps: [
            '清空所有必填字段',
            '提交表单',
            '验证显示错误提示',
          ],
          type: 'functional',
        });
      }
    }

    // 分析输入框
    if (inputs.length > 0) {
      features.push({
        name: '输入框测试',
        priority: 'P2',
        description: `测试 ${inputs.length} 个输入框`,
        suggestedSteps: [
          '输入正常数据',
          '输入边界值',
          '输入特殊字符',
        ],
        type: 'functional',
      });
    }

    // 分析下拉框
    if (selects.length > 0) {
      features.push({
        name: '下拉框测试',
        priority: 'P2',
        description: `测试 ${selects.length} 个下拉框`,
        suggestedSteps: [
          '选择各个选项',
          '验证默认值',
          '验证选项列表',
        ],
        type: 'functional',
      });
    }

    // 添加冒烟测试
    features.unshift({
      name: '页面冒烟测试',
      priority: 'P0',
      description: '验证页面能正常打开，关键元素存在',
      suggestedSteps: [
        `打开页面 ${snapshot.url}`,
        '验证页面标题正确',
        '检查关键元素可见',
      ],
      type: 'functional',
    });

    // 检测潜在风险
    if (snapshot.interactiveElements.some(el => !el.visible && el.clickable)) {
      risks.push('存在不可见但可点击的元素，可能影响自动化测试');
    }

    const disabledElements = snapshot.interactiveElements.filter(el => el.disabled);
    if (disabledElements.length > 0) {
      risks.push(`存在 ${disabledElements.length} 个禁用状态的元素`);
    }

    // 页面描述
    const description = this.generatePageDescription(snapshot);

    return {
      pageDescription: description,
      testableFeatures: features,
      potentialRisks: risks,
      suggestedTestData: testData,
    };
  }

  /**
   * 检测平台类型
   */
  private detectPlatform(snapshot: PageSnapshot): 'pc' | 'h5' {
    // 简单的判断逻辑
    const url = snapshot.url.toLowerCase();
    if (url.includes('m.') || url.includes('mobile') || url.includes('h5')) {
      return 'h5';
    }
    return 'pc';
  }

  /**
   * 生成页面描述
   */
  private generatePageDescription(snapshot: PageSnapshot): string {
    const elements = snapshot.interactiveElements;
    const forms = snapshot.forms;

    const parts: string[] = [];

    if (forms.length > 0) {
      parts.push(`包含 ${forms.length} 个表单`);
    }

    const buttons = elements.filter(e => e.tag === 'button');
    if (buttons.length > 0) {
      parts.push(`${buttons.length} 个按钮`);
    }

    const links = elements.filter(e => e.tag === 'a');
    if (links.length > 0) {
      parts.push(`${links.length} 个链接`);
    }

    if (parts.length === 0) {
      return `页面: ${snapshot.title}`;
    }

    return `${snapshot.title} - ${parts.join('，')}`;
  }

  /**
   * 批量分析页面
   */
  async analyzeBatch(snapshots: PageSnapshot[]): Promise<PageAnalysisResult[]> {
    const results: PageAnalysisResult[] = [];

    for (const snapshot of snapshots) {
      try {
        const result = await this.analyze(snapshot);
        results.push(result);
      } catch (error) {
        logger.fail('❌ 页面分析失败', { url: snapshot.url, error: String(error) });
        // 使用空结果继续
        results.push({
          pageDescription: `分析失败: ${snapshot.title}`,
          testableFeatures: [],
          potentialRisks: ['分析过程出错'],
          suggestedTestData: {},
        });
      }
    }

    return results;
  }
}

/**
 * 快捷分析函数
 */
export async function analyzePage(
  snapshot: PageSnapshot,
  options?: Partial<AnalyzerConfig>,
): Promise<PageAnalysisResult> {
  const analyzer = new PageAnalyzer(options);
  return analyzer.analyze(snapshot);
}
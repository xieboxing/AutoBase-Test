/**
 * 页面巡检器
 * 对每个页面进行自动检查，发现问题并保留证据
 * 第二轮增强：集成 OCR 和 AI 能力
 */

import type { Browser as WebdriverIOBrowser } from 'webdriverio';
import type {
  PageConfig,
  PageInspectionResult,
  InspectionIssue,
  InspectionIssueType,
  InspectionRule,
  ElementInfo,
  ElementLocator,
  OcrConfig,
  OcrResult,
  EnhancedInspectionIssue,
  EnhancedInspectionConfig,
} from '@/types/financial.types.js';
import type { TestCasePriority } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { OcrProcessor, DEFAULT_OCR_CONFIG } from '@/utils/ocr.js';
import { ImageAnnotator, DEFAULT_ANNOTATION_CONFIG } from '@/utils/image-annotator.js';
import { IssueAnalyzer } from '@/testers/financial/issue-analyzer.js';

/**
 * 页面巡检器配置
 */
export interface PageInspectorOptions {
  /** Appium 驱动 */
  driver: WebdriverIOBrowser;
  /** 设备 ID */
  deviceId: string;
  /** 输出目录（截图、page source） */
  outputDir: string;
  /** 基础检查规则 */
  rules?: InspectionRule[];
  /** 是否自动截图 */
  autoScreenshot?: boolean;
  /** 是否保存 page source */
  savePageSource?: boolean;
  /** 是否提取文本 */
  extractText?: boolean;
  /** 第二轮增强配置 */
  enhanced?: EnhancedInspectionConfig;
  /** OCR 配置 */
  ocrConfig?: OcrConfig;
  /** 是否生成标注截图 */
  generateAnnotatedScreenshots?: boolean;
  /** 是否使用 AI 分析 */
  useAiAnalysis?: boolean;
  /** 置信度阈值（低于此值的问题会被过滤） */
  confidenceThreshold?: number;
}

/**
 * 默认检查规则
 */
const DEFAULT_RULES: InspectionRule[] = [
  {
    id: 'page-blank',
    name: '页面空白检查',
    description: '检查页面是否为空白或无内容',
    severity: 'P0',
    enabled: true,
  },
  {
    id: 'critical-element-missing',
    name: '关键元素缺失检查',
    description: '检查页面关键元素是否存在',
    severity: 'P0',
    enabled: true,
  },
  {
    id: 'untranslated-key',
    name: '未翻译 key 检查',
    description: '检查是否存在未翻译的国际化 key',
    severity: 'P1',
    enabled: true,
  },
  {
    id: 'mixed-language',
    name: '中英文混杂检查',
    description: '检查同一页面是否存在中英文混杂',
    severity: 'P2',
    enabled: true,
  },
  {
    id: 'placeholder-unreplaced',
    name: '占位符未替换检查',
    description: '检查是否存在 {0}、%s 等未替换的占位符',
    severity: 'P1',
    enabled: true,
  },
  {
    id: 'garbled-text',
    name: '乱码检查',
    description: '检查是否存在乱码或编码异常',
    severity: 'P1',
    enabled: true,
  },
  {
    id: 'text-truncated',
    name: '文本截断检查',
    description: '检查文本是否被截断显示不完整',
    severity: 'P2',
    enabled: true,
  },
  {
    id: 'element-overlap',
    name: '元素重叠检查',
    description: '检查是否存在元素重叠疑似异常',
    severity: 'P2',
    enabled: true,
  },
  {
    id: 'button-blocked',
    name: '按钮遮挡检查',
    description: '检查按钮是否被其他元素遮挡',
    severity: 'P1',
    enabled: true,
  },
];

/**
 * 未翻译 key 模式
 */
const UNTRANSLATED_KEY_PATTERNS = [
  /^[a-zA-Z_]+\.[a-zA-Z_]+$/,  // common.key 形式
  /\$\{[a-zA-Z_]+\}/,           // ${key} 形式
  /#{[a-zA-Z_]+}/,              // #{key} 形式
  /%[a-zA-Z_]+%/,               // %key% 形式
  /^i18n\.[a-zA-Z_]+$/,         // i18n.key 形式
  /^msg\.[a-zA-Z_]+$/,          // msg.key 形式
];

/**
 * 占位符未替换模式
 */
const PLACEHOLDER_PATTERNS = [
  /\{[0-9]+\}/,                 // {0}, {1} 等
  /\{\d+\}/,                    // {n} 形式
  /%s/,                         // %s 形式
  /%d/,                         // %d 形式
  /\$[0-9]+/,                   // $1, $2 等
  /\{\{[a-zA-Z_]+\}\}/,         // {{key}} 形式
];

/**
 * 乱码模式
 */
const GARBLED_PATTERNS = [
  /[\u0000-\u001F]+/,           // 控制字符
  /[\uFFFD]+/,                  // 替换字符
  /Ã[^\s]/,                     // UTF-8 解码错误常见模式
  /â[^\s]/,                     // 另一种解码错误模式
];

/**
 * 页面巡检器类
 * 第二轮增强：集成 OCR、AI 分析和图片标注
 */
export class PageInspector {
  private driver: WebdriverIOBrowser;
  private deviceId: string;
  private outputDir: string;
  private rules: InspectionRule[];
  private autoScreenshot: boolean;
  private savePageSource: boolean;
  private extractText: boolean;
  private screenshotDir: string;
  private pageSourceDir: string;
  private annotatedDir: string;

  // 第二轮增强组件
  private ocrProcessor?: OcrProcessor;
  private imageAnnotator?: ImageAnnotator;
  private issueAnalyzer: IssueAnalyzer;
  private enhancedConfig?: EnhancedInspectionConfig;
  private generateAnnotatedScreenshots: boolean;
  private useAiAnalysis: boolean;

  constructor(options: PageInspectorOptions) {
    this.driver = options.driver;
    this.deviceId = options.deviceId;
    this.outputDir = options.outputDir;
    this.rules = options.rules || DEFAULT_RULES;
    this.autoScreenshot = options.autoScreenshot ?? true;
    this.savePageSource = options.savePageSource ?? true;
    this.extractText = options.extractText ?? true;

    this.screenshotDir = join(this.outputDir, 'screenshots');
    this.pageSourceDir = join(this.outputDir, 'page-sources');
    this.annotatedDir = join(this.outputDir, 'annotated');

    // 第二轮增强初始化
    this.enhancedConfig = options.enhanced;
    this.generateAnnotatedScreenshots = options.generateAnnotatedScreenshots ?? true;
    this.useAiAnalysis = options.useAiAnalysis ?? false;

    // 初始化 OCR 处理器
    if (options.ocrConfig?.enabled) {
      this.ocrProcessor = new OcrProcessor(options.ocrConfig);
    } else if (this.enhancedConfig?.ocr?.enabled) {
      this.ocrProcessor = new OcrProcessor(this.enhancedConfig.ocr);
    }

    // 初始化图片标注器
    if (this.generateAnnotatedScreenshots) {
      this.imageAnnotator = new ImageAnnotator(this.enhancedConfig?.annotation);
    }

    // 初始化问题分析器
    this.issueAnalyzer = new IssueAnalyzer({
      enableDeduplication: true,
      confidenceThreshold: options.confidenceThreshold ?? 0.5,
      ignoreRules: this.enhancedConfig?.ignoreRules,
    });
  }

  /**
   * 初始化输出目录
   */
  async initialize(): Promise<void> {
    await mkdir(this.screenshotDir, { recursive: true });
    await mkdir(this.pageSourceDir, { recursive: true });
    await mkdir(this.annotatedDir, { recursive: true });
    logger.step(`📁 输出目录已创建: ${this.outputDir}`);

    // 初始化 OCR 处理器
    if (this.ocrProcessor) {
      await this.ocrProcessor.initialize();
    }
  }

  /**
   * 执行页面巡检
   * 第二轮增强：集成 OCR 分析和 AI 辅助
   * @param pageConfig 页面配置
   * @param language 当前语言
   * @returns 巡检结果
   */
  async inspectPage(pageConfig: PageConfig, language: string): Promise<PageInspectionResult> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    const issues: InspectionIssue[] = [];

    logger.step(`🔍 开始巡检页面: ${pageConfig.name} (语言: ${language})`);

    // 生成文件名前缀
    const filePrefix = `${pageConfig.id}_${language}_${Date.now()}`;

    // 1. 自动截图
    let screenshotPath = '';
    if (this.autoScreenshot || pageConfig.screenshot) {
      screenshotPath = await this.takeScreenshot(filePrefix);
      logger.pass(`📸 截图已保存: ${screenshotPath}`);
    }

    // 2. 保存 page source
    let pageSourcePath: string | undefined;
    if (this.savePageSource) {
      pageSourcePath = await this.savePageSourceFile(filePrefix);
      logger.pass(`📄 Page Source 已保存: ${pageSourcePath}`);
    }

    // 3. 提取页面文本（DOM 提取）
    let extractedText: string | undefined;
    if (this.extractText || pageConfig.textInspection) {
      extractedText = await this.extractPageText();
      logger.pass(`📝 文本已提取 (${extractedText?.length || 0} 字符)`);
    }

    // 4. 第二轮增强：OCR 文本提取
    let ocrResults: OcrResult[] | undefined;
    if (this.ocrProcessor && screenshotPath) {
      logger.ai('🤖 OCR 分析中...');
      ocrResults = await this.ocrProcessor.extractText(screenshotPath);

      // OCR 与 DOM 文本对比检测差异
      if (ocrResults && extractedText) {
        const ocrText = ocrResults.map(r => r.text).join('\n');
        const ocrIssues = await this.detectOcrDiscrepancies(
          ocrText,
          extractedText,
          pageConfig,
          language,
          screenshotPath,
          pageSourcePath,
          ocrResults,
        );
        issues.push(...ocrIssues);
      }
    }

    // 5. 执行检查规则
    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      const ruleIssues = await this.executeRule(rule, pageConfig, language, screenshotPath, pageSourcePath, extractedText);
      issues.push(...ruleIssues);
    }

    // 6. 执行页面特定检查规则
    if (pageConfig.customRules) {
      for (const customRule of pageConfig.customRules) {
        if (!customRule.enabled) continue;

        const customIssues = await this.executeCustomRule(customRule, pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...customIssues);
      }
    }

    // 7. 检查关键元素
    if (pageConfig.criticalElements && pageConfig.criticalElements.length > 0) {
      const criticalIssues = await this.checkCriticalElements(pageConfig, language, screenshotPath, pageSourcePath);
      issues.push(...criticalIssues);
    }

    // 8. 第二轮增强：使用问题分析器进行增强
    const enhancedIssues = this.issueAnalyzer.enhanceIssues(issues);

    // 9. 第二轮增强：生成标注截图
    let annotatedScreenshotPath: string | undefined;
    if (this.imageAnnotator && screenshotPath && enhancedIssues.length > 0) {
      const annotations = this.imageAnnotator.createAnnotationsFromIssues(enhancedIssues);
      if (annotations.length > 0) {
        const annotatedResult = await this.imageAnnotator.annotateImage(
          screenshotPath,
          annotations,
          join(this.annotatedDir, `${filePrefix}_annotated.png`),
        );
        annotatedScreenshotPath = annotatedResult.annotatedPath;
        logger.pass(`🖼️ 标注截图已生成: ${annotatedScreenshotPath}`);
      }
    }

    // 10. 第二轮增强：AI 分析（可选）
    if (this.useAiAnalysis && screenshotPath && enhancedIssues.length > 0) {
      logger.ai('🤖 AI 深度分析中...');
      const aiAnalysis = await this.performAiAnalysis(enhancedIssues, screenshotPath);

      // 更新问题的 AI 确认信息
      for (const issue of enhancedIssues) {
        if (issue.confidenceFactors) {
          const aiMatch = aiAnalysis.find(a => a.issueId === issue.id);
          if (aiMatch) {
            issue.confidenceFactors.aiAgreement = aiMatch.agreementScore;
          }
        }
      }
    }

    // 重新计算置信度并过滤
    const analyzedResult = this.issueAnalyzer.analyze(issues);
    const filteredIssues = analyzedResult.enhancedIssues;

    const durationMs = Date.now() - startTime;
    const passed = filteredIssues.filter(i => i.severity === 'P0').length === 0;

    if (filteredIssues.length > 0) {
      const p0Count = filteredIssues.filter(i => i.severity === 'P0').length;
      const p1Count = filteredIssues.filter(i => i.severity === 'P1').length;
      logger.fail(`❌ 发现 ${filteredIssues.length} 个问题 (P0: ${p0Count}, P1: ${p1Count})`);
    } else {
      logger.pass(`✅ 页面检查通过`);
    }

    return {
      pageId: pageConfig.id,
      pageName: pageConfig.name,
      language,
      timestamp,
      screenshotPath,
      pageSourcePath,
      annotatedScreenshotPath,
      extractedText,
      ocrResults,
      issues: filteredIssues,
      passed,
      durationMs,
    };
  }

  /**
   * 第二轮增强：检测 OCR 与 DOM 文本差异
   */
  private async detectOcrDiscrepancies(
    ocrText: string,
    domText: string,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
    ocrResults: OcrResult[],
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    // 标准化文本
    const normalizeText = (text: string) =>
      text.toLowerCase().replace(/\s+/g, ' ').trim();

    const ocrNormalized = normalizeText(ocrText);
    const domNormalized = normalizeText(domText);

    const ocrWords = new Set(ocrNormalized.split(/\s+/));
    const domWords = new Set(domNormalized.split(/\s+/));

    // 检查 OCR 有但 DOM 没有的（可能是渲染问题）
    for (const word of ocrWords) {
      if (word.length > 2 && !domWords.has(word)) {
        const region = ocrResults.find(r =>
          r.text.toLowerCase().includes(word)
        );

        issues.push(this.createIssue(
          'content-missing',
          `OCR 检测到 "${word}" 但 DOM 中未找到，可能存在渲染问题`,
          pageConfig.name,
          language,
          'P1',
          0.6,
          screenshotPath,
          pageSourcePath,
          {
            type: 'ocr-discrepancy',
            text: word,
            bounds: region?.bounds,
          },
        ));
      }
    }

    // 检查 DOM 有但 OCR 没有的（可能是隐藏元素）
    for (const word of domWords) {
      if (word.length > 2 && !ocrWords.has(word)) {
        issues.push(this.createIssue(
          'element-not-visible',
          `DOM 中有 "${word}" 但 OCR 未检测到，元素可能不可见`,
          pageConfig.name,
          language,
          'P2',
          0.5,
          screenshotPath,
          pageSourcePath,
          { type: 'ocr-discrepancy', text: word },
        ));
      }
    }

    return issues;
  }

  /**
   * 第二轮增强：AI 深度分析
   */
  private async performAiAnalysis(
    issues: EnhancedInspectionIssue[],
    screenshotPath: string,
  ): Promise<Array<{ issueId: string; agreementScore: number }>> {
    try {
      // 动态导入 AI 客户端
      const { createAiClient } = await import('@/ai/client.js');
      const client = createAiClient();

      // 读取截图
      const fs = await import('node:fs/promises');
      const imageBuffer = await fs.readFile(screenshotPath);
      const base64Image = imageBuffer.toString('base64');

      // 构建 prompt
      const issueDescriptions = issues.map(i =>
        `- ${i.type}: ${i.description} (置信度: ${i.confidence})`
      ).join('\n');

      const prompt = `请分析这张 APP 截图中的问题列表，评估每个问题的真实性和严重程度。

问题列表：
${issueDescriptions}

请以 JSON 格式返回每个问题的评估结果：
{
  "analysis": [
    {
      "issueId": "问题ID",
      "agreementScore": 0.0-1.0,
      "reason": "简要说明"
    }
  ]
}`;

      const response = await client.chat([
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: {
              type: 'base64',
              media_type: 'image/png',
              data: base64Image
            }},
          ],
        },
      ]);

      // 解析响应
      const text = typeof response === 'string' ? response : JSON.stringify(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return (parsed.analysis || []).map((a: any) => ({
          issueId: a.issueId || '',
          agreementScore: a.agreementScore || 0.5,
        }));
      }

      return [];
    } catch (error) {
      logger.warn(`AI 分析失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 执行单个检查规则
   */
  private async executeRule(
    rule: InspectionRule,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
    extractedText: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    switch (rule.id) {
      case 'page-blank':
        const blankIssue = await this.checkPageBlank(pageConfig, language, screenshotPath, pageSourcePath);
        if (blankIssue) issues.push(blankIssue);
        break;

      case 'critical-element-missing':
        // 已在 checkCriticalElements 中处理
        break;

      case 'untranslated-key':
        const untranslatedIssues = this.checkUntranslatedKey(extractedText, pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...untranslatedIssues);
        break;

      case 'mixed-language':
        const mixedIssues = this.checkMixedLanguage(extractedText, language, pageConfig, screenshotPath, pageSourcePath);
        issues.push(...mixedIssues);
        break;

      case 'placeholder-unreplaced':
        const placeholderIssues = this.checkPlaceholderUnreplaced(extractedText, pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...placeholderIssues);
        break;

      case 'garbled-text':
        const garbledIssues = this.checkGarbledText(extractedText, pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...garbledIssues);
        break;

      case 'text-truncated':
        const truncatedIssues = await this.checkTextTruncated(pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...truncatedIssues);
        break;

      case 'element-overlap':
        const overlapIssues = await this.checkElementOverlap(pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...overlapIssues);
        break;

      case 'button-blocked':
        const blockedIssues = await this.checkButtonBlocked(pageConfig, language, screenshotPath, pageSourcePath);
        issues.push(...blockedIssues);
        break;
    }

    return issues;
  }

  /**
   * 执行页面特定检查规则
   */
  private async executeCustomRule(
    rule: InspectionRule,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    // 自定义规则的具体实现由页面配置决定
    logger.ai(`🤖 执行自定义规则: ${rule.name}`);

    // 如果有目标元素，检查它们
    if (rule.parameters?.targetElements) {
      // 具体实现根据规则类型
    }

    return issues;
  }

  /**
   * 检查页面空白
   */
  private async checkPageBlank(
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue | null> {
    try {
      // 获取所有可见元素
      const elements = await this.driver.$$('//android.widget.TextView | //android.widget.Button | //android.widget.ImageView');

      if (elements.length < 3) {
        return this.createIssue(
          'page-blank',
          '页面空白或内容缺失',
          pageConfig.name,
          language,
          'P0',
          0.9,
          screenshotPath,
          pageSourcePath,
          { type: 'page', text: `元素数量: ${elements.length}` },
        );
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * 检查未翻译 key
   */
  private checkUntranslatedKey(
    text: string | undefined,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): InspectionIssue[] {
    if (!text) return [];

    const issues: InspectionIssue[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      for (const pattern of UNTRANSLATED_KEY_PATTERNS) {
        if (pattern.test(line.trim())) {
          issues.push(this.createIssue(
            'untranslated-key',
            `发现未翻译的国际化 key: "${line.trim()}"`,
            pageConfig.name,
            language,
            'P1',
            0.85,
            screenshotPath,
            pageSourcePath,
            { type: 'text', text: line.trim() },
          ));
        }
      }
    }

    return issues;
  }

  /**
   * 检查中英文混杂
   */
  private checkMixedLanguage(
    text: string | undefined,
    currentLanguage: string,
    pageConfig: PageConfig,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): InspectionIssue[] {
    if (!text) return [];

    const issues: InspectionIssue[] = [];

    // 如果当前是中文语言，检查是否混入英文（排除正常英文词汇）
    if (currentLanguage === 'zh-CN' || currentLanguage === 'zh') {
      // 检查同一行是否同时包含中文和英文单词
      const lines = text.split('\n');
      for (const line of lines) {
        const hasChinese = /[\u4e00-\u9fa5]/.test(line);
        const hasEnglish = /[a-zA-Z]{3,}/.test(line);

        // 排除正常混用情况（如"App Store"、"登录 Login"）
        const normalMixedPatterns = ['App', 'Store', 'Login', 'OK', 'Cancel', 'Submit', 'Download', 'Update'];
        let isNormalMixed = false;
        for (const pattern of normalMixedPatterns) {
          if (line.includes(pattern)) {
            isNormalMixed = true;
            break;
          }
        }

        if (hasChinese && hasEnglish && !isNormalMixed && line.length > 10) {
          issues.push(this.createIssue(
            'mixed-language',
            `疑似中英文混杂: "${line.substring(0, 50)}..."`,
            pageConfig.name,
            currentLanguage,
            'P2',
            0.6,
            screenshotPath,
            pageSourcePath,
            { type: 'text', text: line.substring(0, 100) },
          ));
        }
      }
    }

    return issues;
  }

  /**
   * 检查占位符未替换
   */
  private checkPlaceholderUnreplaced(
    text: string | undefined,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): InspectionIssue[] {
    if (!text) return [];

    const issues: InspectionIssue[] = [];

    for (const pattern of PLACEHOLDER_PATTERNS) {
      const matches = text.match(new RegExp(pattern.source, 'g'));
      if (matches) {
        for (const match of matches) {
          issues.push(this.createIssue(
            'placeholder-unreplaced',
            `发现未替换的占位符: "${match}"`,
            pageConfig.name,
            language,
            'P1',
            0.8,
            screenshotPath,
            pageSourcePath,
            { type: 'text', text: match },
          ));
        }
      }
    }

    return issues;
  }

  /**
   * 检查乱码
   */
  private checkGarbledText(
    text: string | undefined,
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): InspectionIssue[] {
    if (!text) return [];

    const issues: InspectionIssue[] = [];

    for (const pattern of GARBLED_PATTERNS) {
      if (pattern.test(text)) {
        issues.push(this.createIssue(
          'garbled-text',
          '发现乱码或编码异常',
          pageConfig.name,
          language,
          'P1',
          0.9,
          screenshotPath,
          pageSourcePath,
          { type: 'text', text: '检测到编码异常字符' },
        ));
      }
    }

    return issues;
  }

  /**
   * 检查文本截断
   */
  private async checkTextTruncated(
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    try {
      // 检查 TextView 是否有截断迹象
      const textViews = await this.driver.$$('//android.widget.TextView');

      for (const textView of textViews) {
        try {
          const text = await textView.getText();
          const bounds = await textView.getAttribute('bounds');

          // 简单判断：如果文本以 ... 结尾可能被截断
          if (text && text.endsWith('...') && text.length > 20) {
            issues.push(this.createIssue(
              'text-truncated',
              `文本可能被截断: "${text}"`,
              pageConfig.name,
              language,
              'P2',
              0.5,
              screenshotPath,
              pageSourcePath,
              { type: 'TextView', text, locator: bounds || '' },
            ));
          }
        } catch {
          // 忽略单个元素错误
        }
      }
    } catch {
      // 忽略整体错误
    }

    return issues;
  }

  /**
   * 检查元素重叠
   */
  private async checkElementOverlap(
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    try {
      // 获取所有可见元素的 bounds
      const visibleElements = await this.driver.$$('//*[@displayed="true"]');

      const boundsList: Array<{ x: number; y: number; width: number; height: number; element: unknown }> = [];

      for (const element of visibleElements.slice(0, 50)) { // 限制检查数量
        try {
          const boundsStr = await element.getAttribute('bounds');
          if (boundsStr) {
            const bounds = this.parseBounds(boundsStr);
            if (bounds) {
              boundsList.push({ ...bounds, element });
            }
          }
        } catch {
          // 忽略
        }
      }

      // 检查重叠（简化实现）
      for (let i = 0; i < boundsList.length; i++) {
        for (let j = i + 1; j < boundsList.length; j++) {
          const a = boundsList[i];
          const b = boundsList[j];

          // 检查是否重叠（确保 bounds 有效）
          if (a && b && this.isOverlapping(a, b)) {
            issues.push(this.createIssue(
              'element-overlap',
              '发现元素重叠疑似异常',
              pageConfig.name,
              language,
              'P2',
              0.4,
              screenshotPath,
              pageSourcePath,
              { type: 'element', locator: `元素 ${i} 和 ${j} 重叠` },
            ));
            // 只报告一次
            break;
          }
        }
      }
    } catch {
      // 忽略整体错误
    }

    return issues;
  }

  /**
   * 检查按钮遮挡
   */
  private async checkButtonBlocked(
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    try {
      // 获取所有按钮
      const buttons = await this.driver.$$('//android.widget.Button');

      for (const button of buttons.slice(0, 20)) {
        try {
          const boundsStr = await button.getAttribute('bounds');
          const clickable = await button.getAttribute('clickable');

          if (boundsStr && clickable === 'true') {
            const bounds = this.parseBounds(boundsStr);
            if (bounds && (bounds.width < 50 || bounds.height < 30)) {
              issues.push(this.createIssue(
                'button-blocked',
                '按钮尺寸过小可能被遮挡或难以点击',
                pageConfig.name,
                language,
                'P1',
                0.5,
                screenshotPath,
                pageSourcePath,
                { type: 'Button', bounds: bounds ?? undefined },
              ));
            }
          }
        } catch {
          // 忽略
        }
      }
    } catch {
      // 忽略
    }

    return issues;
  }

  /**
   * 检查关键元素是否存在
   */
  private async checkCriticalElements(
    pageConfig: PageConfig,
    language: string,
    screenshotPath: string,
    pageSourcePath: string | undefined,
  ): Promise<InspectionIssue[]> {
    const issues: InspectionIssue[] = [];

    if (!pageConfig.criticalElements || pageConfig.criticalElements.length === 0) {
      return issues;
    }

    for (const locator of pageConfig.criticalElements) {
      try {
        const element = await this.findElement(locator);
        const isDisplayed = await element.isDisplayed();

        if (!isDisplayed) {
          issues.push(this.createIssue(
            'critical-element-missing',
            `关键元素不可见: ${locator.description || locator.value}`,
            pageConfig.name,
            language,
            'P0',
            0.9,
            screenshotPath,
            pageSourcePath,
            { type: 'element', locator: locator.value },
          ));
        }
      } catch {
        issues.push(this.createIssue(
          'critical-element-missing',
          `关键元素未找到: ${locator.description || locator.value}`,
          pageConfig.name,
          language,
          'P0',
          0.95,
          screenshotPath,
          pageSourcePath,
          { type: 'element', locator: locator.value },
        ));
      }
    }

    return issues;
  }

  /**
   * 截图
   */
  private async takeScreenshot(filePrefix: string): Promise<string> {
    const filePath = join(this.screenshotDir, `${filePrefix}.png`);

    try {
      const screenshot = await this.driver.takeScreenshot();
      const buffer = Buffer.from(screenshot, 'base64');

      // 使用 Node.js fs 写入文件
      const fs = await import('node:fs/promises');
      await fs.writeFile(filePath, buffer);

      return filePath;
    } catch (error) {
      logger.warn(`截图失败: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * 保存 page source 文件
   */
  private async savePageSourceFile(filePrefix: string): Promise<string> {
    const filePath = join(this.pageSourceDir, `${filePrefix}.xml`);

    try {
      const pageSource = await this.driver.getPageSource();
      const fs = await import('node:fs/promises');
      await fs.writeFile(filePath, pageSource, 'utf-8');

      return filePath;
    } catch (error) {
      logger.warn(`保存 page source 失败: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * 提取页面文本
   */
  private async extractPageText(): Promise<string> {
    try {
      // 获取所有 TextView 和 Button 的文本
      const textElements = await this.driver.$$('//android.widget.TextView | //android.widget.Button | //android.widget.EditText');

      const texts: string[] = [];

      for (const element of textElements) {
        try {
          const text = await element.getText();
          if (text && text.trim()) {
            texts.push(text.trim());
          }
        } catch {
          // 忽略单个元素错误
        }
      }

      return texts.join('\n');
    } catch (error) {
      logger.warn(`提取页面文本失败: ${(error as Error).message}`);
      return '';
    }
  }

  /**
   * 查找元素
   */
  private async findElement(locator: ElementLocator): Promise<ReturnType<WebdriverIOBrowser['$']>> {
    const selector = this.buildSelector(locator);
    return await this.driver.$(selector);
  }

  /**
   * 构建选择器
   */
  private buildSelector(locator: ElementLocator): string {
    switch (locator.strategy) {
      case 'id':
        return `id:${locator.value}`;
      case 'xpath':
        return locator.value;
      case 'class':
        return `class:${locator.value}`;
      case 'accessibility-id':
        return `accessibility id:${locator.value}`;
      case 'text':
        return `text:${locator.value}`;
      default:
        return locator.value;
    }
  }

  /**
   * 解析 bounds 字符串
   */
  private parseBounds(boundsStr: string): ElementInfo['bounds'] | null {
    try {
      // bounds 格式: [x1,y1][x2,y2]
      const match = boundsStr.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/);
      if (match && match[1] && match[2] && match[3] && match[4]) {
        const x1 = parseInt(match[1], 10);
        const y1 = parseInt(match[2], 10);
        const x2 = parseInt(match[3], 10);
        const y2 = parseInt(match[4], 10);

        return {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1,
        };
      }
    } catch {
      // 忽略解析错误
    }
    return null;
  }

  /**
   * 检查两个 bounds 是否重叠
   */
  private isOverlapping(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
  ): boolean {
    const aRight = a.x + a.width;
    const aBottom = a.y + a.height;
    const bRight = b.x + b.width;
    const bBottom = b.y + b.height;

    // 完全不重叠
    if (aRight < b.x || bRight < a.x || aBottom < b.y || bBottom < a.y) {
      return false;
    }

    // 计算重叠面积
    const overlapWidth = Math.min(aRight, bRight) - Math.max(a.x, b.x);
    const overlapHeight = Math.min(aBottom, bBottom) - Math.max(a.y, b.y);
    const overlapArea = overlapWidth * overlapHeight;

    // 只有显著重叠才报告（超过最小元素面积的 30%）
    const minArea = Math.min(a.width * a.height, b.width * b.height);
    return overlapArea > minArea * 0.3;
  }

  /**
   * 创建问题对象
   */
  private createIssue(
    type: InspectionIssueType,
    description: string,
    pageName: string,
    language: string,
    severity: TestCasePriority,
    confidence: number,
    screenshotPath: string,
    pageSourcePath: string | undefined,
    elementInfo?: ElementInfo,
  ): InspectionIssue {
    return {
      id: `${type}-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      type,
      description,
      pageName,
      language,
      severity,
      confidence,
      screenshotPath,
      pageSourcePath,
      elementInfo,
      suggestion: this.getSuggestion(type),
    };
  }

  /**
   * 获取建议修复方案
   */
  private getSuggestion(type: InspectionIssueType): string {
    const suggestions: Record<InspectionIssueType, string> = {
      'page-blank': '检查页面数据加载是否正常，确认网络连接和 API 响应',
      'content-missing': '检查页面元素是否被正确渲染，确认数据绑定',
      'element-not-visible': '检查元素 display 属性或 visibility 设置',
      'element-overlap': '调整元素布局，确保各元素有足够间距',
      'button-blocked': '检查按钮周围是否有遮挡元素，调整 z-index 或布局',
      'layout-abnormal': '检查响应式布局和屏幕适配',
      'untranslated-key': '补充缺失的国际化翻译，确认 key 是否正确',
      'mixed-language': '统一页面语言，检查翻译遗漏',
      'placeholder-unreplaced': '确保占位符参数正确传入',
      'garbled-text': '检查文本编码设置，确认 UTF-8 编码',
      'critical-element-missing': '确认关键元素定位器是否正确，检查页面是否完全加载',
      'text-truncated': '调整文本显示区域或使用自适应字体大小',
      'icon-missing': '检查图标资源是否存在',
      'color-abnormal': '检查颜色主题设置',
      'spacing-abnormal': '调整元素间距',
    };

    return suggestions[type] || '请检查相关配置和实现';
  }
}

/**
 * 导出默认检查规则
 */
export { DEFAULT_RULES };
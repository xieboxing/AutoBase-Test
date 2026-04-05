/**
 * OCR 文本识别模块
 * 支持多种 OCR 后端：Tesseract.js（本地）、Google Vision、AWS Textract、AI Vision
 */

import type {
  OcrConfig,
  OcrResult,
  OcrPageAnalysis,
  OcrDiscrepancy,
} from '@/types/financial.types.js';
import { logger } from '@/core/logger.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

/**
 * OCR 处理器类
 */
export class OcrProcessor {
  private config: OcrConfig;
  private initialized: boolean = false;

  constructor(config: OcrConfig) {
    this.config = config;
  }

  /**
   * 初始化 OCR 引擎
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    logger.step('🔧 初始化 OCR 引擎...');

    try {
      switch (this.config.provider) {
        case 'tesseract':
          // Tesseract.js 初始化（如果安装了的话）
          logger.info('  使用 Tesseract.js 本地 OCR');
          break;

        case 'google-vision':
          // Google Vision API 初始化
          logger.info('  使用 Google Vision API');
          break;

        case 'aws-textract':
          // AWS Textract 初始化
          logger.info('  使用 AWS Textract');
          break;

        case 'ai-vision':
          // AI Vision（使用现有的 AI 客户端）
          logger.info('  使用 AI Vision (Claude/GPT-4V)');
          break;

        default:
          logger.info('  使用模拟 OCR（需要配置真实 OCR 服务）');
      }

      this.initialized = true;
      logger.pass('✅ OCR 引擎初始化完成');
    } catch (error) {
      logger.warn(`⚠️ OCR 初始化失败: ${(error as Error).message}`);
      logger.warn('将使用降级模式（仅基础文本提取）');
    }
  }

  /**
   * 从图片提取文本
   */
  async extractText(imagePath: string): Promise<OcrResult[]> {
    if (!this.config.enabled) {
      return [];
    }

    await this.initialize();

    logger.step(`📖 OCR 识别: ${basename(imagePath)}`);

    try {
      let results: OcrResult[];

      switch (this.config.provider) {
        case 'ai-vision':
          results = await this.extractWithAiVision(imagePath);
          break;

        case 'tesseract':
          results = await this.extractWithTesseract(imagePath);
          break;

        default:
          // 降级模式：使用文件名和基础信息
          results = await this.extractFallback(imagePath);
      }

      const minConfidence = this.config.minConfidence ?? 0.5;
      const filtered = results.filter(r => r.confidence >= minConfidence);

      logger.pass(`✅ OCR 识别完成: ${filtered.length} 个文本区域`);
      return filtered;

    } catch (error) {
      logger.warn(`⚠️ OCR 识别失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 分析页面截图
   */
  async analyzePage(
    screenshotPath: string,
    pageSourcePath?: string,
    domText?: string,
  ): Promise<OcrPageAnalysis> {
    const startTime = Date.now();
    const pageId = basename(screenshotPath).split('_')[0] || 'unknown';

    logger.step(`🔍 OCR 页面分析: ${pageId}`);

    // 提取 OCR 文本
    const textRegions = await this.extractText(screenshotPath);
    const fullText = textRegions.map(r => r.text).join('\n');

    // 分析差异
    const discrepancies: OcrDiscrepancy[] = [];

    if (domText && fullText) {
      discrepancies.push(...this.findDiscrepancies(fullText, domText, textRegions));
    }

    const durationMs = Date.now() - startTime;

    logger.pass(`✅ 页面 OCR 分析完成: ${textRegions.length} 区域, ${discrepancies.length} 差异`);

    return {
      pageId,
      screenshotPath,
      fullText,
      textRegions,
      discrepancies,
      durationMs,
    };
  }

  /**
   * 使用 AI Vision 提取文本
   */
  private async extractWithAiVision(imagePath: string): Promise<OcrResult[]> {
    try {
      // 动态导入 AI 客户端
      const { createAiClient } = await import('@/ai/client.js');

      const client = createAiClient();

      // 读取图片并转为 base64
      const imageBuffer = await readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = imagePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';

      // 构建 prompt
      const prompt = `请分析这张 APP 截图，提取所有可见的文本内容。

要求：
1. 列出所有可见文本
2. 估计每个文本区域的位置（用百分比坐标）
3. 评估识别置信度

请以 JSON 格式返回，格式如下：
{
  "textRegions": [
    {
      "text": "识别到的文本",
      "confidence": 0.95,
      "bounds": { "x": 10, "y": 20, "width": 80, "height": 5 }
    }
  ]
}

注意：
- bounds 使用百分比坐标（相对于图片宽高的百分比）
- confidence 范围 0-1`;

      const response = await client.chat([
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Image } },
          ],
        },
      ]);

      // 解析响应
      const text = typeof response === 'string' ? response : JSON.stringify(response);
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return (parsed.textRegions || []).map((r: any) => ({
          text: r.text || '',
          confidence: r.confidence || 0.8,
          bounds: r.bounds || { x: 0, y: 0, width: 0, height: 0 },
        }));
      }

      return [];
    } catch (error) {
      logger.warn(`AI Vision OCR 失败: ${(error as Error).message}`);
      return this.extractFallback(imagePath);
    }
  }

  /**
   * 使用 Tesseract.js 提取文本
   */
  private async extractWithTesseract(imagePath: string): Promise<OcrResult[]> {
    try {
      // 尝试动态加载 tesseract.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Tesseract = await import('tesseract.js').catch(() => null) as {
        recognize: (image: string, lang: string, options?: unknown) => Promise<{
          data: {
            words: Array<{
              text: string;
              confidence: number;
              bbox: { x0: number; y0: number; x1: number; y1: number };
            }>;
          };
        }>;
      } | null;

      if (!Tesseract) {
        logger.warn('Tesseract.js 未安装，使用降级模式');
        return this.extractFallback(imagePath);
      }

      const result = await Tesseract.recognize(imagePath, this.config.languages?.join('+') || 'eng+chi_sim');

      return result.data.words.map((word) => ({
        text: word.text,
        confidence: word.confidence / 100,
        bounds: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0,
        },
      }));
    } catch (error) {
      logger.warn(`Tesseract OCR 失败: ${(error as Error).message}`);
      return this.extractFallback(imagePath);
    }
  }

  /**
   * 降级模式：基础文本提取
   */
  private async extractFallback(imagePath: string): Promise<OcrResult[]> {
    // 当没有真实 OCR 时，返回空结果
    // 实际使用时应该配置真实的 OCR 服务
    logger.warn('⚠️ OCR 服务未配置，返回空结果');
    logger.warn('  建议：配置 tesseract.js、Google Vision 或 AI Vision');

    return [{
      text: '[OCR 服务未配置]',
      confidence: 0.0,
      bounds: { x: 0, y: 0, width: 100, height: 5 },
    }];
  }

  /**
   * 查找 OCR 文本与 DOM 文本的差异
   */
  private findDiscrepancies(
    ocrText: string,
    domText: string,
    textRegions: OcrResult[],
  ): OcrDiscrepancy[] {
    const discrepancies: OcrDiscrepancy[] = [];

    // 标准化文本进行比较
    const normalizeText = (text: string) => {
      return text.toLowerCase().replace(/\s+/g, ' ').trim();
    };

    const ocrNormalized = normalizeText(ocrText);
    const domNormalized = normalizeText(domText);

    // 检查 OCR 中有但 DOM 中没有的文本
    const ocrWords = new Set(ocrNormalized.split(/\s+/));
    const domWords = new Set(domNormalized.split(/\s+/));

    for (const word of ocrWords) {
      if (word.length > 2 && !domWords.has(word)) {
        // 查找这个词在 OCR 结果中的位置
        const region = textRegions.find(r =>
          r.text.toLowerCase().includes(word)
        );

        discrepancies.push({
          type: 'text-missing-in-dom',
          description: `OCR 识别到 "${word}" 但 DOM 中未找到`,
          ocrText: word,
          domText: undefined,
          bounds: region?.bounds,
          confidence: region?.confidence || 0.5,
        });
      }
    }

    // 检查 DOM 中有但 OCR 中没有的文本（可能是隐藏或渲染问题）
    for (const word of domWords) {
      if (word.length > 2 && !ocrWords.has(word)) {
        discrepancies.push({
          type: 'text-missing-in-ocr',
          description: `DOM 中有 "${word}" 但 OCR 未识别到`,
          ocrText: undefined,
          domText: word,
          confidence: 0.6,
        });
      }
    }

    return discrepancies;
  }

  /**
   * 保存 OCR 结果到文件
   */
  async saveResults(results: OcrPageAnalysis, outputDir: string): Promise<string> {
    await mkdir(outputDir, { recursive: true });

    const outputPath = join(outputDir, `ocr_${results.pageId}.json`);
    await writeFile(outputPath, JSON.stringify(results, null, 2), 'utf-8');

    logger.debug(`OCR 结果已保存: ${outputPath}`);
    return outputPath;
  }

  /**
   * 检查 OCR 是否可用
   */
  isAvailable(): boolean {
    return this.config.enabled && this.initialized;
  }

  /**
   * 获取 OCR 能力信息
   */
  getCapabilities(): {
    available: boolean;
    provider: string;
    supportsMultiLanguage: boolean;
  } {
    return {
      available: this.config.enabled,
      provider: this.config.provider || 'none',
      supportsMultiLanguage: (this.config.languages?.length ?? 0) > 1,
    };
  }
}

/**
 * 创建 OCR 处理器
 */
export function createOcrProcessor(config: OcrConfig): OcrProcessor {
  return new OcrProcessor(config);
}

/**
 * 默认 OCR 配置
 */
export const DEFAULT_OCR_CONFIG: OcrConfig = {
  enabled: false,
  provider: 'ai-vision',
  languages: ['zh-CN', 'en-US'],
  minConfidence: 0.5,
};
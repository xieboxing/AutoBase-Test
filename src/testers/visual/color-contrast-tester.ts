import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * 颜色对比度检查结果
 */
export interface ColorContrastResult {
  url: string;
  passed: boolean;
  elements: ContrastCheckElement[];
  issues: ContrastIssue[];
  executionTime: number;
}

/**
 * 对比度检查元素
 */
export interface ContrastCheckElement {
  selector: string;
  tagName: string;
  text?: string;
  foregroundColor: string;
  backgroundColor: string;
  contrastRatio: number;
  isLargeText: boolean;
  requiredRatio: number;
  passes: boolean;
}

/**
 * 对比度问题
 */
export interface ContrastIssue {
  selector: string;
  text?: string;
  foregroundColor: string;
  backgroundColor: string;
  contrastRatio: number;
  requiredRatio: number;
  severity: 'critical' | 'serious' | 'moderate';
  description: string;
  recommendation: string;
}

/**
 * 颜色对比度测试器配置
 */
export interface ColorContrastTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  artifactsDir: string;
  wcagLevel: 'AA' | 'AAA';
  checkLargeText: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_COLOR_CONTRAST_CONFIG: ColorContrastTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  artifactsDir: './data/screenshots/a11y',
  wcagLevel: 'AA',
  checkLargeText: true,
};

/**
 * 颜色对比度测试器
 * 检查文字与背景的对比度是否符合 WCAG 标准
 */
export class ColorContrastTester {
  private config: ColorContrastTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private testId: string;

  constructor(config: Partial<ColorContrastTesterConfig> = {}) {
    this.config = { ...DEFAULT_COLOR_CONTRAST_CONFIG, ...config };
    this.testId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    logger.pass('✅ 颜色对比度测试器初始化完成');
  }

  /**
   * 检查页面颜色对比度
   */
  async checkContrast(url: string): Promise<ColorContrastResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = Date.now();
    logger.step(`🎨 检查颜色对比度: ${url}`);

    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
    } catch (error) {
      logger.fail(`  ❌ 无法访问页面: ${error}`);
      return {
        url,
        passed: false,
        elements: [],
        issues: [],
        executionTime: Date.now() - startTime,
      };
    }

    // 获取所有文本元素的对比度
    const elements = await this.getContrastElements();

    // 分析对比度问题
    const issues: ContrastIssue[] = [];

    for (const element of elements) {
      if (!element.passes) {
        const severity = element.contrastRatio < 3
          ? 'critical'
          : element.contrastRatio < 4.5
            ? 'serious'
            : 'moderate';

        issues.push({
          selector: element.selector,
          text: element.text,
          foregroundColor: element.foregroundColor,
          backgroundColor: element.backgroundColor,
          contrastRatio: element.contrastRatio,
          requiredRatio: element.requiredRatio,
          severity,
          description: `元素 "${element.selector}" 的颜色对比度 ${element.contrastRatio.toFixed(2)}:1 不符合要求（最低 ${element.requiredRatio}:1）`,
          recommendation: `增加前景色与背景色的对比度。当前前景色: ${element.foregroundColor}，背景色: ${element.backgroundColor}`,
        });
      }
    }

    const executionTime = Date.now() - startTime;
    const passed = issues.length === 0;

    if (passed) {
      logger.pass(`  ✅ 颜色对比度检查通过`);
    } else {
      logger.fail(`  ❌ 发现 ${issues.length} 个对比度问题`);
    }

    return {
      url,
      passed,
      elements,
      issues,
      executionTime,
    };
  }

  /**
   * 获取所有需要检查对比度的元素
   */
  private async getContrastElements(): Promise<ContrastCheckElement[]> {
    return await this.page!.evaluate((wcagLevel: 'AA' | 'AAA') => {
      const results: ContrastCheckElement[] = [];

      // 获取所有包含文本的元素
      const textElements = document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, span, a, button, label, li, td, th, div');

      for (const el of Array.from(textElements)) {
        // 跳过隐藏元素
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden') {
          continue;
        }

        // 跳过空文本
        const text = el.textContent?.trim();
        if (!text || text.length === 0) {
          continue;
        }

        // 获取前景色和背景色
        const fgColor = style.color;
        const bgColor = style.backgroundColor;

        // 跳过没有设置颜色的元素
        if (bgColor === 'rgba(0, 0, 0, 0)' || bgColor === 'transparent') {
          continue;
        }

        // 计算对比度
        const fg = parseColor(fgColor);
        const bg = parseColor(bgColor);

        if (!fg || !bg) {
          continue;
        }

        const contrastRatio = calculateContrastRatio(fg, bg);

        // 判断是否是大文本（18pt 或 14pt 加粗）
        const fontSize = parseFloat(style.fontSize);
        const fontWeight = parseInt(style.fontWeight);
        const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);

        // 获取所需对比度
        let requiredRatio: number;
        if (wcagLevel === 'AAA') {
          requiredRatio = isLargeText ? 4.5 : 7;
        } else {
          requiredRatio = isLargeText ? 3 : 4.5;
        }

        // 获取选择器
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.className && typeof el.className === 'string') {
          selector = `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`;
        } else {
          selector = el.tagName.toLowerCase();
        }

        results.push({
          selector,
          tagName: el.tagName.toLowerCase(),
          text: text.substring(0, 50),
          foregroundColor: fgColor,
          backgroundColor: bgColor,
          contrastRatio,
          isLargeText,
          requiredRatio,
          passes: contrastRatio >= requiredRatio,
        });
      }

      // 辅助函数：解析颜色
      function parseColor(color: string): { r: number; g: number; b: number } | null {
        // 处理 rgb/rgba
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
          return {
            r: parseInt(rgbMatch[1]!, 10),
            g: parseInt(rgbMatch[2]!, 10),
            b: parseInt(rgbMatch[3]!, 10),
          };
        }

        // 处理 hex
        const hexMatch = color.match(/#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i);
        if (hexMatch) {
          return {
            r: parseInt(hexMatch[1]!, 16),
            g: parseInt(hexMatch[2]!, 16),
            b: parseInt(hexMatch[3]!, 16),
          };
        }

        return null;
      }

      // 辅助函数：计算相对亮度
      function getRelativeLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs! + 0.7152 * gs! + 0.0722 * bs!;
      }

      // 辅助函数：计算对比度
      function calculateContrastRatio(
        fg: { r: number; g: number; b: number },
        bg: { r: number; g: number; b: number }
      ): number {
        const l1 = getRelativeLuminance(fg.r, fg.g, fg.b);
        const l2 = getRelativeLuminance(bg.r, bg.g, bg.b);
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      return results;
    }, this.config.wcagLevel);
  }

  /**
   * 获取检查摘要
   */
  getSummary(results: ColorContrastResult[]): {
    totalChecked: number;
    passedChecks: number;
    totalElements: number;
    totalIssues: number;
    criticalIssues: number;
    seriousIssues: number;
  } {
    const passedChecks = results.filter(r => r.passed).length;
    const allIssues = results.flatMap(r => r.issues);

    return {
      totalChecked: results.length,
      passedChecks,
      totalElements: results.reduce((sum, r) => sum + r.elements.length, 0),
      totalIssues: allIssues.length,
      criticalIssues: allIssues.filter(i => i.severity === 'critical').length,
      seriousIssues: allIssues.filter(i => i.severity === 'serious').length,
    };
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('🔚 颜色对比度测试器已关闭');
  }
}

/**
 * 快捷检查函数
 */
export async function checkColorContrast(
  url: string,
  config?: Partial<ColorContrastTesterConfig>,
): Promise<ColorContrastResult> {
  const tester = new ColorContrastTester(config);
  try {
    return await tester.checkContrast(url);
  } finally {
    await tester.close();
  }
}
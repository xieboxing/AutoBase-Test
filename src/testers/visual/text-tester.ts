import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';

/**
 * 文字问题类型
 */
export type TextIssueType =
  | 'text-truncation'
  | 'text-overflow'
  | 'empty-text'
  | 'garbled-text'
  | 'missing-label';

/**
 * 文字问题严重程度
 */
export type TextIssueSeverity = 'error' | 'warning' | 'info';

/**
 * 文字问题
 */
export interface TextIssue {
  type: TextIssueType;
  severity: TextIssueSeverity;
  selector: string;
  description: string;
  details: Record<string, unknown>;
  screenshot?: string;
}

/**
 * 文字检查结果
 */
export interface TextTestResult {
  url: string;
  viewport: { width: number; height: number };
  issues: TextIssue[];
  screenshot: string;
  timestamp: string;
}

/**
 * 文字检查配置
 */
export interface TextTesterConfig {
  headless: boolean;
  timeout: number;
  artifactsDir: string;
  viewport: { width: number; height: number };
  checkTruncation: boolean;
  checkOverflow: boolean;
  checkEmptyText: boolean;
  checkGarbledText: boolean;
  checkMissingLabels: boolean;
  minTextLength: number;
  maxTextLength: number;
}

/**
 * 默认配置
 */
const DEFAULT_TEXT_TESTER_CONFIG: TextTesterConfig = {
  headless: true,
  timeout: 30000,
  artifactsDir: './data/screenshots',
  viewport: { width: 1920, height: 1080 },
  checkTruncation: true,
  checkOverflow: true,
  checkEmptyText: true,
  checkGarbledText: true,
  checkMissingLabels: true,
  minTextLength: 0,
  maxTextLength: 1000,
};

/**
 * 文字检查测试器
 * 检测页面文字问题：截断、溢出、空文本、乱码、缺失标签等
 */
export class TextTester {
  private config: TextTesterConfig;
  private browser: Browser | null = null;

  constructor(config: Partial<TextTesterConfig> = {}) {
    this.config = { ...DEFAULT_TEXT_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({ headless: this.config.headless });
    logger.pass('✅ 文字检查测试器初始化完成');
  }

  /**
   * 测试页面文字
   * @param url 页面 URL
   */
  async testText(url: string): Promise<TextTestResult> {
    if (!this.browser) {
      await this.initialize();
    }

    logger.step(`📝 开始文字检查: ${url}`);

    const page = await this.browser!.newPage({
      viewport: this.config.viewport,
    });
    page.setDefaultTimeout(this.config.timeout);

    const issues: TextIssue[] = [];
    const runId = nanoid(8);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      // 执行各类检查
      if (this.config.checkTruncation) {
        issues.push(...await this.checkTextTruncation(page));
      }

      if (this.config.checkOverflow) {
        issues.push(...await this.checkTextOverflow(page));
      }

      if (this.config.checkEmptyText) {
        issues.push(...await this.checkEmptyText(page));
      }

      if (this.config.checkGarbledText) {
        issues.push(...await this.checkGarbledText(page));
      }

      if (this.config.checkMissingLabels) {
        issues.push(...await this.checkMissingLabels(page));
      }

      // 截图
      const screenshot = await this.takeScreenshot(page, runId);

      // 汇总结果
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;

      if (errorCount > 0) {
        logger.fail(`❌ 发现 ${errorCount} 个文字错误`);
      }
      if (warningCount > 0) {
        logger.warn(`⚠️ 发现 ${warningCount} 个文字警告`);
      }
      if (issues.length === 0) {
        logger.pass(`✅ 文字检查通过，无问题`);
      }

      return {
        url,
        viewport: this.config.viewport,
        issues,
        screenshot,
        timestamp: new Date().toISOString(),
      };
    } finally {
      await page.close();
    }
  }

  /**
   * 批量测试多个页面
   */
  async testTextBatch(urls: string[]): Promise<TextTestResult[]> {
    const results: TextTestResult[] = [];

    logger.step(`📝 开始批量文字检查: ${urls.length} 个页面`);

    for (const url of urls) {
      const result = await this.testText(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 检测文字截断
   */
  private async checkTextTruncation(page: Page): Promise<TextIssue[]> {
    const issues: TextIssue[] = [];

    const truncatedElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        text: string;
        isTruncated: boolean;
        elementWidth: number;
        contentWidth: number;
      }> = [];

      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);

        // 检查是否有截断样式
        if (
          style.textOverflow === 'ellipsis' ||
          style.textOverflow === 'clip' ||
          style.overflow === 'hidden'
        ) {
          // 检查是否真的被截断
          if (el.scrollWidth > el.clientWidth + 5) {
            const selector = el.id
              ? `#${el.id}`
              : el.className && typeof el.className === 'string'
                ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
                : el.tagName.toLowerCase();

            const text = el.textContent?.trim() || '';
            const displayText = text.length > 50 ? text.slice(0, 50) + '...' : text;

            results.push({
              selector,
              text: displayText,
              isTruncated: true,
              elementWidth: Math.round(el.clientWidth),
              contentWidth: Math.round(el.scrollWidth),
            });
          }
        }
      });

      return results.slice(0, 20);
    });

    for (const el of truncatedElements) {
      issues.push({
        type: 'text-truncation',
        severity: 'warning',
        selector: el.selector,
        description: `文字被截断: "${el.text}" (${el.contentWidth}px 内容在 ${el.elementWidth}px 容器中)`,
        details: {
          text: el.text,
          elementWidth: el.elementWidth,
          contentWidth: el.contentWidth,
        },
      });
    }

    return issues;
  }

  /**
   * 检测文字溢出
   */
  private async checkTextOverflow(page: Page): Promise<TextIssue[]> {
    const issues: TextIssue[] = [];

    const overflowElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        text: string;
        elementWidth: number;
        overflowX: number;
        elementHeight: number;
        overflowY: number;
      }> = [];

      document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label').forEach(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // 检查文字是否溢出（没有截断处理的情况下）
        if (
          style.overflowX === 'visible' &&
          style.overflowY === 'visible' &&
          style.textOverflow === 'clip'
        ) {
          // 检查是否超出父容器
          const parent = el.parentElement;
          if (parent) {
            const parentRect = parent.getBoundingClientRect();
            const parentStyle = window.getComputedStyle(parent);

            // 水平溢出
            if (
              rect.right > parentRect.right + 10 &&
              parentStyle.overflowX !== 'hidden'
            ) {
              const selector = el.id
                ? `#${el.id}`
                : el.className && typeof el.className === 'string'
                  ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
                  : el.tagName.toLowerCase();

              const text = el.textContent?.trim() || '';
              const displayText = text.length > 50 ? text.slice(0, 50) + '...' : text;

              results.push({
                selector,
                text: displayText,
                elementWidth: Math.round(rect.width),
                overflowX: Math.round(rect.right - parentRect.right),
                elementHeight: Math.round(rect.height),
                overflowY: 0,
              });
            }
          }
        }
      });

      return results.slice(0, 15);
    });

    for (const el of overflowElements) {
      issues.push({
        type: 'text-overflow',
        severity: 'error',
        selector: el.selector,
        description: `文字溢出容器: "${el.text}" 溢出 ${el.overflowX}px`,
        details: {
          text: el.text,
          elementWidth: el.elementWidth,
          actualLength: el.overflowX,
        },
      });
    }

    return issues;
  }

  /**
   * 检测空文本
   */
  private async checkEmptyText(page: Page): Promise<TextIssue[]> {
    const issues: TextIssue[] = [];

    const emptyElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        elementType: string;
        hasAriaLabel: boolean;
        hasTitle: boolean;
        hasPlaceholder: boolean;
      }> = [];

      // 检查应该有文字的元素
      const shouldHaveTextSelectors = [
        'button:not([type="submit"])',
        'a:not([href^="#"])',
        'label',
        'h1, h2, h3, h4, h5, h6',
        '[role="button"]',
      ];

      const selector = shouldHaveTextSelectors.join(', ');

      document.querySelectorAll(selector).forEach(el => {
        const text = el.textContent?.trim() || '';
        const hasVisibleText = text.length > 0;

        // 检查是否有替代文字方式
        const hasAriaLabel = el.hasAttribute('aria-label') &&
          el.getAttribute('aria-label')?.trim() !== '';
        const hasTitle = el.hasAttribute('title') &&
          el.getAttribute('title')?.trim() !== '';
        const hasPlaceholder = el.hasAttribute('placeholder') &&
          el.getAttribute('placeholder')?.trim() !== '';
        const hasAlt = el.tagName === 'IMG' &&
          el.hasAttribute('alt') &&
          el.getAttribute('alt')?.trim() !== '';

        if (!hasVisibleText && !hasAriaLabel && !hasTitle && !hasPlaceholder && !hasAlt) {
          const elSelector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector: elSelector,
            elementType: el.tagName.toLowerCase(),
            hasAriaLabel,
            hasTitle,
            hasPlaceholder,
          });
        }
      });

      return results.slice(0, 20);
    });

    for (const el of emptyElements) {
      issues.push({
        type: 'empty-text',
        severity: 'warning',
        selector: el.selector,
        description: `元素缺少文字内容: ${el.selector} (${el.elementType})`,
        details: {
          elementType: el.elementType,
          hasAriaLabel: el.hasAriaLabel,
          hasTitle: el.hasTitle,
          hasPlaceholder: el.hasPlaceholder,
        },
      });
    }

    return issues;
  }

  /**
   * 检测乱码或异常字符
   */
  private async checkGarbledText(page: Page): Promise<TextIssue[]> {
    const issues: TextIssue[] = [];

    const garbledElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        text: string;
        issueType: string;
      }> = [];

      // 可能的乱码模式
      const garbledPatterns = [
        /[\u0000-\u001F]/, // 控制字符
        /[\uFFFD]/,        // 替换字符（Unicode 解码失败）
        /\uFFFD/,          // 黑色问号方块（替换字符）
        /[Ã©Ã¨ÃªÃ«Ã¡Ã³ÃºÃ±]/, // UTF-8 错误解码特征
        /[â€œâ€˜â€™â€"]/,   // 引号解码错误
        /\ufffd{2,}/,      // 多个替换字符
      ];

      document.querySelectorAll('p, span, div, h1, h2, h3, h4, h5, h6, a, button, label, td, th').forEach(el => {
        const text = el.textContent || '';

        for (const pattern of garbledPatterns) {
          if (pattern.test(text)) {
            const selector = el.id
              ? `#${el.id}`
              : el.className && typeof el.className === 'string'
                ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
                : el.tagName.toLowerCase();

            const displayText = text.length > 100 ? text.slice(0, 100) + '...' : text;

            results.push({
              selector,
              text: displayText,
              issueType: 'encoding-error',
            });
            break;
          }
        }

        // 检查是否有过多的重复字符（可能是渲染问题）
        if (/(.{1})\1{10,}/.test(text)) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector,
            text: text.slice(0, 50),
            issueType: 'repeated-characters',
          });
        }
      });

      return results.slice(0, 15);
    });

    for (const el of garbledElements) {
      issues.push({
        type: 'garbled-text',
        severity: 'error',
        selector: el.selector,
        description: `检测到可能的乱码: "${el.text}" (${el.issueType})`,
        details: {
          text: el.text,
          maxLength: 100,
        },
      });
    }

    return issues;
  }

  /**
   * 检测缺失的无障碍标签
   */
  private async checkMissingLabels(page: Page): Promise<TextIssue[]> {
    const issues: TextIssue[] = [];

    const missingLabelElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        elementType: string;
        inputId: string | null;
        hasAssociatedLabel: boolean;
        hasAriaLabel: boolean;
      }> = [];

      // 检查输入元素是否有标签
      document.querySelectorAll('input, select, textarea').forEach(el => {
        const inputId = el.getAttribute('id');
        let hasAssociatedLabel = false;

        // 检查是否有关联的 label 元素
        if (inputId) {
          const label = document.querySelector(`label[for="${inputId}"]`);
          hasAssociatedLabel = !!label;
        }

        // 检查是否被 label 包裹
        const parentLabel = el.closest('label');
        if (parentLabel && parentLabel.textContent?.trim()?.length > 0) {
          hasAssociatedLabel = true;
        }

        // 检查是否有 aria-label
        const hasAriaLabel = el.hasAttribute('aria-label') &&
          el.getAttribute('aria-label')?.trim() !== '';

        // 检查是否有 aria-labelledby
        const hasAriaLabelledby = el.hasAttribute('aria-labelledby') &&
          !!document.getElementById(el.getAttribute('aria-labelledby') || '');

        // 检查是否有 placeholder（不推荐作为唯一标签）
        const hasPlaceholder = el.hasAttribute('placeholder');

        // 检查是否是隐藏或特殊类型输入
        const type = el.getAttribute('type');
        const isHidden = type === 'hidden' ||
          window.getComputedStyle(el).display === 'none' ||
          window.getComputedStyle(el).visibility === 'hidden';

        if (
          !isHidden &&
          !hasAssociatedLabel &&
          !hasAriaLabel &&
          !hasAriaLabelledby &&
          !hasPlaceholder
        ) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector,
            elementType: el.tagName.toLowerCase(),
            inputId,
            hasAssociatedLabel,
            hasAriaLabel,
          });
        }
      });

      // 检查按钮是否有可访问名称
      document.querySelectorAll('button').forEach(el => {
        const text = el.textContent?.trim() || '';
        const hasAriaLabel = el.hasAttribute('aria-label') &&
          el.getAttribute('aria-label')?.trim() !== '';
        const hasTitle = el.hasAttribute('title') &&
          el.getAttribute('title')?.trim() !== '';

        if (!text && !hasAriaLabel && !hasTitle) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector,
            elementType: 'button',
            inputId: null,
            hasAssociatedLabel: false,
            hasAriaLabel,
          });
        }
      });

      return results.slice(0, 20);
    });

    for (const el of missingLabelElements) {
      issues.push({
        type: 'missing-label',
        severity: el.elementType === 'button' ? 'warning' : 'error',
        selector: el.selector,
        description: `元素缺少无障碍标签: ${el.selector} (${el.elementType})`,
        details: {
          elementType: el.elementType,
          hasAssociatedLabel: el.hasAssociatedLabel,
          hasAriaLabel: el.hasAriaLabel,
        },
      });
    }

    return issues;
  }

  /**
   * 截图
   */
  private async takeScreenshot(page: Page, runId: string): Promise<string> {
    const filename = `text_${runId}.png`;
    const filepath = path.join(this.config.artifactsDir, filename);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('🔚 文字检查测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testText(
  url: string,
  config?: Partial<TextTesterConfig>,
): Promise<TextTestResult> {
  const tester = new TextTester(config);
  try {
    return await tester.testText(url);
  } finally {
    await tester.close();
  }
}
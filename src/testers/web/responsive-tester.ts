import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';

/**
 * 视口配置
 */
export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
  deviceScaleFactor?: number;
}

/**
 * 响应式测试结果
 */
export interface ResponsiveTestResult {
  viewport: ViewportConfig;
  screenshot: string;
  issues: ResponsiveIssue[];
}

/**
 * 响应式问题
 */
export interface ResponsiveIssue {
  type: 'horizontal-overflow' | 'element-overlap' | 'text-truncation' | 'image-distortion' | 'small-touch-target';
  severity: 'error' | 'warning' | 'info';
  selector: string;
  description: string;
  details?: Record<string, unknown>;
}

/**
 * 响应式测试器配置
 */
export interface ResponsiveTesterConfig {
  viewports: ViewportConfig[];
  headless: boolean;
  timeout: number;
  artifactsDir: string;
  minTouchTargetSize: number;
}

/**
 * 默认视口列表
 */
const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  { name: 'mobile-s', width: 320, height: 568 },
  { name: 'mobile-m', width: 375, height: 667 },
  { name: 'mobile-l', width: 414, height: 896 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1024, height: 768 },
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'desktop-l', width: 1920, height: 1080 },
];

/**
 * 默认配置
 */
const DEFAULT_RESPONSIVE_TESTER_CONFIG: ResponsiveTesterConfig = {
  viewports: DEFAULT_VIEWPORTS,
  headless: true,
  timeout: 30000,
  artifactsDir: './data/screenshots',
  minTouchTargetSize: 44,
};

/**
 * 响应式测试器
 */
export class ResponsiveTester {
  private config: ResponsiveTesterConfig;
  private browser: Browser | null = null;

  constructor(config: Partial<ResponsiveTesterConfig> = {}) {
    this.config = { ...DEFAULT_RESPONSIVE_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({ headless: this.config.headless });
    logger.pass('✅ 响应式测试器初始化完成');
  }

  /**
   * 测试 URL 在所有视口下的响应式表现
   */
  async testUrl(url: string): Promise<ResponsiveTestResult[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const results: ResponsiveTestResult[] = [];
    const runId = nanoid(8);

    logger.step(`📐 开始响应式测试: ${url}`);

    for (const viewport of this.config.viewports) {
      logger.step(`  📱 测试视口: ${viewport.name} (${viewport.width}x${viewport.height})`);

      const result = await this.testViewport(url, viewport, runId);
      results.push(result);

      if (result.issues.length > 0) {
        logger.warn(`    ⚠️ 发现 ${result.issues.length} 个问题`);
      } else {
        logger.pass(`    ✅ 无问题`);
      }
    }

    return results;
  }

  /**
   * 测试单个视口
   */
  private async testViewport(
    url: string,
    viewport: ViewportConfig,
    runId: string,
  ): Promise<ResponsiveTestResult> {
    if (!this.browser) {
      throw new Error('Browser not initialized');
    }

    const context = await this.browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.deviceScaleFactor || 1,
    });

    const page = await context.newPage();
    page.setDefaultTimeout(this.config.timeout);

    const issues: ResponsiveIssue[] = [];

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });

      // 等待页面稳定
      await page.waitForLoadState('networkidle').catch(() => {});

      // 检测问题
      issues.push(...await this.detectHorizontalOverflow(page, viewport));
      issues.push(...await this.detectElementOverlap(page));
      issues.push(...await this.detectTextTruncation(page));
      issues.push(...await this.detectImageDistortion(page));

      // 只在移动端视口检测触摸目标
      if (viewport.width < 768) {
        issues.push(...await this.detectSmallTouchTargets(page));
      }

      // 截图
      const screenshot = await this.takeScreenshot(page, viewport.name, runId);

      return {
        viewport,
        screenshot,
        issues,
      };
    } finally {
      await page.close();
      await context.close();
    }
  }

  /**
   * 检测横向溢出
   */
  private async detectHorizontalOverflow(page: Page, viewport: ViewportConfig): Promise<ResponsiveIssue[]> {
    const issues: ResponsiveIssue[] = [];

    const hasOverflow = await page.evaluate(() => {
      return document.body.scrollWidth > window.innerWidth;
    });

    if (hasOverflow) {
      // 找出溢出的元素
      const overflowElements = await page.evaluate(() => {
        const elements: Array<{ selector: string; width: number; viewportWidth: number }> = [];
        const viewportWidth = window.innerWidth;

        document.querySelectorAll('*').forEach(el => {
          const rect = el.getBoundingClientRect();
          if (rect.right > viewportWidth + 10 || rect.width > viewportWidth + 10) {
            const selector = el.id
              ? `#${el.id}`
              : el.className && typeof el.className === 'string'
                ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
                : el.tagName.toLowerCase();
            elements.push({
              selector,
              width: rect.width,
              viewportWidth,
            });
          }
        });

        return elements.slice(0, 10);
      });

      issues.push({
        type: 'horizontal-overflow',
        severity: 'error',
        selector: 'body',
        description: `页面存在横向滚动条，内容超出视口宽度 ${viewport.width}px`,
        details: { overflowElements },
      });
    }

    return issues;
  }

  /**
   * 检测元素重叠
   */
  private async detectElementOverlap(page: Page): Promise<ResponsiveIssue[]> {
    const issues: ResponsiveIssue[] = [];

    const overlaps = await page.evaluate(() => {
      const overlapElements: Array<{ selector1: string; selector2: string }> = [];
      const interactiveElements = Array.from(document.querySelectorAll('a, button, input, select, textarea, [role="button"]'));

      for (let i = 0; i < interactiveElements.length; i++) {
        for (let j = i + 1; j < interactiveElements.length; j++) {
          const el1 = interactiveElements[i] as HTMLElement;
          const el2 = interactiveElements[j] as HTMLElement;
          const rect1 = el1.getBoundingClientRect();
          const rect2 = el2.getBoundingClientRect();

          // 检测是否重叠
          if (
            rect1.left < rect2.right &&
            rect1.right > rect2.left &&
            rect1.top < rect2.bottom &&
            rect1.bottom > rect2.top
          ) {
            const selector1 = el1.id ? `#${el1.id}` : el1.tagName.toLowerCase();
            const selector2 = el2.id ? `#${el2.id}` : el2.tagName.toLowerCase();
            overlapElements.push({ selector1, selector2 });
          }
        }
      }

      return overlapElements.slice(0, 10);
    });

    for (const overlap of overlaps) {
      issues.push({
        type: 'element-overlap',
        severity: 'warning',
        selector: `${overlap.selector1}, ${overlap.selector2}`,
        description: `元素 ${overlap.selector1} 和 ${overlap.selector2} 重叠`,
      });
    }

    return issues;
  }

  /**
   * 检测文字截断
   */
  private async detectTextTruncation(page: Page): Promise<ResponsiveIssue[]> {
    const issues: ResponsiveIssue[] = [];

    const truncatedElements = await page.evaluate(() => {
      const elements: Array<{ selector: string; text: string }> = [];

      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.textOverflow === 'ellipsis' || style.textOverflow === 'clip') {
          // 检查是否真的被截断
          if (el.scrollWidth > el.clientWidth) {
            const selector = el.id
              ? `#${el.id}`
              : el.className && typeof el.className === 'string'
                ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
                : el.tagName.toLowerCase();
            elements.push({
              selector,
              text: el.textContent?.slice(0, 50) || '',
            });
          }
        }
      });

      return elements.slice(0, 10);
    });

    for (const el of truncatedElements) {
      issues.push({
        type: 'text-truncation',
        severity: 'info',
        selector: el.selector,
        description: `文字被截断: "${el.text}..."`,
      });
    }

    return issues;
  }

  /**
   * 检测图片变形
   */
  private async detectImageDistortion(page: Page): Promise<ResponsiveIssue[]> {
    const issues: ResponsiveIssue[] = [];

    const distortedImages = await page.evaluate(() => {
      const images: Array<{ selector: string; naturalRatio: number; displayRatio: number }> = [];

      document.querySelectorAll('img').forEach(img => {
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          const naturalRatio = img.naturalWidth / img.naturalHeight;
          const displayRatio = img.clientWidth / img.clientHeight;
          const ratioDiff = Math.abs(naturalRatio - displayRatio);

          if (ratioDiff > 0.1 && img.clientWidth > 50 && img.clientHeight > 50) {
            const selector = img.id
              ? `#${img.id}`
              : img.className
                ? `img.${img.className.split(' ')[0]}`
                : 'img';
            images.push({
              selector,
              naturalRatio: Math.round(naturalRatio * 100) / 100,
              displayRatio: Math.round(displayRatio * 100) / 100,
            });
          }
        }
      });

      return images.slice(0, 10);
    });

    for (const img of distortedImages) {
      issues.push({
        type: 'image-distortion',
        severity: 'warning',
        selector: img.selector,
        description: `图片可能变形: 原始比例 ${img.naturalRatio}, 显示比例 ${img.displayRatio}`,
      });
    }

    return issues;
  }

  /**
   * 检测触摸目标过小
   */
  private async detectSmallTouchTargets(page: Page): Promise<ResponsiveIssue[]> {
    const issues: ResponsiveIssue[] = [];
    const minSize = this.config.minTouchTargetSize;

    const smallTargets = await page.evaluate((min) => {
      const targets: Array<{ selector: string; width: number; height: number }> = [];

      document.querySelectorAll('a, button, input, select, textarea, [role="button"]').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.width < min || rect.height < min) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();
          targets.push({
            selector,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      });

      return targets.slice(0, 20);
    }, minSize);

    for (const target of smallTargets) {
      issues.push({
        type: 'small-touch-target',
        severity: 'warning',
        selector: target.selector,
        description: `触摸目标过小: ${target.width}x${target.height}px，建议至少 ${minSize}x${minSize}px`,
      });
    }

    return issues;
  }

  /**
   * 截图
   */
  private async takeScreenshot(page: Page, viewportName: string, runId: string): Promise<string> {
    const filename = `responsive_${runId}_${viewportName}.png`;
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
    logger.info('🔚 响应式测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testResponsive(
  url: string,
  viewports?: ViewportConfig[],
): Promise<ResponsiveTestResult[]> {
  const tester = new ResponsiveTester({ viewports });
  try {
    return await tester.testUrl(url);
  } finally {
    await tester.close();
  }
}
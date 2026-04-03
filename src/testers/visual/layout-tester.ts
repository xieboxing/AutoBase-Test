import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import { nanoid } from 'nanoid';

/**
 * 布局问题类型
 */
export type LayoutIssueType =
  | 'element-overflow'
  | 'element-overlap'
  | 'spacing-issue'
  | 'z-index-issue'
  | 'alignment-issue'
  | 'hidden-interactive';

/**
 * 布局问题严重程度
 */
export type LayoutIssueSeverity = 'error' | 'warning' | 'info';

/**
 * 布局问题
 */
export interface LayoutIssue {
  type: LayoutIssueType;
  severity: LayoutIssueSeverity;
  selector: string;
  description: string;
  details: Record<string, unknown>;
  screenshot?: string;
}

/**
 * 布局检查结果
 */
export interface LayoutTestResult {
  url: string;
  viewport: { width: number; height: number };
  issues: LayoutIssue[];
  screenshot: string;
  timestamp: string;
}

/**
 * 布局检查配置
 */
export interface LayoutTesterConfig {
  headless: boolean;
  timeout: number;
  artifactsDir: string;
  viewport: { width: number; height: number };
  checkOverflow: boolean;
  checkOverlap: boolean;
  checkSpacing: boolean;
  checkZIndex: boolean;
  checkAlignment: boolean;
  minSpacing: number;
  minInteractiveSize: number;
}

/**
 * 默认配置
 */
const DEFAULT_LAYOUT_TESTER_CONFIG: LayoutTesterConfig = {
  headless: true,
  timeout: 30000,
  artifactsDir: './data/screenshots',
  viewport: { width: 1920, height: 1080 },
  checkOverflow: true,
  checkOverlap: true,
  checkSpacing: true,
  checkZIndex: true,
  checkAlignment: true,
  minSpacing: 4,
  minInteractiveSize: 44,
};

/**
 * 布局检查测试器
 * 检测页面布局问题：元素溢出、重叠、间距异常、z-index 问题等
 */
export class LayoutTester {
  private config: LayoutTesterConfig;
  private browser: Browser | null = null;

  constructor(config: Partial<LayoutTesterConfig> = {}) {
    this.config = { ...DEFAULT_LAYOUT_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({ headless: this.config.headless });
    logger.pass('✅ 布局检查测试器初始化完成');
  }

  /**
   * 测试页面布局
   * @param url 页面 URL
   */
  async testLayout(url: string): Promise<LayoutTestResult> {
    if (!this.browser) {
      await this.initialize();
    }

    logger.step(`📐 开始布局检查: ${url}`);

    const page = await this.browser!.newPage({
      viewport: this.config.viewport,
    });
    page.setDefaultTimeout(this.config.timeout);

    const issues: LayoutIssue[] = [];
    const runId = nanoid(8);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.waitForLoadState('networkidle').catch(() => {});

      // 执行各类检查
      if (this.config.checkOverflow) {
        issues.push(...await this.checkElementOverflow(page));
      }

      if (this.config.checkOverlap) {
        issues.push(...await this.checkElementOverlap(page));
      }

      if (this.config.checkSpacing) {
        issues.push(...await this.checkSpacingIssues(page));
      }

      if (this.config.checkZIndex) {
        issues.push(...await this.checkZIndexIssues(page));
      }

      if (this.config.checkAlignment) {
        issues.push(...await this.checkAlignmentIssues(page));
      }

      // 截图
      const screenshot = await this.takeScreenshot(page, runId);

      // 汇总结果
      const errorCount = issues.filter(i => i.severity === 'error').length;
      const warningCount = issues.filter(i => i.severity === 'warning').length;

      if (errorCount > 0) {
        logger.fail(`❌ 发现 ${errorCount} 个布局错误`);
      }
      if (warningCount > 0) {
        logger.warn(`⚠️ 发现 ${warningCount} 个布局警告`);
      }
      if (issues.length === 0) {
        logger.pass(`✅ 布局检查通过，无问题`);
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
  async testLayoutBatch(urls: string[]): Promise<LayoutTestResult[]> {
    const results: LayoutTestResult[] = [];

    logger.step(`📐 开始批量布局检查: ${urls.length} 个页面`);

    for (const url of urls) {
      const result = await this.testLayout(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 检测元素溢出容器
   */
  private async checkElementOverflow(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];

    const overflowElements = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        elementWidth: number;
        containerWidth: number;
        elementHeight: number;
        containerHeight: number;
        overflowType: string;
      }> = [];

      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();

        // 获取父容器
        const parent = el.parentElement;
        if (!parent) return;

        const parentRect = parent.getBoundingClientRect();
        const parentStyle = window.getComputedStyle(parent);

        // 检查水平溢出
        if (
          rect.right > parentRect.right + 5 &&
          parentStyle.overflowX !== 'visible'
        ) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector,
            elementWidth: Math.round(rect.width),
            containerWidth: Math.round(parentRect.width),
            elementHeight: Math.round(rect.height),
            containerHeight: Math.round(parentRect.height),
            overflowType: 'horizontal',
          });
        }

        // 检查垂直溢出
        if (
          rect.bottom > parentRect.bottom + 5 &&
          parentStyle.overflowY !== 'visible'
        ) {
          const selector = el.id
            ? `#${el.id}`
            : el.className && typeof el.className === 'string'
              ? `${el.tagName.toLowerCase()}.${el.className.split(' ')[0]}`
              : el.tagName.toLowerCase();

          results.push({
            selector,
            elementWidth: Math.round(rect.width),
            containerWidth: Math.round(parentRect.width),
            elementHeight: Math.round(rect.height),
            containerHeight: Math.round(parentRect.height),
            overflowType: 'vertical',
          });
        }
      });

      return results.slice(0, 20);
    });

    for (const el of overflowElements) {
      issues.push({
        type: 'element-overflow',
        severity: 'error',
        selector: el.selector,
        description: `元素溢出容器 (${el.overflowType}): 元素 ${el.elementWidth}x${el.elementHeight}, 容器 ${el.containerWidth}x${el.containerHeight}`,
        details: el,
      });
    }

    return issues;
  }

  /**
   * 检测元素重叠
   */
  private async checkElementOverlap(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];

    const overlaps = await page.evaluate(() => {
      const results: Array<{
        selector1: string;
        selector2: string;
        overlapArea: number;
        overlapType: string;
      }> = [];

      // 获取所有可见元素
      const visibleElements = Array.from(document.querySelectorAll('*')).filter(
        el => {
          const style = window.getComputedStyle(el);
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0'
          );
        }
      );

      // 检查交互元素之间的重叠
      const interactiveElements = visibleElements.filter(
        el =>
          el.tagName === 'A' ||
          el.tagName === 'BUTTON' ||
          el.tagName === 'INPUT' ||
          el.tagName === 'SELECT' ||
          el.tagName === 'TEXTAREA' ||
          el.getAttribute('role') === 'button'
      );

      for (let i = 0; i < interactiveElements.length; i++) {
        for (let j = i + 1; j < interactiveElements.length; j++) {
          const el1 = interactiveElements[i] as HTMLElement;
          const el2 = interactiveElements[j] as HTMLElement;
          const rect1 = el1.getBoundingClientRect();
          const rect2 = el2.getBoundingClientRect();

          // 计算重叠区域
          const overlapX =
            Math.max(0, Math.min(rect1.right, rect2.right) - Math.max(rect1.left, rect2.left));
          const overlapY =
            Math.max(0, Math.min(rect1.bottom, rect2.bottom) - Math.max(rect1.top, rect2.top));
          const overlapArea = overlapX * overlapY;

          if (overlapArea > 100) {
            // 忽略小面积重叠
            const selector1 = el1.id ? `#${el1.id}` : el1.tagName.toLowerCase();
            const selector2 = el2.id ? `#${el2.id}` : el2.tagName.toLowerCase();

            results.push({
              selector1,
              selector2,
              overlapArea: Math.round(overlapArea),
              overlapType: 'interactive',
            });
          }
        }
      }

      return results.slice(0, 10);
    });

    for (const overlap of overlaps) {
      issues.push({
        type: 'element-overlap',
        severity: 'warning',
        selector: `${overlap.selector1}, ${overlap.selector2}`,
        description: `交互元素重叠: ${overlap.selector1} 和 ${overlap.selector2} 重叠面积 ${overlap.overlapArea}px²`,
        details: overlap,
      });
    }

    return issues;
  }

  /**
   * 检测间距问题
   */
  private async checkSpacingIssues(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];
    const minSpacing = this.config.minSpacing;

    const spacingIssues = await page.evaluate((min) => {
      const results: Array<{
        selector1: string;
        selector2: string;
        spacing: number;
        spacingType: string;
      }> = [];

      // 获取相邻元素
      const elements = Array.from(document.querySelectorAll('*')).filter(
        el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        }
      );

      // 检查兄弟元素间距
      for (const el of elements) {
        const parent = el.parentElement;
        if (!parent) continue;

        const siblings = Array.from(parent.children).filter(
          s => s !== el && window.getComputedStyle(s).display !== 'none'
        );

        for (const sibling of siblings) {
          const rect1 = el.getBoundingClientRect();
          const rect2 = (sibling as HTMLElement).getBoundingClientRect();

          // 检查水平间距（相邻且同一行）
          if (
            Math.abs(rect1.top - rect2.top) < 10 &&
            rect1.right < rect2.left &&
            rect2.left - rect1.right < min
          ) {
            const selector1 = el.id ? `#${el.id}` : el.tagName.toLowerCase();
            const selector2 = sibling.id ? `#${sibling.id}` : sibling.tagName.toLowerCase();

            results.push({
              selector1,
              selector2,
              spacing: Math.round(rect2.left - rect1.right),
              spacingType: 'horizontal',
            });
          }

          // 检查垂直间距（相邻且同一列）
          if (
            Math.abs(rect1.left - rect2.left) < 10 &&
            rect1.bottom < rect2.top &&
            rect2.top - rect1.bottom < min
          ) {
            const selector1 = el.id ? `#${el.id}` : el.tagName.toLowerCase();
            const selector2 = sibling.id ? `#${sibling.id}` : sibling.tagName.toLowerCase();

            results.push({
              selector1,
              selector2,
              spacing: Math.round(rect2.top - rect1.bottom),
              spacingType: 'vertical',
            });
          }
        }
      }

      return results.slice(0, 15);
    }, minSpacing);

    for (const issue of spacingIssues) {
      issues.push({
        type: 'spacing-issue',
        severity: 'info',
        selector: `${issue.selector1}, ${issue.selector2}`,
        description: `间距过小 (${issue.spacingType}): ${issue.selector1} 和 ${issue.selector2} 间距仅 ${issue.spacing}px`,
        details: issue,
      });
    }

    return issues;
  }

  /**
   * 检测 z-index 问题
   */
  private async checkZIndexIssues(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];

    const zIndexIssues = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        zIndex: number;
        hiddenBy: string;
        hiddenByZIndex: number;
      }> = [];

      // 获取所有交互元素
      const interactiveElements = Array.from(
        document.querySelectorAll('a, button, input, select, textarea, [role="button"]')
      );

      for (const el of interactiveElements) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const elZIndex = parseInt(style.zIndex) || 0;

        // 检查是否有更高 z-index 的元素遮挡
        const coveringElements = Array.from(document.querySelectorAll('*')).filter(
          potentialCover => {
            if (potentialCover === el) return false;
            const coverStyle = window.getComputedStyle(potentialCover);
            if (coverStyle.display === 'none' || coverStyle.visibility === 'hidden')
              return false;

            const coverZIndex = parseInt(coverStyle.zIndex) || 0;
            if (coverZIndex <= elZIndex) return false;

            const coverRect = potentialCover.getBoundingClientRect();
            return (
              coverRect.left < rect.right &&
              coverRect.right > rect.left &&
              coverRect.top < rect.bottom &&
              coverRect.bottom > rect.top
            );
          }
        );

        for (const cover of coveringElements) {
          const coverZIndex = parseInt(window.getComputedStyle(cover).zIndex) || 0;
          const selector = el.id ? `#${el.id}` : el.tagName.toLowerCase();
          const coverSelector = cover.id
            ? `#${cover.id}`
            : cover.className && typeof cover.className === 'string'
              ? `${cover.tagName.toLowerCase()}.${cover.className.split(' ')[0]}`
              : cover.tagName.toLowerCase();

          results.push({
            selector,
            zIndex: elZIndex,
            hiddenBy: coverSelector,
            hiddenByZIndex: coverZIndex,
          });
        }
      }

      return results.slice(0, 10);
    });

    for (const issue of zIndexIssues) {
      issues.push({
        type: 'z-index-issue',
        severity: 'error',
        selector: issue.selector,
        description: `交互元素被遮挡: ${issue.selector} (z-index: ${issue.zIndex}) 被 ${issue.hiddenBy} (z-index: ${issue.hiddenByZIndex}) 遮挡`,
        details: issue,
      });
    }

    return issues;
  }

  /**
   * 检测对齐问题
   */
  private async checkAlignmentIssues(page: Page): Promise<LayoutIssue[]> {
    const issues: LayoutIssue[] = [];

    const alignmentIssues = await page.evaluate(() => {
      const results: Array<{
        selector: string;
        expectedAlignment: string;
        actualAlignment: number;
        parentSelector: string;
      }> = [];

      // 检查同一容器内的元素是否对齐
      const containers = Array.from(document.querySelectorAll('div, section, article, nav, header, footer'));

      for (const container of containers) {
        const children = Array.from(container.children).filter(
          child => {
            const style = window.getComputedStyle(child);
            return style.display !== 'none' && style.visibility !== 'hidden';
          }
        );

        if (children.length < 2) continue;

        // 检查顶部对齐
        const topValues = children.map(c => (c as HTMLElement).getBoundingClientRect().top);
        const minTop = Math.min(...topValues);
        const maxTop = Math.max(...topValues);

        if (maxTop - minTop > 5 && maxTop - minTop < 50) {
          // 差异超过 5px 但小于 50px（可能是对齐问题）
          for (const child of children) {
            const rect = (child as HTMLElement).getBoundingClientRect();
            if (rect.top !== minTop) {
              const selector = child.id
                ? `#${child.id}`
                : child.className && typeof child.className === 'string'
                  ? `${child.tagName.toLowerCase()}.${child.className.split(' ')[0]}`
                  : child.tagName.toLowerCase();

              results.push({
                selector,
                expectedAlignment: 'top',
                actualAlignment: Math.round(rect.top - minTop),
                parentSelector: container.id
                  ? `#${container.id}`
                  : container.tagName.toLowerCase(),
              });
            }
          }
        }

        // 检查左侧对齐
        const leftValues = children.map(c => (c as HTMLElement).getBoundingClientRect().left);
        const minLeft = Math.min(...leftValues);
        const maxLeft = Math.max(...leftValues);

        if (maxLeft - minLeft > 5 && maxLeft - minLeft < 50) {
          for (const child of children) {
            const rect = (child as HTMLElement).getBoundingClientRect();
            if (rect.left !== minLeft) {
              const selector = child.id
                ? `#${child.id}`
                : child.className && typeof child.className === 'string'
                  ? `${child.tagName.toLowerCase()}.${child.className.split(' ')[0]}`
                  : child.tagName.toLowerCase();

              results.push({
                selector,
                expectedAlignment: 'left',
                actualAlignment: Math.round(rect.left - minLeft),
                parentSelector: container.id
                  ? `#${container.id}`
                  : container.tagName.toLowerCase(),
              });
            }
          }
        }
      }

      return results.slice(0, 10);
    });

    for (const issue of alignmentIssues) {
      issues.push({
        type: 'alignment-issue',
        severity: 'info',
        selector: issue.selector,
        description: `对齐不一致 (${issue.expectedAlignment}): ${issue.selector} 偏移 ${issue.actualAlignment}px (容器: ${issue.parentSelector})`,
        details: issue,
      });
    }

    return issues;
  }

  /**
   * 截图
   */
  private async takeScreenshot(page: Page, runId: string): Promise<string> {
    const filename = `layout_${runId}.png`;
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
    logger.info('🔚 布局检查测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testLayout(
  url: string,
  config?: Partial<LayoutTesterConfig>,
): Promise<LayoutTestResult> {
  const tester = new LayoutTester(config);
  try {
    return await tester.testLayout(url);
  } finally {
    await tester.close();
  }
}
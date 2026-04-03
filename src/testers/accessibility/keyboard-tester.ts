import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';

/**
 * 键盘导航测试结果
 */
export interface KeyboardTestResult {
  url: string;
  passed: boolean;
  issues: KeyboardIssue[];
  focusedElements: FocusedElement[];
  tabOrder: string[];
  hasSkipLinks: boolean;
  hasFocusIndicators: boolean;
  executionTime: number;
}

/**
 * 键盘导航问题
 */
export interface KeyboardIssue {
  type: 'no_focus_indicator' | 'tab_trap' | 'inaccessible_element' | 'incorrect_tab_order' | 'no_skip_link' | 'escape_not_working';
  severity: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  element?: string;
  recommendation: string;
}

/**
 * 聚焦元素信息
 */
export interface FocusedElement {
  selector: string;
  tagName: string;
  text?: string;
  isVisible: boolean;
  hasFocusIndicator: boolean;
  tabIndex: number;
}

/**
 * 键盘测试器配置
 */
export interface KeyboardTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  artifactsDir: string;
  maxTabCount: number;
  checkSkipLinks: boolean;
  checkEscapeKey: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_KEYBOARD_TESTER_CONFIG: KeyboardTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  artifactsDir: './data/screenshots/a11y',
  maxTabCount: 50,
  checkSkipLinks: true,
  checkEscapeKey: true,
};

/**
 * 键盘导航测试器
 */
export class KeyboardTester {
  private config: KeyboardTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _testId: string;

  constructor(config: Partial<KeyboardTesterConfig> = {}) {
    this.config = { ...DEFAULT_KEYBOARD_TESTER_CONFIG, ...config };
    this._testId = nanoid(8);
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

    logger.pass('✅ 键盘导航测试器初始化完成');
  }

  /**
   * 测试页面键盘导航
   */
  async testKeyboardNavigation(url: string): Promise<KeyboardTestResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = Date.now();
    logger.step(`⌨️ 测试键盘导航: ${url}`);

    const issues: KeyboardIssue[] = [];
    const focusedElements: FocusedElement[] = [];
    const tabOrder: string[] = [];
    let hasSkipLinks = false;
    let hasFocusIndicators = true;

    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
    } catch (error) {
      logger.fail(`  ❌ 无法访问页面: ${error}`);
      return {
        url,
        passed: false,
        issues: [{
          type: 'inaccessible_element',
          severity: 'critical',
          description: '无法访问页面',
          recommendation: '检查页面是否可访问',
        }],
        focusedElements: [],
        tabOrder: [],
        hasSkipLinks: false,
        hasFocusIndicators: false,
        executionTime: Date.now() - startTime,
      };
    }

    // 检查跳过链接
    if (this.config.checkSkipLinks) {
      hasSkipLinks = await this.checkSkipLinks();
      if (!hasSkipLinks) {
        issues.push({
          type: 'no_skip_link',
          severity: 'moderate',
          description: '页面缺少跳过导航链接',
          recommendation: '添加 "Skip to main content" 链接，让键盘用户可以跳过重复的导航',
        });
      }
    }

    // 测试 Tab 键导航
    const tabResult = await this.testTabNavigation();
    focusedElements.push(...tabResult.elements);
    tabOrder.push(...tabResult.order);

    // 检查是否有焦点指示器
    for (const element of focusedElements) {
      if (!element.hasFocusIndicator) {
        hasFocusIndicators = false;
        issues.push({
          type: 'no_focus_indicator',
          severity: 'serious',
          description: `元素 "${element.selector}" 缺少焦点指示器`,
          element: element.selector,
          recommendation: '为所有可聚焦元素添加 :focus-visible 样式',
        });
      }
    }

    // 测试 Escape 键
    if (this.config.checkEscapeKey) {
      const escapeIssue = await this.testEscapeKey();
      if (escapeIssue) {
        issues.push(escapeIssue);
      }
    }

    // 检查交互元素是否可以通过键盘访问
    const interactiveIssues = await this.checkInteractiveElements();
    issues.push(...interactiveIssues);

    const executionTime = Date.now() - startTime;
    const passed = issues.filter(i => i.severity === 'critical' || i.severity === 'serious').length === 0;

    if (passed) {
      logger.pass(`  ✅ 键盘导航测试通过`);
    } else {
      logger.fail(`  ❌ 发现 ${issues.length} 个键盘导航问题`);
    }

    return {
      url,
      passed,
      issues,
      focusedElements,
      tabOrder,
      hasSkipLinks,
      hasFocusIndicators,
      executionTime,
    };
  }

  /**
   * 测试 Tab 键导航
   */
  private async testTabNavigation(): Promise<{ elements: FocusedElement[]; order: string[] }> {
    const elements: FocusedElement[] = [];
    const order: string[] = [];
    const seenSelectors = new Set<string>();

    // 点击页面顶部以清除任何现有焦点
    await this.page!.click('body').catch(() => {});

    for (let i = 0; i < this.config.maxTabCount; i++) {
      await this.page!.keyboard.press('Tab');
      await this.page!.waitForTimeout(50);

      const focusedElement = await this.page!.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body || el === document.documentElement) {
          return null;
        }

        // 获取选择器
        let selector = '';
        if (el.id) {
          selector = `#${el.id}`;
        } else if (el.getAttribute('name')) {
          selector = `[name="${el.getAttribute('name')}"]`;
        } else if (el.getAttribute('aria-label')) {
          selector = `[aria-label="${el.getAttribute('aria-label')}"]`;
        } else {
          selector = el.tagName.toLowerCase();
        }

        // 检查是否有焦点指示器
        const style = window.getComputedStyle(el);
        const hasOutline = style.outline !== 'none' && style.outlineWidth !== '0px';
        const hasFocusVisible = el.matches(':focus-visible');

        return {
          selector,
          tagName: el.tagName.toLowerCase(),
          text: el.textContent?.substring(0, 50) || undefined,
          isVisible: (el as HTMLElement).offsetParent !== null,
          hasFocusIndicator: hasOutline || hasFocusVisible,
          tabIndex: (el as HTMLElement).tabIndex,
        };
      });

      if (!focusedElement) {
        break;
      }

      // 检查是否已经见过这个元素（循环）
      if (seenSelectors.has(focusedElement.selector)) {
        break;
      }

      seenSelectors.add(focusedElement.selector);
      elements.push(focusedElement);
      order.push(focusedElement.selector);
    }

    return { elements, order };
  }

  /**
   * 检查跳过链接
   */
  private async checkSkipLinks(): Promise<boolean> {
    return await this.page!.evaluate(() => {
      // 检查是否有跳过链接
      const skipLinks = document.querySelectorAll('a[href^="#"]');
      for (const link of Array.from(skipLinks)) {
        const text = link.textContent?.toLowerCase() || '';
        if (text.includes('skip') || text.includes('跳过') || text.includes('跳转到')) {
          return true;
        }
      }

      // 检查是否有隐藏的跳过链接（可能在焦点时显示）
      const allLinks = document.querySelectorAll('a');
      for (const link of Array.from(allLinks)) {
        const href = link.getAttribute('href') || '';
        const id = href.startsWith('#') ? href.substring(1) : '';
        if (id) {
          const target = document.getElementById(id);
          if (target && (target.tagName === 'MAIN' || target.getAttribute('role') === 'main')) {
            return true;
          }
        }
      }

      return false;
    });
  }

  /**
   * 测试 Escape 键
   */
  private async testEscapeKey(): Promise<KeyboardIssue | null> {
    // 检查是否有打开的模态框或下拉菜单
    const hasModal = await this.page!.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], [role="modal"], .modal, .dialog');
      return modals.length > 0;
    });

    if (hasModal) {
      // 尝试按 Escape 关闭
      await this.page!.keyboard.press('Escape');
      await this.page!.waitForTimeout(100);

      const modalStillOpen = await this.page!.evaluate(() => {
        const modals = document.querySelectorAll('[role="dialog"], [role="modal"], .modal, .dialog');
        for (const modal of Array.from(modals)) {
          const style = window.getComputedStyle(modal);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return true;
          }
        }
        return false;
      });

      if (modalStillOpen) {
        return {
          type: 'escape_not_working',
          severity: 'moderate',
          description: 'Escape 键无法关闭模态框',
          recommendation: '确保 Escape 键可以关闭所有模态框和下拉菜单',
        };
      }
    }

    return null;
  }

  /**
   * 检查交互元素是否可通过键盘访问
   */
  private async checkInteractiveElements(): Promise<KeyboardIssue[]> {
    const issues: KeyboardIssue[] = [];

    const elements = await this.page!.evaluate(() => {
      const results: { selector: string; tagName: string; hasTabindex: boolean }[] = [];

      // 检查所有交互元素
      const interactiveSelectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="tab"]',
        '[role="menuitem"]',
        '[onclick]',
      ];

      for (const selector of interactiveSelectors) {
        document.querySelectorAll(selector).forEach(el => {
          const hasTabindex = el.hasAttribute('tabindex');
          const tabindex = el.getAttribute('tabindex');

          // 如果 tabindex 为负数且不是表单元素，可能无法通过键盘访问
          if (hasTabindex && tabindex === '-1' && !['input', 'select', 'textarea', 'button', 'a[href]'].includes(el.tagName.toLowerCase())) {
            // 检查是否有其他方式访问（如箭头键）
            // 这里简化检查，只标记可能有问题的元素
          }

          // 检查是否有 onclick 但没有 tabindex 且不是原生交互元素
          if (el.hasAttribute('onclick') && !['a', 'button', 'input', 'select', 'textarea'].includes(el.tagName.toLowerCase())) {
            if (!hasTabindex) {
              results.push({
                selector: el.id ? `#${el.id}` : el.tagName.toLowerCase(),
                tagName: el.tagName.toLowerCase(),
                hasTabindex: false,
              });
            }
          }
        });
      }

      return results;
    });

    for (const el of elements) {
      if (!el.hasTabindex) {
        issues.push({
          type: 'inaccessible_element',
          severity: 'serious',
          description: `元素 "${el.selector}" 有点击事件但无法通过键盘访问`,
          element: el.selector,
          recommendation: '添加 tabindex="0" 使元素可以通过 Tab 键聚焦',
        });
      }
    }

    return issues;
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
    logger.info('🔚 键盘导航测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testKeyboardNavigation(
  url: string,
  config?: Partial<KeyboardTesterConfig>,
): Promise<KeyboardTestResult> {
  const tester = new KeyboardTester(config);
  try {
    return await tester.testKeyboardNavigation(url);
  } finally {
    await tester.close();
  }
}
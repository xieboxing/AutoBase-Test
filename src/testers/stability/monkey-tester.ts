import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * Monkey 操作类型
 */
export type MonkeyActionType = 'click' | 'input' | 'scroll' | 'navigate' | 'hover' | 'select';

/**
 * 单次 Monkey 操作记录
 */
export interface MonkeyActionRecord {
  order: number;
  action: MonkeyActionType;
  target?: string;
  value?: string;
  timestamp: string;
  success: boolean;
  errorMessage?: string;
  screenshot?: string;
}

/**
 * Monkey 测试检测到的问题
 */
export interface MonkeyIssue {
  type: 'console_error' | 'page_crash' | 'uncaught_exception' | 'network_5xx' | 'white_screen';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  timestamp: string;
  actionOrder: number;
  details?: Record<string, unknown>;
  screenshot?: string;
}

/**
 * Monkey 测试结果
 */
export interface MonkeyTestResult {
  runId: string;
  url: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  actions: MonkeyActionRecord[];
  issues: MonkeyIssue[];
  summary: {
    crashDetected: boolean;
    errorCount: number;
    criticalIssueCount: number;
    stabilityScore: number; // 0-100, 100 = 最稳定
  };
  artifacts: {
    screenshots: string[];
    logs: string[];
  };
}

/**
 * Monkey 测试器配置
 */
export interface MonkeyTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  actionCount: number; // 操作次数，默认 500
  actionDelay: number; // 操作间隔 ms，默认 100
  screenshotOnAction: boolean; // 每步截图
  screenshotOnIssue: boolean; // 问题截图
  artifactsDir: string;
  maxInputLength: number; // 最大输入长度
  scrollDistance: number; // 滚动距离 px
}

/**
 * 默认配置
 */
const DEFAULT_MONKEY_TESTER_CONFIG: MonkeyTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  actionCount: 500,
  actionDelay: 100,
  screenshotOnAction: false,
  screenshotOnIssue: true,
  artifactsDir: './data/screenshots/monkey',
  maxInputLength: 50,
  scrollDistance: 300,
};

/**
 * 随机数据生成器
 */
class RandomDataGenerator {
  private static readonly SAMPLE_TEXTS = [
    'test',
    'hello',
    'admin',
    'user@example.com',
    '123456',
    '测试中文',
    '日本語テスト',
    'special!@#$%',
    '<script>alert(1)</script>',
    'very long text that might cause overflow or truncation issues in the UI',
  ];

  private static readonly SAMPLE_SELECT_OPTIONS = ['0', '1', '2', 'option1', 'option2'];

  /**
   * 生成随机文本
   */
  static randomText(maxLength: number): string {
    const text = this.SAMPLE_TEXTS[Math.floor(Math.random() * this.SAMPLE_TEXTS.length)]!;
    return text.slice(0, maxLength);
  }

  /**
   * 生成随机数字
   */
  static randomNumber(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * 随机选择数组元素
   */
  static randomChoice<T>(arr: T[]): T | undefined {
    if (arr.length === 0) return undefined;
    return arr[Math.floor(Math.random() * arr.length)];
  }

  /**
   * 生成随机选择值
   */
  static randomSelectValue(): string {
    return this.randomChoice(this.SAMPLE_SELECT_OPTIONS) ?? '0';
  }
}

/**
 * Monkey 随机测试器
 */
export class MonkeyTester {
  private config: MonkeyTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private runId: string;
  private issues: MonkeyIssue[] = [];
  private actions: MonkeyActionRecord[] = [];
  private consoleErrors: string[] = [];
  private network5xxErrors: string[] = [];
  private screenshots: string[] = [];

  constructor(config: Partial<MonkeyTesterConfig> = {}) {
    this.config = { ...DEFAULT_MONKEY_TESTER_CONFIG, ...config };
    this.runId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    // 确保截图目录存在
    const screenshotDir = path.join(this.config.artifactsDir, this.runId);
    await fs.mkdir(screenshotDir, { recursive: true });

    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    // 监听控制台错误
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        this.consoleErrors.push(msg.text());
        this.addIssue({
          type: 'console_error',
          severity: 'medium',
          message: msg.text(),
          timestamp: new Date().toISOString(),
          actionOrder: this.actions.length,
        });
      }
    });

    // 监听未捕获异常
    this.page.on('pageerror', error => {
      this.addIssue({
        type: 'uncaught_exception',
        severity: 'high',
        message: error.message,
        timestamp: new Date().toISOString(),
        actionOrder: this.actions.length,
        details: { stack: error.stack },
      });
    });

    // 监听页面崩溃
    this.page.on('crash', () => {
      this.addIssue({
        type: 'page_crash',
        severity: 'critical',
        message: 'Page crashed during monkey testing',
        timestamp: new Date().toISOString(),
        actionOrder: this.actions.length,
      });
    });

    // 监听网络请求 5xx 错误
    this.page.on('response', response => {
      if (response.status() >= 500) {
        this.network5xxErrors.push(`${response.url()} (${response.status()})`);
        this.addIssue({
          type: 'network_5xx',
          severity: 'high',
          message: `HTTP ${response.status()}: ${response.url()}`,
          timestamp: new Date().toISOString(),
          actionOrder: this.actions.length,
          details: { status: response.status(), url: response.url() },
        });
      }
    });

    logger.pass('✅ Monkey 测试器初始化完成', { runId: this.runId });
  }

  /**
   * 添加问题记录
   */
  private addIssue(issue: MonkeyIssue): void {
    // 添加截图
    if (this.config.screenshotOnIssue && this.page) {
      const screenshotPath = path.join(
        this.config.artifactsDir,
        this.runId,
        `issue-${issue.type}-${this.issues.length}.png`
      );
      this.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      issue.screenshot = screenshotPath;
      this.screenshots.push(screenshotPath);
    }

    this.issues.push(issue);
    logger.fail(`❌ 检测到问题 [${issue.type}]: ${issue.message}`);
  }

  /**
   * 执行 Monkey 测试
   */
  async runMonkeyTest(url: string): Promise<MonkeyTestResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = new Date();
    logger.step(`🐒 开始 Monkey 测试: ${url}`, {
      actionCount: this.config.actionCount,
      runId: this.runId,
    });

    // 导航到目标页面
    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
      logger.pass('✅ 页面加载完成');
    } catch (error) {
      this.addIssue({
        type: 'page_crash',
        severity: 'critical',
        message: `Failed to load page: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date().toISOString(),
        actionOrder: 0,
      });
    }

    // 执行随机操作
    for (let i = 1; i <= this.config.actionCount; i++) {
      // 检查页面是否崩溃
      if (this.page!.isClosed()) {
        this.addIssue({
          type: 'page_crash',
          severity: 'critical',
          message: 'Page closed unexpectedly',
          timestamp: new Date().toISOString(),
          actionOrder: i,
        });
        break;
      }

      // 检查白屏
      const isWhiteScreen = await this.checkWhiteScreen();
      if (isWhiteScreen) {
        this.addIssue({
          type: 'white_screen',
          severity: 'critical',
          message: 'Page appears to be blank/white',
          timestamp: new Date().toISOString(),
          actionOrder: i,
        });
      }

      await this.executeRandomAction(i);

      // 操作间隔
      if (this.config.actionDelay > 0) {
        await this.page!.waitForTimeout(this.config.actionDelay);
      }
    }

    const endTime = new Date();
    const result = this.buildResult(url, startTime, endTime);

    logger.step('📊 Monkey 测试完成', {
      totalActions: result.totalActions,
      issues: result.issues.length,
      stabilityScore: result.summary.stabilityScore,
    });

    return result;
  }

  /**
   * 检查白屏
   */
  private async checkWhiteScreen(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const bodyText = await this.page.evaluate(() => {
        const body = document.body;
        if (!body) return '';
        // 检查 body 是否为空或只有空白字符
        const text = body.innerText || '';
        // 检查是否有可见元素
        const visibleElements = body.querySelectorAll('*:not(script):not(style):not(noscript)');
        let hasVisibleContent = false;
        visibleElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetHeight > 0) {
            hasVisibleContent = true;
          }
        });
        return hasVisibleContent ? 'content' : text.trim();
      });

      return bodyText === '' || bodyText !== 'content';
    } catch {
      return false;
    }
  }

  /**
   * 执行随机操作
   */
  private async executeRandomAction(order: number): Promise<void> {
    if (!this.page) return;

    // 随机选择操作类型
    const actionTypes: MonkeyActionType[] = ['click', 'input', 'scroll', 'navigate', 'hover', 'select'];
    const action = RandomDataGenerator.randomChoice(actionTypes) ?? 'click';

    const record: MonkeyActionRecord = {
      order,
      action,
      timestamp: new Date().toISOString(),
      success: false,
    };

    try {
      switch (action) {
        case 'click':
          await this.randomClick(record);
          break;
        case 'input':
          await this.randomInput(record);
          break;
        case 'scroll':
          await this.randomScroll(record);
          break;
        case 'navigate':
          await this.randomNavigate(record);
          break;
        case 'hover':
          await this.randomHover(record);
          break;
        case 'select':
          await this.randomSelect(record);
          break;
      }

      record.success = true;

      // 操作成功后截图（如果配置）
      if (this.config.screenshotOnAction) {
        const screenshotPath = path.join(
          this.config.artifactsDir,
          this.runId,
          `action-${order}.png`
        );
        await this.page.screenshot({ path: screenshotPath, fullPage: false });
        record.screenshot = screenshotPath;
        this.screenshots.push(screenshotPath);
      }

    } catch (error) {
      record.success = false;
      record.errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn(`⚠️ 操作 #${order} 失败: ${record.errorMessage}`);
    }

    this.actions.push(record);

    if (order % 50 === 0) {
      logger.step(`  🐒 已执行 ${order}/${this.config.actionCount} 次随机操作`);
    }
  }

  /**
   * 随机点击
   */
  private async randomClick(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    // 获取可点击元素
    const clickableSelectors = await this.page.evaluate(() => {
      const elements: string[] = [];
      document.querySelectorAll('button, a, [role="button"], input[type="submit"], input[type="button"], [onclick]').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          if (el.id) {
            elements.push(`#${el.id}`);
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c).slice(0, 2);
            elements.push(`${el.tagName.toLowerCase()}.${classes.join('.')}`);
          } else {
            elements.push(el.tagName.toLowerCase());
          }
        }
      });
      return elements;
    });

    const selector = RandomDataGenerator.randomChoice(clickableSelectors);
    if (!selector) {
      // 没有可点击元素，点击页面任意位置
      const x = RandomDataGenerator.randomNumber(0, this.config.viewport.width);
      const y = RandomDataGenerator.randomNumber(0, this.config.viewport.height);
      await this.page.mouse.click(x, y);
      record.target = `position(${x}, ${y})`;
      return;
    }

    record.target = selector;
    await this.page.locator(selector).first().click({ timeout: 5000 });
  }

  /**
   * 随机输入
   */
  private async randomInput(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    // 获取输入元素
    const inputSelectors = await this.page.evaluate(() => {
      const elements: Array<{ selector: string; type: string }> = [];
      document.querySelectorAll('input:not([type="submit"]):not([type="button"]):not([type="checkbox"]):not([type="radio"]), textarea').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const inputEl = el as HTMLInputElement | HTMLTextAreaElement;
          if (inputEl.disabled || inputEl.readOnly) return;

          if (el.id) {
            elements.push({ selector: `#${el.id}`, type: inputEl.type || 'text' });
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c).slice(0, 2);
            elements.push({ selector: `${el.tagName.toLowerCase()}.${classes.join('.')}`, type: inputEl.type || 'text' });
          } else {
            elements.push({ selector: el.tagName.toLowerCase(), type: inputEl.type || 'text' });
          }
        }
      });
      return elements;
    });

    const target = RandomDataGenerator.randomChoice(inputSelectors);
    if (!target) {
      // 没有输入元素，跳过
      record.success = false;
      record.errorMessage = 'No input elements found';
      return;
    }

    record.target = target.selector;

    // 根据输入类型生成值
    let value: string;
    switch (target.type) {
      case 'email':
        value = `test${RandomDataGenerator.randomNumber(1, 999)}@example.com`;
        break;
      case 'number':
        value = String(RandomDataGenerator.randomNumber(0, 1000));
        break;
      case 'tel':
        value = `1${RandomDataGenerator.randomNumber(1000000000, 9999999999)}`;
        break;
      case 'url':
        value = 'https://example.com';
        break;
      default:
        value = RandomDataGenerator.randomText(this.config.maxInputLength);
    }

    record.value = value;
    await this.page.locator(target.selector).first().fill(value, { timeout: 5000 });
  }

  /**
   * 随机滚动
   */
  private async randomScroll(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    const direction = RandomDataGenerator.randomChoice(['up', 'down', 'left', 'right']) ?? 'down';
    const distance = RandomDataGenerator.randomNumber(100, this.config.scrollDistance);

    record.target = direction;
    record.value = `${distance}px`;

    const scrollAmount = direction === 'up' || direction === 'left' ? -distance : distance;

    if (direction === 'up' || direction === 'down') {
      await this.page.evaluate((amt) => {
        window.scrollBy(0, amt);
      }, scrollAmount);
    } else {
      await this.page.evaluate((amt) => {
        window.scrollBy(amt, 0);
      }, scrollAmount);
    }
  }

  /**
   * 随机导航
   */
  private async randomNavigate(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    // 获取页面中的导航链接
    const navLinks = await this.page.evaluate(() => {
      const links: Array<{ href: string; text: string }> = [];
      const currentOrigin = window.location.origin;
      document.querySelectorAll('a[href]').forEach(el => {
        const linkEl = el as HTMLAnchorElement;
        const href = linkEl.href;
        // 只导航内链
        if (href && href.startsWith(currentOrigin) && !href.includes('#')) {
          links.push({ href, text: linkEl.textContent?.slice(0, 30) || '' });
        }
      });
      return links;
    });

    const targetLink = RandomDataGenerator.randomChoice(navLinks);
    if (!targetLink) {
      record.success = false;
      record.errorMessage = 'No internal navigation links found';
      return;
    }

    record.target = targetLink.href;
    record.value = targetLink.text;

    await this.page.goto(targetLink.href, { waitUntil: 'domcontentloaded', timeout: 10000 });
  }

  /**
   * 随机悬停
   */
  private async randomHover(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    // 获取可悬停元素
    const hoverSelectors = await this.page.evaluate(() => {
      const elements: string[] = [];
      document.querySelectorAll('a, button, [role="button"], .nav-item, .menu-item, .dropdown').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          if (el.id) {
            elements.push(`#${el.id}`);
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c).slice(0, 2);
            elements.push(`${el.tagName.toLowerCase()}.${classes.join('.')}`);
          }
        }
      });
      return elements;
    });

    const selector = RandomDataGenerator.randomChoice(hoverSelectors);
    if (!selector) {
      // 随机位置悬停
      const x = RandomDataGenerator.randomNumber(0, this.config.viewport.width);
      const y = RandomDataGenerator.randomNumber(0, this.config.viewport.height);
      await this.page.mouse.move(x, y);
      record.target = `position(${x}, ${y})`;
      return;
    }

    record.target = selector;
    await this.page.locator(selector).first().hover({ timeout: 5000 });
  }

  /**
   * 随机选择下拉框
   */
  private async randomSelect(record: MonkeyActionRecord): Promise<void> {
    if (!this.page) return;

    // 获取下拉框元素
    const selectSelectors = await this.page.evaluate(() => {
      const elements: Array<{ selector: string; options: string[] }> = [];
      document.querySelectorAll('select').forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          const selectEl = el as HTMLSelectElement;
          if (selectEl.disabled) return;

          const options = Array.from(selectEl.options).map(opt => opt.value);

          if (el.id) {
            elements.push({ selector: `#${el.id}`, options });
          } else if (el.className && typeof el.className === 'string') {
            const classes = el.className.split(' ').filter(c => c).slice(0, 2);
            elements.push({ selector: `select.${classes.join('.')}`, options });
          } else {
            elements.push({ selector: 'select', options });
          }
        }
      });
      return elements;
    });

    const target = RandomDataGenerator.randomChoice(selectSelectors);
    if (!target || target.options.length === 0) {
      record.success = false;
      record.errorMessage = 'No select elements found or no options available';
      return;
    }

    record.target = target.selector;
    const value = RandomDataGenerator.randomChoice(target.options) ?? target.options[0];
    record.value = value;

    if (value) {
      await this.page.locator(target.selector).first().selectOption(value, { timeout: 5000 });
    }
  }

  /**
   * 构建测试结果
   */
  private buildResult(url: string, startTime: Date, endTime: Date): MonkeyTestResult {
    const successfulActions = this.actions.filter(a => a.success).length;
    const failedActions = this.actions.filter(a => !a.success).length;
    const criticalIssues = this.issues.filter(i => i.severity === 'critical').length;

    // 稳定性评分计算
    // 基础分数 100，每个问题扣分，critical扣10，high扣5，medium扣2，low扣1
    let stabilityScore = 100;
    for (const issue of this.issues) {
      switch (issue.severity) {
        case 'critical':
          stabilityScore -= 10;
          break;
        case 'high':
          stabilityScore -= 5;
          break;
        case 'medium':
          stabilityScore -= 2;
          break;
        case 'low':
          stabilityScore -= 1;
          break;
      }
    }
    // 失败操作也扣分
    stabilityScore -= failedActions * 0.5;
    stabilityScore = Math.max(0, Math.min(100, stabilityScore));

    return {
      runId: this.runId,
      url,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      totalActions: this.actions.length,
      successfulActions,
      failedActions,
      actions: this.actions,
      issues: this.issues,
      summary: {
        crashDetected: this.issues.some(i => i.type === 'page_crash' || i.type === 'white_screen'),
        errorCount: this.issues.length,
        criticalIssueCount: criticalIssues,
        stabilityScore,
      },
      artifacts: {
        screenshots: this.screenshots,
        logs: [],
      },
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
    logger.info('🔚 Monkey 测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function runMonkeyTest(
  url: string,
  config?: Partial<MonkeyTesterConfig>,
): Promise<MonkeyTestResult> {
  const tester = new MonkeyTester(config);
  try {
    await tester.initialize();
    return await tester.runMonkeyTest(url);
  } finally {
    await tester.close();
  }
}
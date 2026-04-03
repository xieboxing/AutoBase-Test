import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type { TestCase, TestStep, TestCasePriority, TestCaseType, Platform } from '@/types/test-case.types.js';

/**
 * 录制的操作
 */
export interface RecordedAction {
  timestamp: string;
  action: string;
  selector?: string;
  tagName?: string;
  text?: string;
  value?: string;
  url?: string;
  x?: number;
  y?: number;
  key?: string;
}

/**
 * 用例录制器配置
 */
export interface CaseRecorderConfig {
  headless: boolean;
  viewport: { width: number; height: number };
  recordVideo: boolean;
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_CASE_RECORDER_CONFIG: CaseRecorderConfig = {
  headless: false, // 录制时默认显示浏览器
  viewport: { width: 1920, height: 1080 },
  recordVideo: false,
  artifactsDir: './data/recordings',
};

/**
 * 测试用例录制器
 * 录制用户操作并生成测试用例 JSON
 */
export class CaseRecorder {
  private config: CaseRecorderConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private actions: RecordedAction[] = [];
  private isRecording: boolean = false;
  private startUrl: string = '';
  private runId: string;

  constructor(config: Partial<CaseRecorderConfig> = {}) {
    this.config = { ...DEFAULT_CASE_RECORDER_CONFIG, ...config };
    this.runId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    this.browser = await chromium.launch({
      headless: this.config.headless,
    });

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      recordVideo: this.config.recordVideo
        ? { dir: `${this.config.artifactsDir}/${this.runId}` }
        : undefined,
    });

    this.page = await this.context.newPage();

    // 注入录制脚本
    await this.injectRecordingScript();

    logger.pass('✅ 录制器初始化完成', { runId: this.runId });
  }

  /**
   * 注入录制脚本到页面
   */
  private async injectRecordingScript(): Promise<void> {
    if (!this.page) return;

    // 监听所有用户交互
    await this.page.exposeFunction('recordAction', (action: RecordedAction) => {
      if (this.isRecording) {
        this.actions.push({
          ...action,
          timestamp: new Date().toISOString(),
        });
        logger.step(`📝 录制: ${action.action}${action.selector ? ` [${action.selector}]` : ''}${action.value ? ` = "${action.value.slice(0, 30)}"` : ''}`);
      }
    });

    // 在页面加载完成后注入监听器
    this.page.on('domcontentloaded', async () => {
      if (!this.page) return;

      await this.page.evaluate(() => {
        // 点击事件
        document.addEventListener('click', (e) => {
          const target = e.target as HTMLElement;
          const selector = generateSelector(target);
          const action: RecordedAction = {
            timestamp: '',
            action: 'click',
            selector,
            tagName: target.tagName.toLowerCase(),
            text: target.textContent?.slice(0, 50),
          };
          // @ts-expect-error - exposed function
          window.recordAction(action);
        }, true);

        // 输入事件
        document.addEventListener('input', (e) => {
          const target = e.target as HTMLInputElement | HTMLTextAreaElement;
          const selector = generateSelector(target);
          const action: RecordedAction = {
            timestamp: '',
            action: 'fill',
            selector,
            tagName: target.tagName.toLowerCase(),
            value: target.value,
          };
          // @ts-expect-error - exposed function
          window.recordAction(action);
        }, true);

        // 选择事件
        document.addEventListener('change', (e) => {
          const target = e.target as HTMLSelectElement;
          if (target.tagName === 'SELECT') {
            const selector = generateSelector(target);
            const action: RecordedAction = {
              timestamp: '',
              action: 'select',
              selector,
              tagName: 'select',
              value: target.value,
            };
            // @ts-expect-error - exposed function
            window.recordAction(action);
          }
        }, true);

        // 键盘事件
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
            const action: RecordedAction = {
              timestamp: '',
              action: 'keypress',
              key: e.key,
            };
            // @ts-expect-error - exposed function
            window.recordAction(action);
          }
        }, true);

        // 生成选择器的辅助函数
        function generateSelector(element: HTMLElement): string {
          // 优先使用 data-testid
          if (element.hasAttribute('data-testid')) {
            return `[data-testid="${element.getAttribute('data-testid')}"]`;
          }

          // 使用 id
          if (element.id) {
            return `#${element.id}`;
          }

          // 使用 name
          if (element.hasAttribute('name')) {
            return `[name="${element.getAttribute('name')}"]`;
          }

          // 使用 aria-label
          if (element.hasAttribute('aria-label')) {
            return `[aria-label="${element.getAttribute('aria-label')}"]`;
          }

          // 使用 placeholder
          if (element.hasAttribute('placeholder')) {
            return `[placeholder="${element.getAttribute('placeholder')}"]`;
          }

          // 使用 class + tag
          const tagName = element.tagName.toLowerCase();
          if (element.className && typeof element.className === 'string') {
            const classes = element.className.split(' ').filter(c => c && !c.includes(':'));
            if (classes.length > 0) {
              return `${tagName}.${classes.slice(0, 2).join('.')}`;
            }
          }

          // 使用 text content
          const text = element.textContent?.trim().slice(0, 30);
          if (text && text.length > 0) {
            return `${tagName}:has-text("${text}")`;
          }

          return tagName;
        }
      });
    });
  }

  /**
   * 开始录制
   */
  async startRecording(url: string): Promise<void> {
    if (!this.page) {
      await this.initialize();
    }

    this.actions = [];
    this.isRecording = true;
    this.startUrl = url;

    // 导航到起始 URL
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });

    // 记录初始导航
    this.actions.push({
      timestamp: new Date().toISOString(),
      action: 'navigate',
      url,
    });

    logger.step('🎬 开始录制', { url, runId: this.runId });
    logger.step('💡 提示: 在浏览器中操作，完成后调用 stopRecording()');
  }

  /**
   * 停止录制
   */
  async stopRecording(): Promise<RecordedAction[]> {
    this.isRecording = false;
    logger.step('🎬 录制结束', { totalActions: this.actions.length });
    return [...this.actions];
  }

  /**
   * 生成测试用例
   */
  generateTestCase(options: {
    name: string;
    description: string;
    priority?: TestCasePriority;
    type?: TestCaseType;
    platform?: Platform[];
    tags?: string[];
  }): TestCase {
    const steps = this.convertActionsToSteps();

    const testCase: TestCase = {
      id: `tc-recorded-${this.runId}`,
      name: options.name,
      description: options.description,
      priority: options.priority ?? 'P2',
      type: options.type ?? 'functional',
      platform: options.platform ?? ['pc-web'],
      tags: options.tags ?? ['recorded'],
      steps,
      metadata: {
        author: 'Case Recorder',
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
        run_count: 0,
        pass_rate: 0,
        avg_duration_ms: 0,
      },
    };

    return testCase;
  }

  /**
   * 将录制操作转换为测试步骤
   */
  private convertActionsToSteps(): TestStep[] {
    const steps: TestStep[] = [];
    let order = 1;
    const processedSelectors = new Set<string>();

    for (const action of this.actions) {
      // 跳过重复的输入操作（只保留最终值）
      if (action.action === 'fill' && action.selector) {
        if (processedSelectors.has(`fill-${action.selector}`)) {
          // 更新最后一个相同选择器的 fill 操作的值
          const lastFill = steps.find(s => s.target === action.selector && s.action === 'fill');
          if (lastFill) {
            lastFill.value = action.value;
          }
          continue;
        }
        processedSelectors.add(`fill-${action.selector}`);
      }

      const step = this.actionToStep(action, order);
      if (step) {
        steps.push(step);
        order++;
      }
    }

    return steps;
  }

  /**
   * 单个操作转步骤
   */
  private actionToStep(action: RecordedAction, order: number): TestStep | null {
    switch (action.action) {
      case 'navigate':
        return {
          order,
          action: 'navigate',
          value: action.url,
          description: `导航到 ${action.url}`,
        };

      case 'click':
        return {
          order,
          action: 'click',
          target: action.selector,
          description: `点击 ${action.tagName}${action.text ? `: "${action.text.slice(0, 30)}"` : ''}`,
        };

      case 'fill':
        return {
          order,
          action: 'fill',
          target: action.selector,
          value: action.value,
          description: `在 ${action.selector} 输入 "${action.value?.slice(0, 30)}"`,
        };

      case 'select':
        return {
          order,
          action: 'select',
          target: action.selector,
          value: action.value,
          description: `选择 ${action.value}`,
        };

      case 'keypress':
        if (action.key === 'Enter') {
          return {
            order,
            action: 'click',
            target: 'button[type="submit"], input[type="submit"], .submit-btn',
            description: '按 Enter 提交',
          };
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * 保存测试用例到文件
   */
  async saveTestCase(project: string, testCase: TestCase): Promise<string> {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');

    const casesDir = path.join('./test-suites', project, 'cases');
    await fs.mkdir(casesDir, { recursive: true });

    const filePath = path.join(casesDir, `${testCase.id}.case.json`);
    await fs.writeFile(filePath, JSON.stringify(testCase, null, 2), 'utf-8');

    logger.pass(`✅ 测试用例已保存: ${filePath}`);
    return filePath;
  }

  /**
   * 获取录制的操作数量
   */
  getActionCount(): number {
    return this.actions.length;
  }

  /**
   * 获取所有录制操作
   */
  getActions(): RecordedAction[] {
    return [...this.actions];
  }

  /**
   * 清空录制
   */
  clearActions(): void {
    this.actions = [];
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    this.isRecording = false;

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

    logger.info('🔚 录制器已关闭');
  }
}

/**
 * 快捷函数：录制并生成用例
 */
export async function recordTestCase(
  url: string,
  options: {
    name: string;
    description: string;
    priority?: TestCasePriority;
    type?: TestCaseType;
    platform?: Platform[];
    tags?: string[];
  },
  config?: Partial<CaseRecorderConfig>,
): Promise<TestCase> {
  const recorder = new CaseRecorder(config);
  try {
    await recorder.initialize();
    await recorder.startRecording(url);

    // 等待用户操作...
    // 实际使用时需要外部调用 stopRecording
    await new Promise(resolve => setTimeout(resolve, 60000)); // 1分钟超时

    await recorder.stopRecording();
    return recorder.generateTestCase(options);
  } finally {
    await recorder.close();
  }
}
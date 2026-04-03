import { chromium, type Browser, type BrowserContext, type Page, type Response } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * 崩溃事件类型
 */
export type CrashEventType = 'page_crash' | 'js_exception' | 'console_error' | 'network_5xx' | 'network_timeout' | 'white_screen';

/**
 * 崩溃事件严重级别
 */
export type CrashSeverity = 'critical' | 'high' | 'medium' | 'low';

/**
 * 单个崩溃事件记录
 */
export interface CrashEvent {
  id: string;
  type: CrashEventType;
  severity: CrashSeverity;
  message: string;
  timestamp: string;
  url?: string;
  stackTrace?: string;
  httpStatus?: number;
  requestUrl?: string;
  consoleMessage?: string;
  screenshot?: string;
  context?: Record<string, unknown>;
}

/**
 * 崩溃检测结果
 */
export interface CrashDetectionResult {
  runId: string;
  url: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  events: CrashEvent[];
  summary: {
    totalEvents: number;
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    pageCrashes: number;
    jsExceptions: number;
    networkErrors: number;
    consoleErrors: number;
    stabilityScore: number; // 0-100
    isStable: boolean;
  };
  recommendations: string[];
  artifacts: {
    screenshots: string[];
    logs: string[];
  };
}

/**
 * 崩溃检测器配置
 */
export interface CrashDetectorConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  detectWhiteScreen: boolean; // 检测白屏
  whiteScreenCheckInterval: number; // 白屏检查间隔 ms
  screenshotOnError: boolean; // 错误时截图
  artifactsDir: string;
  maxEvents: number; // 最大记录事件数
  ignorePatterns: string[]; // 忽略的错误模式（正则）
}

/**
 * 默认配置
 */
const DEFAULT_CRASH_DETECTOR_CONFIG: CrashDetectorConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  detectWhiteScreen: true,
  whiteScreenCheckInterval: 5000,
  screenshotOnError: true,
  artifactsDir: './data/screenshots/crash-detector',
  maxEvents: 100,
  ignorePatterns: [],
};

/**
 * 崩溃检测器
 */
export class CrashDetector {
  private config: CrashDetectorConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private runId: string;
  private events: CrashEvent[] = [];
  private screenshots: string[] = [];
  private isMonitoring: boolean = false;

  constructor(config: Partial<CrashDetectorConfig> = {}) {
    this.config = { ...DEFAULT_CRASH_DETECTOR_CONFIG, ...config };
    this.runId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    const screenshotDir = path.join(this.config.artifactsDir, this.runId);
    await fs.mkdir(screenshotDir, { recursive: true });

    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    logger.pass('✅ 崩溃检测器初始化完成', { runId: this.runId });
  }

  /**
   * 开始监控崩溃事件
   */
  async startMonitoring(url: string): Promise<void> {
    if (!this.page) {
      await this.initialize();
    }

    this.isMonitoring = true;
    this.events = [];
    this.screenshots = [];

    logger.step('🔍 开始监控崩溃事件', { url, runId: this.runId });

    // 设置事件监听
    this.setupEventListeners();

    // 导航到目标页面
    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
    } catch (error) {
      this.recordEvent({
        type: 'page_crash',
        severity: 'critical',
        message: `Failed to load page: ${error instanceof Error ? error.message : String(error)}`,
        url,
      });
    }

    // 启动白屏检测定时器
    if (this.config.detectWhiteScreen) {
      this.startWhiteScreenDetection();
    }
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    if (!this.page) return;

    // 监听页面崩溃
    this.page.on('crash', () => {
      this.recordEvent({
        type: 'page_crash',
        severity: 'critical',
        message: 'Page crashed',
        url: this.page?.url(),
      });
    });

    // 监听未捕获的 JS 异常
    this.page.on('pageerror', error => {
      this.recordEvent({
        type: 'js_exception',
        severity: 'high',
        message: error.message,
        stackTrace: error.stack,
        url: this.page?.url(),
      });
    });

    // 监听控制台错误
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        // 检查是否需要忽略
        const shouldIgnore = this.config.ignorePatterns.some(pattern => {
          try {
            return new RegExp(pattern).test(msg.text());
          } catch {
            return false;
          }
        });

        if (!shouldIgnore) {
          this.recordEvent({
            type: 'console_error',
            severity: 'medium',
            message: msg.text(),
            consoleMessage: msg.text(),
            url: this.page?.url(),
          });
        }
      }
    });

    // 监听网络请求失败
    this.page.on('requestfailed', request => {
      const failure = request.failure();
      if (failure) {
        // 检查是否是超时
        if (failure.errorText.includes('timeout')) {
          this.recordEvent({
            type: 'network_timeout',
            severity: 'high',
            message: `Request timeout: ${request.url()}`,
            requestUrl: request.url(),
            url: this.page?.url(),
          });
        } else {
          this.recordEvent({
            type: 'network_5xx',
            severity: 'medium',
            message: `Request failed: ${failure.errorText}`,
            requestUrl: request.url(),
            url: this.page?.url(),
          });
        }
      }
    });

    // 监听网络响应 5xx
    this.page.on('response', (response: Response) => {
      if (response.status() >= 500) {
        this.recordEvent({
          type: 'network_5xx',
          severity: 'high',
          message: `HTTP ${response.status()}: ${response.url()}`,
          httpStatus: response.status(),
          requestUrl: response.url(),
          url: this.page?.url(),
        });
      }
    });
  }

  /**
   * 启动白屏检测
   */
  private startWhiteScreenDetection(): void {
    if (!this.page) return;

    const checkWhiteScreen = async () => {
      if (!this.isMonitoring || !this.page || this.page.isClosed()) return;

      try {
        const isWhiteScreen = await this.detectWhiteScreen();
        if (isWhiteScreen) {
          this.recordEvent({
            type: 'white_screen',
            severity: 'critical',
            message: 'Page appears to be blank/white',
            url: this.page?.url(),
          });
        }
      } catch {
        // 检测失败，忽略
      }
    };

    // 定时检查白屏
    const intervalId = setInterval(checkWhiteScreen, this.config.whiteScreenCheckInterval);

    // 页面关闭时停止检查
    this.page.on('close', () => {
      clearInterval(intervalId);
    });
  }

  /**
   * 检测白屏
   */
  private async detectWhiteScreen(): Promise<boolean> {
    if (!this.page) return false;

    try {
      const result = await this.page.evaluate(() => {
        const body = document.body;
        if (!body) return true;

        // 检查背景色是否为白色
        const bgColor = window.getComputedStyle(body).backgroundColor;
        const isWhiteBg = bgColor === 'rgb(255, 255, 255)' || bgColor === 'rgba(0, 0, 0, 0)';

        // 检查是否有可见内容
        const visibleElements = body.querySelectorAll('*:not(script):not(style):not(noscript):not(meta):not(link)');
        let hasVisibleContent = false;

        visibleElements.forEach(el => {
          const style = window.getComputedStyle(el);
          if (style.display !== 'none' && style.visibility !== 'hidden' && (el as HTMLElement).offsetHeight > 0) {
            // 检查元素是否有可见内容
            const text = el.textContent?.trim();
            const hasImages = el.querySelectorAll('img[src]').length > 0;
            const isInput = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';

            if (text && text.length > 0 || hasImages || isInput) {
              hasVisibleContent = true;
            }
          }
        });

        return isWhiteBg && !hasVisibleContent;
      });

      return result;
    } catch {
      return false;
    }
  }

  /**
   * 记录崩溃事件
   */
  private recordEvent(eventData: Omit<CrashEvent, 'id' | 'timestamp' | 'screenshot' | 'context'>): void {
    if (this.events.length >= this.config.maxEvents) {
      logger.warn('⚠️ 已达到最大事件记录数，忽略后续事件');
      return;
    }

    const event: CrashEvent = {
      id: nanoid(8),
      timestamp: new Date().toISOString(),
      ...eventData,
      context: {
        url: this.page?.url(),
        viewport: this.config.viewport,
      },
    };

    // 截图
    if (this.config.screenshotOnError && this.page && !this.page.isClosed()) {
      const screenshotPath = path.join(
        this.config.artifactsDir,
        this.runId,
        `${event.type}-${event.id}.png`
      );
      this.page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      event.screenshot = screenshotPath;
      this.screenshots.push(screenshotPath);
    }

    this.events.push(event);

    // 根据严重级别输出日志
    switch (event.severity) {
      case 'critical':
        logger.fail(`🔴 [CRITICAL] ${event.type}: ${event.message}`);
        break;
      case 'high':
        logger.fail(`🟠 [HIGH] ${event.type}: ${event.message}`);
        break;
      case 'medium':
        logger.warn(`🟡 [MEDIUM] ${event.type}: ${event.message}`);
        break;
      case 'low':
        logger.info(`🟢 [LOW] ${event.type}: ${event.message}`);
        break;
    }
  }

  /**
   * 停止监控并获取结果
   */
  async stopMonitoring(): Promise<CrashDetectionResult> {
    this.isMonitoring = false;

    const endTime = new Date();
    const result = this.buildResult(endTime);

    logger.step('📊 崩溃检测监控结束', {
      totalEvents: result.summary.totalEvents,
      criticalCount: result.summary.criticalCount,
      stabilityScore: result.summary.stabilityScore,
    });

    return result;
  }

  /**
   * 执行完整崩溃检测测试
   */
  async runCrashDetection(url: string, durationMs: number = 60000): Promise<CrashDetectionResult> {
    const startTime = new Date();

    await this.startMonitoring(url);

    // 等待指定时间
    await this.page!.waitForTimeout(durationMs);

    const result = await this.stopMonitoring();

    return result;
  }

  /**
   * 获取当前事件列表
   */
  getEvents(): CrashEvent[] {
    return [...this.events];
  }

  /**
   * 检查是否有严重崩溃
   */
  hasCriticalCrash(): boolean {
    return this.events.some(e => e.severity === 'critical');
  }

  /**
   * 构建检测结果
   */
  private buildResult(endTime: Date): CrashDetectionResult {
    const startTime = new Date(endTime.getTime() - (this.events.length > 0 ? 60000 : 0));

    const criticalCount = this.events.filter(e => e.severity === 'critical').length;
    const highCount = this.events.filter(e => e.severity === 'high').length;
    const mediumCount = this.events.filter(e => e.severity === 'medium').length;
    const lowCount = this.events.filter(e => e.severity === 'low').length;

    const pageCrashes = this.events.filter(e => e.type === 'page_crash').length;
    const jsExceptions = this.events.filter(e => e.type === 'js_exception').length;
    const networkErrors = this.events.filter(e => e.type === 'network_5xx' || e.type === 'network_timeout').length;
    const consoleErrors = this.events.filter(e => e.type === 'console_error').length;

    // 计算稳定性评分
    let stabilityScore = 100;
    stabilityScore -= criticalCount * 20;
    stabilityScore -= highCount * 10;
    stabilityScore -= mediumCount * 5;
    stabilityScore -= lowCount * 2;
    stabilityScore = Math.max(0, stabilityScore);

    const isStable = stabilityScore >= 80 && criticalCount === 0;

    // 生成建议
    const recommendations = this.generateRecommendations();

    return {
      runId: this.runId,
      url: this.page?.url() || '',
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      events: this.events,
      summary: {
        totalEvents: this.events.length,
        criticalCount,
        highCount,
        mediumCount,
        lowCount,
        pageCrashes,
        jsExceptions,
        networkErrors,
        consoleErrors,
        stabilityScore,
        isStable,
      },
      recommendations,
      artifacts: {
        screenshots: this.screenshots,
        logs: [],
      },
    };
  }

  /**
   * 生成修复建议
   */
  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.events.some(e => e.type === 'page_crash')) {
      recommendations.push('页面崩溃: 检查内存使用情况，避免无限循环或递归，确保异常被正确捕获');
    }

    if (this.events.some(e => e.type === 'js_exception')) {
      recommendations.push('JS 异常: 检查代码中的 null/undefined 引用，添加边界条件检查，使用 try-catch 包裹可能出错的代码');
    }

    if (this.events.some(e => e.type === 'network_5xx' || e.type === 'network_timeout')) {
      recommendations.push('网络错误: 检查后端服务稳定性，添加请求超时和重试机制，确保 API 有正确的错误处理');
    }

    if (this.events.some(e => e.type === 'console_error')) {
      recommendations.push('控制台错误: 检查前端日志输出，修复浏览器兼容性问题，确保资源加载正确');
    }

    if (this.events.some(e => e.type === 'white_screen')) {
      recommendations.push('白屏问题: 检查页面渲染逻辑，确保关键内容优先加载，添加加载状态指示器');
    }

    if (recommendations.length === 0) {
      recommendations.push('系统运行稳定，建议继续保持监控');
    }

    return recommendations;
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    this.isMonitoring = false;

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

    logger.info('🔚 崩溃检测器已关闭');
  }
}

/**
 * 快捷检测函数
 */
export async function runCrashDetection(
  url: string,
  config?: Partial<CrashDetectorConfig>,
  durationMs?: number,
): Promise<CrashDetectionResult> {
  const detector = new CrashDetector(config);
  try {
    await detector.initialize();
    return await detector.runCrashDetection(url, durationMs ?? 60000);
  } finally {
    await detector.close();
  }
}
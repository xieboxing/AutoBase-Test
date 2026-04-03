import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';

/**
 * 内存采样数据点
 */
export interface MemorySample {
  timestamp: string;
  actionName: string;
  actionIndex: number;
  usedJSHeapSize: number; // 已使用 JS 堆大小 (bytes)
  totalJSHeapSize: number; // 总 JS 堆大小 (bytes)
  jsHeapSizeLimit: number; // JS 堆大小限制 (bytes)
}

/**
 * 内存泄漏检测结果
 */
export interface MemoryLeakResult {
  runId: string;
  url: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  samples: MemorySample[];
  analysis: {
    hasLeak: boolean; // 是否存在内存泄漏
    leakRate: number; // 泄漏速率 (bytes/iteration)
    growthPercentage: number; // 内存增长百分比
    peakMemoryMB: number; // 峰值内存 MB
    initialMemoryMB: number; // 初始内存 MB
    finalMemoryMB: number; // 最终内存 MB
    recommendation: string; // 修复建议
  };
  timeline: {
    action: string;
    memoryDeltaMB: number; // 内存变化
    timestamp: string;
  }[];
}

/**
 * 内存泄漏测试器配置
 */
export interface MemoryLeakTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  iterationCount: number; // 重复操作次数，默认 50
  iterationDelay: number; // 每次操作间隔 ms
  leakThresholdMB: number; // 泄漏阈值 MB，默认 10MB
  growthThresholdPercent: number; // 增长百分比阈值，默认 20%
  artifactsDir: string;
  actionSequence?: MemoryLeakAction[]; // 自定义操作序列
}

/**
 * 内存泄漏测试操作
 */
export interface MemoryLeakAction {
  name: string;
  action: 'click' | 'navigate' | 'open-dialog' | 'close-dialog' | 'scroll' | 'custom';
  target?: string;
  value?: string;
}

/**
 * 默认配置
 */
const DEFAULT_MEMORY_LEAK_TESTER_CONFIG: MemoryLeakTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  iterationCount: 50,
  iterationDelay: 500,
  leakThresholdMB: 10,
  growthThresholdPercent: 20,
  artifactsDir: './data/screenshots/memory-leak',
};

/**
 * 内存泄漏检测器
 */
export class MemoryLeakTester {
  private config: MemoryLeakTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private runId: string;
  private samples: MemorySample[] = [];

  constructor(config: Partial<MemoryLeakTesterConfig> = {}) {
    this.config = { ...DEFAULT_MEMORY_LEAK_TESTER_CONFIG, ...config };
    this.runId = nanoid(8);
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    const screenshotDir = path.join(this.config.artifactsDir, this.runId);
    await fs.mkdir(screenshotDir, { recursive: true });

    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
    });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);

    logger.pass('✅ 内存泄漏检测器初始化完成', { runId: this.runId });
  }

  /**
   * 采集当前内存数据
   */
  private async collectMemorySample(actionName: string, actionIndex: number): Promise<MemorySample> {
    if (!this.page) {
      throw new Error('Page not initialized');
    }

    // 使用 Chrome 的 performance.memory API
    const memoryData = await this.page.evaluate(() => {
      // @ts-expect-error - Chrome specific API
      const memory = performance.memory;
      if (!memory) {
        return null;
      }
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
      };
    });

    if (!memoryData) {
      // 如果不支持 performance.memory，返回模拟数据
      logger.warn('⚠️ performance.memory API 不可用，使用模拟数据');
      return {
        timestamp: new Date().toISOString(),
        actionName,
        actionIndex,
        usedJSHeapSize: 0,
        totalJSHeapSize: 0,
        jsHeapSizeLimit: 0,
      };
    }

    const sample: MemorySample = {
      timestamp: new Date().toISOString(),
      actionName,
      actionIndex,
      usedJSHeapSize: memoryData.usedJSHeapSize,
      totalJSHeapSize: memoryData.totalJSHeapSize,
      jsHeapSizeLimit: memoryData.jsHeapSizeLimit,
    };

    this.samples.push(sample);
    return sample;
  }

  /**
   * 执行内存泄漏测试
   */
  async runMemoryLeakTest(url: string, actionSequence?: MemoryLeakAction[]): Promise<MemoryLeakResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = new Date();
    logger.step('📊 开始内存泄漏检测测试', {
      url,
      iterationCount: this.config.iterationCount,
      runId: this.runId,
    });

    // 导航到目标页面
    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForLoadState('networkidle').catch(() => {});

    // 采集初始内存
    await this.collectMemorySample('initial', 0);
    logger.perf('📊 初始内存', { memoryMB: this.bytesToMB(this.samples[0]!.usedJSHeapSize) });

    // 使用提供的操作序列或默认操作
    const actions = actionSequence || this.config.actionSequence || this.getDefaultActionSequence();

    // 重复执行操作序列
    for (let i = 1; i <= this.config.iterationCount; i++) {
      for (const action of actions) {
        await this.executeAction(action);
        await this.collectMemorySample(action.name, i);

        if (this.config.iterationDelay > 0) {
          await this.page!.waitForTimeout(this.config.iterationDelay);
        }
      }

      // 强制垃圾回收（如果可用）
      await this.forceGarbageCollection();

      if (i % 10 === 0) {
        const latestSample = this.samples[this.samples.length - 1];
        logger.step(`  📊 已完成 ${i}/${this.config.iterationCount} 次迭代`, {
          currentMemoryMB: this.bytesToMB(latestSample!.usedJSHeapSize),
        });
      }
    }

    const endTime = new Date();
    const result = this.buildResult(url, startTime, endTime);

    logger.perf('📊 内存泄漏检测完成', {
      hasLeak: result.analysis.hasLeak,
      growthPercentage: result.analysis.growthPercentage.toFixed(2) + '%',
      peakMemoryMB: result.analysis.peakMemoryMB.toFixed(2),
    });

    return result;
  }

  /**
   * 获取默认操作序列
   */
  private getDefaultActionSequence(): MemoryLeakAction[] {
    return [
      { name: 'scroll-down', action: 'scroll', value: 'down' },
      { name: 'scroll-up', action: 'scroll', value: 'up' },
    ];
  }

  /**
   * 执行单个操作
   */
  private async executeAction(action: MemoryLeakAction): Promise<void> {
    if (!this.page) return;

    switch (action.action) {
      case 'click':
        if (action.target) {
          await this.page.locator(action.target).click({ timeout: 5000 });
        }
        break;

      case 'navigate':
        if (action.target) {
          await this.page.goto(action.target, { waitUntil: 'domcontentloaded', timeout: 10000 });
        }
        break;

      case 'open-dialog':
        if (action.target) {
          await this.page.locator(action.target).click({ timeout: 5000 });
          await this.page.waitForTimeout(500);
        }
        break;

      case 'close-dialog':
        // 尝试多种关闭方式
        try {
          // 按 ESC 键
          await this.page.keyboard.press('Escape');
          await this.page.waitForTimeout(300);
        } catch {
          // 点击关闭按钮
          const closeButtons = await this.page.locator('[data-testid="close"], .close-btn, .modal-close, button[aria-label="Close"]').all();
          if (closeButtons.length > 0) {
            await closeButtons[0]!.click();
          }
        }
        break;

      case 'scroll':
        const direction = action.value === 'up' ? -300 : 300;
        await this.page.evaluate((amt) => {
          window.scrollBy(0, amt);
        }, direction);
        break;

      case 'custom':
        // 自定义操作可以由用户扩展
        break;
    }
  }

  /**
   * 强制垃圾回收
   */
  private async forceGarbageCollection(): Promise<void> {
    if (!this.page) return;

    // Chrome 可以通过 --expose-gc 启动参数启用手动 GC
    // 但默认情况下这个 API 不可用，所以这里只是尝试
    try {
      await this.page.evaluate(() => {
        if (typeof gc === 'function') {
          gc();
        }
      });
    } catch {
      // GC 不可用，忽略
    }

    // 即使 GC 不可用，等待一小段时间让浏览器有机会进行 GC
    await this.page.waitForTimeout(100);
  }

  /**
   * 字节转 MB
   */
  private bytesToMB(bytes: number): number {
    return bytes / (1024 * 1024);
  }

  /**
   * 分析内存数据，判断是否存在泄漏
   */
  private analyzeMemoryData(): MemoryLeakResult['analysis'] {
    if (this.samples.length < 2) {
      return {
        hasLeak: false,
        leakRate: 0,
        growthPercentage: 0,
        peakMemoryMB: 0,
        initialMemoryMB: 0,
        finalMemoryMB: 0,
        recommendation: '数据不足，无法分析',
      };
    }

    const initialMemory = this.samples[0]!.usedJSHeapSize;
    const finalMemory = this.samples[this.samples.length - 1]!.usedJSHeapSize;
    const peakMemory = Math.max(...this.samples.map(s => s.usedJSHeapSize));

    const initialMB = this.bytesToMB(initialMemory);
    const finalMB = this.bytesToMB(finalMemory);
    const peakMB = this.bytesToMB(peakMemory);

    // 计算增长百分比
    const growthPercentage = initialMemory > 0
      ? ((finalMemory - initialMemory) / initialMemory) * 100
      : 0;

    // 计算泄漏速率 (bytes/iteration)
    const iterationCount = this.config.iterationCount;
    const leakRate = (finalMemory - initialMemory) / iterationCount;

    // 判断是否存在泄漏
    const hasLeak = growthPercentage > this.config.growthThresholdPercent
      || (finalMB - initialMB) > this.config.leakThresholdMB;

    // 生成建议
    let recommendation: string;
    if (hasLeak) {
      recommendation = `检测到潜在内存泄漏：内存增长 ${growthPercentage.toFixed(2)}%，约 ${(finalMB - initialMB).toFixed(2)}MB。建议检查：1) 未清理的事件监听器；2) 未释放的闭包引用；3) 缓存数据未设置上限；4) DOM 元素未正确销毁。`;
    } else {
      recommendation = '内存使用稳定，未检测到明显泄漏。建议继续监控长时间运行场景。';
    }

    return {
      hasLeak,
      leakRate,
      growthPercentage,
      peakMemoryMB: peakMB,
      initialMemoryMB: initialMB,
      finalMemoryMB: finalMB,
      recommendation,
    };
  }

  /**
   * 构建时间线数据
   */
  private buildTimeline(): MemoryLeakResult['timeline'] {
    const timeline: MemoryLeakResult['timeline'] = [];

    for (let i = 1; i < this.samples.length; i++) {
      const prevSample = this.samples[i - 1]!;
      const currSample = this.samples[i]!;
      const delta = this.bytesToMB(currSample.usedJSHeapSize - prevSample.usedJSHeapSize);

      timeline.push({
        action: currSample.actionName,
        memoryDeltaMB: delta,
        timestamp: currSample.timestamp,
      });
    }

    return timeline;
  }

  /**
   * 构建测试结果
   */
  private buildResult(url: string, startTime: Date, endTime: Date): MemoryLeakResult {
    const analysis = this.analyzeMemoryData();
    const timeline = this.buildTimeline();

    return {
      runId: this.runId,
      url,
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      durationMs: endTime.getTime() - startTime.getTime(),
      samples: this.samples,
      analysis,
      timeline,
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
    logger.info('🔚 内存泄漏检测器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function runMemoryLeakTest(
  url: string,
  config?: Partial<MemoryLeakTesterConfig>,
  actionSequence?: MemoryLeakAction[],
): Promise<MemoryLeakResult> {
  const tester = new MemoryLeakTester(config);
  try {
    await tester.initialize();
    return await tester.runMemoryLeakTest(url, actionSequence);
  } finally {
    await tester.close();
  }
}
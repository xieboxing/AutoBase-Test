import { chromium, type Browser } from 'playwright';
import { logger } from '@/core/logger.js';
import { eventBus } from '@/core/event-bus.js';
import { devices, type DeviceConfig } from '@config/devices.config.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import type { PerformanceResult } from '@/types/test-result.types.js';

/**
 * 页面加载时间测试器配置
 */
export interface LoadTimeTesterConfig {
  url: string;
  urls?: string[];                     // 多个 URL 测试
  devices?: string[];                  // 设备名称列表
  timeout: number;
  headless: boolean;
  iterations: number;                  // 每个URL测试次数（取平均值）
  warmupIterations: number;            // 预热次数（不计入统计）
  artifactsDir: string;
  baseUrl?: string;
}

/**
 * 单个页面加载时间结果
 */
export interface PageLoadTimeResult {
  url: string;
  device: string;
  iteration: number;
  timings: NavigationTimings;
  timestamp: string;
}

/**
 * Navigation Timing API 数据
 */
export interface NavigationTimings {
  // 关键时间点
  dnsTime: number;          // DNS 查询时间 (ms)
  tcpTime: number;          // TCP 连接时间 (ms)
  sslTime: number;          // SSL/TLS 握手时间 (ms)
  ttfb: number;             // Time to First Byte (ms)
  domContentLoaded: number; // DOMContentLoaded 事件时间 (ms)
  domComplete: number;      // DOM 完全加载时间 (ms)
  loadEvent: number;        // Load 事件完成时间 (ms)

  // 计算值
  redirectTime: number;     // 重定向时间 (ms)
  requestTime: number;      // 请求响应时间 (ms)
  responseTime: number;     // 响应下载时间 (ms)
  domProcessingTime: number; // DOM 处理时间 (ms)
  totalLoadTime: number;    // 总加载时间 (ms)

  // 资源统计
  resourceCount: number;    // 资源数量
  totalResourceSize: number; // 总资源大小 (bytes)

  // 性能等级标记
  isSlow: boolean;          // 是否为慢页面 (> 3s)
  isVerySlow: boolean;      // 是否为非常慢页面 (> 5s)
}

/**
 * 页面加载时间汇总结果
 */
export interface LoadTimeSummaryResult {
  url: string;
  device: string;
  avgTimings: NavigationTimings;
  minTimings: NavigationTimings;
  maxTimings: NavigationTimings;
  stdDev: number;           // 标准差
  iterations: number;
  passRate: number;         // 加载时间 < 3s 的比例
}

/**
 * 默认配置
 */
const DEFAULT_LOAD_TIME_CONFIG: LoadTimeTesterConfig = {
  url: '',
  devices: ['Desktop'],
  timeout: 60000,
  headless: true,
  iterations: 3,
  warmupIterations: 1,
  artifactsDir: './data/screenshots/load-time',
};

/**
 * 页面加载时间测试器
 */
export class LoadTimeTester {
  protected config: LoadTimeTesterConfig;
  protected results: PageLoadTimeResult[] = [];
  protected summaries: LoadTimeSummaryResult[] = [];

  constructor(config: Partial<LoadTimeTesterConfig> & { url: string }) {
    this.config = { ...DEFAULT_LOAD_TIME_CONFIG, ...config };
  }

  /**
   * 运行测试
   */
  async run(): Promise<PerformanceResult> {
    const runId = nanoid(8);
    const startTime = new Date();

    logger.info('🚀 开始页面加载时间测试', { url: this.config.url, runId });
    eventBus.emit('test:start', { caseId: runId, name: 'load-time' });

    // 确保目录存在
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    // 获取要测试的 URL 列表
    const urls = this.config.urls || [this.config.url];

    // 获取设备配置
    const deviceConfigs = this.getDeviceConfigs();

    // 对每个 URL 和每个设备进行测试
    for (const url of urls) {
      for (const deviceConfig of deviceConfigs) {
        await this.testUrlOnDevice(url, deviceConfig, runId);
      }
    }

    // 计算汇总
    this.calculateSummaries();

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    eventBus.emit('test:complete', { caseId: runId, status: 'passed' });
    logger.info('📊 页面加载时间测试完成', { durationMs, resultsCount: this.results.length });

    return this.generatePerformanceResult(startTime, endTime);
  }

  /**
   * 获取设备配置列表
   */
  protected getDeviceConfigs(): DeviceConfig[] {
    const configs: DeviceConfig[] = [];

    if (this.config.devices?.includes('Desktop')) {
      configs.push({
        name: 'Desktop',
        viewport: { width: 1920, height: 1080 },
        userAgent: '',
        deviceScaleFactor: 1,
        isMobile: false,
        hasTouch: false,
      });
    }

    for (const deviceName of this.config.devices || []) {
      if (deviceName !== 'Desktop') {
        const deviceConfig = devices.find(d => d.name === deviceName);
        if (deviceConfig) {
          configs.push(deviceConfig);
        }
      }
    }

    return configs;
  }

  /**
   * 测试单个 URL 在特定设备上的加载时间
   */
  protected async testUrlOnDevice(
    url: string,
    deviceConfig: DeviceConfig,
    _runId: string,
  ): Promise<void> {
    const testLabel = `${url} on ${deviceConfig.name}`;
    logger.step(`📍 测试页面加载时间: ${testLabel}`);

    const browser = await chromium.launch({ headless: this.config.headless });

    for (let i = 0; i < this.config.warmupIterations; i++) {
      logger.step(`🔥 预热第 ${i + 1} 次`);
      await this.runSingleIteration(browser, url, deviceConfig, i, true);
    }

    for (let i = 0; i < this.config.iterations; i++) {
      logger.step(`📊 测试第 ${i + 1} 次`);
      const result = await this.runSingleIteration(browser, url, deviceConfig, i, false);
      if (result) {
        this.results.push(result);
      }
    }

    await browser.close();
  }

  /**
   * 运行单次测试
   */
  protected async runSingleIteration(
    browser: Browser,
    url: string,
    deviceConfig: DeviceConfig,
    iteration: number,
    isWarmup: boolean,
  ): Promise<PageLoadTimeResult | null> {
    try {
      const context = await browser.newContext({
        viewport: deviceConfig.viewport,
        userAgent: deviceConfig.userAgent || undefined,
        deviceScaleFactor: deviceConfig.deviceScaleFactor,
        isMobile: deviceConfig.isMobile,
        hasTouch: deviceConfig.hasTouch,
      });

      const page = await context.newPage();

      // 监听网络请求以统计资源
      const resources: { size: number; url: string }[] = [];
      page.on('response', response => {
        const resourceSize = response.headers()['content-length'];
        if (resourceSize) {
          resources.push({
            size: parseInt(resourceSize, 10),
            url: response.url(),
          });
        }
      });

      // 导航到页面并等待加载完成
      const fullUrl = this.config.baseUrl && !url.startsWith('http')
        ? new URL(url, this.config.baseUrl).toString()
        : url;

      await page.goto(fullUrl, {
        waitUntil: 'load',
        timeout: this.config.timeout,
      });

      // 获取 Navigation Timing API 数据
      const timings = await page.evaluate(() => {
        const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
        if (!perf) {
          return null;
        }

        const dnsTime = perf.domainLookupEnd - perf.domainLookupStart;
        const tcpTime = perf.connectEnd - perf.connectStart;
        const sslTime = perf.secureConnectionStart > 0 ? perf.connectEnd - perf.secureConnectionStart : 0;
        const ttfb = perf.responseStart - perf.requestStart;
        const domContentLoaded = perf.domContentLoadedEventEnd - perf.fetchStart;
        const domComplete = perf.domComplete - perf.fetchStart;
        const loadEvent = perf.loadEventEnd - perf.fetchStart;

        const redirectTime = perf.redirectEnd - perf.redirectStart;
        const requestTime = perf.responseStart - perf.requestStart;
        const responseTime = perf.responseEnd - perf.responseStart;
        const domProcessingTime = perf.domComplete - perf.domInteractive;
        const totalLoadTime = perf.loadEventEnd - perf.fetchStart;

        return {
          dnsTime,
          tcpTime,
          sslTime,
          ttfb,
          domContentLoaded,
          domComplete,
          loadEvent,
          redirectTime,
          requestTime,
          responseTime,
          domProcessingTime,
          totalLoadTime,
        };
      });

      // 获取资源数量
      const resourceCount = resources.length;
      const totalResourceSize = resources.reduce((sum, r) => sum + r.size, 0);

      await page.close();
      await context.close();

      if (!timings) {
        logger.warn(`⚠️ 无法获取 Navigation Timing 数据`);
        return null;
      }

      // 判断是否为慢页面
      const isSlow = timings.totalLoadTime > 3000;
      const isVerySlow = timings.totalLoadTime > 5000;

      const fullTimings: NavigationTimings = {
        ...timings,
        resourceCount,
        totalResourceSize,
        isSlow,
        isVerySlow,
      };

      if (!isWarmup) {
        logger.perf(`📊 加载时间: ${timings.totalLoadTime}ms`, fullTimings as unknown as Record<string, unknown>);
      }

      return {
        url,
        device: deviceConfig.name,
        iteration,
        timings: fullTimings,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail(`❌ 测试失败: ${errorMessage}`);
      return null;
    }
  }

  /**
   * 计算汇总结果
   */
  protected calculateSummaries(): void {
    // 按 URL 和设备分组
    const groups: Map<string, PageLoadTimeResult[]> = new Map();

    for (const result of this.results) {
      const key = `${result.url}|${result.device}`;
      const existing = groups.get(key) || [];
      existing.push(result);
      groups.set(key, existing);
    }

    // 计算每组的汇总
    for (const [key, groupResults] of groups) {
      const [url, device] = key.split('|') as [string, string];
      const timingsArray = groupResults.map(r => r.timings);

      const avgTimings = this.calculateAverageTimings(timingsArray);
      const minTimings = this.calculateMinTimings(timingsArray);
      const maxTimings = this.calculateMaxTimings(timingsArray);
      const stdDev = this.calculateStdDev(timingsArray.map(t => t.totalLoadTime));
      const passRate = timingsArray.filter(t => !t.isSlow).length / timingsArray.length;

      this.summaries.push({
        url,
        device,
        avgTimings,
        minTimings,
        maxTimings,
        stdDev,
        iterations: groupResults.length,
        passRate,
      });
    }
  }

  /**
   * 计算平均时间
   */
  protected calculateAverageTimings(timings: NavigationTimings[]): NavigationTimings {
    const count = timings.length;
    if (count === 0) return this.getEmptyTimings();

    const sum = timings.reduce((acc, t) => ({
      dnsTime: acc.dnsTime + t.dnsTime,
      tcpTime: acc.tcpTime + t.tcpTime,
      sslTime: acc.sslTime + t.sslTime,
      ttfb: acc.ttfb + t.ttfb,
      domContentLoaded: acc.domContentLoaded + t.domContentLoaded,
      domComplete: acc.domComplete + t.domComplete,
      loadEvent: acc.loadEvent + t.loadEvent,
      redirectTime: acc.redirectTime + t.redirectTime,
      requestTime: acc.requestTime + t.requestTime,
      responseTime: acc.responseTime + t.responseTime,
      domProcessingTime: acc.domProcessingTime + t.domProcessingTime,
      totalLoadTime: acc.totalLoadTime + t.totalLoadTime,
      resourceCount: acc.resourceCount + t.resourceCount,
      totalResourceSize: acc.totalResourceSize + t.totalResourceSize,
      isSlow: acc.isSlow || t.isSlow,
      isVerySlow: acc.isVerySlow || t.isVerySlow,
    }), this.getEmptyTimings());

    return {
      dnsTime: Math.round(sum.dnsTime / count),
      tcpTime: Math.round(sum.tcpTime / count),
      sslTime: Math.round(sum.sslTime / count),
      ttfb: Math.round(sum.ttfb / count),
      domContentLoaded: Math.round(sum.domContentLoaded / count),
      domComplete: Math.round(sum.domComplete / count),
      loadEvent: Math.round(sum.loadEvent / count),
      redirectTime: Math.round(sum.redirectTime / count),
      requestTime: Math.round(sum.requestTime / count),
      responseTime: Math.round(sum.responseTime / count),
      domProcessingTime: Math.round(sum.domProcessingTime / count),
      totalLoadTime: Math.round(sum.totalLoadTime / count),
      resourceCount: Math.round(sum.resourceCount / count),
      totalResourceSize: Math.round(sum.totalResourceSize / count),
      isSlow: sum.totalLoadTime / count > 3000,
      isVerySlow: sum.totalLoadTime / count > 5000,
    };
  }

  /**
   * 计算最小时间
   */
  protected calculateMinTimings(timings: NavigationTimings[]): NavigationTimings {
    if (timings.length === 0) return this.getEmptyTimings();

    return {
      dnsTime: Math.min(...timings.map(t => t.dnsTime)),
      tcpTime: Math.min(...timings.map(t => t.tcpTime)),
      sslTime: Math.min(...timings.map(t => t.sslTime)),
      ttfb: Math.min(...timings.map(t => t.ttfb)),
      domContentLoaded: Math.min(...timings.map(t => t.domContentLoaded)),
      domComplete: Math.min(...timings.map(t => t.domComplete)),
      loadEvent: Math.min(...timings.map(t => t.loadEvent)),
      redirectTime: Math.min(...timings.map(t => t.redirectTime)),
      requestTime: Math.min(...timings.map(t => t.requestTime)),
      responseTime: Math.min(...timings.map(t => t.responseTime)),
      domProcessingTime: Math.min(...timings.map(t => t.domProcessingTime)),
      totalLoadTime: Math.min(...timings.map(t => t.totalLoadTime)),
      resourceCount: Math.min(...timings.map(t => t.resourceCount)),
      totalResourceSize: Math.min(...timings.map(t => t.totalResourceSize)),
      isSlow: timings.some(t => t.isSlow),
      isVerySlow: timings.some(t => t.isVerySlow),
    };
  }

  /**
   * 计算最大时间
   */
  protected calculateMaxTimings(timings: NavigationTimings[]): NavigationTimings {
    if (timings.length === 0) return this.getEmptyTimings();

    return {
      dnsTime: Math.max(...timings.map(t => t.dnsTime)),
      tcpTime: Math.max(...timings.map(t => t.tcpTime)),
      sslTime: Math.max(...timings.map(t => t.sslTime)),
      ttfb: Math.max(...timings.map(t => t.ttfb)),
      domContentLoaded: Math.max(...timings.map(t => t.domContentLoaded)),
      domComplete: Math.max(...timings.map(t => t.domComplete)),
      loadEvent: Math.max(...timings.map(t => t.loadEvent)),
      redirectTime: Math.max(...timings.map(t => t.redirectTime)),
      requestTime: Math.max(...timings.map(t => t.requestTime)),
      responseTime: Math.max(...timings.map(t => t.responseTime)),
      domProcessingTime: Math.max(...timings.map(t => t.domProcessingTime)),
      totalLoadTime: Math.max(...timings.map(t => t.totalLoadTime)),
      resourceCount: Math.max(...timings.map(t => t.resourceCount)),
      totalResourceSize: Math.max(...timings.map(t => t.totalResourceSize)),
      isSlow: timings.every(t => t.isSlow),
      isVerySlow: timings.every(t => t.isVerySlow),
    };
  }

  /**
   * 计算标准差
   */
  protected calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;

    const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length;

    return Math.round(Math.sqrt(avgSquaredDiff));
  }

  /**
   * 获取空的时间数据
   */
  protected getEmptyTimings(): NavigationTimings {
    return {
      dnsTime: 0,
      tcpTime: 0,
      sslTime: 0,
      ttfb: 0,
      domContentLoaded: 0,
      domComplete: 0,
      loadEvent: 0,
      redirectTime: 0,
      requestTime: 0,
      responseTime: 0,
      domProcessingTime: 0,
      totalLoadTime: 0,
      resourceCount: 0,
      totalResourceSize: 0,
      isSlow: false,
      isVerySlow: false,
    };
  }

  /**
   * 生成 PerformanceResult
   */
  protected generatePerformanceResult(_startTime: Date, _endTime: Date): PerformanceResult {
    const total = this.summaries.length;
    const passed = this.summaries.filter(s => !s.avgTimings.isSlow).length;
    const failed = this.summaries.filter(s => s.avgTimings.isVerySlow).length;
    const skipped = 0;
    const blocked = 0;
    const passRate = total > 0 ? passed / total : 0;

    // 计算平均指标
    const avgTimings = this.calculateAverageTimings(this.summaries.map(s => s.avgTimings));

    return {
      total,
      passed,
      failed,
      skipped,
      blocked,
      passRate,
      avgDurationMs: avgTimings.totalLoadTime,
      metrics: {
        performanceScore: passRate * 100,
        lcp: avgTimings.domComplete,
        fcp: avgTimings.ttfb,
        cls: 0,
        tbt: 0,
        speedIndex: avgTimings.domContentLoaded,
        tti: avgTimings.loadEvent,
      },
    };
  }

  /**
   * 获取详细结果
   */
  getDetailedResults(): PageLoadTimeResult[] {
    return this.results;
  }

  /**
   * 获取汇总结果
   */
  getSummaries(): LoadTimeSummaryResult[] {
    return this.summaries;
  }

  /**
   * 生成报告摘要
   */
  getSummary(): string {
    const lines: string[] = [
      `# 页面加载时间测试报告`,
      ``,
      `## 概览`,
      `- 测试 URL 数量: ${this.summaries.length}`,
      `- 平均加载时间: ${this.calculateAverageTimings(this.summaries.map(s => s.avgTimings)).totalLoadTime}ms`,
      `- 慢页面数量 (>3s): ${this.summaries.filter(s => s.avgTimings.isSlow).length}`,
      `- 非常慢页面数量 (>5s): ${this.summaries.filter(s => s.avgTimings.isVerySlow).length}`,
      ``,
      `## 详细结果`,
    ];

    for (const summary of this.summaries) {
      lines.push(``);
      lines.push(`### ${summary.url} (${summary.device})`);
      lines.push(`- 平均加载时间: ${summary.avgTimings.totalLoadTime}ms`);
      lines.push(`- 最小加载时间: ${summary.minTimings.totalLoadTime}ms`);
      lines.push(`- 最大加载时间: ${summary.maxTimings.totalLoadTime}ms`);
      lines.push(`- 标准差: ${summary.stdDev}ms`);
      lines.push(`- 测试次数: ${summary.iterations}`);
      lines.push(`- 通过率 (<3s): ${Math.round(summary.passRate * 100)}%`);
      lines.push(`- DNS 时间: ${summary.avgTimings.dnsTime}ms`);
      lines.push(`- TCP 时间: ${summary.avgTimings.tcpTime}ms`);
      lines.push(`- SSL 时间: ${summary.avgTimings.sslTime}ms`);
      lines.push(`- TTFB: ${summary.avgTimings.ttfb}ms`);
      lines.push(`- DOMContentLoaded: ${summary.avgTimings.domContentLoaded}ms`);
      lines.push(`- 资源数量: ${summary.avgTimings.resourceCount}`);
      lines.push(`- 总资源大小: ${(summary.avgTimings.totalResourceSize / 1024).toFixed(2)}KB`);
    }

    return lines.join('\n');
  }

  /**
   * 生成瀑布图数据（可用于可视化）
   */
  getWaterfallData(): Map<string, NavigationTimings[]> {
    const waterfallData: Map<string, NavigationTimings[]> = new Map();

    for (const result of this.results) {
      const key = `${result.url}|${result.device}`;
      const existing = waterfallData.get(key) || [];
      existing.push(result.timings);
      waterfallData.set(key, existing);
    }

    return waterfallData;
  }
}

/**
 * 快捷执行函数
 */
export async function runLoadTimeTest(
  url: string,
  config?: Partial<LoadTimeTesterConfig>,
): Promise<PerformanceResult> {
  const tester = new LoadTimeTester({ url, ...config });
  return tester.run();
}
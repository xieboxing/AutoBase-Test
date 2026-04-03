import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';
import { logger } from '@/core/logger.js';
import { eventBus } from '@/core/event-bus.js';
import { devices, type DeviceConfig } from '@config/devices.config.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PerformanceResult } from '@/types/test-result.types.js';

/**
 * Lighthouse 结果类型
 */
type LighthouseResult = ReturnType<typeof lighthouse> extends Promise<infer T> ? T extends { lhr: infer R } ? R : never : never;

/**
 * Web 性能测试器配置
 */
export interface WebPerformanceConfig {
  url: string;
  devices?: string[];                    // 设备名称列表
  networkProfiles?: NetworkProfile[];    // 网络模拟配置
  timeout: number;
  headless: boolean;
  artifactsDir: string;
  onlyCategories?: ('performance' | 'accessibility' | 'best-practices' | 'seo')[];
}

/**
 * 网络模拟配置
 */
export interface NetworkProfile {
  name: string;
  download: number;    // Kbps
  upload: number;      // Kbps
  latency: number;     // ms
}

/**
 * 预设网络配置
 */
export const NETWORK_PROFILES: Record<string, NetworkProfile> = {
  '3g': {
    name: '3G',
    download: 1600,
    upload: 750,
    latency: 150,
  },
  'slow-3g': {
    name: 'Slow 3G',
    download: 400,
    upload: 200,
    latency: 300,
  },
  '4g': {
    name: '4G',
    download: 9000,
    upload: 3000,
    latency: 70,
  },
  'fast-3g': {
    name: 'Fast 3G',
    download: 1700,
    upload: 700,
    latency: 50,
  },
  'offline': {
    name: 'Offline',
    download: 0,
    upload: 0,
    latency: 0,
  },
};

/**
 * 默认网络配置
 */
const DEFAULT_NETWORK_PROFILES: NetworkProfile[] = [
  NETWORK_PROFILES['4g']!,
  NETWORK_PROFILES['3g']!,
];

/**
 * 单个设备/网络的性能测试结果
 */
export interface DevicePerformanceResult {
  device: string;
  network: string;
  metrics: PerformanceMetrics;
  opportunities: OptimizationOpportunity[];
  diagnostics: Diagnostic[];
  screenshot?: string;
}

/**
 * 性能指标
 */
export interface PerformanceMetrics {
  performanceScore: number;      // 0-100
  lcp: number;                   // Largest Contentful Paint (ms)
  fcp: number;                   // First Contentful Paint (ms
  cls: number;                   // Cumulative Layout Shift (0-1)
  tbt: number;                   // Total Blocking Time (ms)
  speedIndex: number;            // Speed Index (ms)
  tti: number;                   // Time to Interactive (ms)
  inp?: number;                  // Interaction to Next Paint (ms) - 替代 FID
  si: number;                    // Speed Index
  fmp?: number;                  // First Meaningful Paint (ms)
  /** @deprecated Use inp instead */
  fid?: number;                  // First Input Delay (ms) - 已废弃
}

/**
 * 优化建议
 */
export interface OptimizationOpportunity {
  id: string;
  title: string;
  description: string;
  savings: number;               // 预估节省时间 (ms)
  score: number;                 // 0-1
}

/**
 * 诊断信息
 */
export interface Diagnostic {
  id: string;
  title: string;
  description: string;
  score: number;                 // 0-1
  value?: number;
  unit?: string;
}

/**
 * Web 性能测试器
 */
export class WebPerformanceTester {
  protected config: WebPerformanceConfig;
  protected results: DevicePerformanceResult[] = [];

  constructor(config: Partial<WebPerformanceConfig> & { url: string }) {
    this.config = {
      devices: ['Desktop'],
      networkProfiles: DEFAULT_NETWORK_PROFILES,
      timeout: 60000,
      headless: true,
      artifactsDir: './data/screenshots/performance',
      onlyCategories: ['performance'],
      ...config,
    };
  }

  /**
   * 运行性能测试
   */
  async run(): Promise<PerformanceResult> {
    const runId = nanoid(8);
    const startTime = new Date();

    logger.info('🚀 开始 Web 性能测试', { url: this.config.url, runId });
    eventBus.emit('test:start', { caseId: runId, name: 'web-performance' });

    // 确保目录存在
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    // 获取设备配置
    const deviceConfigs = this.getDeviceConfigs();

    // 在每个设备和网络配置下测试
    for (const deviceConfig of deviceConfigs) {
      for (const networkProfile of this.config.networkProfiles || DEFAULT_NETWORK_PROFILES) {
        const result = await this.runLighthouseTest(deviceConfig, networkProfile, runId);
        if (result) {
          this.results.push(result);
        }
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    eventBus.emit('test:complete', { caseId: runId, status: 'passed' });
    logger.info('📊 Web 性能测试完成', { durationMs, resultsCount: this.results.length });

    // 生成汇总结果
    return this.generateSummaryResult(startTime, endTime);
  }

  /**
   * 获取设备配置列表
   */
  protected getDeviceConfigs(): DeviceConfig[] {
    const configs: DeviceConfig[] = [];

    // 添加桌面配置
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

    // 添加移动设备配置
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
   * 运行 Lighthouse 测试
   */
  protected async runLighthouseTest(
    deviceConfig: DeviceConfig,
    networkProfile: NetworkProfile,
    runId: string,
  ): Promise<DevicePerformanceResult | null> {
    const testLabel = `${deviceConfig.name}-${networkProfile.name}`;
    logger.step(`📍 性能测试: ${testLabel}`, { url: this.config.url });

    try {
      // 启动 Chrome
      const chrome = await chromeLauncher.launch({
        chromeFlags: [
          '--headless',
          '--disable-gpu',
          '--no-sandbox',
          '--disable-dev-shm-usage',
          `--window-size=${deviceConfig.viewport.width},${deviceConfig.viewport.height}`,
        ],
        logLevel: 'silent',
      });

      const port = chrome.port;

      // 配置 Lighthouse 选项
      const lighthouseOptions: Record<string, unknown> = {
        port,
        output: 'json',
        onlyCategories: this.config.onlyCategories,
        timeout: this.config.timeout,
        // 模拟设备
        emulation: {
          viewport: {
            width: deviceConfig.viewport.width,
            height: deviceConfig.viewport.height,
            deviceScaleFactor: deviceConfig.deviceScaleFactor,
          },
          userAgent: deviceConfig.userAgent || undefined,
          deviceScaleFactor: deviceConfig.deviceScaleFactor,
          mobile: deviceConfig.isMobile,
        },
        // 网络模拟
        throttling: {
          downloadThroughputKbps: networkProfile.download,
          uploadThroughputKbps: networkProfile.upload,
          rttMs: networkProfile.latency,
          cpuSlowdownMultiplier: deviceConfig.isMobile ? 4 : 1,
        },
      };

      // 运行 Lighthouse
      const runnerResult = await lighthouse(this.config.url, lighthouseOptions);

      // 关闭 Chrome
      await chrome.kill();

      if (!runnerResult) {
        logger.warn(`⚠️ Lighthouse 测试结果为空: ${testLabel}`);
        return null;
      }

      const lhr = runnerResult.lhr as LighthouseResult;

      // 提取性能指标
      const metrics = this.extractMetrics(lhr);
      const opportunities = this.extractOpportunities(lhr);
      const diagnostics = this.extractDiagnostics(lhr);

      // 保存截图
      const screenshot = await this.saveScreenshot(lhr, deviceConfig.name, networkProfile.name, runId);

      logger.perf(`📊 性能指标: ${testLabel}`, metrics as unknown as Record<string, unknown>);

      return {
        device: deviceConfig.name,
        network: networkProfile.name,
        metrics,
        opportunities,
        diagnostics,
        screenshot,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail(`❌ 性能测试失败: ${testLabel}`, { error: errorMessage });
      return null;
    }
  }

  /**
   * 提取性能指标
   */
  protected extractMetrics(lhr: LighthouseResult): PerformanceMetrics {
    const categories = lhr.categories;
    const audits = lhr.audits;

    // Performance Score
    const performanceScore = categories.performance?.score ?? 0;

    // Core Web Vitals
    const lcp = audits['largest-contentful-paint']?.numericValue ?? 0;
    const cls = audits['cumulative-layout-shift']?.numericValue ?? 0;
    const tbt = audits['total-blocking-time']?.numericValue ?? 0;
    const inp = audits['interaction-to-next-paint']?.numericValue ?? undefined;
    const fid = audits['first-input-delay']?.numericValue ?? undefined; // 已废弃但可能存在

    // 其他指标
    const fcp = audits['first-contentful-paint']?.numericValue ?? 0;
    const speedIndex = audits['speed-index']?.numericValue ?? 0;
    const tti = audits['interactive']?.numericValue ?? 0;
    const fmp = audits['first-meaningful-paint']?.numericValue ?? undefined;
    const si = speedIndex;

    return {
      performanceScore: Math.round(performanceScore * 100),
      lcp: Math.round(lcp),
      fcp: Math.round(fcp),
      cls: Math.round(cls * 100) / 100,
      tbt: Math.round(tbt),
      speedIndex: Math.round(speedIndex),
      tti: Math.round(tti),
      inp: inp ? Math.round(inp) : undefined,
      fid: fid ? Math.round(fid) : undefined,
      si: Math.round(si),
      fmp: fmp ? Math.round(fmp) : undefined,
    };
  }

  /**
   * 提取优化建议
   */
  protected extractOpportunities(lhr: LighthouseResult): OptimizationOpportunity[] {
    const audits = lhr.audits;
    const opportunities: OptimizationOpportunity[] = [];

    // 获取所有优化建议类型的 audit
    const opportunityIds = [
      'bootup-time',
      'mainthread-work-breakdown',
      'render-blocking-resources',
      'unused-javascript',
      'unused-css-rules',
      'unminified-javascript',
      'unminified-css',
      'uses-optimized-images',
      'uses-text-compression',
      'uses-responsive-images',
      'efficient-animated-content',
      'offscreen-images',
      'server-response-time',
      'redirects',
      'critical-request-chains',
      'dom-size',
      'long-tasks',
    ];

    for (const id of opportunityIds) {
      const audit = audits[id];
      if (audit && audit.details) {
        const savings = audit.numericValue ?? 0;
        const score = audit.score ?? 0;

        if (savings > 0 || score < 0.9) {
          opportunities.push({
            id,
            title: audit.title || id,
            description: audit.description || '',
            savings: Math.round(savings),
            score,
          });
        }
      }
    }

    // 按节省时间排序
    return opportunities.sort((a, b) => b.savings - a.savings);
  }

  /**
   * 提取诊断信息
   */
  protected extractDiagnostics(lhr: LighthouseResult): Diagnostic[] {
    const audits = lhr.audits;
    const diagnostics: Diagnostic[] = [];

    const diagnosticIds = [
      'performance-budget',
      'lcp-lazy-loaded',
      'layout-shifts',
      'long-tasks',
      'script-treemap-data',
      'dom-size',
      'total-byte-weight',
      'uses-long-cache-ttl',
    ];

    for (const id of diagnosticIds) {
      const audit = audits[id];
      if (audit && audit.score !== null && audit.score !== undefined) {
        diagnostics.push({
          id,
          title: audit.title || id,
          description: audit.description || '',
          score: audit.score,
          value: audit.numericValue,
          unit: audit.numericUnit,
        });
      }
    }

    return diagnostics;
  }

  /**
   * 保存截图
   */
  protected async saveScreenshot(
    lhr: LighthouseResult,
    deviceName: string,
    networkName: string,
    runId: string,
  ): Promise<string | undefined> {
    try {
      // Lighthouse 截图在 audits['screenshot-thumbnails'] 中
      const screenshotAudit = lhr.audits['screenshot-thumbnails'] as unknown as { details?: { items?: unknown[] } } | undefined;
      if (screenshotAudit?.details?.items && screenshotAudit.details.items.length > 0) {
        // 使用最终的截图
        const finalScreenshot = lhr.audits['final-screenshot'] as unknown as { details?: { data?: string } } | undefined;
        if (finalScreenshot?.details?.data) {
          const base64Data = finalScreenshot.details.data;
          const filename = `perf_${runId}_${deviceName}_${networkName}.png`;
          const filepath = path.join(this.config.artifactsDir, filename);

          // 移除 base64 头部
          const base64WithoutHeader = base64Data.replace(/^data:image\/\w+;base64,/, '');
          await fs.writeFile(filepath, base64WithoutHeader, 'base64');

          return filepath;
        }
      }
    } catch (error) {
      logger.warn(`⚠️ 保存截图失败`, { error: error instanceof Error ? error.message : String(error) });
    }

    return undefined;
  }

  /**
   * 生成汇总结果
   */
  protected generateSummaryResult(_startTime: Date, _endTime: Date): PerformanceResult {
    const total = this.results.length;
    const passed = this.results.filter(r => r.metrics.performanceScore >= 90).length;
    const failed = this.results.filter(r => r.metrics.performanceScore < 50).length;
    const skipped = 0;
    const blocked = 0;

    // 计算平均指标
    const avgMetrics = this.calculateAverageMetrics();

    const avgDurationMs = this.results.reduce((sum, r) => {
      // 使用 Lighthouse 的总时间作为参考
      return sum + (r.metrics.speedIndex || 0);
    }, 0);

    const passRate = total > 0 ? passed / total : 0;

    return {
      total,
      passed,
      failed,
      skipped,
      blocked,
      passRate,
      avgDurationMs,
      metrics: avgMetrics,
    };
  }

  /**
   * 计算平均指标
   */
  protected calculateAverageMetrics(): PerformanceResult['metrics'] {
    if (this.results.length === 0) {
      return {};
    }

    const sum = {
      performanceScore: 0,
      lcp: 0,
      fcp: 0,
      cls: 0,
      tbt: 0,
      speedIndex: 0,
      tti: 0,
      inp: 0,
    };

    let inpCount = 0;

    for (const result of this.results) {
      sum.performanceScore += result.metrics.performanceScore;
      sum.lcp += result.metrics.lcp;
      sum.fcp += result.metrics.fcp;
      sum.cls += result.metrics.cls;
      sum.tbt += result.metrics.tbt;
      sum.speedIndex += result.metrics.speedIndex;
      sum.tti += result.metrics.tti;
      if (result.metrics.inp !== undefined) {
        sum.inp += result.metrics.inp;
        inpCount++;
      }
    }

    const count = this.results.length;

    return {
      performanceScore: Math.round(sum.performanceScore / count),
      lcp: Math.round(sum.lcp / count),
      fcp: Math.round(sum.fcp / count),
      cls: Math.round((sum.cls / count) * 100) / 100,
      tbt: Math.round(sum.tbt / count),
      speedIndex: Math.round(sum.speedIndex / count),
      tti: Math.round(sum.tti / count),
      inp: inpCount > 0 ? Math.round(sum.inp / inpCount) : undefined,
    };
  }

  /**
   * 获取所有详细结果
   */
  getDetailedResults(): DevicePerformanceResult[] {
    return this.results;
  }

  /**
   * 获取性能报告摘要
   */
  getSummary(): string {
    const avgMetrics = this.calculateAverageMetrics();
    const bestResult = this.results.length > 0
      ? this.results.reduce((best, current) =>
          current.metrics.performanceScore > (best?.metrics.performanceScore ?? 0) ? current : best,
        this.results[0])
      : undefined;

    const worstResult = this.results.length > 0
      ? this.results.reduce((worst, current) =>
          current.metrics.performanceScore < (worst?.metrics.performanceScore ?? 100) ? current : worst,
        this.results[0])
      : undefined;

    const lines: string[] = [
      `# Web 性能测试报告`,
      ``,
      `## 概览`,
      `- 平均性能评分: ${avgMetrics.performanceScore ?? 0}/100`,
      `- 平均 LCP: ${avgMetrics.lcp ?? 0}ms`,
      `- 平均 FCP: ${avgMetrics.fcp ?? 0}ms`,
      `- 平均 CLS: ${avgMetrics.cls ?? 0}`,
      `- 平均 TBT: ${avgMetrics.tbt ?? 0}ms`,
      `- 平均 TTI: ${avgMetrics.tti ?? 0}ms`,
      `- 平均 Speed Index: ${avgMetrics.speedIndex ?? 0}ms`,
      ``,
      `## 最佳配置`,
      `- 设备: ${bestResult?.device || '-'}`,
      `- 网络: ${bestResult?.network || '-'}`,
      `- 性能评分: ${bestResult?.metrics.performanceScore ?? 0}/100`,
      ``,
      `## 最差配置`,
      `- 设备: ${worstResult?.device || '-'}`,
      `- 网络: ${worstResult?.network || '-'}`,
      `- 性能评分: ${worstResult?.metrics.performanceScore ?? 0}/100`,
      ``,
      `## 详细结果`,
    ];

    for (const result of this.results) {
      lines.push(``);
      lines.push(`### ${result.device} - ${result.network}`);
      lines.push(`- 性能评分: ${result.metrics.performanceScore}/100`);
      lines.push(`- LCP: ${result.metrics.lcp}ms`);
      lines.push(`- FCP: ${result.metrics.fcp}ms`);
      lines.push(`- CLS: ${result.metrics.cls}`);
      lines.push(`- TBT: ${result.metrics.tbt}ms`);
      lines.push(`- TTI: ${result.metrics.tti}ms`);

      if (result.opportunities.length > 0) {
        lines.push(``);
        lines.push(`**优化建议**:`);
        for (const op of result.opportunities.slice(0, 5)) {
          lines.push(`- ${op.title}: 预估节省 ${op.savings}ms`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * 快捷执行函数
 */
export async function runWebPerformanceTest(
  url: string,
  config?: Partial<WebPerformanceConfig>,
): Promise<PerformanceResult> {
  const tester = new WebPerformanceTester({ url, ...config });
  return tester.run();
}

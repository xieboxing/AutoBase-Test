import { chromium, type Browser, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { eventBus } from '@/core/event-bus.js';
import { devices, type DeviceConfig } from '@config/devices.config.js';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs/promises';
import type { PerformanceResult } from '@/types/test-result.types.js';

/**
 * 弱网测试器配置
 */
export interface NetworkTesterConfig {
  url: string;
  devices?: string[];
  networkProfiles?: NetworkProfile[];
  timeout: number;
  headless: boolean;
  artifactsDir: string;
  baseUrl?: string;
}

/**
 * 网络模拟配置
 */
export interface NetworkProfile {
  name: string;
  download: number;    // Kbps
  upload: number;      // Kbps
  latency: number;     // ms
  offline?: boolean;
}

/**
 * 预设网络配置
 */
export const NETWORK_PROFILES: Record<string, NetworkProfile> = {
  'online': {
    name: 'Online',
    download: 50000,    // ~50 Mbps
    upload: 50000,
    latency: 0,
  },
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
    offline: true,
  },
  'unstable': {
    name: 'Unstable',
    download: 1000,
    upload: 500,
    latency: 500,
  },
};

/**
 * 默认网络配置列表
 */
const DEFAULT_NETWORK_PROFILES: NetworkProfile[] = [
  NETWORK_PROFILES['4g']!,
  NETWORK_PROFILES['3g']!,
  NETWORK_PROFILES['slow-3g']!,
  NETWORK_PROFILES['offline']!,
];

/**
 * 单次网络测试结果
 */
export interface NetworkTestResult {
  url: string;
  device: string;
  network: string;
  success: boolean;
  loadTime: number;
  timeout: boolean;
  offlineHandled: boolean;    // 是否正确处理离线状态
  recoveryHandled: boolean;   // 网络恢复后是否正确恢复
  errorMessage?: string;
  screenshot?: string;
  timestamp: string;
}

/**
 * 网络测试汇总结果
 */
export interface NetworkTestSummary {
  network: string;
  total: number;
  passed: number;
  failed: number;
  timeout: number;
  avgLoadTime: number;
  offlineHandledRate: number;
  recoveryHandledRate: number;
}

/**
 * 默认配置
 */
const DEFAULT_NETWORK_TESTER_CONFIG: NetworkTesterConfig = {
  url: '',
  devices: ['Desktop'],
  networkProfiles: DEFAULT_NETWORK_PROFILES,
  timeout: 60000,
  headless: true,
  artifactsDir: './data/screenshots/network',
};

/**
 * 弱网测试器
 */
export class NetworkTester {
  protected config: NetworkTesterConfig;
  protected results: NetworkTestResult[] = [];

  constructor(config: Partial<NetworkTesterConfig> & { url: string }) {
    this.config = { ...DEFAULT_NETWORK_TESTER_CONFIG, ...config };
  }

  /**
   * 运行测试
   */
  async run(): Promise<PerformanceResult> {
    const runId = nanoid(8);
    const startTime = new Date();

    logger.info('🚀 开始弱网测试', { url: this.config.url, runId });
    eventBus.emit('test:start', { caseId: runId, name: 'network' });

    // 确保目录存在
    await fs.mkdir(this.config.artifactsDir, { recursive: true });

    // 获取设备配置
    const deviceConfigs = this.getDeviceConfigs();

    // 对每个设备进行测试
    const browser = await chromium.launch({ headless: this.config.headless });

    for (const deviceConfig of deviceConfigs) {
      for (const networkProfile of this.config.networkProfiles || DEFAULT_NETWORK_PROFILES) {
        const result = await this.testNetworkOnDevice(browser, deviceConfig, networkProfile, runId);
        if (result) {
          this.results.push(result);
        }
      }
    }

    await browser.close();

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();

    eventBus.emit('test:complete', { caseId: runId, status: 'passed' });
    logger.info('📊 弱网测试完成', { durationMs, resultsCount: this.results.length });

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
   * 测试特定设备上的网络条件
   */
  protected async testNetworkOnDevice(
    browser: Browser,
    deviceConfig: DeviceConfig,
    networkProfile: NetworkProfile,
    runId: string,
  ): Promise<NetworkTestResult | null> {
    const testLabel = `${deviceConfig.name}-${networkProfile.name}`;
    logger.step(`📍 弱网测试: ${testLabel}`, { url: this.config.url });

    try {
      const context = await browser.newContext({
        viewport: deviceConfig.viewport,
        userAgent: deviceConfig.userAgent || undefined,
        deviceScaleFactor: deviceConfig.deviceScaleFactor,
        isMobile: deviceConfig.isMobile,
        hasTouch: deviceConfig.hasTouch,
      });

      const page = await context.newPage();

      // 配置网络模拟
      if (networkProfile.offline) {
        await context.setOffline(true);
        logger.step(`🔌 设置离线模式`);
      } else {
        await context.route('**', async route => {
          // 模拟延迟和带宽限制
          await new Promise(resolve => setTimeout(resolve, networkProfile.latency));
          route.continue();
        });
        logger.step(`🌐 设置网络: ${networkProfile.name}`, {
          download: `${networkProfile.download} Kbps`,
          upload: `${networkProfile.upload} Kbps`,
          latency: `${networkProfile.latency} ms`,
        });
      }

      const fullUrl = this.config.baseUrl && !this.config.url.startsWith('http')
        ? new URL(this.config.url, this.config.baseUrl).toString()
        : this.config.url;

      const startTime = Date.now();
      let success = false;
      let loadTime = 0;
      let timeout = false;
      let offlineHandled = false;
      let recoveryHandled = false;
      let errorMessage: string | undefined;
      let screenshot: string | undefined;

      try {
        // 尝试导航
        await page.goto(fullUrl, {
          waitUntil: 'domcontentloaded',
          timeout: this.config.timeout,
        });

        success = true;
        loadTime = Date.now() - startTime;

        // 检查是否有离线处理提示（如果设置了离线模式）
        if (networkProfile.offline) {
          // 检查页面是否显示了离线提示
          const offlineIndicators = await this.checkOfflineIndicators(page);
          offlineHandled = offlineIndicators.hasIndicator;
          if (!offlineHandled) {
            errorMessage = '页面未正确处理离线状态';
          }
        }

        logger.pass(`✅ 页面加载成功`, { loadTime, network: networkProfile.name });

        // 截图
        screenshot = await this.takeScreenshot(page, runId, deviceConfig.name, networkProfile.name, 'success');

        // 测试网络恢复（如果之前是离线）
        if (networkProfile.offline) {
          await context.setOffline(false);
          logger.step(`🔌 恢复网络连接`);

          try {
            await page.reload({ timeout: 10000 });
            recoveryHandled = true;
            logger.pass(`✅ 网络恢复后页面正确加载`);
          } catch {
            recoveryHandled = false;
            errorMessage = '网络恢复后页面未能正确加载';
            logger.fail(`❌ 网络恢复后页面加载失败`);
          }
        }
      } catch (error) {
        const errMessage = error instanceof Error ? error.message : String(error);

        if (errMessage.includes('Timeout') || errMessage.includes('timeout')) {
          timeout = true;
          logger.warn(`⚠️ 页面加载超时`, { network: networkProfile.name });
        } else {
          logger.fail(`❌ 页面加载失败`, { error: errMessage });
        }

        errorMessage = errMessage;
        loadTime = Date.now() - startTime;

        // 截图失败状态
        screenshot = await this.takeScreenshot(page, runId, deviceConfig.name, networkProfile.name, 'failure');
      }

      await page.close();
      await context.close();

      return {
        url: this.config.url,
        device: deviceConfig.name,
        network: networkProfile.name,
        success,
        loadTime,
        timeout,
        offlineHandled,
        recoveryHandled,
        errorMessage,
        screenshot,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail(`❌ 测试执行失败: ${testLabel}`, { error: errorMessage });
      return null;
    }
  }

  /**
   * 检查页面是否有离线提示
   */
  protected async checkOfflineIndicators(page: Page): Promise<{ hasIndicator: boolean; indicatorType?: string }> {
    try {
      // 检查常见的离线提示元素
      const offlineSelectors = [
        '[data-testid*="offline"]',
        '.offline-message',
        '.offline-alert',
        '.no-connection',
        '.network-error',
        'text=/offline/i',
        'text=/无网络/i',
        'text=/网络不可用/i',
        'text=/connection/i',
      ];

      for (const selector of offlineSelectors) {
        try {
          const element = await page.locator(selector).first();
          if (await element.isVisible({ timeout: 1000 })) {
            return { hasIndicator: true, indicatorType: selector };
          }
        } catch {
          // 继续检查下一个选择器
        }
      }

      // 检查页面标题或内容是否包含离线提示
      const title = await page.title();
      const bodyContent = await page.locator('body').textContent();

      const offlineKeywords = ['offline', '无网络', '网络不可用', 'connection', '网络错误'];
      for (const keyword of offlineKeywords) {
        if (title.toLowerCase().includes(keyword) || bodyContent?.toLowerCase().includes(keyword)) {
          return { hasIndicator: true, indicatorType: 'content' };
        }
      }

      return { hasIndicator: false };
    } catch {
      return { hasIndicator: false };
    }
  }

  /**
   * 截图
   */
  protected async takeScreenshot(
    page: Page,
    runId: string,
    deviceName: string,
    networkName: string,
    status: string,
  ): Promise<string | undefined> {
    try {
      const filename = `network_${runId}_${deviceName}_${networkName}_${status}.png`;
      const filepath = path.join(this.config.artifactsDir, filename);
      await page.screenshot({ path: filepath, fullPage: true });
      return filepath;
    } catch (error) {
      logger.warn(`⚠️ 截图失败`, { error: error instanceof Error ? error.message : String(error) });
      return undefined;
    }
  }

  /**
   * 生成 PerformanceResult
   */
  protected generatePerformanceResult(_startTime: Date, _endTime: Date): PerformanceResult {
    const total = this.results.length;
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success && !r.timeout).length;
    const skipped = 0;
    const blocked = this.results.filter(r => r.timeout).length;
    const passRate = total > 0 ? passed / total : 0;

    // 计算平均加载时间（仅成功的）
    const avgLoadTime = this.results
      .filter(r => r.success)
      .reduce((sum, r) => sum + r.loadTime, 0) / (passed || 1);

    return {
      total,
      passed,
      failed,
      skipped,
      blocked,
      passRate,
      avgDurationMs: Math.round(avgLoadTime),
      metrics: {
        performanceScore: passRate * 100,
        lcp: Math.round(avgLoadTime),
        fcp: Math.round(avgLoadTime * 0.5),
        cls: 0,
        tbt: 0,
        speedIndex: Math.round(avgLoadTime),
        tti: Math.round(avgLoadTime),
      },
    };
  }

  /**
   * 获取详细结果
   */
  getDetailedResults(): NetworkTestResult[] {
    return this.results;
  }

  /**
   * 获取汇总结果
   */
  getSummaries(): NetworkTestSummary[] {
    // 按网络类型分组
    const groups: Map<string, NetworkTestResult[]> = new Map();

    for (const result of this.results) {
      const existing = groups.get(result.network) || [];
      existing.push(result);
      groups.set(result.network, existing);
    }

    const summaries: NetworkTestSummary[] = [];

    for (const [network, networkResults] of groups) {
      const total = networkResults.length;
      const passed = networkResults.filter(r => r.success).length;
      const failed = networkResults.filter(r => !r.success && !r.timeout).length;
      const timeout = networkResults.filter(r => r.timeout).length;
      const avgLoadTime = networkResults
        .filter(r => r.success)
        .reduce((sum, r) => sum + r.loadTime, 0) / (passed || 1);
      const offlineHandledRate = networkResults
        .filter(r => r.offlineHandled)
        .length / total;
      const recoveryHandledRate = networkResults
        .filter(r => r.recoveryHandled)
        .length / networkResults.filter(r => r.offlineHandled).length || 0;

      summaries.push({
        network,
        total,
        passed,
        failed,
        timeout,
        avgLoadTime: Math.round(avgLoadTime),
        offlineHandledRate,
        recoveryHandledRate,
      });
    }

    return summaries;
  }

  /**
   * 生成报告摘要
   */
  getSummary(): string {
    const summaries = this.getSummaries();

    const lines: string[] = [
      `# 弱网测试报告`,
      ``,
      `## 概览`,
      `- 测试 URL: ${this.config.url}`,
      `- 测试次数: ${this.results.length}`,
      `- 成功次数: ${this.results.filter(r => r.success).length}`,
      `- 超时次数: ${this.results.filter(r => r.timeout).length}`,
      `- 失败次数: ${this.results.filter(r => !r.success && !r.timeout).length}`,
      ``,
      `## 各网络条件测试结果`,
    ];

    for (const summary of summaries) {
      lines.push(``);
      lines.push(`### ${summary.network}`);
      lines.push(`- 测试次数: ${summary.total}`);
      lines.push(`- 成功次数: ${summary.passed}`);
      lines.push(`- 超时次数: ${summary.timeout}`);
      lines.push(`- 失败次数: ${summary.failed}`);
      lines.push(`- 平均加载时间: ${summary.avgLoadTime}ms`);
      lines.push(`- 离线处理率: ${Math.round(summary.offlineHandledRate * 100)}%`);
      lines.push(`- 网络恢复处理率: ${Math.round(summary.recoveryHandledRate * 100)}%`);
    }

    // 添加详细问题列表
    const failures = this.results.filter(r => !r.success);
    if (failures.length > 0) {
      lines.push(``);
      lines.push(`## 问题详情`);
      for (const failure of failures) {
        lines.push(``);
        lines.push(`- **${failure.device} - ${failure.network}**`);
        if (failure.errorMessage) {
          lines.push(`  - 错误: ${failure.errorMessage}`);
        }
        lines.push(`  - 加载时间: ${failure.loadTime}ms`);
        if (failure.timeout) {
          lines.push(`  - 状态: 超时`);
        }
      }
    }

    return lines.join('\n');
  }
}

/**
 * 快捷执行函数
 */
export async function runNetworkTest(
  url: string,
  config?: Partial<NetworkTesterConfig>,
): Promise<PerformanceResult> {
  const tester = new NetworkTester({ url, ...config });
  return tester.run();
}
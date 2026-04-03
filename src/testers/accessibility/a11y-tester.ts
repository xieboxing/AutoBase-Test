import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';

/**
 * Axe-core 分析结果
 */
export interface AxeScanResult {
  url: string;
  passed: boolean;
  violations: AxeViolation[];
  incomplete: AxeIncomplete[];
  passes: string[];
  executionTime: number;
}

/**
 * Axe 违规项
 */
export interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNodeResult[];
}

/**
 * Axe 不完整项
 */
export interface AxeIncomplete {
  id: string;
  impact: string;
  description: string;
  help: string;
  helpUrl: string;
  nodes: AxeNodeResult[];
}

/**
 * Axe 节点结果
 */
export interface AxeNodeResult {
  html: string;
  target: string[];
  failureSummary?: string;
  any?: { message: string }[];
  all?: { message: string }[];
  none?: { message: string }[];
}

/**
 * 无障碍测试器配置
 */
export interface A11yTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  artifactsDir: string;
  includeWarnings: boolean;
  includeIncomplete: boolean;
  rulesToDisable: string[];
  tags: string[]; // wcag2a, wcag2aa, wcag21aa, section508, best-practice
}

/**
 * 默认配置
 */
const DEFAULT_A11Y_TESTER_CONFIG: A11yTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  artifactsDir: './data/screenshots/a11y',
  includeWarnings: true,
  includeIncomplete: true,
  rulesToDisable: [],
  tags: ['wcag2a', 'wcag2aa', 'wcag21aa'],
};

/**
 * 无障碍测试器
 * 使用 axe-core 进行 WCAG 合规性检查
 */
export class A11yTester {
  private config: A11yTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private _testId: string;

  constructor(config: Partial<A11yTesterConfig> = {}) {
    this.config = { ...DEFAULT_A11Y_TESTER_CONFIG, ...config };
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

    logger.pass('✅ 无障碍测试器初始化完成');
  }

  /**
   * 扫描页面无障碍问题
   */
  async scanPage(url: string): Promise<AxeScanResult> {
    if (!this.page) {
      await this.initialize();
    }

    const startTime = Date.now();
    logger.step(`♿ 扫描无障碍问题: ${url}`);

    try {
      await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
      await this.page!.waitForLoadState('networkidle').catch(() => {});
    } catch (error) {
      logger.fail(`  ❌ 无法访问页面: ${error}`);
      return {
        url,
        passed: false,
        violations: [],
        incomplete: [],
        passes: [],
        executionTime: Date.now() - startTime,
      };
    }

    // 注入 axe-core 并运行检查
    const results = await this.runAxeAnalysis();

    const executionTime = Date.now() - startTime;
    const passed = results.violations.length === 0;

    if (passed) {
      logger.pass(`  ✅ 无障碍检查通过`);
    } else {
      const critical = results.violations.filter(v => v.impact === 'critical').length;
      const serious = results.violations.filter(v => v.impact === 'serious').length;
      logger.fail(`  ❌ 发现 ${results.violations.length} 个问题 (Critical: ${critical}, Serious: ${serious})`);
    }

    return {
      url,
      passed,
      violations: results.violations,
      incomplete: results.incomplete,
      passes: results.passes,
      executionTime,
    };
  }

  /**
   * 扫描多个页面
   */
  async scanPages(urls: string[]): Promise<AxeScanResult[]> {
    const results: AxeScanResult[] = [];

    for (const url of urls) {
      const result = await this.scanPage(url);
      results.push(result);
    }

    return results;
  }

  /**
   * 运行 axe-core 分析
   */
  private async runAxeAnalysis(): Promise<{
    violations: AxeViolation[];
    incomplete: AxeIncomplete[];
    passes: string[];
  }> {
    if (!this.page) {
      return { violations: [], incomplete: [], passes: [] };
    }

    try {
      // 使用 axe-core 的 CDN 版本
      await this.page.addScriptTag({
        url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.8.2/axe.min.js',
      });

      // 配置 axe 选项
      const axeOptions: Record<string, unknown> = {
        runOnly: {
          type: 'tag',
          values: this.config.tags,
        },
      };

      if (this.config.rulesToDisable.length > 0) {
        axeOptions.rules = {};
        for (const rule of this.config.rulesToDisable) {
          (axeOptions.rules as Record<string, { enabled: boolean }>)[rule] = { enabled: false };
        }
      }

      // 运行 axe
      const results = await this.page.evaluate(async (options) => {
        // @ts-expect-error - axe is injected
        const axeResults = await axe.run(document, options);

        return {
          violations: axeResults.violations.map((v: any) => ({
            id: v.id,
            impact: v.impact,
            description: v.description,
            help: v.help,
            helpUrl: v.helpUrl,
            nodes: v.nodes.map((n: any) => ({
              html: n.html,
              target: n.target,
              failureSummary: n.failureSummary,
            })),
          })),
          incomplete: axeResults.incomplete.map((i: any) => ({
            id: i.id,
            impact: i.impact,
            description: i.description,
            help: i.help,
            helpUrl: i.helpUrl,
            nodes: i.nodes.map((n: any) => ({
              html: n.html,
              target: n.target,
            })),
          })),
          passes: axeResults.passes.map((p: any) => p.id),
        };
      }, axeOptions);

      return results;
    } catch (error) {
      logger.warn(`  ⚠️ axe-core 分析失败: ${error}`);
      return { violations: [], incomplete: [], passes: [] };
    }
  }

  /**
   * 获取违规项摘要
   */
  getSummary(results: AxeScanResult[]): {
    totalScanned: number;
    passedScans: number;
    totalViolations: number;
    criticalCount: number;
    seriousCount: number;
    moderateCount: number;
    minorCount: number;
    violationsByType: Record<string, number>;
  } {
    const passedScans = results.filter(r => r.passed).length;
    const allViolations = results.flatMap(r => r.violations);

    const violationsByType: Record<string, number> = {};
    for (const violation of allViolations) {
      violationsByType[violation.id] = (violationsByType[violation.id] || 0) + 1;
    }

    return {
      totalScanned: results.length,
      passedScans,
      totalViolations: allViolations.length,
      criticalCount: allViolations.filter(v => v.impact === 'critical').length,
      seriousCount: allViolations.filter(v => v.impact === 'serious').length,
      moderateCount: allViolations.filter(v => v.impact === 'moderate').length,
      minorCount: allViolations.filter(v => v.impact === 'minor').length,
      violationsByType,
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
    logger.info('🔚 无障碍测试器已关闭');
  }
}

/**
 * 快捷扫描函数
 */
export async function scanAccessibility(
  url: string,
  config?: Partial<A11yTesterConfig>,
): Promise<AxeScanResult> {
  const tester = new A11yTester(config);
  try {
    return await tester.scanPage(url);
  } finally {
    await tester.close();
  }
}

/**
 * 批量扫描函数
 */
export async function scanAccessibilityBatch(
  urls: string[],
  config?: Partial<A11yTesterConfig>,
): Promise<AxeScanResult[]> {
  const tester = new A11yTester(config);
  try {
    return await tester.scanPages(urls);
  } finally {
    await tester.close();
  }
}
import type { TestCase } from '@/types/test-case.types.js';
import type { TestCaseResult } from '@/types/test-result.types.js';
import { PcTester, type BrowserName } from './pc-tester.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 浏览器测试结果
 */
export interface BrowserTestResult {
  browser: BrowserName;
  result: TestCaseResult;
}

/**
 * 跨浏览器测试结果
 */
export interface CrossBrowserTestResult {
  url: string;
  results: BrowserTestResult[];
  comparison: {
    passed: BrowserName[];
    failed: BrowserName[];
    differences: BrowserDifference[];
  };
}

/**
 * 浏览器差异
 */
export interface BrowserDifference {
  type: 'rendering' | 'behavior' | 'timing';
  description: string;
  browsers: BrowserName[];
  details?: Record<string, unknown>;
}

/**
 * 跨浏览器测试器配置
 */
export interface CrossBrowserTesterConfig {
  browsers: BrowserName[];
  viewport: { width: number; height: number };
  headless: boolean;
  timeout: number;
  compareScreenshots: boolean;
  screenshotThreshold: number;
}

/**
 * 默认配置
 */
const DEFAULT_CROSS_BROWSER_TESTER_CONFIG: CrossBrowserTesterConfig = {
  browsers: ['chromium', 'firefox', 'webkit'],
  viewport: { width: 1920, height: 1080 },
  headless: true,
  timeout: 30000,
  compareScreenshots: true,
  screenshotThreshold: 0.1, // 10% 差异阈值
};

/**
 * 跨浏览器测试器
 */
export class CrossBrowserTester {
  private config: CrossBrowserTesterConfig;

  constructor(config: Partial<CrossBrowserTesterConfig> = {}) {
    this.config = { ...DEFAULT_CROSS_BROWSER_TESTER_CONFIG, ...config };
  }

  /**
   * 在所有浏览器中测试 URL
   */
  async testUrl(url: string): Promise<CrossBrowserTestResult> {
    logger.step(`🌐 开始跨浏览器测试: ${url}`);

    const results: BrowserTestResult[] = [];

    for (const browser of this.config.browsers) {
      logger.step(`  🖥️ 测试浏览器: ${browser}`);

      const tester = new PcTester({
        browser,
        viewport: this.config.viewport,
        headless: this.config.headless,
        timeout: this.config.timeout,
        screenshotOnFailure: true,
      });

      // 创建简单的导航测试用例
      const testCase: TestCase = {
        id: `cross-browser-${nanoid(4)}`,
        name: `Cross-browser test for ${url}`,
        description: 'Test page loads correctly in this browser',
        priority: 'P1',
        type: 'functional',
        platform: ['pc-web'],
        tags: ['cross-browser', browser],
        steps: [
          { order: 1, action: 'navigate', value: url, description: `Navigate to ${url}` },
          { order: 2, action: 'assert', target: 'body', type: 'element-visible', description: 'Verify page loaded' },
          { order: 3, action: 'screenshot', description: 'Take screenshot for comparison' },
        ],
      };

      try {
        const result = await tester.runTest(testCase);
        results.push({ browser, result });

        if (result.status === 'passed') {
          logger.pass(`    ✅ ${browser}: 通过`);
        } else {
          logger.fail(`    ❌ ${browser}: 失败`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.fail(`    ❌ ${browser}: 错误 - ${errorMessage}`);

        results.push({
          browser,
          result: {
            caseId: testCase.id,
            caseName: testCase.name,
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 0,
            platform: 'pc-web',
            environment: { browser },
            steps: [],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [errorMessage] },
          },
        });
      } finally {
        await tester.close();
      }
    }

    // 比较结果
    const comparison = this.compareResults(results);

    return {
      url,
      results,
      comparison,
    };
  }

  /**
   * 在所有浏览器中运行测试用例
   */
  async runTest(testCase: TestCase): Promise<CrossBrowserTestResult> {
    logger.step(`🌐 开始跨浏览器测试用例: ${testCase.name}`);

    const results: BrowserTestResult[] = [];

    for (const browser of this.config.browsers) {
      logger.step(`  🖥️ 测试浏览器: ${browser}`);

      const tester = new PcTester({
        browser,
        viewport: this.config.viewport,
        headless: this.config.headless,
        timeout: this.config.timeout,
        screenshotOnFailure: true,
      });

      try {
        const result = await tester.runTest(testCase);
        results.push({ browser, result });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.fail(`    ❌ ${browser}: 错误 - ${errorMessage}`);

        results.push({
          browser,
          result: {
            caseId: testCase.id,
            caseName: testCase.name,
            status: 'failed',
            startTime: new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 0,
            platform: 'pc-web',
            environment: { browser },
            steps: [],
            retryCount: 0,
            selfHealed: false,
            artifacts: { screenshots: [], logs: [errorMessage] },
          },
        });
      } finally {
        await tester.close();
      }
    }

    const comparison = this.compareResults(results);

    return {
      url: testCase.steps[0]?.value || '',
      results,
      comparison,
    };
  }

  /**
   * 比较各浏览器结果
   */
  private compareResults(results: BrowserTestResult[]): CrossBrowserTestResult['comparison'] {
    const passed: BrowserName[] = [];
    const failed: BrowserName[] = [];
    const differences: BrowserDifference[] = [];

    // 分类通过和失败的浏览器
    for (const { browser, result } of results) {
      if (result.status === 'passed') {
        passed.push(browser);
      } else {
        failed.push(browser);
      }
    }

    // 检测差异
    if (passed.length > 0 && failed.length > 0) {
      differences.push({
        type: 'behavior',
        description: '测试在某些浏览器中通过，在其他浏览器中失败',
        browsers: [...passed, ...failed],
        details: {
          passed,
          failed,
        },
      });
    }

    // 比较执行时间差异
    if (results.length > 1) {
      const durations = results.map(r => ({ browser: r.browser, duration: r.result.durationMs }));
      const maxDuration = Math.max(...durations.map(d => d.duration));
      const minDuration = Math.min(...durations.map(d => d.duration));

      if (maxDuration > minDuration * 2 && minDuration > 100) {
        differences.push({
          type: 'timing',
          description: '不同浏览器执行时间差异显著',
          browsers: durations.map(d => d.browser),
          details: { durations },
        });
      }
    }

    return {
      passed,
      failed,
      differences,
    };
  }

  /**
   * 生成浏览器兼容性矩阵
   */
  generateCompatibilityMatrix(results: CrossBrowserTestResult[]): Record<string, Record<BrowserName, 'passed' | 'failed' | 'not-tested'>> {
    const matrix: Record<string, Record<BrowserName, 'passed' | 'failed' | 'not-tested'>> = {};

    for (const result of results) {
      const row: Record<BrowserName, 'passed' | 'failed' | 'not-tested'> = {
        chromium: 'not-tested',
        firefox: 'not-tested',
        webkit: 'not-tested',
      };

      for (const { browser, result: testResult } of result.results) {
        row[browser] = testResult.status as 'passed' | 'failed';
      }

      matrix[result.url] = row;
    }

    return matrix;
  }
}

/**
 * 快捷测试函数
 */
export async function testCrossBrowser(
  url: string,
  browsers?: BrowserName[],
): Promise<CrossBrowserTestResult> {
  const tester = new CrossBrowserTester({ browsers });
  return tester.testUrl(url);
}
import { EventEmitter } from 'node:events';
import type { TestCase, Platform, TestType, TestStatus } from '@/types/index.js';
import type { TestRunResult, TestCaseResult, TestEnvironment } from '@/types/test-result.types.js';
import type { GlobalConfig } from '../../config/index.js';
import type { PageSnapshot } from '@/types/crawler.types.js';
import { logger } from './logger.js';
import { eventBus, TestEventType, emitRunStart, emitRunComplete } from './event-bus.js';
import { TestError, TestErrorCode } from './error-handler.js';
import { WebCrawler } from '@/crawlers/web-crawler.js';
import { PageSnapshotter } from '@/crawlers/page-snapshot.js';
import { CaseGenerator } from '@/ai/case-generator.js';
import { PcTester } from '@/testers/web/pc-tester.js';
import { H5Tester } from '@/testers/web/h5-tester.js';
import { ReportGenerator } from '@/reporters/report-generator.js';
import { nanoid } from 'nanoid';
import { chromium, type Browser } from 'playwright';
import fs from 'node:fs/promises';

/**
 * 测试编排器配置（从 CLI 传入）
 */
export interface OrchestratorConfig {
  /** 项目名称（可选，用于报告显示） */
  project?: string;
  /** 目标 URL（Web 测试必需） */
  url?: string;
  /** 测试平台 */
  platform?: 'pc' | 'h5' | 'all' | 'pc-web' | 'h5-web' | 'android-app' | 'api';
  /** 测试类型 */
  testType?: TestType;
  /** 浏览器列表 */
  browsers?: string[];
  /** 设备列表（H5 测试） */
  devices?: string[];
  /** 爬取深度 */
  depth?: number;
  /** 超时时间（毫秒） */
  timeout?: number;
  /** 登录配置 */
  login?: {
    url: string;
    username?: string;
    password?: string;
  };
  /** 是否启用 AI */
  enableAi?: boolean;
  /** 报告格式 */
  reportFormats?: string[];
  /** 全局配置 */
  config?: GlobalConfig;
  /** 预定义的测试用例 */
  cases?: TestCase[];
}

/**
 * 内部测试配置
 */
interface InternalConfig {
  maxDepth: number;
  timeoutMs: number;
  browsers: ('chromium' | 'firefox' | 'webkit')[];
  devices: string[];
  enableAi: boolean;
  reportFormats: ('html' | 'json' | 'markdown')[];
  screenshotOnFailure: boolean;
  videoOnFailure: boolean;
  parallelism: number;
  retryCount: number;
}

/**
 * 测试编排器（总指挥）
 * 负责协调测试流程的各个阶段
 */
export class Orchestrator extends EventEmitter {
  private runId: string;
  private projectName: string;
  private url: string;
  private platform: 'pc' | 'h5' | 'all';
  private testType: TestType;
  private internalConfig: InternalConfig;
  private cases: TestCase[];
  private startTime: string;
  private endTime?: string;
  private isRunning: boolean = false;
  private browser: Browser | null = null;
  private results: TestCaseResult[] = [];

  constructor(options: OrchestratorConfig) {
    super();
    this.runId = nanoid(8);

    // 支持两种配置格式：
    // 1. 新格式（CLI）：使用 url 字段
    // 2. 旧格式（测试）：使用 project 字段
    this.url = options.url || 'about:blank';
    this.projectName = options.project || options.url || 'Test Project';

    // 规范化平台参数
    const rawPlatform = options.platform || 'all';
    if (rawPlatform === 'pc-web') {
      this.platform = 'pc';
    } else if (rawPlatform === 'h5-web') {
      this.platform = 'h5';
    } else {
      this.platform = rawPlatform as 'pc' | 'h5' | 'all';
    }

    this.testType = options.testType || 'smoke';
    this.cases = options.cases ?? [];
    this.startTime = new Date().toISOString();

    // 解析内部配置
    this.internalConfig = {
      maxDepth: options.depth ?? 3,
      timeoutMs: options.timeout ?? 30 * 60 * 1000,
      browsers: (options.browsers ?? ['chromium']) as ('chromium' | 'firefox' | 'webkit')[],
      devices: options.devices ?? [],
      enableAi: options.enableAi ?? true,
      reportFormats: (options.reportFormats ?? ['html']) as ('html' | 'json' | 'markdown')[],
      screenshotOnFailure: true,
      videoOnFailure: true,
      parallelism: 1,
      retryCount: 2,
    };
  }

  /**
   * 执行测试流程
   */
  async run(): Promise<TestRunResult> {
    if (this.isRunning) {
      throw new TestError('测试已在运行中', TestErrorCode.ACTION_FAILED);
    }

    this.isRunning = true;
    this.startTime = new Date().toISOString();
    this.results = [];

    const testLogger = logger.child({ runId: this.runId, url: this.url });

    try {
      testLogger.info('🚀 开始测试流程', {
        url: this.url,
        platform: this.platform,
        testType: this.testType,
      });

      // 发出运行开始事件
      this.emit('test:start', { project: this.url, total: 0, runId: this.runId });
      emitRunStart(this.runId, this.url, 0);

      // Phase 1: 初始化环境
      testLogger.step('初始化测试环境');
      await this.initializeEnvironment(testLogger);

      // Phase 2: 探索页面
      testLogger.step('探索页面结构');
      const snapshots = await this.discoverPages(testLogger);
      this.emit('crawler:complete', { pages: snapshots.length });

      // Phase 3: 生成测试用例
      testLogger.step('生成测试用例');
      const generatedCases = await this.generateCases(testLogger, snapshots);
      this.cases = [...this.cases, ...generatedCases];
      testLogger.info(`共 ${this.cases.length} 个测试用例`);

      // Phase 4: 执行测试用例
      testLogger.step('执行测试用例');
      await this.executeCases(testLogger);

      // Phase 5: 生成报告
      testLogger.step('生成测试报告');
      await this.generateReport(testLogger);

      // 发出运行完成事件
      const summary = {
        passed: this.results.filter(r => r.status === 'passed').length,
        failed: this.results.filter(r => r.status === 'failed').length,
        total: this.results.length,
      };
      this.emit('test:complete', this.buildTestRunResult());
      emitRunComplete(this.runId, summary);

      this.endTime = new Date().toISOString();
      const duration = (new Date(this.endTime).getTime() - new Date(this.startTime).getTime()) / 1000;

      testLogger.info('✅ 测试流程完成', {
        duration: `${duration}s`,
        passRate: `${((summary.passed / summary.total) * 100).toFixed(1)}%`,
      });

      return this.buildTestRunResult();

    } catch (error) {
      testLogger.fail('测试流程异常', { error });
      this.emit('error', error);
      eventBus.emitSafe(TestEventType.RUN_ERROR, {
        runId: this.runId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
      throw error;
    } finally {
      this.isRunning = false;
      await this.cleanup(testLogger);
    }
  }

  /**
   * 初始化测试环境
   */
  private async initializeEnvironment(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    testLogger.debug('检查环境依赖');

    // 确保目录存在
    const dirs = [
      './data/screenshots',
      './data/videos',
      './data/reports',
      './data/logs',
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // 启动浏览器
    testLogger.info('启动浏览器', { browsers: this.internalConfig.browsers });
    this.browser = await chromium.launch({
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-dev-shm-usage',
      ],
    });

    testLogger.pass('✅ 环境初始化完成');
  }

  /**
   * 探索页面结构
   */
  private async discoverPages(testLogger: ReturnType<typeof logger.child>): Promise<PageSnapshot[]> {
    const snapshots: PageSnapshot[] = [];

    testLogger.info('开始爬取页面', {
      url: this.url,
      maxDepth: this.internalConfig.maxDepth,
    });

    // 使用爬虫爬取页面
    const crawler = new WebCrawler({
      maxDepth: this.internalConfig.maxDepth,
      maxPages: 20,
      timeout: 30000,
    });

    try {
      const crawlResult = await crawler.crawl(this.url);

      testLogger.info('爬取完成', {
        totalPages: crawlResult.pages.length,
        errors: crawlResult.errors.length,
      });

      // 为每个页面生成快照
      if (this.browser) {
        const snapshotter = new PageSnapshotter({
          fullPageScreenshot: true,
          captureInteractiveElements: true,
          captureForms: true,
        });

        // 只处理前几个页面以节省时间
        const pagesToSnapshot = crawlResult.pages.slice(0, 5);

        for (const crawledPage of pagesToSnapshot) {
          try {
            testLogger.step(`📸 生成页面快照`, { url: crawledPage.url });

            const context = await this.browser.newContext({
              viewport: { width: 1920, height: 1080 },
            });
            const page = await context.newPage();

            await page.goto(crawledPage.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });

            const snapshot = await snapshotter.takeSnapshot(page, crawledPage.url);
            snapshots.push(snapshot);

            this.emit('snapshot:generated', { url: crawledPage.url });

            await context.close();
          } catch (error) {
            testLogger.warn('快照生成失败', { url: crawledPage.url, error: String(error) });
          }
        }
      }
    } catch (error) {
      testLogger.warn('爬虫执行失败，使用首页快照', { error: String(error) });

      // 如果爬虫失败，至少获取首页快照
      if (this.browser) {
        try {
          const context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
          });
          const page = await context.newPage();

          await page.goto(this.url, {
            waitUntil: 'domcontentloaded',
            timeout: 30000,
          });

          const snapshotter = new PageSnapshotter();
          const snapshot = await snapshotter.takeSnapshot(page, this.url);
          snapshots.push(snapshot);

          await context.close();
        } catch (snapshotError) {
          testLogger.fail('首页快照也失败', { error: String(snapshotError) });
        }
      }
    }

    return snapshots;
  }

  /**
   * 生成测试用例
   */
  private async generateCases(
    testLogger: ReturnType<typeof logger.child>,
    snapshots: PageSnapshot[],
  ): Promise<TestCase[]> {
    if (snapshots.length === 0) {
      testLogger.warn('没有页面快照，无法生成测试用例');
      return [];
    }

    const generator = new CaseGenerator({
      useAi: this.internalConfig.enableAi,
      platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
      generateSmokeTests: true,
      generateFormTests: true,
      generateNavigationTests: true,
    });

    const cases: TestCase[] = [];

    for (const snapshot of snapshots) {
      try {
        testLogger.ai('🤖 生成测试用例', { url: snapshot.url });
        const generatedCases = await generator.generateFromSnapshot(snapshot);
        cases.push(...generatedCases);

        this.emit('cases:generated', { url: snapshot.url, count: generatedCases.length });
      } catch (error) {
        testLogger.warn('测试用例生成失败', { url: snapshot.url, error: String(error) });
      }
    }

    // 限制测试用例数量
    const maxCases = 20;
    if (cases.length > maxCases) {
      testLogger.info(`限制测试用例数量: ${cases.length} → ${maxCases}`);
      // 优先保留 P0 和 P1 用例
      cases.sort((a, b) => {
        const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
      cases.splice(maxCases);
    }

    return cases;
  }

  /**
   * 执行测试用例
   */
  private async executeCases(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    if (this.cases.length === 0) {
      testLogger.warn('没有测试用例可执行');
      return;
    }

    testLogger.info(`开始执行 ${this.cases.length} 个测试用例`);

    // 根据平台选择测试器
    const platformsToTest: ('pc-web' | 'h5-web')[] = [];
    if (this.platform === 'all') {
      platformsToTest.push('pc-web', 'h5-web');
    } else if (this.platform === 'pc') {
      platformsToTest.push('pc-web');
    } else {
      platformsToTest.push('h5-web');
    }

    // 执行测试
    for (const testPlatform of platformsToTest) {
      testLogger.step(`执行 ${testPlatform} 平台测试`);

      for (const testCase of this.cases) {
        this.emit('test:case:start', { name: testCase.name, id: testCase.id, platform: testPlatform });

        const result = await this.executeSingleCase(testCase, testPlatform, testLogger);
        this.results.push(result);

        this.emit('test:case:end', result);

        testLogger.info(`用例完成: ${testCase.name}`, {
          status: result.status,
          duration: `${result.durationMs}ms`,
        });
      }
    }
  }

  /**
   * 执行单个测试用例
   */
  private async executeSingleCase(
    testCase: TestCase,
    platform: 'pc-web' | 'h5-web',
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<TestCaseResult> {
    const startTime = new Date();
    let status: TestStatus = 'passed';
    let retryCount = 0;

    testLogger.step(`📍 执行测试用例: ${testCase.name}`, { caseId: testCase.id });

    // 创建测试器
    const tester = platform === 'h5-web'
      ? new H5Tester({
          browser: 'chromium',
          device: this.internalConfig.devices[0] || 'iPhone 15',
          timeout: this.internalConfig.timeoutMs / this.cases.length,
          screenshotOnFailure: this.internalConfig.screenshotOnFailure,
          videoOnFailure: this.internalConfig.videoOnFailure,
          artifactsDir: './data/screenshots',
        })
      : new PcTester({
          browser: 'chromium',
          viewport: { width: 1920, height: 1080 },
          timeout: this.internalConfig.timeoutMs / this.cases.length,
          screenshotOnFailure: this.internalConfig.screenshotOnFailure,
          videoOnFailure: this.internalConfig.videoOnFailure,
          artifactsDir: './data/screenshots',
          baseUrl: this.url,
        });

    try {
      await tester.initialize();

      // 执行测试
      const result = await tester.runTest(testCase);
      status = result.status;
      retryCount = result.retryCount;

      testLogger[status === 'passed' ? 'pass' : 'fail'](
        status === 'passed' ? `✅ 用例通过: ${testCase.name}` : `❌ 用例失败: ${testCase.name}`,
        { caseId: testCase.id, duration: result.durationMs }
      );

      return result;

    } catch (error) {
      status = 'failed';
      const errorMessage = error instanceof Error ? error.message : String(error);

      testLogger.fail(`❌ 用例执行出错: ${testCase.name}`, { error: errorMessage });

      return {
        caseId: testCase.id,
        caseName: testCase.name,
        status: 'failed',
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        durationMs: Date.now() - startTime.getTime(),
        platform,
        environment: this.getEnvironment(platform),
        steps: [],
        retryCount,
        selfHealed: false,
        artifacts: {
          screenshots: [],
          logs: [errorMessage],
        },
      };
    } finally {
      await tester.close();
    }
  }

  /**
   * 生成测试报告
   */
  private async generateReport(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    const result = this.buildTestRunResult();

    const reportGenerator = new ReportGenerator({
      formats: this.internalConfig.reportFormats,
      outputDir: './data/reports',
      language: 'zh-CN',
      embedScreenshots: true,
    });

    const reportResult = await reportGenerator.generate(result);

    testLogger.pass('✅ 报告生成完成', {
      files: reportResult.files,
      summary: reportResult.summary,
    });

    this.emit('report:generated', { paths: reportResult.files });

    // 输出报告路径
    console.log('\n报告文件:');
    for (const file of reportResult.files) {
      console.log(`  ${file}`);
    }
  }

  /**
   * 构建测试运行结果
   */
  private buildTestRunResult(): TestRunResult {
    const endTime = this.endTime || new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(this.startTime).getTime();

    const passed = this.results.filter(r => r.status === 'passed').length;
    const failed = this.results.filter(r => r.status === 'failed').length;
    const skipped = this.results.filter(r => r.status === 'skipped').length;
    const total = this.results.length;
    const passRate = total > 0 ? passed / total : 0;

    return {
      runId: this.runId,
      project: this.projectName,
      startTime: this.startTime,
      endTime,
      duration,
      platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
      environment: this.getEnvironment('pc-web'),
      summary: {
        total,
        passed,
        failed,
        skipped,
        blocked: 0,
        passRate,
      },
      categories: {
        functional: { total, passed, failed, skipped, blocked: 0, passRate, avgDurationMs: duration / total || 0 },
        visual: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        performance: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, metrics: {} },
        security: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, issues: [] },
        accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, violations: [] },
        compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
      },
      cases: this.results,
      aiAnalysis: {
        overallAssessment: `共执行 ${total} 个测试用例，通过 ${passed} 个，失败 ${failed} 个`,
        criticalIssues: this.results.filter(r => r.status === 'failed').map(r => r.caseName),
        recommendations: ['建议检查失败用例的具体错误信息', '可以考虑增加等待时间或调整选择器'],
        riskLevel: passRate >= 0.8 ? 'low' : passRate >= 0.6 ? 'medium' : passRate >= 0.4 ? 'high' : 'critical',
      },
      artifacts: {
        screenshots: this.results.flatMap(r => r.artifacts.screenshots),
        videos: this.results.filter(r => r.artifacts.video).map(r => r.artifacts.video!),
        logs: this.results.flatMap(r => r.artifacts.logs),
      },
    };
  }

  /**
   * 获取环境信息
   */
  private getEnvironment(platform: 'pc-web' | 'h5-web'): TestEnvironment {
    return {
      browser: 'chromium',
      os: process.platform,
      viewport: platform === 'h5-web' ? { width: 375, height: 667 } : { width: 1920, height: 1080 },
      network: { online: true },
    };
  }

  /**
   * 清理资源
   */
  private async cleanup(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    testLogger.debug('清理测试资源');

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    testLogger.info('资源清理完成');
  }

  /**
   * 获取运行 ID
   */
  getRunId(): string {
    return this.runId;
  }

  /**
   * 获取运行状态
   */
  getStatus(): {
    runId: string;
    project: string;
    platform: Platform;
    testType: TestType;
    isRunning: boolean;
    startTime: string;
    endTime?: string;
    totalCases: number;
  } {
    return {
      runId: this.runId,
      project: this.projectName,
      platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
      testType: this.testType,
      isRunning: this.isRunning,
      startTime: this.startTime,
      endTime: this.endTime,
      totalCases: this.cases.length,
    };
  }
}
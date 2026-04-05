import { EventEmitter } from 'node:events';
import type { TestCase, Platform, TestType, TestStatus, TestActionType, WebPlatform } from '@/types/index.js';
import type { TestRunResult, TestCaseResult, TestEnvironment } from '@/types/test-result.types.js';
import type { GlobalConfig } from '../../config/index.js';
import type { PageSnapshot } from '@/types/crawler.types.js';
import type { HistoricalContext } from '@/types/knowledge.types.js';
import type { ScheduleOptions } from '@/types/scheduler.types.js';
import type { WorkerTestConfig } from '@/types/worker.types.js';
import { logger } from './logger.js';
import { eventBus, TestEventType, emitRunStart, emitRunComplete } from './event-bus.js';
import { TestError, TestErrorCode } from './error-handler.js';
import { WebCrawler } from '@/crawlers/web-crawler.js';
import { PageSnapshotter } from '@/crawlers/page-snapshot.js';
import { CaseGenerator } from '@/ai/case-generator.js';
import { FailureAnalyzer } from '@/ai/failure-analyzer.js';
import { PcTester } from '@/testers/web/pc-tester.js';
import { H5Tester } from '@/testers/web/h5-tester.js';
import { ReportGenerator } from '@/reporters/report-generator.js';
import { FlowOptimizer } from '@/ai/flow-optimizer.js';
import { TestScheduler } from './test-scheduler.js';
import { ParallelRunner } from './parallel-runner.js';
import { getDatabase, initializeDatabase, type KnowledgeDatabase } from '@/knowledge/db/index.js';
import { createKnowledgeRepository, type KnowledgeRepository } from '@/knowledge/repository.js';
import { FailurePatternLibrary, createFailurePatternLibrary } from '@/knowledge/failure-pattern-library.js';
import { createRagMemoryEngine, type RagMemoryEngine } from '@/knowledge/rag-memory.js';
import { StateGraphBuilder, createStateGraphBuilder } from './state-graph-builder.js';
import { BusinessFlowAnalyzer, createBusinessFlowAnalyzer } from '@/ai/business-flow-analyzer.js';
import type { RagMemoryType } from '@/types/rag.types.js';
import { nanoid } from 'nanoid';
import { chromium, type BrowserContext, type Page } from 'playwright';
import fs from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';

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
  /** 并发执行数量 */
  parallelism?: number | 'auto';
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
  private results: TestCaseResult[] = [];
  private db: KnowledgeDatabase | null = null;
  private repository: KnowledgeRepository | null = null;
  private historicalContext: HistoricalContext | null = null;
  private flowOptimizer: FlowOptimizer | null = null;
  private testScheduler: TestScheduler | null = null;
  private failureAnalyzer: FailureAnalyzer | null = null;
  private patternLibrary: FailurePatternLibrary | null = null;
  private ragMemory: RagMemoryEngine | null = null;
  private stateGraphBuilder: StateGraphBuilder | null = null;
  private currentStateHash: string | null = null;
  private businessFlowAnalyzer: BusinessFlowAnalyzer | null = null;

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
    let parallelism = 1;
    if (options.parallelism === 'auto') {
      // 自动检测 CPU 核心数
      parallelism = Math.max(1, os.cpus().length - 1); // 保留一个核心给系统
    } else if (typeof options.parallelism === 'number') {
      parallelism = Math.max(1, options.parallelism);
    }

    this.internalConfig = {
      maxDepth: options.depth ?? 3,
      timeoutMs: options.timeout ?? 30 * 60 * 1000,
      browsers: (options.browsers ?? ['chromium']) as ('chromium' | 'firefox' | 'webkit')[],
      devices: options.devices ?? [],
      enableAi: options.enableAi ?? true,
      reportFormats: (options.reportFormats ?? ['html']) as ('html' | 'json' | 'markdown')[],
      screenshotOnFailure: true,
      videoOnFailure: true,
      parallelism,
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

      // Phase 1.5: 加载历史知识（新增）
      testLogger.step('📚 加载历史知识');
      await this.loadHistoricalKnowledge(testLogger);

      // Phase 2: 探索页面
      testLogger.step('探索页面结构');
      const snapshots = await this.discoverPages(testLogger);
      this.emit('crawler:complete', { pages: snapshots.length });

      // Phase 3: 生成测试用例（注入历史上下文）
      testLogger.step('生成测试用例');
      const generatedCases = await this.generateCases(testLogger, snapshots);
      this.cases = [...this.cases, ...generatedCases];
      testLogger.info(`共 ${this.cases.length} 个测试用例`);

      // Phase 3.2: 业务流分析补充阶段（新增）
      testLogger.step('🔍 业务流分析补充');
      const businessFlowCases = await this.analyzeBusinessFlows(testLogger, snapshots);
      if (businessFlowCases.length > 0) {
        // 将业务流级用例插入队列前部（P0/P1 优先）
        this.cases = [...businessFlowCases, ...this.cases];
        testLogger.pass(`✅ 业务流用例已添加: ${businessFlowCases.length} 个`);
      }

      // Phase 3.5: 智能调度（新增）
      testLogger.step('🎯 智能调度用例');
      this.scheduleCases(testLogger);

      // Phase 4: 执行测试用例
      testLogger.step('执行测试用例');
      await this.executeCases(testLogger);

      // Phase 5: 生成报告
      testLogger.step('生成测试报告');
      await this.generateReport(testLogger);

      // Phase 5.5: 优化闭环（新增）
      testLogger.step('🔄 执行优化闭环');
      await this.runOptimizationLoop(testLogger);

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
      './db',
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }

    // 初始化数据库
    try {
      this.db = await initializeDatabase({ dbPath: './db/sqlite.db' });
      this.repository = createKnowledgeRepository(this.db);
      this.flowOptimizer = new FlowOptimizer({ useAi: this.internalConfig.enableAi });
      this.testScheduler = new TestScheduler({}, this.repository);
      this.patternLibrary = createFailurePatternLibrary(this.db);
      this.failureAnalyzer = new FailureAnalyzer({ useAi: this.internalConfig.enableAi });
      this.ragMemory = createRagMemoryEngine(this.db);
      this.stateGraphBuilder = createStateGraphBuilder({ persist: true });
      await this.stateGraphBuilder.initialize();
      this.businessFlowAnalyzer = createBusinessFlowAnalyzer(
        { useScreenshot: true, persistToKnowledgeBase: true, confidenceThreshold: 0.7 },
        undefined,
        this.db
      );
      testLogger.pass('✅ 数据库初始化完成');
    } catch (error) {
      testLogger.warn('⚠️ 数据库初始化失败，将不使用历史知识', { error: String(error) });
    }

    // 注意：不再在此处创建浏览器，由各 Tester 自行管理
    // 这样可以避免资源管理混乱，每个 Tester 负责自己的浏览器生命周期
    testLogger.pass('✅ 环境初始化完成');
  }

  /**
   * 加载历史知识
   */
  private async loadHistoricalKnowledge(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    if (!this.repository) {
      testLogger.warn('⚠️ 知识库不可用，跳过历史知识加载');
      return;
    }

    try {
      const platformKey: 'pc-web' | 'h5-web' = this.platform === 'h5' ? 'h5-web' : 'pc-web';
      this.historicalContext = this.repository.loadHistoricalContext(this.projectName, platformKey);

      // 发出知识加载事件
      eventBus.emitSafe(TestEventType.KNOWLEDGE_LOADED, {
        project: this.projectName,
        platform: platformKey,
        passedCasesCount: this.historicalContext.previousPassedCases.length,
        failedCasesCount: this.historicalContext.previousFailedCases.length,
        stableCasesCount: this.historicalContext.stableCases.length,
        highRiskCasesCount: this.historicalContext.highRiskCases.length,
        loadTimeMs: Date.now() - new Date(this.historicalContext.loadedAt).getTime(),
      });

      testLogger.pass('✅ 历史知识加载完成', {
        passedCases: this.historicalContext.previousPassedCases.length,
        failedCases: this.historicalContext.previousFailedCases.length,
        stableCases: this.historicalContext.stableCases.length,
        highRiskCases: this.historicalContext.highRiskCases.length,
      });
    } catch (error) {
      testLogger.warn('⚠️ 加载历史知识失败', { error: String(error) });
      this.historicalContext = null;
    }
  }

  /**
   * 智能调度测试用例
   */
  private scheduleCases(testLogger: ReturnType<typeof logger.child>): void {
    if (this.cases.length === 0) {
      testLogger.info('无测试用例，跳过调度');
      return;
    }

    // 如果有 TestScheduler，使用智能调度
    if (this.testScheduler) {
      const platformKey: 'pc-web' | 'h5-web' = this.platform === 'h5' ? 'h5-web' : 'pc-web';
      const scheduleOptions: ScheduleOptions = {
        testType: this.testType,
        projectId: this.projectName,
        platform: platformKey,
        enableSkipStable: true,
        stableThreshold: 30,
        maxSkipRatio: 0.2,
      };

      const result = this.testScheduler.schedule(
        this.cases,
        this.historicalContext,
        scheduleOptions
      );

      // 更新用例列表为调度后的顺序
      this.cases = result.scheduledCases.map(sc => sc.testCase);

      testLogger.pass('✅ 智能调度完成', {
        scheduled: result.scheduledCases.length,
        skipped: result.skippedCases.length,
        highRisk: result.summary.highRiskCount,
        strategy: result.summary.strategy,
      });

      // 记录跳过的用例
      for (const skipped of result.skippedCases) {
        testLogger.debug(`⏭️ 跳过稳定用例: ${skipped.testCase.name}`, {
          reason: skipped.reason,
          consecutivePasses: skipped.consecutivePasses,
        });
      }
      return;
    }

    // 降级：默认按优先级排序
    testLogger.info('无调度器，使用默认排序');
    this.cases.sort((a, b) => {
      const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * 执行优化闭环
   */
  private async runOptimizationLoop(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    if (!this.repository || !this.flowOptimizer) {
      testLogger.warn('⚠️ 优化器不可用，跳过优化闭环');
      return;
    }

    try {
      // === P0 新增：验证已应用优化的效果 ===
      testLogger.step('📊 验证已应用优化的效果');
      await this.verifyAppliedOptimizations(testLogger);

      // 准备历史数据
      const historyData = this.results.map(r => ({
        caseId: r.caseId,
        caseName: r.caseName,
        totalRuns: 1,
        passCount: r.status === 'passed' ? 1 : 0,
        failCount: r.status === 'failed' ? 1 : 0,
        skipCount: r.status === 'skipped' ? 1 : 0,
        avgDurationMs: r.durationMs,
        lastResult: r.status as 'passed' | 'failed' | 'skipped',
        recentResults: [r.status] as ('passed' | 'failed' | 'skipped')[],
        priority: 'P2' as const,
        type: 'functional' as const,
        tags: [],
      }));

      // 调用优化器
      const totalResults = this.results.length || 1; // 防止除以零
      const optimizationResult = await this.flowOptimizer.optimize({
        projectName: this.projectName,
        totalCases: this.results.length,
        historyData,
        recentPassRate: this.results.filter(r => r.status === 'passed').length / totalResults,
        avgDuration: this.results.reduce((sum, r) => sum + r.durationMs, 0) / totalResults,
      });

      // 保存高置信度的优化建议（带运行前状态）
      for (const suggestion of optimizationResult.suggestions) {
        if (suggestion.confidence >= 0.85 && suggestion.autoApplicable) {
          // 查找该用例的当前状态作为基准
          const caseResult = this.results.find(r => r.caseId === suggestion.caseId);
          const beforePassRate = caseResult ? (caseResult.status === 'passed' ? 1 : 0) : null;
          const beforeAvgDurationMs = caseResult?.durationMs ?? null;

          const suggestionId = this.repository.saveOptimizationSuggestion({
            project: this.projectName,
            platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
            caseId: suggestion.caseId,
            suggestionType: suggestion.type,
            suggestionValue: String(suggestion.suggestedValue ?? ''),
            reason: suggestion.reason,
            confidence: suggestion.confidence,
            autoApplicable: suggestion.autoApplicable,
            beforePassRate,
            beforeAvgDurationMs,
            verificationStatus: 'pending',
            verificationRunCount: 0,
          });

          eventBus.emitSafe(TestEventType.OPTIMIZATION_SUGGESTED, {
            suggestionId,
            caseId: suggestion.caseId,
            suggestionType: suggestion.type,
            confidence: suggestion.confidence,
            autoApplicable: suggestion.autoApplicable,
          });
        }
      }

      // 更新用例统计
      if (this.repository) {
        for (const result of this.results) {
          // 只统计 passed/failed/skipped，忽略 blocked/pending
          if (result.status === 'passed' || result.status === 'failed' || result.status === 'skipped') {
            this.repository.updateCaseStatistics(
              result.caseId,
              this.projectName,
              this.platform === 'h5' ? 'h5-web' : 'pc-web',
              result.status,
              result.durationMs
            );
          }
        }
      }

      // === P0 新增：清理无效优化 ===
      testLogger.step('🧹 清理无效优化建议');
      const cleanedCount = this.repository.cleanupIneffectiveOptimizations(
        this.projectName,
        3  // 连续 3 次无效则清理
      );
      if (cleanedCount > 0) {
        testLogger.pass(`✅ 已清理 ${cleanedCount} 个无效优化建议`);
      }

      testLogger.pass('✅ 优化闭环完成', {
        suggestions: optimizationResult.suggestions.length,
        autoApplicable: optimizationResult.summary.autoApplicableCount,
      });
    } catch (error) {
      testLogger.warn('⚠️ 优化闭环执行失败', { error: String(error) });
    }
  }

  /**
   * 验证已应用优化的效果（P0 新增）
   */
  private async verifyAppliedOptimizations(testLogger: ReturnType<typeof logger.child>): Promise<void> {
    if (!this.repository) return;

    try {
      const platformKey = this.platform === 'h5' ? 'h5-web' : 'pc-web';

      // 查找需要验证的建议（已应用但未验证）
      const pendingSuggestions = this.repository.loadApplicableOptimizations(
        this.projectName,
        platformKey,
        true  // 只取已应用的
      ).filter(s => s.applied && s.verificationStatus === 'pending');

      if (pendingSuggestions.length === 0) {
        testLogger.debug('无待验证的优化建议');
        return;
      }

      testLogger.info(`发现 ${pendingSuggestions.length} 个待验证的优化建议`);

      // 对每个建议进行验证
      const verificationResults: import('@/types/knowledge.types.js').OptimizationVerificationResult[] = [];

      for (const suggestion of pendingSuggestions) {
        if (!suggestion.caseId) continue;

        // 查找本次运行中该用例的结果
        const caseResult = this.results.find(r => r.caseId === suggestion.caseId);

        if (caseResult) {
          const afterPassRate = caseResult.status === 'passed' ? 1 : 0;
          const afterAvgDurationMs = caseResult.durationMs;

          const result = this.repository.verifyOptimizationEffectiveness(
            suggestion.id,
            afterPassRate,
            afterAvgDurationMs
          );

          verificationResults.push(result);

          // 发出验证事件
          eventBus.emitSafe(TestEventType.OPTIMIZATION_VERIFIED, {
            suggestionId: suggestion.id,
            caseId: suggestion.caseId,
            effective: result.effective,
            effectivenessScore: result.effectivenessScore,
            passRateChange: result.passRateChange,
            durationChange: result.durationChange,
            shouldRetain: result.shouldRetain,
          });

          testLogger.debug(`优化验证: ${suggestion.caseId}`, {
            effective: result.effective,
            score: result.effectivenessScore.toFixed(2),
            passRateChange: `${(result.passRateChange * 100).toFixed(1)}%`,
          });
        }
      }

      // 统计验证结果
      const effectiveCount = verificationResults.filter(r => r.effective).length;
      const ineffectiveCount = verificationResults.filter(r => !r.effective).length;

      testLogger.pass(`✅ 优化验证完成`, {
        total: verificationResults.length,
        effective: effectiveCount,
        ineffective: ineffectiveCount,
      });

    } catch (error) {
      testLogger.warn('⚠️ 优化验证失败', { error: String(error) });
    }
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

      // 为每个页面生成快照（创建独立的浏览器实例）
      const snapshotBrowser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      try {
        const snapshotter = new PageSnapshotter({
          fullPageScreenshot: true,
          captureInteractiveElements: true,
          captureForms: true,
        });

        // 只处理前几个页面以节省时间
        const pagesToSnapshot = crawlResult.pages.slice(0, 5);

        for (const crawledPage of pagesToSnapshot) {
          let context: BrowserContext | null = null;
          let page: Page | null = null;
          try {
            testLogger.step(`📸 生成页面快照`, { url: crawledPage.url });

            context = await snapshotBrowser.newContext({
              viewport: { width: 1920, height: 1080 },
            });
            page = await context.newPage();

            await page.goto(crawledPage.url, {
              waitUntil: 'domcontentloaded',
              timeout: 30000,
            });

            const snapshot = await snapshotter.takeSnapshot(page, crawledPage.url);
            snapshots.push(snapshot);

            // 记录新页面/新状态发现记忆
            this.recordRagMemory('new_state', {
              url: crawledPage.url,
              platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
              domSummary: snapshot.title,
              viewSummary: snapshot.interactiveElements?.slice(0, 5).map(e => e.text || e.selector).join(', ') ?? undefined,
              errorMessage: `发现新页面: ${snapshot.title ?? crawledPage.url}`,
              confidence: 0.8,
            }, testLogger);

            this.emit('snapshot:generated', { url: crawledPage.url });

            // 记录状态节点
            if (this.stateGraphBuilder) {
              const platformKey: WebPlatform = this.platform === 'h5' ? 'h5-web' : 'pc-web';
              const stateNode = this.stateGraphBuilder.recordState(
                snapshot,
                this.projectName,
                platformKey
              );
              this.currentStateHash = stateNode.stateHash;
              testLogger.debug('📍 状态节点已记录', {
                stateHash: stateNode.stateHash,
                stateName: stateNode.stateName,
              });
            }
          } catch (error) {
            testLogger.warn('快照生成失败', { url: crawledPage.url, error: String(error) });
          } finally {
            // 确保 page 和 context 被正确关闭，防止资源泄漏
            if (page) {
              try {
                await page.close();
              } catch {
                // 忽略关闭错误
              }
            }
            if (context) {
              try {
                await context.close();
              } catch {
                // 忽略关闭错误
              }
            }
          }
        }
      } finally {
        // 确保快照浏览器被关闭
        await snapshotBrowser.close();
      }
    } catch (error) {
      testLogger.warn('爬虫执行失败，使用首页快照', { error: String(error) });

      // 如果爬虫失败，至少获取首页快照
      const fallbackBrowser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      try {
        const context = await fallbackBrowser.newContext({
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
      } finally {
        await fallbackBrowser.close();
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
   * 分析业务流并生成 E2E 测试用例
   */
  private async analyzeBusinessFlows(
    testLogger: ReturnType<typeof logger.child>,
    snapshots: PageSnapshot[],
  ): Promise<TestCase[]> {
    if (!this.businessFlowAnalyzer) {
      testLogger.warn('⚠️ 业务流分析器未初始化，跳过业务流分析');
      return [];
    }

    if (snapshots.length === 0) {
      testLogger.info('无页面快照，跳过业务流分析');
      return [];
    }

    const platformKey: 'pc-web' | 'h5-web' = this.platform === 'h5' ? 'h5-web' : 'pc-web';
    const allFlows: import('@/ai/prompts/business-flow.prompt.js').BusinessFlow[] = [];

    try {
      // 分析单个页面的业务流
      for (const snapshot of snapshots) {
        testLogger.step(`🔍 分析页面业务流: ${snapshot.title ?? snapshot.url}`);

        try {
          const analysis = await this.businessFlowAnalyzer.analyzePage(snapshot, {
            projectId: this.projectName,
            platform: platformKey,
            previousPages: snapshots.slice(0, snapshots.indexOf(snapshot)).map(s => ({
              url: s.url,
              title: s.title ?? '',
            })),
          });

          // 收集识别到的业务流
          allFlows.push(...analysis.potentialFlows);

          // 发出业务流分析事件
          eventBus.emitSafe(TestEventType.BUSINESS_FLOW_ANALYZED, {
            pageUrl: snapshot.url,
            pageName: analysis.pageName,
            flowsCount: analysis.potentialFlows.length,
            scenariosCount: analysis.businessScenarios.length,
          });

          testLogger.debug(`页面业务分析完成`, {
            pageName: analysis.pageName,
            flows: analysis.potentialFlows.length,
            scenarios: analysis.businessScenarios.length,
          });
        } catch (error) {
          testLogger.warn('页面业务流分析失败', {
            url: snapshot.url,
            error: String(error),
          });
        }
      }

      // 如果有多个页面，分析跨页面业务流
      if (snapshots.length > 1) {
        testLogger.step('🔗 分析跨页面业务流');

        try {
          const crossPageFlows = await this.businessFlowAnalyzer.analyzeFlow(
            snapshots.map(s => ({
              url: s.url,
              title: s.title ?? '',
              snapshot: s,
              keyElements: s.interactiveElements?.map(e => e.selector) ?? [],
            })),
            { projectId: this.projectName, platform: platformKey }
          );

          allFlows.push(...crossPageFlows);
          testLogger.pass(`跨页面业务流分析完成: ${crossPageFlows.length} 个`);
        } catch (error) {
          testLogger.warn('跨页面业务流分析失败', { error: String(error) });
        }
      }

      // 从业务流生成 E2E 测试用例
      if (allFlows.length === 0) {
        testLogger.info('未识别到业务流');
        return [];
      }

      testLogger.step('📝 从业务流生成 E2E 测试用例');
      const e2eCases = this.businessFlowAnalyzer.generateE2ETestCases(allFlows, {
        projectId: this.projectName,
        platform: platformKey,
      });

      // 过滤掉置信度过低的用例
      const highConfidenceCases = e2eCases.filter(c => {
        const confidence = c.metadata?.ai_confidence as number | undefined;
        return confidence === undefined || confidence >= 0.7;
      });

      testLogger.pass(`✅ 业务流用例生成完成`, {
        totalFlows: allFlows.length,
        generatedCases: e2eCases.length,
        highConfidenceCases: highConfidenceCases.length,
      });

      return highConfidenceCases;
    } catch (error) {
      testLogger.warn('⚠️ 业务流分析失败', { error: String(error) });
      return [];
    }
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

      // 检查是否启用并发执行
      if (this.internalConfig.parallelism > 1) {
        // 并发执行
        await this.executeCasesParallel(testPlatform, testLogger);
      } else {
        // 串行执行
        await this.executeCasesSerial(testPlatform, testLogger);
      }
    }
  }

  /**
   * 串行执行测试用例
   */
  private async executeCasesSerial(
    testPlatform: 'pc-web' | 'h5-web',
    testLogger: ReturnType<typeof logger.child>
  ): Promise<void> {
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

  /**
   * 并发执行测试用例
   */
  private async executeCasesParallel(
    testPlatform: 'pc-web' | 'h5-web',
    testLogger: ReturnType<typeof logger.child>
  ): Promise<void> {
    testLogger.info(`启用并发执行，并行度: ${this.internalConfig.parallelism}`);

    const parallelRunner = new ParallelRunner({
      maxWorkers: this.internalConfig.parallelism,
      taskTimeout: this.internalConfig.timeoutMs,
      maxRetries: this.internalConfig.retryCount,
    });

    const workerConfig: WorkerTestConfig = {
      platform: testPlatform,
      browser: 'chromium',
      viewport: { width: 1920, height: 1080 },
      device: this.internalConfig.devices[0] || 'iPhone 15',
      baseUrl: this.url,
      screenshotDir: './data/screenshots',
      screenshotOnFailure: this.internalConfig.screenshotOnFailure,
      videoOnFailure: this.internalConfig.videoOnFailure,
      headless: true,
    };

    try {
      const result = await parallelRunner.run(this.cases, workerConfig, {
        runId: this.runId,
      });

      // 收集结果
      this.results.push(...result.results);

      testLogger.info(`并发执行完成`, {
        totalCases: result.totalCases,
        passed: result.passedCases,
        failed: result.failedCases,
        duration: `${(result.totalDurationMs / 1000).toFixed(2)}s`,
        efficiency: `${result.parallelEfficiency.toFixed(1)}%`,
      });
    } catch (error) {
      testLogger.error(`并发执行失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
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
    let selfHealed = false;
    let autoFixApplied = false;

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
      let result = await tester.runTest(testCase);
      status = result.status;
      retryCount = result.retryCount;

      // 如果失败，尝试自动修复
      if (status === 'failed' && this.patternLibrary && this.failureAnalyzer) {
        const autoFixResult = await this.tryAutoFix(testCase, result, testLogger);
        if (autoFixResult.retrySuccess) {
          status = 'passed';
          retryCount = autoFixResult.retryCount;
          selfHealed = autoFixResult.selfHealed;
          autoFixApplied = true;
          result = autoFixResult.result ?? result;
          testLogger.pass(`✅ 自动修复成功: ${testCase.name}`, {
            caseId: testCase.id,
            fixType: autoFixResult.fixType,
          });
        }
      }

      testLogger[status === 'passed' ? 'pass' : 'fail'](
        status === 'passed' ? `✅ 用例通过: ${testCase.name}` : `❌ 用例失败: ${testCase.name}`,
        { caseId: testCase.id, duration: result.durationMs, autoFixApplied }
      );

      // 记录失败记忆（如果失败且未自动修复）
      if (status === 'failed' && !autoFixApplied) {
        const failedStep = result.steps.find(s => s.status === 'failed');
        this.recordRagMemory('failure', {
          caseId: testCase.id,
          caseName: testCase.name,
          url: this.url,
          platform,
          errorMessage: failedStep?.errorMessage ?? 'Unknown error',
          screenshots: result.artifacts.screenshots,
          logs: result.artifacts.logs,
          domSummary: failedStep?.target ?? undefined,
          confidence: 0.9,
        }, testLogger);
      }

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
   * 尝试自动修复失败用例
   */
  private async tryAutoFix(
    testCase: TestCase,
    failedResult: TestCaseResult,
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<{
    retrySuccess: boolean;
    retryCount: number;
    selfHealed: boolean;
    fixType?: string;
    result?: TestCaseResult;
  }> {
    if (!this.patternLibrary || !this.failureAnalyzer) {
      return { retrySuccess: false, retryCount: 0, selfHealed: false };
    }

    // 获取失败步骤信息
    const failedStep = failedResult.steps.find(s => s.status === 'failed');
    if (!failedStep) {
      return { retrySuccess: false, retryCount: 0, selfHealed: false };
    }

    // 匹配失败模式
    const matchResult = this.patternLibrary.matchPattern(failedStep.errorMessage ?? 'Unknown error', {
      patternType: this.classifyErrorToPatternType(failedStep.errorMessage ?? ''),
      selector: failedStep.target,
    });

    if (!matchResult.matched || !matchResult.pattern?.autoFixConfig) {
      testLogger.info('⚠️ 未匹配到可自动修复的模式', { caseId: testCase.id });
      return { retrySuccess: false, retryCount: 0, selfHealed: false };
    }

    const pattern = matchResult.pattern;
    const config = pattern.autoFixConfig;

    if (!config) {
      return { retrySuccess: false, retryCount: 0, selfHealed: false };
    }

    testLogger.info('🔧 尝试自动修复', {
      caseId: testCase.id,
      patternId: pattern.id,
      fixType: config.fixType,
    });

    // 发出自动修复事件
    eventBus.emitSafe(TestEventType.AUTO_FIX_APPLIED, {
      caseId: testCase.id,
      patternId: pattern.id,
      fixType: config.fixType,
      fixValue: config.fixValue,
    });

    // 应用修复配置
    const maxRetries = config.maxRetries ?? 1;
    let retryCount = 0;

    for (let i = 0; i < maxRetries; i++) {
      retryCount++;
      testLogger.step(`🔄 重试 ${retryCount}/${maxRetries}`, { caseId: testCase.id });

      // 根据修复类型调整测试配置
      const adjustedTimeout = config.fixType === 'increase-timeout'
        ? (this.internalConfig.timeoutMs / this.cases.length) * (config.fixValue as number ?? 1.5)
        : this.internalConfig.timeoutMs / this.cases.length;

      const additionalWait = config.fixType === 'add-wait'
        ? (config.fixValue as number ?? 2000)
        : 0;

      // 创建带调整配置的测试器（根据失败用例的平台选择正确的测试器）
      const isH5Platform = failedResult.platform === 'h5-web';
      const tester = isH5Platform
        ? new H5Tester({
            browser: 'chromium',
            device: this.internalConfig.devices[0] || 'iPhone 15',
            timeout: adjustedTimeout,
            screenshotOnFailure: this.internalConfig.screenshotOnFailure,
            videoOnFailure: this.internalConfig.videoOnFailure,
            artifactsDir: './data/screenshots',
          })
        : new PcTester({
            browser: 'chromium',
            viewport: { width: 1920, height: 1080 },
            timeout: adjustedTimeout,
            screenshotOnFailure: this.internalConfig.screenshotOnFailure,
            videoOnFailure: this.internalConfig.videoOnFailure,
            artifactsDir: './data/screenshots',
            baseUrl: this.url,
          });

      try {
        await tester.initialize();

        // 如果需要额外等待
        if (additionalWait > 0) {
          await new Promise(resolve => setTimeout(resolve, additionalWait));
        }

        const retryResult = await tester.runTest(testCase);

        if (retryResult.status === 'passed') {
          // 记录修复成功
          this.patternLibrary.recordFixSuccess(pattern.id);

          // 记录自动修复成功记忆
          this.recordRagMemory('auto_fix', {
            caseId: testCase.id,
            caseName: testCase.name,
            url: this.url,
            platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
            errorMessage: failedStep.errorMessage ?? 'Unknown error',
            solutionStrategy: `应用修复策略: ${config.fixType}`,
            solutionSteps: [
              `匹配失败模式: ${pattern.patternType}`,
              `应用修复配置: ${config.fixType}`,
              `重试次数: ${retryCount}`,
              `修复参数: ${JSON.stringify(config.fixValue)}`,
            ],
            screenshots: retryResult.artifacts.screenshots,
            logs: retryResult.artifacts.logs,
            confidence: 0.95,
          }, testLogger);

          // 发出修复成功事件
          eventBus.emitSafe(TestEventType.AUTO_FIX_SUCCESS, {
            caseId: testCase.id,
            patternId: pattern.id,
            retryCount,
          });

          await tester.close();
          return {
            retrySuccess: true,
            retryCount,
            selfHealed: true,
            fixType: config.fixType,
            result: retryResult,
          };
        }

        await tester.close();
      } catch (error) {
        testLogger.warn('重试失败', { attempt: i + 1, error: String(error) });
        try {
          await tester.close();
        } catch {
          // 忽略关闭错误
        }
      }
    }

    // 所有重试都失败
    this.patternLibrary.recordFixFailure(pattern.id, failedStep.errorMessage ?? 'Unknown');

    // 发出修复失败事件
    eventBus.emitSafe(TestEventType.AUTO_FIX_FAILED, {
      caseId: testCase.id,
      patternId: pattern.id,
      error: new Error('Auto-fix retry failed'),
      needsManualIntervention: true,
    });

    // === P1 新增：尝试状态图谱替代路径 ===
    testLogger.step('🔀 尝试状态图谱替代路径');
    const alternativeResult = await this.tryAlternativePath(
      failedStep.action ?? 'unknown',
      failedStep.target,
      testCase,
      testLogger
    );

    if (alternativeResult.retrySuccess && alternativeResult.result) {
      // 替代路径成功
      this.patternLibrary.recordFixSuccess(pattern.id);

      // 记录替代路径成功记忆
      this.recordRagMemory('self_heal', {
        caseId: testCase.id,
        caseName: testCase.name,
        url: this.url,
        platform: this.platform === 'h5' ? 'h5-web' : 'pc-web',
        errorMessage: failedStep.errorMessage ?? 'Unknown error',
        solutionStrategy: '状态图谱替代路径兜底成功',
        solutionSteps: [
          `自动修复失败后，通过状态图谱找到替代路径`,
          `原失败步骤: ${failedStep.action}`,
        ],
        screenshots: alternativeResult.result.artifacts.screenshots,
        logs: alternativeResult.result.artifacts.logs,
        confidence: 0.85,
      }, testLogger);

      return {
        retrySuccess: true,
        retryCount,
        selfHealed: true,
        fixType: 'state-graph-alternative',
        result: alternativeResult.result,
      };
    }

    return { retrySuccess: false, retryCount, selfHealed: false, fixType: config.fixType };
  }

  /**
   * 将错误消息分类为模式类型
   */
  private classifyErrorToPatternType(errorMessage: string): import('@/types/knowledge.types.js').FailurePatternType {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('timeout') || lower.includes('timed out')) return 'timeout';
    if (lower.includes('element not found') || lower.includes('no element')) return 'element_not_found';
    if (lower.includes('network') || lower.includes('econnrefused')) return 'network_error';
    if (lower.includes('assertion') || lower.includes('assert')) return 'assertion_failed';
    if (lower.includes('permission') || lower.includes('denied')) return 'permission_denied';

    return 'timeout'; // 默认
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

    // 关闭所有浏览器实例（由 browser-manager 统一管理）
    try {
      const { closeAllBrowsers } = await import('@/testers/web/browser-manager.js');
      const closedCount = await closeAllBrowsers();
      if (closedCount > 0) {
        testLogger.debug(`已关闭 ${closedCount} 个浏览器实例`);
      }
    } catch {
      // 浏览器管理器可能未初始化
    }

    // 关闭 RAG 记忆引擎
    if (this.ragMemory) {
      try {
        // RagMemoryEngine 没有 close 方法，但我们可以清理引用
        this.ragMemory = null;
      } catch (error) {
        testLogger.warn('清理 RAG 记忆引擎失败', { error: String(error) });
      }
    }

    // 关闭状态图谱构建器
    if (this.stateGraphBuilder) {
      try {
        // 持久化当前图谱
        const platformKey: WebPlatform = this.platform === 'h5' ? 'h5-web' : 'pc-web';
        await this.stateGraphBuilder.persistGraph(this.projectName, platformKey);
        this.stateGraphBuilder = null;
      } catch (error) {
        testLogger.warn('关闭状态图谱构建器失败', { error: String(error) });
      }
    }

    // 关闭失败模式库
    if (this.patternLibrary) {
      this.patternLibrary = null;
    }

    // 关闭知识库
    if (this.db) {
      try {
        // 数据库是单例，不在这里关闭，但清理引用
        this.db = null;
      } catch (error) {
        testLogger.warn('清理知识库引用失败', { error: String(error) });
      }
    }

    // 清理其他引用
    this.repository = null;
    this.flowOptimizer = null;
    this.testScheduler = null;
    this.failureAnalyzer = null;
    this.businessFlowAnalyzer = null;

    testLogger.info('资源清理完成');
  }

  /**
   * 记录 RAG 记忆（失败、自愈、修复等）
   */
  private recordRagMemory(
    memoryType: RagMemoryType,
    context: {
      caseId?: string;
      caseName?: string;
      url?: string;
      platform?: 'pc-web' | 'h5-web';
      errorMessage?: string;
      solutionStrategy?: string;
      solutionSteps?: string[];
      screenshots?: string[];
      logs?: string[];
      domSummary?: string;
      viewSummary?: string;
      confidence?: number;
    },
    testLogger: ReturnType<typeof logger.child>,
  ): void {
    if (!this.ragMemory) {
      testLogger.debug('RAG 记忆引擎未初始化，跳过记录');
      return;
    }

    try {
      const memory = this.ragMemory.store({
        projectId: this.projectName,
        platform: context.platform ?? (this.platform === 'h5' ? 'h5-web' : 'pc-web'),
        memoryType,
        contextUrl: context.url ?? this.url,
        contextPackage: null,
        domSummary: context.domSummary ?? null,
        viewSummary: context.viewSummary ?? null,
        executionResult: context.errorMessage
          ? `用例 ${context.caseName ?? 'Unknown'} 失败: ${context.errorMessage}`
          : `用例 ${context.caseName ?? 'Unknown'} ${memoryType === 'self_heal' ? '自愈成功' : memoryType === 'auto_fix' ? '自动修复成功' : '执行完成'}`,
        solutionStrategy: context.solutionStrategy ?? null,
        solutionSteps: context.solutionSteps ?? null,
        relatedScreenshots: context.screenshots ?? null,
        relatedLogs: context.logs ?? null,
        confidence: context.confidence ?? 1.0,
      });

      testLogger.debug('📝 RAG 记忆已记录', {
        memoryId: memory.id,
        memoryType,
        caseId: context.caseId,
      });

      // 发出 RAG 记忆保存事件
      eventBus.emitSafe(TestEventType.RAG_MEMORY_SAVED, {
        memoryId: memory.id,
        memoryType,
        projectId: this.projectName,
        caseId: context.caseId,
      });
    } catch (error) {
      testLogger.warn('⚠️ RAG 记忆记录失败', { error: String(error) });
    }
  }

  /**
   * 记录状态转移
   */
  private recordStateTransition(
    action: TestActionType,
    actionTarget?: string,
    actionValue?: string,
    success: boolean = true,
    testLogger?: ReturnType<typeof logger.child>,
  ): void {
    if (!this.stateGraphBuilder || !this.currentStateHash) return;

    try {
      const platformKey: WebPlatform = this.platform === 'h5' ? 'h5-web' : 'pc-web';

      // 创建目标状态哈希（基于动作）
      const targetHash = this.computeActionTargetHash(action, actionTarget);

      if (targetHash) {
        this.stateGraphBuilder.recordTransition(
          this.currentStateHash,
          targetHash,
          action,
          this.projectName,
          platformKey,
          actionTarget,
          actionValue,
          success
        );

        // 更新当前状态
        this.currentStateHash = targetHash;

        testLogger?.debug('🔀 状态转移已记录', {
          action,
          success,
          targetHash: targetHash.slice(0, 8),
        });
      }
    } catch (error) {
      testLogger?.warn('⚠️ 记录状态转移失败', { error: String(error) });
    }
  }

  /**
   * 计算动作目标哈希
   */
  private computeActionTargetHash(action: TestActionType, target?: string): string | null {
    if (!target) return null;

    // 使用动作和目标创建简单哈希
    const content = `${action}:${target}`;
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * 尝试使用状态图谱替代路径
   * 当自愈失败时，查找并执行替代路径到达目标状态
   */
  private async tryAlternativePath(
    failedAction: string,
    failedTarget: string | undefined,
    testCase: TestCase,
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<{
    pathFound: boolean;
    pathExecuted: boolean;
    retrySuccess: boolean;
    result?: TestCaseResult;
  }> {
    const emptyResult = { pathFound: false, pathExecuted: false, retrySuccess: false };

    if (!this.stateGraphBuilder || !this.currentStateHash) {
      return emptyResult;
    }

    try {
      const platformKey: WebPlatform = this.platform === 'h5' ? 'h5-web' : 'pc-web';
      const graph = this.stateGraphBuilder.getGraph(this.projectName, platformKey);

      if (!graph) {
        testLogger.debug('无可用状态图谱');
        return emptyResult;
      }

      // 1. 查找从当前状态可达的高成功率的替代边
      const outgoingEdges = graph.edges.filter(
        e => e.sourceStateHash === this.currentStateHash &&
             (e.successCount / e.transitionCount) > 0.7
      );

      if (outgoingEdges.length === 0) {
        testLogger.debug('未找到可行的替代路径');
        return emptyResult;
      }

      // 按成功率排序，选择最佳替代路径
      outgoingEdges.sort((a, b) =>
        (b.successCount / b.transitionCount) - (a.successCount / a.transitionCount)
      );

      const bestEdge = outgoingEdges[0];
      if (!bestEdge) {
        testLogger.debug('排序后未找到有效边');
        return emptyResult;
      }

      const successRate = bestEdge.successCount / bestEdge.transitionCount;

      testLogger.info('🔀 找到替代路径', {
        action: bestEdge.actionType,
        target: bestEdge.actionTarget,
        successRate: successRate.toFixed(2),
        alternatives: outgoingEdges.length,
      });

      // 发出状态图谱路径发现事件
      eventBus.emitSafe(TestEventType.STATE_GRAPH_PATH_FOUND, {
        sourceHash: this.currentStateHash,
        targetHash: bestEdge.targetStateHash,
        pathLength: 1,
        confidence: successRate,
      });

      // 2. 尝试执行替代路径
      const executed = await this.executeAlternativePath(bestEdge, testLogger);

      if (!executed) {
        return { pathFound: true, pathExecuted: false, retrySuccess: false };
      }

      // 3. 在新状态下重试测试用例
      testLogger.step('🔄 在新状态下重试测试用例');

      // 根据平台键确定使用哪个测试器，保持与状态图谱一致
      const tester = platformKey === 'h5-web'
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
        const retryResult = await tester.runTest(testCase);
        await tester.close();

        if (retryResult.status === 'passed') {
          testLogger.pass('✅ 替代路径重试成功');

          // 记录替代路径成功记忆
          this.recordRagMemory('self_heal', {
            caseId: testCase.id,
            caseName: testCase.name,
            url: this.url,
            platform: platformKey as 'pc-web' | 'h5-web',
            errorMessage: `原路径失败，使用替代路径成功`,
            solutionStrategy: `状态图谱替代路径: ${bestEdge.actionType}`,
            solutionSteps: [
              `原动作: ${failedAction}`,
              `替代动作: ${bestEdge.actionType}`,
              `替代目标: ${bestEdge.actionTarget ?? 'N/A'}`,
              `路径成功率: ${successRate.toFixed(2)}`,
            ],
            confidence: successRate,
          }, testLogger);

          // 更新边的成功计数
          this.stateGraphBuilder.recordTransition(
            bestEdge.sourceStateHash,
            bestEdge.targetStateHash,
            bestEdge.actionType as TestActionType,
            this.projectName,
            platformKey,
            bestEdge.actionTarget ?? undefined,
            bestEdge.actionValue ?? undefined,
            true
          );

          return {
            pathFound: true,
            pathExecuted: true,
            retrySuccess: true,
            result: retryResult,
          };
        }

        testLogger.warn('⚠️ 替代路径重试仍失败');
        return { pathFound: true, pathExecuted: true, retrySuccess: false };

      } catch (error) {
        testLogger.warn('替代路径执行出错', { error: String(error) });
        try {
          await tester.close();
        } catch {
          // 忽略关闭错误
        }
        return { pathFound: true, pathExecuted: true, retrySuccess: false };
      }
    } catch (error) {
      testLogger.warn('⚠️ 查找替代路径失败', { error: String(error) });
      return emptyResult;
    }
  }

  /**
   * 执行替代路径的单步动作
   */
  private async executeAlternativePath(
    edge: import('@/types/state-graph.types.js').StateEdge,
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<boolean> {
    // 创建独立的浏览器实例执行替代路径
    let browser: import('playwright').Browser | null = null;

    try {
      browser = await chromium.launch({
        headless: true,
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      const context = await browser.newContext({
        viewport: this.platform === 'h5' ? { width: 375, height: 667 } : { width: 1920, height: 1080 },
      });
      const page = await context.newPage();

      testLogger.step(`🔀 执行替代动作: ${edge.actionType}`, {
        target: edge.actionTarget,
      });

      // 根据动作类型执行相应操作
      switch (edge.actionType) {
        case 'navigate':
          if (edge.actionTarget) {
            await page.goto(edge.actionTarget, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          break;
        case 'click':
          if (edge.actionTarget) {
            await page.click(edge.actionTarget, { timeout: 10000 });
          }
          break;
        case 'fill':
          if (edge.actionTarget && edge.actionValue) {
            await page.fill(edge.actionTarget, edge.actionValue, { timeout: 10000 });
          }
          break;
        case 'scroll':
          await page.evaluate(() => window.scrollBy(0, 500));
          break;
        case 'wait':
          await page.waitForTimeout(parseInt(edge.actionValue ?? '1000', 10));
          break;
        default:
          testLogger.debug(`未支持的动作类型: ${edge.actionType}`);
          await context.close();
          await browser.close();
          return false;
      }

      // 更新当前状态哈希
      const snapshotter = new PageSnapshotter();
      const snapshot = await snapshotter.takeSnapshot(page, page.url());
      const newStateHash = this.stateGraphBuilder!.computeStateHash(snapshot);
      this.currentStateHash = newStateHash;

      testLogger.debug('✅ 替代动作执行成功', { newStateHash: newStateHash.slice(0, 8) });

      await context.close();
      await browser.close();
      return true;
    } catch (error) {
      testLogger.warn('替代动作执行失败', { error: String(error) });
      // 确保浏览器被关闭
      if (browser) {
        try {
          await browser.close();
        } catch {
          // 忽略关闭错误
        }
      }
      return false;
    }
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
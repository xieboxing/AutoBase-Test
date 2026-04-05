import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@/core/logger.js';
import { createDatabase, type DatabaseAdapter } from './adapter.js';

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  dbPath: string;
  enableVectorExtension?: boolean;
  vectorExtensionPath?: string;
}

/**
 * 平台类型枚举（用于测试结果分类存储）
 */
export type TestPlatform = 'pc-web' | 'h5-web' | 'android-app' | 'api';

/**
 * 默认配置 - 使用 db/sqlite.db 作为主数据库
 */
const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  dbPath: process.env.AUTO_TEST_DB_PATH || process.env.DB_PATH || './db/sqlite.db',
  enableVectorExtension: true,
  vectorExtensionPath: './db/ext',
};

/**
 * 知识库数据库管理
 */
export class KnowledgeDatabase {
  private config: DatabaseConfig;
  private db: DatabaseAdapter | null = null;
  private dbType: 'better-sqlite3' | 'sql.js' | null = null;
  private vectorEnabled: boolean = false;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = { ...DEFAULT_DATABASE_CONFIG, ...config };
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    const result = await createDatabase(this.config.dbPath, {
      info: (msg, data) => logger.info(msg, data as Record<string, unknown> | undefined),
      warn: (msg, data) => logger.warn(msg, data as Record<string, unknown> | undefined),
    });

    this.db = result.adapter;
    this.dbType = result.type;

    // 尝试加载向量扩展（仅 better-sqlite3 支持）
    if (this.config.enableVectorExtension && result.type === 'better-sqlite3') {
      await this.loadVectorExtension();
    }

    // 创建所有表
    this.createTables();

    logger.pass('✅ 知识库数据库初始化完成', {
      dbPath: this.config.dbPath,
      dbType: this.dbType,
      vectorEnabled: this.vectorEnabled,
    });
  }

  /**
   * 加载向量扩展（仅 better-sqlite3 支持）
   */
  private async loadVectorExtension(): Promise<void> {
    // sql.js 不支持扩展，跳过
    if (this.dbType !== 'better-sqlite3') {
      return;
    }

    try {
      const extPath = this.config.vectorExtensionPath
        ? this.getVectorExtensionPath(this.config.vectorExtensionPath)
        : this.getVectorExtensionPath('./db/ext');

      // 检查扩展文件是否存在
      try {
        await fs.access(extPath);
      } catch {
        logger.warn(`⚠️ 向量扩展文件不存在: ${extPath}，将使用普通模式`);
        return;
      }

      // better-sqlite3 的扩展加载需要直接访问底层 db
      // 这里暂时跳过，因为适配器接口不支持 loadExtension
      logger.info(`ℹ️ 向量扩展功能需要 better-sqlite3 直接支持`);
    } catch (error) {
      logger.warn('⚠️ 向量扩展加载失败，将使用普通模式', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.vectorEnabled = false;
    }
  }

  /**
   * 获取平台特定的向量扩展路径
   */
  private getVectorExtensionPath(basePath: string): string {
    const platform = process.platform;

    if (platform === 'win32') {
      return path.join(basePath, 'windows', 'vec0.dll');
    }
    if (platform === 'darwin') {
      return path.join(basePath, 'macos', 'vec0.so');
    }
    return path.join(basePath, 'linux', 'vec0.so');
  }

  /**
   * 创建所有表（支持平台分类存储）
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- 测试运行记录表（增强版，支持平台分类）
      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT NOT NULL,
        test_type TEXT DEFAULT 'full',
        start_time TEXT NOT NULL,
        end_time TEXT,
        duration_ms INTEGER DEFAULT 0,
        total_cases INTEGER DEFAULT 0,
        passed INTEGER DEFAULT 0,
        failed INTEGER DEFAULT 0,
        skipped INTEGER DEFAULT 0,
        blocked INTEGER DEFAULT 0,
        pass_rate REAL DEFAULT 0,
        status TEXT DEFAULT 'running',
        browser TEXT,
        browser_version TEXT,
        device TEXT,
        os TEXT,
        os_version TEXT,
        viewport_width INTEGER,
        viewport_height INTEGER,
        app_version TEXT,
        app_package TEXT,
        config_json TEXT,
        ai_analysis TEXT,
        risk_level TEXT,
        created TEXT NOT NULL
      );

      -- 测试用例结果表（增强版）
      CREATE TABLE IF NOT EXISTS test_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        case_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        test_category TEXT DEFAULT 'functional',
        status TEXT NOT NULL,
        priority TEXT DEFAULT 'P2',
        duration_ms INTEGER DEFAULT 0,
        retry_count INTEGER DEFAULT 0,
        error_message TEXT,
        error_stack TEXT,
        error_screenshot TEXT,
        error_video TEXT,
        ai_error_analysis TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        self_healed INTEGER DEFAULT 0,
        self_heal_selector TEXT,
        embedding BLOB,
        created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      -- 测试步骤结果表
      CREATE TABLE IF NOT EXISTS test_step_results (
        id TEXT PRIMARY KEY,
        result_id TEXT NOT NULL,
        step_order INTEGER NOT NULL,
        action TEXT NOT NULL,
        target TEXT,
        value TEXT,
        status TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT,
        screenshot TEXT,
        created TEXT NOT NULL
      );

      -- 元素定位映射表（增强版）
      CREATE TABLE IF NOT EXISTS element_mappings (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT NOT NULL,
        page_url TEXT NOT NULL,
        page_name TEXT,
        element_name TEXT,
        element_description TEXT,
        original_selector TEXT NOT NULL,
        alternative_selectors TEXT,
        last_working_selector TEXT,
        selector_type TEXT DEFAULT 'css',
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        last_success TEXT,
        last_failure TEXT,
        ai_suggested INTEGER DEFAULT 0,
        embedding BLOB,
        page_url_pattern TEXT,
        last_updated TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 失败模式库表（增强版）
      CREATE TABLE IF NOT EXISTS failure_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        platform TEXT,
        description TEXT,
        frequency INTEGER DEFAULT 1,
        last_occurrence TEXT NOT NULL,
        first_occurrence TEXT NOT NULL,
        root_cause TEXT,
        solution TEXT,
        solution_steps TEXT,
        auto_fix_config TEXT,
        resolved_count INTEGER DEFAULT 0,
        misfire_count INTEGER DEFAULT 0,
        ai_analyzed INTEGER DEFAULT 0,
        auto_fixable INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        UNIQUE(pattern_type, pattern_key, platform)
      );

      -- 优化历史表（增强版）
      CREATE TABLE IF NOT EXISTS optimization_history (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        optimization_type TEXT NOT NULL,
        case_id TEXT,
        before_value TEXT,
        after_value TEXT,
        improvement REAL DEFAULT 0,
        reason TEXT,
        ai_generated INTEGER DEFAULT 0,
        applied INTEGER DEFAULT 0,
        applied_time TEXT,
        created TEXT NOT NULL
      );

      -- 最佳实践表（增强版）
      CREATE TABLE IF NOT EXISTS best_practices (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        platform TEXT,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        example TEXT,
        tags TEXT,
        confidence REAL DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        success_rate REAL DEFAULT 0,
        embedding BLOB,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 测试覆盖率统计表
      CREATE TABLE IF NOT EXISTS test_coverage (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT NOT NULL,
        coverage_date TEXT NOT NULL,
        total_features INTEGER DEFAULT 0,
        covered_features INTEGER DEFAULT 0,
        feature_coverage_rate REAL DEFAULT 0,
        total_pages INTEGER DEFAULT 0,
        covered_pages INTEGER DEFAULT 0,
        page_coverage_rate REAL DEFAULT 0,
        total_apis INTEGER DEFAULT 0,
        covered_apis INTEGER DEFAULT 0,
        api_coverage_rate REAL DEFAULT 0,
        uncovered_items TEXT,
        created TEXT NOT NULL,
        UNIQUE(project, platform, coverage_date)
      );

      -- 覆盖薄弱区域表
      CREATE TABLE IF NOT EXISTS coverage_weak_areas (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        url_pattern TEXT NOT NULL,
        feature_area TEXT NOT NULL,
        coverage_rate REAL DEFAULT 0,
        visit_count INTEGER DEFAULT 0,
        last_visit_time TEXT,
        created TEXT NOT NULL
      );

      -- AI 交互记录表
      CREATE TABLE IF NOT EXISTS ai_interactions (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        interaction_type TEXT NOT NULL,
        prompt_summary TEXT,
        input_data TEXT,
        output_data TEXT,
        model_used TEXT,
        tokens_used INTEGER DEFAULT 0,
        duration_ms INTEGER DEFAULT 0,
        success INTEGER DEFAULT 1,
        error_message TEXT,
        created TEXT NOT NULL
      );

      -- ===== 智能化升级所需表 =====

      -- 用例历史统计表
      CREATE TABLE IF NOT EXISTS case_statistics (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        project TEXT NOT NULL,
        platform TEXT NOT NULL,
        total_runs INTEGER DEFAULT 0,
        pass_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        skip_count INTEGER DEFAULT 0,
        pass_rate REAL DEFAULT 0,
        consecutive_passes INTEGER DEFAULT 0,
        consecutive_failures INTEGER DEFAULT 0,
        stability_score REAL DEFAULT 0,
        is_stable INTEGER DEFAULT 0,
        last_run_time TEXT,
        last_result TEXT,
        avg_duration_ms INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        UNIQUE(case_id, project, platform)
      );

      -- 调度决策记录表
      CREATE TABLE IF NOT EXISTS scheduler_decisions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        decision TEXT NOT NULL,
        risk_score REAL DEFAULT 0,
        reason TEXT,
        created TEXT NOT NULL
      );

      -- RAG 记忆表
      CREATE TABLE IF NOT EXISTS rag_memories (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        platform TEXT,
        memory_type TEXT NOT NULL,
        context_url TEXT,
        context_package TEXT,
        dom_summary TEXT,
        view_summary TEXT,
        execution_result TEXT NOT NULL,
        solution_strategy TEXT,
        solution_steps TEXT,
        related_screenshots TEXT,
        related_logs TEXT,
        embedding BLOB,
        confidence REAL DEFAULT 1.0,
        usage_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rag_memories_project ON rag_memories(project_id);
      CREATE INDEX IF NOT EXISTS idx_rag_memories_type ON rag_memories(memory_type);
      CREATE INDEX IF NOT EXISTS idx_rag_memories_platform ON rag_memories(platform);

      -- 业务流表
      CREATE TABLE IF NOT EXISTS business_flows (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        flow_name TEXT NOT NULL,
        flow_type TEXT,
        steps TEXT NOT NULL,
        entry_points TEXT,
        exit_points TEXT,
        critical_path INTEGER DEFAULT 0,
        confidence REAL DEFAULT 0,
        last_validated TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 状态图谱节点表
      CREATE TABLE IF NOT EXISTS state_graph_nodes (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        state_hash TEXT NOT NULL,
        state_summary TEXT,
        url_pattern TEXT,
        page_title TEXT,
        visit_count INTEGER DEFAULT 0,
        last_visited TEXT,
        is_entry_point INTEGER DEFAULT 0,
        is_exit_point INTEGER DEFAULT 0,
        metadata TEXT,
        created TEXT NOT NULL
      );

      -- 状态图谱边表
      CREATE TABLE IF NOT EXISTS state_graph_edges (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        source_state TEXT NOT NULL,
        target_state TEXT NOT NULL,
        action TEXT NOT NULL,
        action_type TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_traversed TEXT,
        metadata TEXT,
        created TEXT NOT NULL
      );

      -- 视觉基线表
      CREATE TABLE IF NOT EXISTS visual_baselines (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        page_url TEXT NOT NULL,
        viewport_width INTEGER DEFAULT 1920,
        viewport_height INTEGER DEFAULT 1080,
        browser TEXT,
        device TEXT,
        baseline_image TEXT NOT NULL,
        baseline_hash TEXT,
        approved INTEGER DEFAULT 0,
        approved_by TEXT,
        approved_time TEXT,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 视觉差异记录表
      CREATE TABLE IF NOT EXISTS visual_diffs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        baseline_id TEXT NOT NULL,
        current_image TEXT NOT NULL,
        diff_image TEXT,
        diff_percentage REAL DEFAULT 0,
        diff_regions TEXT,
        threshold REAL DEFAULT 0,
        passed INTEGER DEFAULT 0,
        created TEXT NOT NULL
      );

      -- 自动优化建议表（增强版，支持收益验证）
      CREATE TABLE IF NOT EXISTS auto_optimization_suggestions (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT,
        case_id TEXT,
        suggestion_type TEXT NOT NULL,
        suggestion_value TEXT,
        reason TEXT NOT NULL,
        confidence REAL DEFAULT 0,
        auto_applicable INTEGER DEFAULT 0,
        applied INTEGER DEFAULT 0,
        applied_time TEXT,
        effectiveness_score REAL,
        before_pass_rate REAL,
        after_pass_rate REAL,
        before_avg_duration_ms INTEGER,
        after_avg_duration_ms INTEGER,
        verification_status TEXT DEFAULT 'pending',
        verified_at TEXT,
        verification_run_count INTEGER DEFAULT 0,
        created TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auto_opt_suggestions_case ON auto_optimization_suggestions(case_id);
      CREATE INDEX IF NOT EXISTS idx_auto_opt_suggestions_status ON auto_optimization_suggestions(verification_status);

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project);
      CREATE INDEX IF NOT EXISTS idx_test_runs_platform ON test_runs(platform);
      CREATE INDEX IF NOT EXISTS idx_test_runs_start_time ON test_runs(start_time);
      CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
      CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_case_id ON test_results(case_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_platform ON test_results(platform);
      CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
      CREATE INDEX IF NOT EXISTS idx_test_results_category ON test_results(test_category);
      CREATE INDEX IF NOT EXISTS idx_test_step_results_result ON test_step_results(result_id);
      CREATE INDEX IF NOT EXISTS idx_element_mappings_project ON element_mappings(project);
      CREATE INDEX IF NOT EXISTS idx_element_mappings_platform ON element_mappings(platform);
      CREATE INDEX IF NOT EXISTS idx_element_mappings_original ON element_mappings(original_selector);
      CREATE INDEX IF NOT EXISTS idx_failure_patterns_type ON failure_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_failure_patterns_platform ON failure_patterns(platform);
      CREATE INDEX IF NOT EXISTS idx_optimization_history_project ON optimization_history(project);
      CREATE INDEX IF NOT EXISTS idx_optimization_history_platform ON optimization_history(platform);
      CREATE INDEX IF NOT EXISTS idx_best_practices_category ON best_practices(category);
      CREATE INDEX IF NOT EXISTS idx_best_practices_platform ON best_practices(platform);
      CREATE INDEX IF NOT EXISTS idx_test_coverage_project ON test_coverage(project);
      CREATE INDEX IF NOT EXISTS idx_test_coverage_platform ON test_coverage(platform);
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_project ON ai_interactions(project);
      CREATE INDEX IF NOT EXISTS idx_ai_interactions_type ON ai_interactions(interaction_type);
    `);
  }

  /**
   * 获取数据库实例
   */
  getDb(): DatabaseAdapter {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 获取数据库类型
   */
  getDbType(): 'better-sqlite3' | 'sql.js' | null {
    return this.dbType;
  }

  /**
   * 检查向量扩展是否可用
   */
  isVectorEnabled(): boolean {
    return this.vectorEnabled;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.dbType = null;
      this.vectorEnabled = false;
      logger.info('🔚 知识库数据库已关闭');
    }
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn);
  }

  /**
   * 执行查询
   */
  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.getDb().all<T>(sql, params);
  }

  /**
   * 执行单条查询
   */
  queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.getDb().get<T>(sql, params);
  }

  /**
   * 执行插入/更新/删除
   */
  execute(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
    return this.getDb().run(sql, params);
  }

  /**
   * 批量执行
   */
  batch(sql: string, paramsArray: unknown[][]): Array<{ changes: number; lastInsertRowid: number | bigint }> {
    const results: Array<{ changes: number; lastInsertRowid: number | bigint }> = [];

    this.transaction(() => {
      for (const params of paramsArray) {
        results.push(this.getDb().run(sql, params));
      }
    });

    return results;
  }

  /**
   * 获取数据库统计信息（增强版，支持平台分类）
   */
  getStats(): {
    testRuns: number;
    testResults: number;
    elementMappings: number;
    failurePatterns: number;
    optimizations: number;
    bestPractices: number;
    aiInteractions: number;
    byPlatform: Record<TestPlatform, { runs: number; results: number }>;
  } {
    const stats = {
      testRuns: 0,
      testResults: 0,
      elementMappings: 0,
      failurePatterns: 0,
      optimizations: 0,
      bestPractices: 0,
      aiInteractions: 0,
      byPlatform: {
        'pc-web': { runs: 0, results: 0 },
        'h5-web': { runs: 0, results: 0 },
        'android-app': { runs: 0, results: 0 },
        api: { runs: 0, results: 0 },
      } as Record<TestPlatform, { runs: number; results: number }>,
    };

    if (!this.db) return stats;

    stats.testRuns = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test_runs')?.count ?? 0;
    stats.testResults = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test_results')?.count ?? 0;
    stats.elementMappings = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM element_mappings')?.count ?? 0;
    stats.failurePatterns = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM failure_patterns')?.count ?? 0;
    stats.optimizations = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM optimization_history')?.count ?? 0;
    stats.bestPractices = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM best_practices')?.count ?? 0;
    stats.aiInteractions = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM ai_interactions')?.count ?? 0;

    // 按平台统计
    const platformRuns = this.query<{ platform: TestPlatform; count: number }>(
      'SELECT platform, COUNT(*) as count FROM test_runs GROUP BY platform'
    );
    const platformResults = this.query<{ platform: TestPlatform; count: number }>(
      'SELECT platform, COUNT(*) as count FROM test_results GROUP BY platform'
    );

    for (const row of platformRuns) {
      if (stats.byPlatform[row.platform]) {
        stats.byPlatform[row.platform].runs = row.count;
      }
    }
    for (const row of platformResults) {
      if (stats.byPlatform[row.platform]) {
        stats.byPlatform[row.platform].results = row.count;
      }
    }

    return stats;
  }

  /**
   * 获取平台特定的测试运行历史
   */
  getRunsByPlatform(
    platform: TestPlatform,
    options?: {
      project?: string;
      limit?: number;
      startDate?: string;
      endDate?: string;
    }
  ): Array<{
    id: string;
    project: string;
    startTime: string;
    endTime: string | null;
    totalCases: number;
    passed: number;
    failed: number;
    passRate: number;
    status: string;
  }> {
    let sql = 'SELECT * FROM test_runs WHERE platform = ?';
    const params: unknown[] = [platform];

    if (options?.project) {
      sql += ' AND project = ?';
      params.push(options.project);
    }
    if (options?.startDate) {
      sql += ' AND start_time >= ?';
      params.push(options.startDate);
    }
    if (options?.endDate) {
      sql += ' AND start_time <= ?';
      params.push(options.endDate);
    }
    sql += ' ORDER BY start_time DESC';
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.query(sql, params);
  }

  /**
   * 清理旧数据（增强版）
   */
  async cleanup(olderThanDays: number = 30): Promise<{
    testRunsDeleted: number;
    testResultsDeleted: number;
    stepResultsDeleted: number;
    aiInteractionsDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffStr = cutoffDate.toISOString();

    // 删除旧的步骤结果
    const stepsDeleted = this.execute(
      `DELETE FROM test_step_results WHERE result_id IN
        (SELECT id FROM test_results WHERE run_id IN
          (SELECT id FROM test_runs WHERE start_time < ?))`,
      [cutoffStr]
    ).changes;

    // 删除旧的测试结果
    const resultsDeleted = this.execute(
      'DELETE FROM test_results WHERE run_id IN (SELECT id FROM test_runs WHERE start_time < ?)',
      [cutoffStr]
    ).changes;

    // 删除旧的测试运行记录
    const runsDeleted = this.execute('DELETE FROM test_runs WHERE start_time < ?', [cutoffStr]).changes;

    // 删除旧的 AI 交互记录
    const aiDeleted = this.execute('DELETE FROM ai_interactions WHERE created < ?', [cutoffStr]).changes;

    logger.info(
      `🧹 清理了 ${runsDeleted} 条测试运行记录、${resultsDeleted} 条测试结果、${stepsDeleted} 条步骤结果、${aiDeleted} 条 AI 交互记录`
    );

    return {
      testRunsDeleted: runsDeleted,
      testResultsDeleted: resultsDeleted,
      stepResultsDeleted: stepsDeleted,
      aiInteractionsDeleted: aiDeleted,
    };
  }
}

// 单例实例
let dbInstance: KnowledgeDatabase | null = null;
let initPromise: Promise<void> | null = null;
let isInitializing: boolean = false;
let initError: Error | null = null;

/**
 * 检查数据库是否已初始化
 */
export function isDatabaseInitialized(): boolean {
  return dbInstance !== null && dbInstance['db'] !== null;
}

/**
 * 获取数据库单例
 * 注意：此函数会返回数据库实例，但不保证初始化已完成
 * 如果需要确保数据库已初始化，请使用 getDatabaseAsync() 或先调用 initializeDatabase()
 */
export function getDatabase(config?: Partial<DatabaseConfig>): KnowledgeDatabase {
  if (!dbInstance) {
    // 自动初始化一个默认实例（延迟初始化模式）
    // 但建议在生产环境中显式调用 initializeDatabase()
    logger.warn('⚠️ 数据库单例在未显式初始化的情况下被访问，建议在启动时调用 initializeDatabase()');

    // 同步创建实例（初始化是异步的）
    dbInstance = new KnowledgeDatabase(config);

    // 触发异步初始化（不等待）
    if (!isInitializing && !initPromise) {
      isInitializing = true;
      initPromise = dbInstance.initialize().then(() => {
        isInitializing = false;
      }).catch(err => {
        logger.error('数据库自动初始化失败', { error: String(err) });
        initError = err instanceof Error ? err : new Error(String(err));
        initPromise = null;
        isInitializing = false;
      });
    }
  }
  return dbInstance;
}

/**
 * 异步获取已初始化的数据库单例
 * 确保数据库已完全初始化后再返回
 */
export async function getDatabaseAsync(config?: Partial<DatabaseConfig>): Promise<KnowledgeDatabase> {
  // 如果已有错误，抛出
  if (initError) {
    throw initError;
  }

  // 如果正在初始化，等待完成
  if (isInitializing && initPromise) {
    await initPromise;
  }

  // 如果已有实例且已初始化，直接返回
  if (dbInstance && dbInstance['db']) {
    return dbInstance;
  }

  // 需要初始化
  return initializeDatabase(config);
}

/**
 * 等待数据库初始化完成
 * 必须在调用 getDatabase() 后调用此方法以确保数据库已就绪
 */
export async function waitForInitialization(): Promise<void> {
  // 如果有错误，抛出
  if (initError) {
    throw initError;
  }

  // 如果正在初始化，等待完成
  if (isInitializing && initPromise) {
    await initPromise;
  }

  // 如果数据库实例存在但未初始化，等待初始化完成
  if (dbInstance && !dbInstance['db']) {
    // 等待 db 属性被设置
    let attempts = 0;
    while (!dbInstance['db'] && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 50));
      attempts++;
    }
    if (!dbInstance['db']) {
      throw new Error('数据库初始化超时');
    }
  }
}

/**
 * 初始化数据库
 * 推荐在应用启动时调用此方法
 */
export async function initializeDatabase(config?: Partial<DatabaseConfig>): Promise<KnowledgeDatabase> {
  // 如果有之前的错误，清除
  initError = null;

  // 如果正在初始化，等待完成
  if (isInitializing && initPromise) {
    await initPromise;
    if (dbInstance && dbInstance['db']) {
      return dbInstance;
    }
    // 如果等待后仍未初始化成功，检查错误
    if (initError) {
      throw initError;
    }
  }

  // 如果已经初始化，直接返回
  if (dbInstance && dbInstance['db']) {
    return dbInstance;
  }

  // 开始初始化
  isInitializing = true;
  dbInstance = new KnowledgeDatabase(config);

  try {
    initPromise = dbInstance.initialize();
    await initPromise;
    return dbInstance;
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
    throw initError;
  } finally {
    isInitializing = false;
    initPromise = null;
  }
}

/**
 * 重置数据库实例（用于测试或重新配置）
 */
export function resetDatabase(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // 忽略关闭错误
    }
    dbInstance = null;
  }
  isInitializing = false;
  initPromise = null;
}
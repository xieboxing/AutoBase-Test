import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@/core/logger.js';

/**
 * 数据库配置
 */
export interface DatabaseConfig {
  dbPath: string;
}

/**
 * 默认配置
 */
const DEFAULT_DATABASE_CONFIG: DatabaseConfig = {
  dbPath: './data/knowledge/knowledge.db',
};

/**
 * 知识库数据库管理
 */
export class KnowledgeDatabase {
  private config: DatabaseConfig;
  private db: Database.Database | null = null;

  constructor(config: Partial<DatabaseConfig> = {}) {
    this.config = { ...DEFAULT_DATABASE_CONFIG, ...config };
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    const dbDir = path.dirname(this.config.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    this.db = new Database(this.config.dbPath);

    // 创建所有表
    this.createTables();

    logger.pass('✅ 知识库数据库初始化完成', { dbPath: this.config.dbPath });
  }

  /**
   * 创建所有表
   */
  private createTables(): void {
    if (!this.db) return;

    this.db.exec(`
      -- 测试运行记录表
      CREATE TABLE IF NOT EXISTS test_runs (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        platform TEXT NOT NULL,
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
        config_json TEXT,
        created TEXT NOT NULL
      );

      -- 测试用例结果表
      CREATE TABLE IF NOT EXISTS test_results (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        case_id TEXT NOT NULL,
        case_name TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT,
        error_stack TEXT,
        screenshot TEXT,
        video TEXT,
        start_time TEXT NOT NULL,
        end_time TEXT,
        self_healed INTEGER DEFAULT 0,
        self_heal_selector TEXT,
        FOREIGN KEY (run_id) REFERENCES test_runs(id)
      );

      -- 元素定位映射表（自愈用）
      CREATE TABLE IF NOT EXISTS element_mappings (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        page_url TEXT NOT NULL,
        element_name TEXT,
        original_selector TEXT NOT NULL,
        alternative_selectors TEXT,
        last_working_selector TEXT,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        last_success TEXT,
        last_failure TEXT,
        ai_suggested INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 失败模式库表
      CREATE TABLE IF NOT EXISTS failure_patterns (
        id TEXT PRIMARY KEY,
        pattern_type TEXT NOT NULL,
        pattern_key TEXT NOT NULL,
        description TEXT,
        frequency INTEGER DEFAULT 1,
        last_occurrence TEXT NOT NULL,
        first_occurrence TEXT NOT NULL,
        root_cause TEXT,
        solution TEXT,
        ai_analyzed INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL,
        UNIQUE(pattern_type, pattern_key)
      );

      -- 优化历史表
      CREATE TABLE IF NOT EXISTS optimization_history (
        id TEXT PRIMARY KEY,
        project TEXT NOT NULL,
        optimization_type TEXT NOT NULL,
        case_id TEXT,
        before_value TEXT,
        after_value TEXT,
        improvement REAL DEFAULT 0,
        reason TEXT,
        ai_generated INTEGER DEFAULT 0,
        applied INTEGER DEFAULT 0,
        created TEXT NOT NULL
      );

      -- 最佳实践表
      CREATE TABLE IF NOT EXISTS best_practices (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        example TEXT,
        tags TEXT,
        confidence REAL DEFAULT 0,
        usage_count INTEGER DEFAULT 0,
        created TEXT NOT NULL,
        updated TEXT NOT NULL
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project);
      CREATE INDEX IF NOT EXISTS idx_test_runs_start_time ON test_runs(start_time);
      CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_case_id ON test_results(case_id);
      CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
      CREATE INDEX IF NOT EXISTS idx_element_mappings_project ON element_mappings(project);
      CREATE INDEX IF NOT EXISTS idx_element_mappings_original ON element_mappings(original_selector);
      CREATE INDEX IF NOT EXISTS idx_failure_patterns_type ON failure_patterns(pattern_type);
      CREATE INDEX IF NOT EXISTS idx_optimization_history_project ON optimization_history(project);
    `);
  }

  /**
   * 获取数据库实例
   */
  getDb(): Database.Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('🔚 知识库数据库已关闭');
    }
  }

  /**
   * 执行事务
   */
  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  /**
   * 执行查询
   */
  query<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.getDb().prepare(sql).all(...params) as T[];
  }

  /**
   * 执行单条查询
   */
  queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.getDb().prepare(sql).get(...params) as T | undefined;
  }

  /**
   * 执行插入/更新/删除
   */
  execute(sql: string, params: unknown[] = []): Database.RunResult {
    return this.getDb().prepare(sql).run(...params);
  }

  /**
   * 批量执行
   */
  batch(sql: string, paramsArray: unknown[][]): Database.RunResult[] {
    const stmt = this.getDb().prepare(sql);
    const results: Database.RunResult[] = [];

    const insert = this.getDb().transaction(() => {
      for (const params of paramsArray) {
        results.push(stmt.run(...params));
      }
    });

    insert();
    return results;
  }

  /**
   * 获取数据库统计信息
   */
  getStats(): {
    testRuns: number;
    testResults: number;
    elementMappings: number;
    failurePatterns: number;
    optimizations: number;
    bestPractices: number;
  } {
    const stats = {
      testRuns: 0,
      testResults: 0,
      elementMappings: 0,
      failurePatterns: 0,
      optimizations: 0,
      bestPractices: 0,
    };

    if (!this.db) return stats;

    stats.testRuns = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test_runs')?.count ?? 0;
    stats.testResults = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test_results')?.count ?? 0;
    stats.elementMappings = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM element_mappings')?.count ?? 0;
    stats.failurePatterns = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM failure_patterns')?.count ?? 0;
    stats.optimizations = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM optimization_history')?.count ?? 0;
    stats.bestPractices = this.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM best_practices')?.count ?? 0;

    return stats;
  }

  /**
   * 清理旧数据
   */
  async cleanup(olderThanDays: number = 30): Promise<{
    testRunsDeleted: number;
    testResultsDeleted: number;
  }> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    const cutoffStr = cutoffDate.toISOString();

    // 删除旧的测试结果
    const resultsDeleted = this.execute(
      'DELETE FROM test_results WHERE run_id IN (SELECT id FROM test_runs WHERE start_time < ?)',
      [cutoffStr]
    ).changes;

    // 删除旧的测试运行记录
    const runsDeleted = this.execute(
      'DELETE FROM test_runs WHERE start_time < ?',
      [cutoffStr]
    ).changes;

    logger.info(`🧹 清理了 ${runsDeleted} 条测试运行记录和 ${resultsDeleted} 条测试结果`);

    return {
      testRunsDeleted: runsDeleted,
      testResultsDeleted: resultsDeleted,
    };
  }
}

// 单例实例
let dbInstance: KnowledgeDatabase | null = null;

/**
 * 获取数据库单例
 */
export function getDatabase(config?: Partial<DatabaseConfig>): KnowledgeDatabase {
  if (!dbInstance) {
    dbInstance = new KnowledgeDatabase(config);
  }
  return dbInstance;
}

/**
 * 初始化数据库
 */
export async function initializeDatabase(config?: Partial<DatabaseConfig>): Promise<KnowledgeDatabase> {
  const db = getDatabase(config);
  await db.initialize();
  return db;
}
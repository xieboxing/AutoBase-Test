import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs/promises';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type { TestCase, TestStatus } from '@/types/test-case.types.js';

/**
 * 用例运行统计
 */
export interface CaseRunStats {
  caseId: string;
  runCount: number;
  passCount: number;
  failCount: number;
  skipCount: number;
  passRate: number;
  avgDurationMs: number;
  lastRunTime: string | null;
  lastResult: TestStatus | null;
  lastErrorMessage: string | null;
}

/**
 * 运行记录
 */
export interface CaseRunRecord {
  id: string;
  caseId: string;
  runId: string;
  status: TestStatus;
  durationMs: number;
  errorMessage?: string;
  screenshot?: string;
  timestamp: string;
}

/**
 * 用例存储配置
 */
export interface CaseStoreConfig {
  dbPath: string;
  casesDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_CASE_STORE_CONFIG: CaseStoreConfig = {
  dbPath: './data/knowledge/knowledge.db',
  casesDir: './test-suites',
};

/**
 * 测试用例存储
 * 使用 SQLite 存储用例元数据和运行统计
 */
export class CaseStore {
  private config: CaseStoreConfig;
  private db: Database.Database | null = null;

  constructor(config: Partial<CaseStoreConfig> = {}) {
    this.config = { ...DEFAULT_CASE_STORE_CONFIG, ...config };
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<void> {
    // 确保目录存在
    const dbDir = path.dirname(this.config.dbPath);
    await fs.mkdir(dbDir, { recursive: true });

    this.db = new Database(this.config.dbPath);

    // 创建表
    this.db.exec(`
      -- 用例统计表
      CREATE TABLE IF NOT EXISTS case_stats (
        case_id TEXT PRIMARY KEY,
        run_count INTEGER DEFAULT 0,
        pass_count INTEGER DEFAULT 0,
        fail_count INTEGER DEFAULT 0,
        skip_count INTEGER DEFAULT 0,
        pass_rate REAL DEFAULT 0,
        avg_duration_ms INTEGER DEFAULT 0,
        last_run_time TEXT,
        last_result TEXT,
        last_error_message TEXT
      );

      -- 运行记录表
      CREATE TABLE IF NOT EXISTS case_runs (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL,
        run_id TEXT NOT NULL,
        status TEXT NOT NULL,
        duration_ms INTEGER DEFAULT 0,
        error_message TEXT,
        screenshot TEXT,
        timestamp TEXT NOT NULL
      );

      -- 创建索引
      CREATE INDEX IF NOT EXISTS idx_case_runs_case_id ON case_runs(case_id);
      CREATE INDEX IF NOT EXISTS idx_case_runs_run_id ON case_runs(run_id);
      CREATE INDEX IF NOT EXISTS idx_case_runs_timestamp ON case_runs(timestamp);
    `);

    logger.pass('✅ 用例存储初始化完成');
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDb(): Database.Database {
    if (!this.db) {
      throw new Error('数据库未初始化，请先调用 initialize()');
    }
    return this.db;
  }

  /**
   * 记录用例运行结果
   */
  recordRun(record: Omit<CaseRunRecord, 'id' | 'timestamp'>): CaseRunRecord {
    const db = this.ensureDb();

    const runRecord: CaseRunRecord = {
      id: nanoid(8),
      ...record,
      timestamp: new Date().toISOString(),
    };

    // 插入运行记录
    const insertRun = db.prepare(`
      INSERT INTO case_runs (id, case_id, run_id, status, duration_ms, error_message, screenshot, timestamp)
      VALUES (@id, @caseId, @runId, @status, @durationMs, @errorMessage, @screenshot, @timestamp)
    `);

    insertRun.run({
      id: runRecord.id,
      caseId: runRecord.caseId,
      runId: runRecord.runId,
      status: runRecord.status,
      durationMs: runRecord.durationMs,
      errorMessage: runRecord.errorMessage ?? null,
      screenshot: runRecord.screenshot ?? null,
      timestamp: runRecord.timestamp,
    });

    // 更新统计
    this.updateStats(runRecord);

    return runRecord;
  }

  /**
   * 更新用例统计
   */
  private updateStats(record: CaseRunRecord): void {
    const db = this.ensureDb();

    // 获取当前统计
    const currentStats = this.getStats(record.caseId);

    const newRunCount = currentStats.runCount + 1;
    const newPassCount = currentStats.passCount + (record.status === 'passed' ? 1 : 0);
    const newFailCount = currentStats.failCount + (record.status === 'failed' ? 1 : 0);
    const newSkipCount = currentStats.skipCount + (record.status === 'skipped' ? 1 : 0);
    const newPassRate = newRunCount > 0 ? newPassCount / newRunCount : 0;

    // 计算新的平均耗时
    const totalDuration = currentStats.avgDurationMs * currentStats.runCount + record.durationMs;
    const newAvgDuration = newRunCount > 0 ? Math.round(totalDuration / newRunCount) : 0;

    // 更新或插入统计
    const upsertStats = db.prepare(`
      INSERT INTO case_stats (case_id, run_count, pass_count, fail_count, skip_count, pass_rate, avg_duration_ms, last_run_time, last_result, last_error_message)
      VALUES (@caseId, @runCount, @passCount, @failCount, @skipCount, @passRate, @avgDurationMs, @lastRunTime, @lastResult, @lastErrorMessage)
      ON CONFLICT(case_id) DO UPDATE SET
        run_count = @runCount,
        pass_count = @passCount,
        fail_count = @failCount,
        skip_count = @skipCount,
        pass_rate = @passRate,
        avg_duration_ms = @avgDurationMs,
        last_run_time = @lastRunTime,
        last_result = @lastResult,
        last_error_message = @lastErrorMessage
    `);

    upsertStats.run({
      caseId: record.caseId,
      runCount: newRunCount,
      passCount: newPassCount,
      failCount: newFailCount,
      skipCount: newSkipCount,
      passRate: newPassRate,
      avgDurationMs: newAvgDuration,
      lastRunTime: record.timestamp,
      lastResult: record.status,
      lastErrorMessage: record.errorMessage ?? null,
    });
  }

  /**
   * 获取用例统计
   */
  getStats(caseId: string): CaseRunStats {
    const db = this.ensureDb();

    const row = db.prepare(`
      SELECT * FROM case_stats WHERE case_id = ?
    `).get(caseId) as {
      case_id: string;
      run_count: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      avg_duration_ms: number;
      last_run_time: string | null;
      last_result: string | null;
      last_error_message: string | null;
    } | undefined;

    if (!row) {
      return {
        caseId,
        runCount: 0,
        passCount: 0,
        failCount: 0,
        skipCount: 0,
        passRate: 0,
        avgDurationMs: 0,
        lastRunTime: null,
        lastResult: null,
        lastErrorMessage: null,
      };
    }

    return {
      caseId: row.case_id,
      runCount: row.run_count,
      passCount: row.pass_count,
      failCount: row.fail_count,
      skipCount: row.skip_count,
      passRate: row.pass_rate,
      avgDurationMs: row.avg_duration_ms,
      lastRunTime: row.last_run_time,
      lastResult: row.last_result as TestStatus,
      lastErrorMessage: row.last_error_message,
    };
  }

  /**
   * 获取用例运行历史
   */
  getRunHistory(caseId: string, limit: number = 10): CaseRunRecord[] {
    const db = this.ensureDb();

    const rows = db.prepare(`
      SELECT * FROM case_runs
      WHERE case_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(caseId, limit) as Array<{
      id: string;
      case_id: string;
      run_id: string;
      status: string;
      duration_ms: number;
      error_message: string | null;
      screenshot: string | null;
      timestamp: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      runId: row.run_id,
      status: row.status as TestStatus,
      durationMs: row.duration_ms,
      errorMessage: row.error_message ?? undefined,
      screenshot: row.screenshot ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * 获取某次运行的所有用例结果
   */
  getRunResults(runId: string): CaseRunRecord[] {
    const db = this.ensureDb();

    const rows = db.prepare(`
      SELECT * FROM case_runs
      WHERE run_id = ?
      ORDER BY timestamp ASC
    `).all(runId) as Array<{
      id: string;
      case_id: string;
      run_id: string;
      status: string;
      duration_ms: number;
      error_message: string | null;
      screenshot: string | null;
      timestamp: string;
    }>;

    return rows.map(row => ({
      id: row.id,
      caseId: row.case_id,
      runId: row.run_id,
      status: row.status as TestStatus,
      durationMs: row.duration_ms,
      errorMessage: row.error_message ?? undefined,
      screenshot: row.screenshot ?? undefined,
      timestamp: row.timestamp,
    }));
  }

  /**
   * 批量获取用例统计
   */
  getManyStats(caseIds: string[]): Map<string, CaseRunStats> {
    const db = this.ensureDb();
    const statsMap = new Map<string, CaseRunStats>();

    const placeholders = caseIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT * FROM case_stats WHERE case_id IN (${placeholders})
    `).all(...caseIds) as Array<{
      case_id: string;
      run_count: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      avg_duration_ms: number;
      last_run_time: string | null;
      last_result: string | null;
      last_error_message: string | null;
    }>;

    for (const row of rows) {
      statsMap.set(row.case_id, {
        caseId: row.case_id,
        runCount: row.run_count,
        passCount: row.pass_count,
        failCount: row.fail_count,
        skipCount: row.skip_count,
        passRate: row.pass_rate,
        avgDurationMs: row.avg_duration_ms,
        lastRunTime: row.last_run_time,
        lastResult: row.last_result as TestStatus,
        lastErrorMessage: row.last_error_message,
      });
    }

    // 填充未找到的用例
    for (const caseId of caseIds) {
      if (!statsMap.has(caseId)) {
        statsMap.set(caseId, {
          caseId,
          runCount: 0,
          passCount: 0,
          failCount: 0,
          skipCount: 0,
          passRate: 0,
          avgDurationMs: 0,
          lastRunTime: null,
          lastResult: null,
          lastErrorMessage: null,
        });
      }
    }

    return statsMap;
  }

  /**
   * 更新用例元数据（同步到 JSON 文件）
   */
  async updateCaseMetadata(project: string, caseId: string, metadata: Partial<TestCase['metadata']>): Promise<void> {
    const casePath = path.join(this.config.casesDir, project, 'cases', `${caseId}.case.json`);

    try {
      const content = await fs.readFile(casePath, 'utf-8');
      const testCase = JSON.parse(content) as TestCase;

      testCase.metadata = {
        ...testCase.metadata,
        ...metadata,
        updated: new Date().toISOString(),
      };

      // 从统计中更新
      const stats = this.getStats(caseId);
      testCase.metadata.run_count = stats.runCount;
      testCase.metadata.pass_rate = stats.passRate;
      testCase.metadata.avg_duration_ms = stats.avgDurationMs;
      testCase.metadata.last_result = stats.lastResult ?? undefined;

      await fs.writeFile(casePath, JSON.stringify(testCase, null, 2), 'utf-8');
    } catch (error) {
      logger.warn(`⚠️ 无法更新用例元数据: ${caseId}`, { error });
    }
  }

  /**
   * 获取低通过率用例
   */
  getLowPassRateCases(threshold: number = 0.5): CaseRunStats[] {
    const db = this.ensureDb();

    const rows = db.prepare(`
      SELECT * FROM case_stats
      WHERE run_count >= 3 AND pass_rate < ?
      ORDER BY pass_rate ASC
    `).all(threshold) as Array<{
      case_id: string;
      run_count: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      avg_duration_ms: number;
      last_run_time: string | null;
      last_result: string | null;
      last_error_message: string | null;
    }>;

    return rows.map(row => ({
      caseId: row.case_id,
      runCount: row.run_count,
      passCount: row.pass_count,
      failCount: row.fail_count,
      skipCount: row.skip_count,
      passRate: row.pass_rate,
      avgDurationMs: row.avg_duration_ms,
      lastRunTime: row.last_run_time,
      lastResult: row.last_result as TestStatus,
      lastErrorMessage: row.last_error_message,
    }));
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('🔚 用例存储已关闭');
    }
  }
}

/**
 * 快捷函数：创建用例存储
 */
export function createCaseStore(config?: Partial<CaseStoreConfig>): CaseStore {
  return new CaseStore(config);
}
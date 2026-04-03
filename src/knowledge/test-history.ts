import type { TestRunResult, TestCaseResult } from '@/types/test-result.types.js';
import type { TestStatus } from '@/types/test-case.types.js';
import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 测试运行摘要
 */
export interface TestRunSummary {
  id: string;
  project: string;
  platform: string;
  startTime: string;
  endTime: string | null;
  durationMs: number;
  totalCases: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  status: 'running' | 'completed' | 'failed';
}

/**
 * 测试结果摘要
 */
export interface TestResultSummary {
  id: string;
  runId: string;
  caseId: string;
  caseName: string;
  status: TestStatus;
  durationMs: number;
  errorMessage: string | null;
  screenshot: string | null;
  selfHealed: boolean;
}

/**
 * 测试历史查询选项
 */
export interface TestHistoryQueryOptions {
  project?: string;
  platform?: string;
  status?: 'running' | 'completed' | 'failed';
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/**
 * 测试历史记录管理
 */
export class TestHistory {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 保存测试运行结果
   */
  saveRunResult(result: TestRunResult): void {
    const runId = result.runId;
    const now = new Date().toISOString();

    // 插入运行记录
    this.db.execute(`
      INSERT OR REPLACE INTO test_runs (
        id, project, platform, start_time, end_time, duration_ms,
        total_cases, passed, failed, skipped, blocked, pass_rate, status, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      runId,
      result.project,
      result.platform,
      result.startTime,
      result.endTime,
      result.duration,
      result.summary.total,
      result.summary.passed,
      result.summary.failed,
      result.summary.skipped,
      result.summary.blocked,
      result.summary.passRate,
      'completed',
      now,
    ]);

    // 插入用例结果
    for (const caseResult of result.cases) {
      this.saveCaseResult(runId, caseResult);
    }

    logger.pass('✅ 测试运行结果已保存', { runId, project: result.project });
  }

  /**
   * 保存单个用例结果
   */
  saveCaseResult(runId: string, result: TestCaseResult): void {
    const id = `${runId}-${result.caseId}`;

    this.db.execute(`
      INSERT OR REPLACE INTO test_results (
        id, run_id, case_id, case_name, status, duration_ms,
        error_message, error_stack, screenshot, video, start_time, end_time,
        self_healed, self_heal_selector
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      runId,
      result.caseId,
      result.caseName,
      result.status,
      result.durationMs,
      result.steps.find((s: any) => s.errorMessage)?.errorMessage ?? null,
      result.steps.find((s: any) => s.errorStack)?.errorStack ?? null,
      result.artifacts.screenshots?.[0] ?? null,
      result.artifacts.video ?? null,
      result.startTime,
      result.endTime,
      result.selfHealed ? 1 : 0,
      result.selfHealSelector ?? null,
    ]);
  }

  /**
   * 开始新的测试运行
   */
  startRun(project: string, platform: string, config?: Record<string, unknown>): string {
    const runId = nanoid(8);
    const now = new Date().toISOString();

    this.db.execute(`
      INSERT INTO test_runs (
        id, project, platform, start_time, status, created, config_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      runId,
      project,
      platform,
      now,
      'running',
      now,
      config ? JSON.stringify(config) : null,
    ]);

    logger.step('🎬 测试运行已开始', { runId, project, platform });
    return runId;
  }

  /**
   * 完成测试运行
   */
  completeRun(runId: string, summary: {
    totalCases: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;
  }): void {
    const now = new Date().toISOString();

    // 获取开始时间
    const run = this.db.queryOne<{ start_time: string }>(
      'SELECT start_time FROM test_runs WHERE id = ?',
      [runId]
    );

    const startTime = run?.start_time ? new Date(run.start_time) : new Date();
    const durationMs = Date.now() - startTime.getTime();

    this.db.execute(`
      UPDATE test_runs SET
        end_time = ?, duration_ms = ?, total_cases = ?, passed = ?,
        failed = ?, skipped = ?, blocked = ?, pass_rate = ?, status = 'completed'
      WHERE id = ?
    `, [
      now,
      durationMs,
      summary.totalCases,
      summary.passed,
      summary.failed,
      summary.skipped,
      summary.blocked,
      summary.passRate,
      runId,
    ]);

    logger.pass('✅ 测试运行已完成', { runId, passRate: summary.passRate });
  }

  /**
   * 查询测试运行历史
   */
  queryRuns(options: TestHistoryQueryOptions = {}): TestRunSummary[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.project) {
      conditions.push('project = ?');
      params.push(options.project);
    }

    if (options.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.startDate) {
      conditions.push('start_time >= ?');
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push('start_time <= ?');
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';
    const offsetClause = options.offset ? `OFFSET ${options.offset}` : '';

    const sql = `
      SELECT * FROM test_runs
      ${whereClause}
      ORDER BY start_time DESC
      ${limitClause} ${offsetClause}
    `;

    const rows = this.db.query<{
      id: string;
      project: string;
      platform: string;
      start_time: string;
      end_time: string | null;
      duration_ms: number;
      total_cases: number;
      passed: number;
      failed: number;
      skipped: number;
      blocked: number;
      pass_rate: number;
      status: string;
    }>(sql, params);

    return rows.map(row => ({
      id: row.id,
      project: row.project,
      platform: row.platform,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMs: row.duration_ms,
      totalCases: row.total_cases,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      blocked: row.blocked,
      passRate: row.pass_rate,
      status: row.status as 'running' | 'completed' | 'failed',
    }));
  }

  /**
   * 获取单个测试运行详情
   */
  getRun(runId: string): TestRunSummary | null {
    const row = this.db.queryOne<{
      id: string;
      project: string;
      platform: string;
      start_time: string;
      end_time: string | null;
      duration_ms: number;
      total_cases: number;
      passed: number;
      failed: number;
      skipped: number;
      blocked: number;
      pass_rate: number;
      status: string;
    }>('SELECT * FROM test_runs WHERE id = ?', [runId]);

    if (!row) return null;

    return {
      id: row.id,
      project: row.project,
      platform: row.platform,
      startTime: row.start_time,
      endTime: row.end_time,
      durationMs: row.duration_ms,
      totalCases: row.total_cases,
      passed: row.passed,
      failed: row.failed,
      skipped: row.skipped,
      blocked: row.blocked,
      passRate: row.pass_rate,
      status: row.status as 'running' | 'completed' | 'failed',
    };
  }

  /**
   * 获取测试运行的所有用例结果
   */
  getRunResults(runId: string): TestResultSummary[] {
    const rows = this.db.query<{
      id: string;
      run_id: string;
      case_id: string;
      case_name: string;
      status: string;
      duration_ms: number;
      error_message: string | null;
      screenshot: string | null;
      self_healed: number;
    }>('SELECT * FROM test_results WHERE run_id = ? ORDER BY start_time', [runId]);

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      caseName: row.case_name,
      status: row.status as TestStatus,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      screenshot: row.screenshot,
      selfHealed: row.self_healed === 1,
    }));
  }

  /**
   * 获取用例的历史结果
   */
  getCaseHistory(caseId: string, limit: number = 10): TestResultSummary[] {
    const rows = this.db.query<{
      id: string;
      run_id: string;
      case_id: string;
      case_name: string;
      status: string;
      duration_ms: number;
      error_message: string | null;
      screenshot: string | null;
      self_healed: number;
    }>(`
      SELECT * FROM test_results
      WHERE case_id = ?
      ORDER BY start_time DESC
      LIMIT ?
    `, [caseId, limit]);

    return rows.map(row => ({
      id: row.id,
      runId: row.run_id,
      caseId: row.case_id,
      caseName: row.case_name,
      status: row.status as TestStatus,
      durationMs: row.duration_ms,
      errorMessage: row.error_message,
      screenshot: row.screenshot,
      selfHealed: row.self_healed === 1,
    }));
  }

  /**
   * 获取项目统计
   */
  getProjectStats(project: string): {
    totalRuns: number;
    totalCases: number;
    avgPassRate: number;
    avgDuration: number;
    recentFailures: number;
  } {
    const stats = this.db.queryOne<{
      total_runs: number;
      total_cases: number;
      avg_pass_rate: number;
      avg_duration: number;
      recent_failures: number;
    }>(`
      SELECT
        COUNT(*) as total_runs,
        SUM(total_cases) as total_cases,
        AVG(pass_rate) as avg_pass_rate,
        AVG(duration_ms) as avg_duration,
        (SELECT COUNT(*) FROM test_results tr
         JOIN test_runs tr2 ON tr.run_id = tr2.id
         WHERE tr2.project = ? AND tr.status = 'failed'
         AND tr2.start_time > datetime('now', '-7 days')) as recent_failures
      FROM test_runs
      WHERE project = ?
    `, [project, project]);

    return {
      totalRuns: stats?.total_runs ?? 0,
      totalCases: stats?.total_cases ?? 0,
      avgPassRate: stats?.avg_pass_rate ?? 0,
      avgDuration: stats?.avg_duration ?? 0,
      recentFailures: stats?.recent_failures ?? 0,
    };
  }

  /**
   * 获取趋势数据
   */
  getTrend(project: string, days: number = 30): Array<{
    date: string;
    passRate: number;
    totalCases: number;
    failedCases: number;
  }> {
    const rows = this.db.query<{
      date: string;
      pass_rate: number;
      total_cases: number;
      failed_cases: number;
    }>(`
      SELECT
        date(start_time) as date,
        AVG(pass_rate) as pass_rate,
        SUM(total_cases) as total_cases,
        SUM(failed) as failed_cases
      FROM test_runs
      WHERE project = ? AND start_time > datetime('now', '-${days} days')
      GROUP BY date(start_time)
      ORDER BY date
    `, [project]);

    return rows.map(row => ({
      date: row.date,
      passRate: row.pass_rate,
      totalCases: row.total_cases,
      failedCases: row.failed_cases,
    }));
  }
}

/**
 * 快捷函数：创建测试历史实例
 */
export function createTestHistory(db?: KnowledgeDatabase): TestHistory {
  return new TestHistory(db);
}
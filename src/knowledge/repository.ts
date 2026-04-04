/**
 * 知识库统一数据访问层
 * 提供所有知识库相关查询的统一入口，避免业务模块直接散落 SQL
 */

import type { Platform, TestStatus } from '@/types/test-case.types.js';
import type {
  HistoricalContext,
  CaseStatistics,
  FailurePatternMatch,
  AutoFixConfig,
} from '@/types/knowledge.types.js';
import type { ScheduleDecision, RiskScoreParams } from '@/types/scheduler.types.js';
import type { getDatabase, KnowledgeDatabase } from './db/index.js';
import { TestHistory, createTestHistory } from './test-history.js';
import { FailurePatterns, createFailurePatterns } from './failure-patterns.js';
import { ElementMappingManager, createElementMappingManager } from './element-mapping.js';
import { OptimizationLog, createOptimizationLog } from './optimization-log.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 知识库仓储类
 * 统一的数据访问层，提供历史查询、写入、更新、删除、批量读取等功能
 */
export class KnowledgeRepository {
  private db: KnowledgeDatabase;
  private testHistory: TestHistory;
  private failurePatterns: FailurePatterns;
  private elementMappings: ElementMappingManager;
  private optimizationLog: OptimizationLog;

  constructor(database: KnowledgeDatabase) {
    this.db = database;
    this.testHistory = createTestHistory(database);
    this.failurePatterns = createFailurePatterns(database);
    this.elementMappings = createElementMappingManager(database);
    this.optimizationLog = createOptimizationLog(database);
  }

  // ===== 历史上下文查询 =====

  /**
   * 加载历史上下文（用于测试生成和执行）
   */
  loadHistoricalContext(project: string, platform: Platform): HistoricalContext {
    const startTime = Date.now();
    logger.info('📚 加载历史上下文', { project, platform });

    // 获取上次通过的用例列表
    const previousPassedCases = this.getLastPassedCasesWithStats(project, platform);

    // 获取上次失败的用例及原因
    const previousFailedCases = this.getLastFailedCases(project, platform);

    // 获取覆盖薄弱区域
    const uncoveredFeatures = this.getUncoveredFeatures(project, platform);
    const weakCoverageAreas = this.getWeakCoverageAreas(project, platform);

    // 获取历史失败模式摘要
    const failurePatterns = this.getRecentFailurePatterns(project, platform);

    // 获取稳定用例列表
    const stableCases = this.getStableCases(project, platform);

    // 获取高风险用例列表
    const highRiskCases = this.getHighRiskCases(project, platform);

    // 获取用例统计数据
    const caseStatistics = this.queryAllCaseStatistics(project, platform);

    // 获取优化建议
    const optimizationSuggestions = this.getOptimizationSuggestions(project, platform);

    const context: HistoricalContext = {
      projectId: project,
      platform,
      previousPassedCases,
      previousFailedCases,
      caseStatistics,
      uncoveredFeatures,
      weakCoverageAreas,
      failurePatterns,
      stableCases,
      highRiskCases,
      optimizationSuggestions,
      loadedAt: new Date().toISOString(),
    };

    logger.pass(`✅ 历史上下文加载完成 (${Date.now() - startTime}ms)`, {
      passedCases: previousPassedCases.length,
      failedCases: previousFailedCases.length,
      stableCases: stableCases.length,
      highRiskCases: highRiskCases.length,
    });

    return context;
  }

  /**
   * 查询所有用例统计数据（内部方法）
   */
  private queryAllCaseStatistics(project: string, platform: Platform): CaseStatistics[] {
    const rows = this.db.query<{
      case_id: string;
      case_name: string | null;
      total_runs: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      consecutive_passes: number;
      consecutive_failures: number;
      stability_score: number;
      is_stable: number;
      last_run_time: string | null;
      last_result: string | null;
      avg_duration_ms: number;
      created: string;
      updated: string;
    }>(`
      SELECT cs.*, tr.case_name
      FROM case_statistics cs
      LEFT JOIN (
        SELECT case_id, case_name FROM test_results GROUP BY case_id
      ) tr ON cs.case_id = tr.case_id
      WHERE cs.project = ? AND cs.platform = ?
      ORDER BY cs.last_run_time DESC
      LIMIT 100
    `, [project, platform]);

    return rows.map(r => ({
      caseId: r.case_id,
      caseName: r.case_name ?? undefined,
      projectId: project,
      platform,
      totalRuns: r.total_runs,
      passCount: r.pass_count,
      failCount: r.fail_count,
      skipCount: r.skip_count,
      passRate: r.pass_rate,
      failRate: r.fail_count / (r.total_runs || 1),
      consecutivePasses: r.consecutive_passes,
      consecutiveFailures: r.consecutive_failures,
      stabilityScore: r.stability_score,
      isStable: r.is_stable === 1,
      lastRunTime: r.last_run_time,
      lastResult: r.last_result as TestStatus | null,
      avgDurationMs: r.avg_duration_ms,
      createdAt: r.created,
      updatedAt: r.updated,
    }));
  }

  /**
   * 获取上次通过的用例列表（带统计信息）
   */
  private getLastPassedCasesWithStats(project: string, platform: Platform): Array<{
    caseId: string;
    caseName: string;
    passRate: number;
    lastRunTime?: string;
  }> {
    const rows = this.db.query<{
      case_id: string;
      case_name: string;
      pass_rate: number;
      last_run_time: string | null;
    }>(`
      SELECT DISTINCT tr.case_id, tr.case_name, cs.pass_rate, cs.last_run_time
      FROM test_results tr
      JOIN test_runs run ON tr.run_id = run.id
      LEFT JOIN case_statistics cs ON cs.case_id = tr.case_id AND cs.project = run.project
      WHERE run.project = ? AND run.platform = ? AND tr.status = 'passed'
      AND run.start_time = (
        SELECT MAX(start_time) FROM test_runs
        WHERE project = ? AND platform = ? AND status = 'completed'
      )
    `, [project, platform, project, platform]);

    return rows.map(r => ({
      caseId: r.case_id,
      caseName: r.case_name,
      passRate: r.pass_rate ?? 1,
      lastRunTime: r.last_run_time ?? undefined,
    }));
  }

  /**
   * 获取覆盖薄弱区域（简化格式）
   */
  private getWeakCoverageAreas(project: string, platform: Platform): Array<{
    urlPattern: string;
    featureArea: string;
    coverageRate: number;
  }> {
    const rows = this.db.query<{
      url_pattern: string;
      feature_area: string;
      coverage_rate: number;
    }>(`
      SELECT url_pattern, feature_area, coverage_rate
      FROM coverage_weak_areas
      WHERE project = ? AND (platform = ? OR platform IS NULL)
      ORDER BY coverage_rate ASC
      LIMIT 10
    `, [project, platform]);

    return rows.map(r => ({
      urlPattern: r.url_pattern,
      featureArea: r.feature_area,
      coverageRate: r.coverage_rate,
    }));
  }

  /**
   * 获取上次通过的用例列表
   */
  private getLastPassedCases(project: string, platform: Platform): string[] {
    const rows = this.db.query<{ case_id: string }>(`
      SELECT DISTINCT tr.case_id
      FROM test_results tr
      JOIN test_runs run ON tr.run_id = run.id
      WHERE run.project = ? AND run.platform = ? AND tr.status = 'passed'
      AND run.start_time = (
        SELECT MAX(start_time) FROM test_runs
        WHERE project = ? AND platform = ? AND status = 'completed'
      )
    `, [project, platform, project, platform]);

    return rows.map(r => r.case_id);
  }

  /**
   * 获取上次失败的用例及原因
   */
  private getLastFailedCases(project: string, platform: Platform): Array<{
    caseId: string;
    caseName: string;
    errorMessage: string;
    failureType: string;
    failureReason?: string;
    urlPattern?: string;
    failedStep?: {
      order: number;
      action: string;
      target?: string;
      description?: string;
    };
  }> {
    const rows = this.db.query<{
      case_id: string;
      case_name: string;
      error_message: string;
    }>(`
      SELECT DISTINCT tr.case_id, tr.case_name, tr.error_message
      FROM test_results tr
      JOIN test_runs run ON tr.run_id = run.id
      WHERE run.project = ? AND run.platform = ? AND tr.status = 'failed'
      AND run.start_time = (
        SELECT MAX(start_time) FROM test_runs
        WHERE project = ? AND platform = ? AND status = 'completed'
      )
    `, [project, platform, project, platform]);

    return rows.map(r => ({
      caseId: r.case_id,
      caseName: r.case_name,
      errorMessage: r.error_message ?? '',
      failureType: this.classifyFailureType(r.error_message ?? ''),
      failureReason: r.error_message ?? undefined,
    }));
  }

  /**
   * 获取覆盖薄弱区域
   */
  private getUncoveredFeatures(project: string, platform: Platform): Array<{
    featureName: string;
    coverage: number;
    importance: 'high' | 'medium' | 'low';
  }> {
    // 基于用例名称和功能测试分布分析
    const rows = this.db.query<{
      case_name: string;
      test_count: number;
    }>(`
      SELECT case_name, COUNT(*) as test_count
      FROM test_results tr
      JOIN test_runs run ON tr.run_id = run.id
      WHERE run.project = ? AND run.platform = ?
      GROUP BY case_name
      ORDER BY test_count ASC
      LIMIT 10
    `, [project, platform]);

    return rows.map(r => ({
      featureName: r.case_name,
      coverage: r.test_count,
      importance: r.test_count === 0 ? 'high' : r.test_count < 3 ? 'medium' : 'low' as const,
    }));
  }

  /**
   * 获取最近的失败模式摘要
   */
  private getRecentFailurePatterns(project: string, platform: Platform): Array<{
    patternType: string;
    patternKey: string;
    description?: string;
    frequency: number;
    lastOccurrence: string;
  }> {
    const rows = this.db.query<{
      pattern_type: string;
      pattern_key: string;
      description: string | null;
      frequency: number;
      last_occurrence: string;
    }>(`
      SELECT pattern_type, pattern_key, description, frequency, last_occurrence
      FROM failure_patterns
      WHERE (platform = ? OR platform IS NULL)
      ORDER BY frequency DESC
      LIMIT 10
    `, [platform]);

    return rows.map(r => ({
      patternType: r.pattern_type,
      patternKey: r.pattern_key,
      description: r.description ?? undefined,
      frequency: r.frequency,
      lastOccurrence: r.last_occurrence,
    }));
  }

  /**
   * 获取稳定用例列表（连续通过次数 >= 阈值）
   */
  private getStableCases(project: string, platform: Platform, threshold: number = 30): Array<{
    caseId: string;
    caseName?: string;
    consecutivePasses: number;
    passRate: number;
  }> {
    const rows = this.db.query<{
      case_id: string;
      consecutive_passes: number;
      pass_rate: number;
    }>(`
      SELECT case_id, consecutive_passes, pass_rate
      FROM case_statistics
      WHERE project = ? AND platform = ? AND is_stable = 1 AND consecutive_passes >= ?
    `, [project, platform, threshold]);

    return rows.map(r => ({
      caseId: r.case_id,
      consecutivePasses: r.consecutive_passes,
      passRate: r.pass_rate,
    }));
  }

  /**
   * 获取高风险用例列表
   */
  private getHighRiskCases(project: string, platform: Platform): Array<{
    caseId: string;
    caseName?: string;
    riskScore: number;
    reason: string;
  }> {
    const rows = this.db.query<{
      case_id: string;
      pass_rate: number;
      consecutive_failures: number;
    }>(`
      SELECT case_id, pass_rate, consecutive_failures
      FROM case_statistics
      WHERE project = ? AND platform = ?
      AND (pass_rate < 0.5 OR consecutive_failures >= 3)
      ORDER BY pass_rate ASC
      LIMIT 20
    `, [project, platform]);

    return rows.map(r => ({
      caseId: r.case_id,
      riskScore: 1 - r.pass_rate,
      reason: r.consecutive_failures >= 3
        ? `连续失败 ${r.consecutive_failures} 次`
        : `通过率仅 ${(r.pass_rate * 100).toFixed(1)}%`,
    }));
  }

  /**
   * 获取优化建议
   */
  private getOptimizationSuggestions(project: string, platform: Platform): Array<{
    suggestionType: string;
    caseId?: string;
    suggestion: string;
    reason?: string;
    confidence: number;
    autoApplicable: boolean;
    applied?: boolean;
    suggestionValue?: string;
  }> {
    const rows = this.db.query<{
      suggestion_type: string;
      case_id: string | null;
      suggestion_value: string | null;
      reason: string;
      confidence: number;
      auto_applicable: number;
      applied: number;
    }>(`
      SELECT suggestion_type, case_id, suggestion_value, reason, confidence, auto_applicable, applied
      FROM auto_optimization_suggestions
      WHERE project = ? AND (platform = ? OR platform IS NULL)
      ORDER BY confidence DESC
      LIMIT 20
    `, [project, platform]);

    return rows.map(r => ({
      suggestionType: r.suggestion_type,
      caseId: r.case_id ?? undefined,
      suggestion: r.suggestion_value ?? r.reason,
      reason: r.reason,
      confidence: r.confidence,
      autoApplicable: r.auto_applicable === 1,
      applied: r.applied === 1,
      suggestionValue: r.suggestion_value ?? undefined,
    }));
  }

  // ===== 用例统计查询 =====

  /**
   * 获取用例历史统计
   */
  getCaseStatistics(caseId: string, project: string, platform: Platform): CaseStatistics | null {
    const row = this.db.queryOne<{
      id: string;
      case_id: string;
      case_name: string | null;
      project: string;
      platform: string;
      total_runs: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      consecutive_passes: number;
      consecutive_failures: number;
      stability_score: number;
      is_stable: number;
      last_run_time: string | null;
      last_result: string | null;
      avg_duration_ms: number;
      created: string;
      updated: string;
    }>(`
      SELECT cs.*, tr.case_name
      FROM case_statistics cs
      LEFT JOIN (
        SELECT case_id, case_name FROM test_results GROUP BY case_id
      ) tr ON cs.case_id = tr.case_id
      WHERE cs.case_id = ? AND cs.project = ? AND cs.platform = ?
    `, [caseId, project, platform]);

    if (!row) return null;

    return {
      caseId: row.case_id,
      caseName: row.case_name ?? undefined,
      projectId: row.project,
      platform: row.platform as Platform,
      totalRuns: row.total_runs,
      passCount: row.pass_count,
      failCount: row.fail_count,
      skipCount: row.skip_count,
      passRate: row.pass_rate,
      failRate: row.fail_count / (row.total_runs || 1),
      consecutivePasses: row.consecutive_passes,
      consecutiveFailures: row.consecutive_failures,
      stabilityScore: row.stability_score,
      isStable: row.is_stable === 1,
      lastRunTime: row.last_run_time,
      lastResult: row.last_result as TestStatus | null,
      avgDurationMs: row.avg_duration_ms,
      createdAt: row.created,
      updatedAt: row.updated,
    };
  }

  /**
   * 更新用例统计
   */
  updateCaseStatistics(
    caseId: string,
    project: string,
    platform: Platform,
    result: 'passed' | 'failed' | 'skipped',
    durationMs: number
  ): void {
    const now = new Date().toISOString();
    const existing = this.getCaseStatistics(caseId, project, platform);

    if (existing) {
      // 计算新的统计数据
      const totalRuns = existing.totalRuns + 1;
      const passCount = result === 'passed' ? existing.passCount + 1 : existing.passCount;
      const failCount = result === 'failed' ? existing.failCount + 1 : existing.failCount;
      const skipCount = result === 'skipped' ? existing.skipCount + 1 : existing.skipCount;
      const passRate = passCount / totalRuns;
      const consecutivePasses = result === 'passed' ? existing.consecutivePasses + 1 : 0;
      const consecutiveFailures = result === 'failed' ? existing.consecutiveFailures + 1 : 0;
      const stabilityScore = this.calculateStabilityScore(consecutivePasses, consecutiveFailures, passRate);
      const isStable = consecutivePasses >= 30 ? 1 : 0;

      this.db.execute(`
        UPDATE case_statistics SET
          total_runs = ?, pass_count = ?, fail_count = ?, skip_count = ?,
          pass_rate = ?, consecutive_passes = ?, consecutive_failures = ?,
          stability_score = ?, is_stable = ?, last_run_time = ?, last_result = ?,
          avg_duration_ms = ?, updated = ?
        WHERE case_id = ? AND project = ? AND platform = ?
      `, [
        totalRuns, passCount, failCount, skipCount,
        passRate, consecutivePasses, consecutiveFailures,
        stabilityScore, isStable, now, result,
        (existing.avgDurationMs + durationMs) / 2, now,
        caseId, project, platform
      ]);
    } else {
      // 创建新记录
      const id = nanoid(8);
      const passCount = result === 'passed' ? 1 : 0;
      const failCount = result === 'failed' ? 1 : 0;
      const skipCount = result === 'skipped' ? 1 : 0;
      const consecutivePasses = result === 'passed' ? 1 : 0;
      const consecutiveFailures = result === 'failed' ? 1 : 0;

      this.db.execute(`
        INSERT INTO case_statistics (
          id, case_id, project, platform, total_runs, pass_count, fail_count, skip_count,
          pass_rate, consecutive_passes, consecutive_failures, stability_score, is_stable,
          last_run_time, last_result, avg_duration_ms, created, updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, caseId, project, platform, 1, passCount, failCount, skipCount,
        passCount, consecutivePasses, consecutiveFailures,
        this.calculateStabilityScore(consecutivePasses, consecutiveFailures, passCount),
        0, now, result, durationMs, now, now
      ]);
    }
  }

  /**
   * 计算稳定性分数
   */
  private calculateStabilityScore(consecutivePasses: number, consecutiveFailures: number, passRate: number): number {
    // 稳定性分数 = 连续通过权重 * 0.3 + 通过率权重 * 0.5 - 连续失败惩罚 * 0.2
    const passBonus = Math.min(consecutivePasses / 30, 1) * 0.3;
    const rateScore = passRate * 0.5;
    const failPenalty = Math.min(consecutiveFailures / 5, 1) * 0.2;

    return Math.max(0, Math.min(1, passBonus + rateScore - failPenalty));
  }

  // ===== 调度决策查询 =====

  /**
   * 保存调度决策
   */
  saveScheduleDecision(decision: Omit<ScheduleDecision, 'reason'> & { reason: string }): void {
    const id = nanoid(8);
    const now = new Date().toISOString();

    this.db.execute(`
      INSERT INTO scheduler_decisions (
        id, run_id, case_id, project, platform, risk_score, priority,
        scheduled_order, skip_decision, skip_reason, historical_pass_rate, last_status, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id,
      decision.caseId, // run_id 暂用 caseId 代替，实际使用时传入真实 runId
      decision.caseId,
      '', // project 需要从外部传入
      '', // platform 需要从外部传入
      decision.riskScore,
      decision.decision === 'schedule' ? 'P2' : 'P3',
      0, // scheduled_order
      decision.decision === 'skip' ? 1 : 0,
      decision.reason,
      decision.factors.passRateWeight,
      'unknown',
      now,
    ]);
  }

  // ===== 失败模式查询 =====

  /**
   * 匹配失败模式
   */
  matchFailurePattern(
    patternType: string,
    errorMessage: string,
    platform: Platform
  ): FailurePatternMatch | null {
    const patternKey = this.extractPatternKey(errorMessage);

    const row = this.db.queryOne<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
    }>(`
      SELECT * FROM failure_patterns
      WHERE pattern_type = ? AND pattern_key = ? AND (platform = ? OR platform IS NULL)
    `, [patternType, patternKey, platform]);

    if (!row) return null;

    let autoFixConfig: AutoFixConfig | null = null;
    if (row.auto_fix_config) {
      try {
        autoFixConfig = JSON.parse(row.auto_fix_config);
      } catch {
        autoFixConfig = null;
      }
    }

    return {
      patternId: row.id,
      patternType: row.pattern_type as import('@/types/knowledge.types.js').FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      confidence: Math.min(1, row.frequency / 10),
      autoFixConfig,
      rootCause: row.root_cause,
      solution: row.solution,
    };
  }

  /**
   * 提取模式键
   */
  private extractPatternKey(errorMessage: string): string {
    // 简化的模式提取：取错误消息的前 50 个字符并移除动态值
    return errorMessage
      .toLowerCase()
      .replace(/\d+/g, 'N')
      .replace(/['"][^'"]*['"]/g, 'STR')
      .slice(0, 50);
  }

  /**
   * 分类失败类型
   */
  private classifyFailureType(errorMessage: string): string {
    const lower = errorMessage.toLowerCase();

    if (lower.includes('timeout') || lower.includes('超时')) return 'timeout';
    if (lower.includes('element') || lower.includes('selector') || lower.includes('not found')) return 'element_not_found';
    if (lower.includes('assertion') || lower.includes('assert')) return 'assertion_failed';
    if (lower.includes('navigation') || lower.includes('navigate')) return 'navigation_error';
    if (lower.includes('network') || lower.includes('fetch') || lower.includes('request')) return 'network_error';
    if (lower.includes('crash') || lower.includes('崩溃')) return 'crash';

    return 'other';
  }

  // ===== 优化建议查询 =====

  /**
   * 保存优化建议
   */
  saveOptimizationSuggestion(suggestion: {
    project: string;
    platform?: Platform;
    caseId?: string;
    suggestionType: string;
    suggestionValue?: string;
    reason: string;
    confidence: number;
    autoApplicable: boolean;
    beforePassRate?: number | null;
    beforeAvgDurationMs?: number | null;
    verificationStatus?: 'pending' | 'verified' | 'invalid';
    verificationRunCount?: number;
  }): string {
    const id = nanoid(8);
    const now = new Date().toISOString();

    this.db.execute(`
      INSERT INTO auto_optimization_suggestions (
        id, project, platform, case_id, suggestion_type, suggestion_value,
        reason, confidence, auto_applicable, applied,
        before_pass_rate, before_avg_duration_ms,
        verification_status, verification_run_count, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
    `, [
      id,
      suggestion.project,
      suggestion.platform ?? null,
      suggestion.caseId ?? null,
      suggestion.suggestionType,
      suggestion.suggestionValue ?? null,
      suggestion.reason,
      suggestion.confidence,
      suggestion.autoApplicable ? 1 : 0,
      suggestion.beforePassRate ?? null,
      suggestion.beforeAvgDurationMs ?? null,
      suggestion.verificationStatus ?? 'pending',
      suggestion.verificationRunCount ?? 0,
      now,
    ]);

    return id;
  }

  /**
   * 标记优化建议已应用
   */
  markOptimizationApplied(id: string, effectivenessScore?: number): void {
    const now = new Date().toISOString();

    this.db.execute(`
      UPDATE auto_optimization_suggestions
      SET applied = 1, applied_time = ?, effectiveness_score = ?
      WHERE id = ?
    `, [now, effectivenessScore ?? null, id]);
  }

  /**
   * 加载可自动应用的优化建议
   * @param project 项目名称
   * @param platform 平台（可选）
   * @param appliedOnly 若为 true，只返回已应用的建议；若为 false/未提供，返回未应用的建议
   * @param confidenceThreshold 置信度阈值（默认 0.85）
   */
  loadApplicableOptimizations(
    project: string,
    platform?: Platform,
    appliedOnly?: boolean,
    confidenceThreshold: number = 0.85
  ): Array<{
    id: string;
    caseId: string | null;
    suggestionType: string;
    suggestionValue: string | null;
    reason: string;
    confidence: number;
    autoApplicable: boolean;
    applied: boolean;
    verificationStatus: string;
    beforePassRate: number | null;
    beforeAvgDurationMs: number | null;
    appliedAt: string | null;
  }> {
    const platformFilter = platform ? 'AND (platform = ? OR platform IS NULL)' : '';
    const appliedFilter = appliedOnly === true
      ? 'AND applied = 1 AND verification_status = "pending"'
      : appliedOnly === false
        ? 'AND applied = 0'
        : '';
    const params = platform
      ? [project, confidenceThreshold, platform]
      : [project, confidenceThreshold];

    const rows = this.db.query<{
      id: string;
      case_id: string | null;
      suggestion_type: string;
      suggestion_value: string | null;
      reason: string;
      confidence: number;
      auto_applicable: number;
      applied: number;
      verification_status: string;
      before_pass_rate: number | null;
      before_avg_duration_ms: number | null;
      applied_time: string | null;
    }>(`
      SELECT id, case_id, suggestion_type, suggestion_value, reason, confidence,
             auto_applicable, applied, verification_status,
             before_pass_rate, before_avg_duration_ms, applied_time
      FROM auto_optimization_suggestions
      WHERE project = ? AND confidence >= ? AND auto_applicable = 1
      ${appliedFilter}
      ${platformFilter}
      ORDER BY confidence DESC
      LIMIT 20
    `, params);

    return rows.map(r => ({
      id: r.id,
      caseId: r.case_id,
      suggestionType: r.suggestion_type,
      suggestionValue: r.suggestion_value,
      reason: r.reason,
      confidence: r.confidence,
      autoApplicable: r.auto_applicable === 1,
      applied: r.applied === 1,
      verificationStatus: r.verification_status,
      beforePassRate: r.before_pass_rate,
      beforeAvgDurationMs: r.before_avg_duration_ms,
      appliedAt: r.applied_time,
    }));
  }

  /**
   * 记录优化建议应用前的状态（用于后续验证）
   */
  recordOptimizationBeforeState(
    id: string,
    beforePassRate: number,
    beforeAvgDurationMs: number
  ): void {
    this.db.execute(`
      UPDATE auto_optimization_suggestions
      SET before_pass_rate = ?, before_avg_duration_ms = ?, applied = 1, applied_time = ?
      WHERE id = ?
    `, [beforePassRate, beforeAvgDurationMs, new Date().toISOString(), id]);
  }

  /**
   * 验证优化效果（应用后调用）
   * 对比应用前后的通过率和耗时，判断优化是否有效
   */
  verifyOptimizationEffectiveness(
    id: string,
    afterPassRate: number,
    afterAvgDurationMs: number
  ): import('@/types/knowledge.types.js').OptimizationVerificationResult {
    const row = this.db.queryOne<{
      case_id: string | null;
      before_pass_rate: number | null;
      before_avg_duration_ms: number | null;
      suggestion_type: string;
    }>('SELECT case_id, before_pass_rate, before_avg_duration_ms, suggestion_type FROM auto_optimization_suggestions WHERE id = ?', [id]);

    if (!row) {
      return {
        suggestionId: id,
        caseId: '',
        effective: false,
        effectivenessScore: 0,
        passRateChange: 0,
        durationChange: 0,
        verificationBasis: '优化建议不存在',
        shouldRetain: false,
      };
    }

    const beforePassRate = row.before_pass_rate ?? 0;
    const beforeDuration = row.before_avg_duration_ms ?? 0;

    // 计算变化
    const passRateChange = afterPassRate - beforePassRate;
    const durationChange = beforeDuration > 0 ? (afterAvgDurationMs - beforeDuration) / beforeDuration : 0;

    // 判断是否有效
    // 通过率提升 >= 5% 或 耗时降低 >= 10% 且通过率未下降
    const isEffective = passRateChange >= 0.05 || (durationChange <= -0.10 && passRateChange >= -0.05);

    // 计算效果分数 (-1 到 1)
    // 正数表示改进，负数表示恶化
    let effectivenessScore = 0;
    if (passRateChange > 0) {
      effectivenessScore += Math.min(passRateChange, 0.5) * 2; // 最高 1.0
    } else if (passRateChange < 0) {
      effectivenessScore += Math.max(passRateChange, -0.5) * 2; // 最低 -1.0
    }

    // 耗时优化也有贡献
    if (row.suggestion_type === 'increase-timeout' || row.suggestion_type === 'add-wait') {
      // 这类优化耗时增加是预期的，不作为负面因素
      if (passRateChange >= 0) {
        effectivenessScore = Math.max(effectivenessScore, passRateChange * 2);
      }
    } else if (durationChange < 0) {
      effectivenessScore += Math.abs(durationChange) * 0.5;
    }

    effectivenessScore = Math.max(-1, Math.min(1, effectivenessScore));

    // 更新数据库
    const now = new Date().toISOString();
    const verificationStatus = isEffective ? 'verified' : 'invalid';

    this.db.execute(`
      UPDATE auto_optimization_suggestions
      SET after_pass_rate = ?,
          after_avg_duration_ms = ?,
          effectiveness_score = ?,
          verification_status = ?,
          verified_at = ?,
          verification_run_count = verification_run_count + 1
      WHERE id = ?
    `, [afterPassRate, afterAvgDurationMs, effectivenessScore, verificationStatus, now, id]);

    const result: import('@/types/knowledge.types.js').OptimizationVerificationResult = {
      suggestionId: id,
      caseId: row.case_id ?? '',
      effective: isEffective,
      effectivenessScore,
      passRateChange,
      durationChange,
      verificationBasis: isEffective
        ? `通过率变化: ${(passRateChange * 100).toFixed(1)}%, 耗时变化: ${(durationChange * 100).toFixed(1)}%`
        : `优化无效: 通过率下降 ${(Math.abs(passRateChange) * 100).toFixed(1)}%`,
      shouldRetain: isEffective && effectivenessScore >= 0.1,
    };

    logger.info('📊 优化效果验证完成', {
      suggestionId: id,
      caseId: row.case_id,
      effective: isEffective,
      effectivenessScore: effectivenessScore.toFixed(2),
      passRateChange: (passRateChange * 100).toFixed(1) + '%',
    });

    return result;
  }

  /**
   * 清理无效的优化建议（持续多次验证失败的）
   */
  cleanupIneffectiveOptimizations(
    project: string,
    maxFailedVerifications: number = 2
  ): number {
    // 删除验证状态为 invalid 且效果分数 < 0 的建议
    const result = this.db.execute(`
      DELETE FROM auto_optimization_suggestions
      WHERE project = ? AND verification_status = 'invalid' AND effectiveness_score < 0
    `, [project]);

    if (result.changes > 0) {
      logger.info(`🧹 清理了 ${result.changes} 条无效优化建议`);
    }

    return result.changes;
  }

  /**
   * 获取优化建议统计（用于报告）
   */
  getOptimizationStats(project: string, platform?: Platform): {
    total: number;
    applied: number;
    verified: number;
    invalid: number;
    avgEffectivenessScore: number;
    topEffectiveOptimizations: Array<{
      caseId: string;
      suggestionType: string;
      effectivenessScore: number;
    }>;
  } {
    const platformFilter = platform ? 'AND (platform = ? OR platform IS NULL)' : '';
    const params = platform ? [project, platform] : [project];

    const total = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auto_optimization_suggestions WHERE project = ? ${platformFilter}`,
      params
    )?.count ?? 0;

    const applied = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auto_optimization_suggestions WHERE project = ? AND applied = 1 ${platformFilter}`,
      params
    )?.count ?? 0;

    const verified = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auto_optimization_suggestions WHERE project = ? AND verification_status = 'verified' ${platformFilter}`,
      params
    )?.count ?? 0;

    const invalid = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auto_optimization_suggestions WHERE project = ? AND verification_status = 'invalid' ${platformFilter}`,
      params
    )?.count ?? 0;

    const avgEffectivenessScore = this.db.queryOne<{ avg: number }>(
      `SELECT AVG(effectiveness_score) as avg FROM auto_optimization_suggestions WHERE project = ? AND verification_status = 'verified' ${platformFilter}`,
      params
    )?.avg ?? 0;

    const topEffectiveOptimizations = this.db.query<{
      case_id: string | null;
      suggestion_type: string;
      effectiveness_score: number;
    }>(`
      SELECT case_id, suggestion_type, effectiveness_score
      FROM auto_optimization_suggestions
      WHERE project = ? AND verification_status = 'verified' AND effectiveness_score > 0
      ${platformFilter}
      ORDER BY effectiveness_score DESC
      LIMIT 5
    `, params).map(r => ({
      caseId: r.case_id ?? '',
      suggestionType: r.suggestion_type,
      effectivenessScore: r.effectiveness_score,
    }));

    return {
      total,
      applied,
      verified,
      invalid,
      avgEffectivenessScore,
      topEffectiveOptimizations,
    };
  }

  // ===== 元素映射查询 =====

  /**
   * 获取元素映射管理器
   */
  getElementMappings(): ElementMappingManager {
    return this.elementMappings;
  }

  // ===== 测试历史查询 =====

  /**
   * 获取测试历史管理器
   */
  getTestHistory(): TestHistory {
    return this.testHistory;
  }

  // ===== 失败模式管理 =====

  /**
   * 获取失败模式管理器
   */
  getFailurePatterns(): FailurePatterns {
    return this.failurePatterns;
  }

  // ===== 优化记录管理 =====

  /**
   * 获取优化记录管理器
   */
  getOptimizationLog(): OptimizationLog {
    return this.optimizationLog;
  }

  // ===== 批量查询 =====

  /**
   * 批量获取用例统计
   */
  batchGetCaseStatistics(
    caseIds: string[],
    project: string,
    platform: Platform
  ): Map<string, CaseStatistics> {
    const result = new Map<string, CaseStatistics>();

    if (caseIds.length === 0) return result;

    const placeholders = caseIds.map(() => '?').join(',');
    const rows = this.db.query<{
      case_id: string;
      total_runs: number;
      pass_count: number;
      fail_count: number;
      skip_count: number;
      pass_rate: number;
      consecutive_passes: number;
      consecutive_failures: number;
      stability_score: number;
      is_stable: number;
      last_run_time: string | null;
      last_result: string | null;
      avg_duration_ms: number;
    }>(`
      SELECT * FROM case_statistics
      WHERE case_id IN (${placeholders}) AND project = ? AND platform = ?
    `, [...caseIds, project, platform]);

    for (const row of rows) {
      result.set(row.case_id, {
        caseId: row.case_id,
        projectId: project,
        platform,
        totalRuns: row.total_runs,
        passCount: row.pass_count,
        failCount: row.fail_count,
        skipCount: row.skip_count,
        passRate: row.pass_rate,
        failRate: row.fail_count / (row.total_runs || 1),
        consecutivePasses: row.consecutive_passes,
        consecutiveFailures: row.consecutive_failures,
        stabilityScore: row.stability_score,
        isStable: row.is_stable === 1,
        lastRunTime: row.last_run_time,
        lastResult: row.last_result as TestStatus | null,
        avgDurationMs: row.avg_duration_ms,
        createdAt: '',
        updatedAt: '',
      });
    }

    return result;
  }

  // ===== 统计查询 =====

  /**
   * 获取项目知识库统计
   */
  getProjectKnowledgeStats(project: string, platform?: Platform): {
    totalRuns: number;
    totalCases: number;
    avgPassRate: number;
    stableCaseCount: number;
    highRiskCaseCount: number;
    failurePatternCount: number;
    elementMappingCount: number;
    optimizationSuggestionCount: number;
  } {
    const platformFilter = platform ? 'AND platform = ?' : '';
    const params = platform ? [project, platform] : [project];

    const totalRuns = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM test_runs WHERE project = ? ${platformFilter}`,
      params
    )?.count ?? 0;

    const totalCases = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(DISTINCT case_id) as count FROM case_statistics WHERE project = ? ${platformFilter}`,
      params
    )?.count ?? 0;

    const avgPassRate = this.db.queryOne<{ avg: number }>(
      `SELECT AVG(pass_rate) as avg FROM case_statistics WHERE project = ? ${platformFilter}`,
      params
    )?.avg ?? 0;

    const stableCaseCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM case_statistics WHERE project = ? AND is_stable = 1 ${platform ? 'AND platform = ?' : ''}`,
      params
    )?.count ?? 0;

    const highRiskCaseCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM case_statistics WHERE project = ? AND pass_rate < 0.5 ${platform ? 'AND platform = ?' : ''}`,
      params
    )?.count ?? 0;

    const failurePatternCount = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM failure_patterns'
    )?.count ?? 0;

    const elementMappingCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM element_mappings WHERE project = ? ${platformFilter}`,
      params
    )?.count ?? 0;

    const optimizationSuggestionCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM auto_optimization_suggestions WHERE project = ? AND applied = 0 ${platform ? 'AND (platform = ? OR platform IS NULL)' : ''}`,
      params
    )?.count ?? 0;

    return {
      totalRuns,
      totalCases,
      avgPassRate,
      stableCaseCount,
      highRiskCaseCount,
      failurePatternCount,
      elementMappingCount,
      optimizationSuggestionCount,
    };
  }
}

// 单例实例
let repositoryInstance: KnowledgeRepository | null = null;

/**
 * 获取知识库仓储实例
 */
export function getKnowledgeRepository(db?: KnowledgeDatabase): KnowledgeRepository {
  if (!repositoryInstance) {
    if (!db) {
      throw new Error('首次调用必须提供数据库实例');
    }
    repositoryInstance = new KnowledgeRepository(db);
  }
  return repositoryInstance;
}

/**
 * 重置仓储实例（用于测试）
 */
export function resetKnowledgeRepository(): void {
  repositoryInstance = null;
}

/**
 * 创建知识库仓储
 */
export function createKnowledgeRepository(db: KnowledgeDatabase): KnowledgeRepository {
  return new KnowledgeRepository(db);
}
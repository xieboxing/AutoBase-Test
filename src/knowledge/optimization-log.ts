import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 优化类型
 */
export type OptimizationType =
  | 'wait_time'
  | 'selector'
  | 'test_order'
  | 'skip_case'
  | 'add_case'
  | 'merge_case'
  | 'split_case';

/**
 * 优化记录
 */
export interface OptimizationRecord {
  id: string;
  project: string;
  optimizationType: OptimizationType;
  caseId: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  improvement: number;
  reason: string | null;
  aiGenerated: boolean;
  applied: boolean;
  created: string;
}

/**
 * 优化记录查询选项
 */
export interface OptimizationQueryOptions {
  project?: string;
  type?: OptimizationType;
  caseId?: string;
  applied?: boolean;
  limit?: number;
}

/**
 * 优化记录管理
 * 记录测试流程的优化历史和效果
 */
export class OptimizationLog {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 记录优化
   */
  recordOptimization(record: Omit<OptimizationRecord, 'id' | 'created'>): OptimizationRecord {
    const id = nanoid(8);
    const now = new Date().toISOString();

    const optimization: OptimizationRecord = {
      id,
      ...record,
      created: now,
    };

    this.db.execute(`
      INSERT INTO optimization_history (
        id, project, optimization_type, case_id, before_value,
        after_value, improvement, reason, ai_generated, applied, created
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      optimization.id,
      optimization.project,
      optimization.optimizationType,
      optimization.caseId,
      optimization.beforeValue,
      optimization.afterValue,
      optimization.improvement,
      optimization.reason,
      optimization.aiGenerated ? 1 : 0,
      optimization.applied ? 1 : 0,
      optimization.created,
    ]);

    logger.step('📝 记录优化', { type: record.optimizationType, caseId: record.caseId });
    return optimization;
  }

  /**
   * 标记优化已应用
   */
  markApplied(id: string): void {
    this.db.execute(
      'UPDATE optimization_history SET applied = 1 WHERE id = ?',
      [id]
    );

    logger.pass('✅ 优化已应用', { id });
  }

  /**
   * 获取优化记录
   */
  getOptimization(id: string): OptimizationRecord | null {
    const row = this.db.queryOne<{
      id: string;
      project: string;
      optimization_type: string;
      case_id: string | null;
      before_value: string | null;
      after_value: string | null;
      improvement: number;
      reason: string | null;
      ai_generated: number;
      applied: number;
      created: string;
    }>('SELECT * FROM optimization_history WHERE id = ?', [id]);

    if (!row) return null;

    return {
      id: row.id,
      project: row.project,
      optimizationType: row.optimization_type as OptimizationType,
      caseId: row.case_id,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      improvement: row.improvement,
      reason: row.reason,
      aiGenerated: row.ai_generated === 1,
      applied: row.applied === 1,
      created: row.created,
    };
  }

  /**
   * 查询优化记录
   */
  query(options: OptimizationQueryOptions): OptimizationRecord[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.project) {
      conditions.push('project = ?');
      params.push(options.project);
    }

    if (options.type) {
      conditions.push('optimization_type = ?');
      params.push(options.type);
    }

    if (options.caseId) {
      conditions.push('case_id = ?');
      params.push(options.caseId);
    }

    if (options.applied !== undefined) {
      conditions.push('applied = ?');
      params.push(options.applied ? 1 : 0);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    const rows = this.db.query<{
      id: string;
      project: string;
      optimization_type: string;
      case_id: string | null;
      before_value: string | null;
      after_value: string | null;
      improvement: number;
      reason: string | null;
      ai_generated: number;
      applied: number;
      created: string;
    }>(`
      SELECT * FROM optimization_history
      ${whereClause}
      ORDER BY created DESC
      ${limitClause}
    `, params);

    return rows.map(row => ({
      id: row.id,
      project: row.project,
      optimizationType: row.optimization_type as OptimizationType,
      caseId: row.case_id,
      beforeValue: row.before_value,
      afterValue: row.after_value,
      improvement: row.improvement,
      reason: row.reason,
      aiGenerated: row.ai_generated === 1,
      applied: row.applied === 1,
      created: row.created,
    }));
  }

  /**
   * 获取待应用的优化
   */
  getPendingOptimizations(project: string): OptimizationRecord[] {
    return this.query({ project, applied: false });
  }

  /**
   * 获取优化效果统计
   */
  getImprovementStats(project: string): {
    totalOptimizations: number;
    appliedCount: number;
    avgImprovement: number;
    byType: Record<OptimizationType, { count: number; avgImprovement: number }>;
  } {
    const totalOptimizations = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM optimization_history WHERE project = ?',
      [project]
    )?.count ?? 0;

    const appliedCount = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM optimization_history WHERE project = ? AND applied = 1',
      [project]
    )?.count ?? 0;

    const avgImprovement = this.db.queryOne<{ avg: number }>(
      'SELECT AVG(improvement) as avg FROM optimization_history WHERE project = ? AND applied = 1',
      [project]
    )?.avg ?? 0;

    const typeRows = this.db.query<{
      optimization_type: string;
      count: number;
      avg_improvement: number;
    }>(`
      SELECT optimization_type, COUNT(*) as count, AVG(improvement) as avg_improvement
      FROM optimization_history
      WHERE project = ?
      GROUP BY optimization_type
    `, [project]);

    const byType: Record<OptimizationType, { count: number; avgImprovement: number }> = {
      wait_time: { count: 0, avgImprovement: 0 },
      selector: { count: 0, avgImprovement: 0 },
      test_order: { count: 0, avgImprovement: 0 },
      skip_case: { count: 0, avgImprovement: 0 },
      add_case: { count: 0, avgImprovement: 0 },
      merge_case: { count: 0, avgImprovement: 0 },
      split_case: { count: 0, avgImprovement: 0 },
    };

    for (const row of typeRows) {
      byType[row.optimization_type as OptimizationType] = {
        count: row.count,
        avgImprovement: row.avg_improvement,
      };
    }

    return { totalOptimizations, appliedCount, avgImprovement, byType };
  }

  /**
   * 清理旧的优化记录
   */
  cleanup(olderThanDays: number = 90): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = this.db.execute(
      'DELETE FROM optimization_history WHERE created < ? AND applied = 1',
      [cutoffDate.toISOString()]
    );

    logger.info(`🧹 清理了 ${result.changes} 条旧优化记录`);
    return result.changes;
  }
}

/**
 * 快捷函数：创建优化记录管理器
 */
export function createOptimizationLog(db?: KnowledgeDatabase): OptimizationLog {
  return new OptimizationLog(db);
}
import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 失败模式类型
 */
export type FailurePatternType =
  | 'element_not_found'
  | 'timeout'
  | 'assertion_failed'
  | 'navigation_error'
  | 'network_error'
  | 'js_error'
  | 'crash';

/**
 * 失败模式
 */
export interface FailurePattern {
  id: string;
  patternType: FailurePatternType;
  patternKey: string;
  description: string;
  frequency: number;
  lastOccurrence: string;
  firstOccurrence: string;
  rootCause: string | null;
  solution: string | null;
  aiAnalyzed: boolean;
  created: string;
  updated: string;
}

/**
 * 失败记录
 */
export interface FailureRecord {
  patternType: FailurePatternType;
  patternKey: string;
  description: string;
  context?: Record<string, unknown>;
}

/**
 * 失败模式库
 * 记录和分析测试失败的重复模式
 */
export class FailurePatterns {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 记录失败
   */
  recordFailure(record: FailureRecord): FailurePattern {
    const now = new Date().toISOString();

    // 查找是否已存在该模式
    const existing = this.db.queryOne<FailurePattern>(
      'SELECT * FROM failure_patterns WHERE pattern_type = ? AND pattern_key = ?',
      [record.patternType, record.patternKey]
    );

    if (existing) {
      // 更新频率和最后发生时间
      this.db.execute(`
        UPDATE failure_patterns SET
          frequency = frequency + 1,
          last_occurrence = ?,
          description = ?,
          updated = ?
        WHERE id = ?
      `, [now, record.description, now, existing.id]);

      return {
        ...existing,
        frequency: existing.frequency + 1,
        lastOccurrence: now,
        description: record.description,
        updated: now,
      };
    }

    // 创建新的失败模式
    const id = nanoid(8);
    const pattern: FailurePattern = {
      id,
      patternType: record.patternType,
      patternKey: record.patternKey,
      description: record.description,
      frequency: 1,
      lastOccurrence: now,
      firstOccurrence: now,
      rootCause: null,
      solution: null,
      aiAnalyzed: false,
      created: now,
      updated: now,
    };

    this.db.execute(`
      INSERT INTO failure_patterns (
        id, pattern_type, pattern_key, description, frequency,
        last_occurrence, first_occurrence, root_cause, solution,
        ai_analyzed, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pattern.id,
      pattern.patternType,
      pattern.patternKey,
      pattern.description,
      pattern.frequency,
      pattern.lastOccurrence,
      pattern.firstOccurrence,
      pattern.rootCause,
      pattern.solution,
      pattern.aiAnalyzed ? 1 : 0,
      pattern.created,
      pattern.updated,
    ]);

    logger.step('📝 记录失败模式', { type: record.patternType, key: record.patternKey });
    return pattern;
  }

  /**
   * 更新失败模式分析结果
   */
  updateAnalysis(
    patternId: string,
    analysis: {
      rootCause: string;
      solution: string;
    }
  ): void {
    const now = new Date().toISOString();

    this.db.execute(`
      UPDATE failure_patterns SET
        root_cause = ?,
        solution = ?,
        ai_analyzed = 1,
        updated = ?
      WHERE id = ?
    `, [analysis.rootCause, analysis.solution, now, patternId]);

    logger.pass('✅ 失败模式分析已更新', { patternId });
  }

  /**
   * 获取失败模式
   */
  getPattern(patternId: string): FailurePattern | null {
    const row = this.db.queryOne<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>('SELECT * FROM failure_patterns WHERE id = ?', [patternId]);

    if (!row) return null;

    return {
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    };
  }

  /**
   * 获取高频失败模式
   */
  getTopPatterns(limit: number = 10): FailurePattern[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      ORDER BY frequency DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    }));
  }

  /**
   * 获取未分析的失败模式
   */
  getUnanalyzedPatterns(): FailurePattern[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      WHERE ai_analyzed = 0
      ORDER BY frequency DESC
    `);

    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    }));
  }

  /**
   * 按类型获取失败模式
   */
  getPatternsByType(type: FailurePatternType): FailurePattern[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      WHERE pattern_type = ?
      ORDER BY frequency DESC
    `, [type]);

    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    }));
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalPatterns: number;
    totalOccurrences: number;
    byType: Record<FailurePatternType, number>;
    unanalyzedCount: number;
  } {
    const totalPatterns = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM failure_patterns'
    )?.count ?? 0;

    const totalOccurrences = this.db.queryOne<{ sum: number }>(
      'SELECT SUM(frequency) as sum FROM failure_patterns'
    )?.sum ?? 0;

    const unanalyzedCount = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM failure_patterns WHERE ai_analyzed = 0'
    )?.count ?? 0;

    const typeRows = this.db.query<{ pattern_type: string; count: number }>(`
      SELECT pattern_type, COUNT(*) as count
      FROM failure_patterns
      GROUP BY pattern_type
    `);

    const byType: Record<FailurePatternType, number> = {
      element_not_found: 0,
      timeout: 0,
      assertion_failed: 0,
      navigation_error: 0,
      network_error: 0,
      js_error: 0,
      crash: 0,
    };

    for (const row of typeRows) {
      byType[row.pattern_type as FailurePatternType] = row.count;
    }

    return { totalPatterns, totalOccurrences, byType, unanalyzedCount };
  }

  /**
   * 删除低频失败模式
   */
  cleanupLowFrequency(threshold: number = 2): number {
    const result = this.db.execute(
      'DELETE FROM failure_patterns WHERE frequency < ?',
      [threshold]
    );

    logger.info(`🧹 清理了 ${result.changes} 个低频失败模式`);
    return result.changes;
  }

  /**
   * 查找相似失败
   */
  findSimilar(description: string, limit: number = 5): FailurePattern[] {
    // 简单的关键词匹配
    const keywords = description.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (keywords.length === 0) return [];

    const conditions = keywords.map(() => 'LOWER(description) LIKE ?').join(' OR ');
    const params = keywords.map(w => `%${w}%`);

    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      WHERE ${conditions}
      ORDER BY frequency DESC
      LIMIT ?
    `, [...params, limit]);

    return rows.map(row => ({
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    }));
  }
}

/**
 * 快捷函数：创建失败模式库实例
 */
export function createFailurePatterns(db?: KnowledgeDatabase): FailurePatterns {
  return new FailurePatterns(db);
}
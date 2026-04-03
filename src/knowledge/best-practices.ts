import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 最佳实践类别
 */
export type BestPracticeCategory =
  | 'selector'
  | 'wait'
  | 'assertion'
  | 'navigation'
  | 'performance'
  | 'stability'
  | 'accessibility';

/**
 * 最佳实践
 */
export interface BestPractice {
  id: string;
  category: BestPracticeCategory;
  title: string;
  description: string;
  example: string | null;
  tags: string[];
  confidence: number;
  usageCount: number;
  created: string;
  updated: string;
}

/**
 * 最佳实践查询选项
 */
export interface BestPracticeQueryOptions {
  category?: BestPracticeCategory;
  tags?: string[];
  search?: string;
  limit?: number;
}

/**
 * 最佳实践积累
 * 从测试历史中学习和积累最佳实践
 */
export class BestPractices {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 添加最佳实践
   */
  addPractice(practice: Omit<BestPractice, 'id' | 'usageCount' | 'created' | 'updated'>): BestPractice {
    const id = nanoid(8);
    const now = new Date().toISOString();

    const newPractice: BestPractice = {
      id,
      ...practice,
      usageCount: 0,
      created: now,
      updated: now,
    };

    this.db.execute(`
      INSERT INTO best_practices (
        id, category, title, description, example, tags, confidence, usage_count, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      newPractice.id,
      newPractice.category,
      newPractice.title,
      newPractice.description,
      newPractice.example,
      JSON.stringify(newPractice.tags),
      newPractice.confidence,
      newPractice.usageCount,
      newPractice.created,
      newPractice.updated,
    ]);

    logger.pass('✅ 添加最佳实践', { title: practice.title });
    return newPractice;
  }

  /**
   * 更新最佳实践
   */
  updatePractice(id: string, updates: Partial<Omit<BestPractice, 'id' | 'created'>>): BestPractice | null {
    const existing = this.getPractice(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const updated = { ...existing, ...updates, updated: now };

    this.db.execute(`
      UPDATE best_practices SET
        category = ?, title = ?, description = ?, example = ?,
        tags = ?, confidence = ?, usage_count = ?, updated = ?
      WHERE id = ?
    `, [
      updated.category,
      updated.title,
      updated.description,
      updated.example,
      JSON.stringify(updated.tags),
      updated.confidence,
      updated.usageCount,
      updated.updated,
      id,
    ]);

    return updated;
  }

  /**
   * 增加使用次数
   */
  incrementUsage(id: string): void {
    this.db.execute(
      'UPDATE best_practices SET usage_count = usage_count + 1 WHERE id = ?',
      [id]
    );
  }

  /**
   * 获取最佳实践
   */
  getPractice(id: string): BestPractice | null {
    const row = this.db.queryOne<{
      id: string;
      category: string;
      title: string;
      description: string;
      example: string | null;
      tags: string;
      confidence: number;
      usage_count: number;
      created: string;
      updated: string;
    }>('SELECT * FROM best_practices WHERE id = ?', [id]);

    if (!row) return null;

    return this.rowToPractice(row);
  }

  /**
   * 查询最佳实践
   */
  query(options: BestPracticeQueryOptions = {}): BestPractice[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.category) {
      conditions.push('category = ?');
      params.push(options.category);
    }

    if (options.search) {
      conditions.push('(title LIKE ? OR description LIKE ?)');
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitClause = options.limit ? `LIMIT ${options.limit}` : '';

    const rows = this.db.query<{
      id: string;
      category: string;
      title: string;
      description: string;
      example: string | null;
      tags: string;
      confidence: number;
      usage_count: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM best_practices
      ${whereClause}
      ORDER BY confidence DESC, usage_count DESC
      ${limitClause}
    `, params);

    let practices = rows.map(row => this.rowToPractice(row));

    // 标签过滤
    if (options.tags && options.tags.length > 0) {
      practices = practices.filter(p =>
        options.tags!.some(tag => p.tags.includes(tag))
      );
    }

    return practices;
  }

  /**
   * 获取热门最佳实践
   */
  getTopPractices(limit: number = 10): BestPractice[] {
    return this.query({ limit });
  }

  /**
   * 按类别获取最佳实践
   */
  getByCategory(category: BestPracticeCategory): BestPractice[] {
    return this.query({ category });
  }

  /**
   * 搜索最佳实践
   */
  search(keyword: string): BestPractice[] {
    return this.query({ search: keyword });
  }

  /**
   * 删除最佳实践
   */
  deletePractice(id: string): boolean {
    const result = this.db.execute('DELETE FROM best_practices WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalPractices: number;
    byCategory: Record<BestPracticeCategory, number>;
    avgConfidence: number;
    totalUsage: number;
  } {
    const totalPractices = this.db.queryOne<{ count: number }>(
      'SELECT COUNT(*) as count FROM best_practices'
    )?.count ?? 0;

    const avgConfidence = this.db.queryOne<{ avg: number }>(
      'SELECT AVG(confidence) as avg FROM best_practices'
    )?.avg ?? 0;

    const totalUsage = this.db.queryOne<{ sum: number }>(
      'SELECT SUM(usage_count) as sum FROM best_practices'
    )?.sum ?? 0;

    const typeRows = this.db.query<{
      category: string;
      count: number;
    }>(`
      SELECT category, COUNT(*) as count
      FROM best_practices
      GROUP BY category
    `);

    const byCategory: Record<BestPracticeCategory, number> = {
      selector: 0,
      wait: 0,
      assertion: 0,
      navigation: 0,
      performance: 0,
      stability: 0,
      accessibility: 0,
    };

    for (const row of typeRows) {
      byCategory[row.category as BestPracticeCategory] = row.count;
    }

    return { totalPractices, byCategory, avgConfidence, totalUsage };
  }

  /**
   * 行数据转实践对象
   */
  private rowToPractice(row: {
    id: string;
    category: string;
    title: string;
    description: string;
    example: string | null;
    tags: string;
    confidence: number;
    usage_count: number;
    created: string;
    updated: string;
  }): BestPractice {
    let tags: string[] = [];
    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {
      tags = [];
    }

    return {
      id: row.id,
      category: row.category as BestPracticeCategory,
      title: row.title,
      description: row.description,
      example: row.example,
      tags,
      confidence: row.confidence,
      usageCount: row.usage_count,
      created: row.created,
      updated: row.updated,
    };
  }
}

/**
 * 快捷函数：创建最佳实践管理器
 */
export function createBestPractices(db?: KnowledgeDatabase): BestPractices {
  return new BestPractices(db);
}
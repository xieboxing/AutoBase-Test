import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 元素映射
 */
export interface ElementMapping {
  id: string;
  project: string;
  pageUrl: string;
  elementName: string | null;
  originalSelector: string;
  alternativeSelectors: string[];
  lastWorkingSelector: string | null;
  successCount: number;
  failureCount: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  aiSuggested: boolean;
  created: string;
  updated: string;
}

/**
 * 元素映射查询选项
 */
export interface ElementMappingQueryOptions {
  project?: string;
  pageUrl?: string;
  selector?: string;
}

/**
 * 元素定位映射管理
 * 用于自愈功能，记录元素选择器的备选方案
 */
export class ElementMappingManager {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 记录成功的定位
   */
  recordSuccess(
    project: string,
    pageUrl: string,
    selector: string,
    elementName?: string
  ): ElementMapping {
    const now = new Date().toISOString();

    // 查找现有映射
    const existing = this.findBySelector(project, selector);

    if (existing) {
      // 更新成功计数
      this.db.execute(`
        UPDATE element_mappings SET
          success_count = success_count + 1,
          last_success = ?,
          last_working_selector = ?,
          updated = ?
        WHERE id = ?
      `, [now, selector, now, existing.id]);

      return {
        ...existing,
        successCount: existing.successCount + 1,
        lastSuccess: now,
        lastWorkingSelector: selector,
        updated: now,
      };
    }

    // 创建新映射
    const id = nanoid(8);
    const mapping: ElementMapping = {
      id,
      project,
      pageUrl,
      elementName: elementName ?? null,
      originalSelector: selector,
      alternativeSelectors: [],
      lastWorkingSelector: selector,
      successCount: 1,
      failureCount: 0,
      lastSuccess: now,
      lastFailure: null,
      aiSuggested: false,
      created: now,
      updated: now,
    };

    this.db.execute(`
      INSERT INTO element_mappings (
        id, project, page_url, element_name, original_selector,
        alternative_selectors, last_working_selector, success_count,
        failure_count, last_success, last_failure, ai_suggested, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      mapping.id,
      mapping.project,
      mapping.pageUrl,
      mapping.elementName,
      mapping.originalSelector,
      JSON.stringify(mapping.alternativeSelectors),
      mapping.lastWorkingSelector,
      mapping.successCount,
      mapping.failureCount,
      mapping.lastSuccess,
      mapping.lastFailure,
      mapping.aiSuggested ? 1 : 0,
      mapping.created,
      mapping.updated,
    ]);

    return mapping;
  }

  /**
   * 记录失败的定位
   */
  recordFailure(project: string, selector: string): void {
    const now = new Date().toISOString();
    const existing = this.findBySelector(project, selector);

    if (existing) {
      this.db.execute(`
        UPDATE element_mappings SET
          failure_count = failure_count + 1,
          last_failure = ?,
          updated = ?
        WHERE id = ?
      `, [now, now, existing.id]);
    }
  }

  /**
   * 添加备选选择器
   */
  addAlternativeSelector(
    project: string,
    originalSelector: string,
    alternativeSelector: string,
    aiSuggested: boolean = false
  ): void {
    const existing = this.findBySelector(project, originalSelector);
    if (!existing) return;

    const alternatives = existing.alternativeSelectors.filter(s => s !== alternativeSelector);
    alternatives.push(alternativeSelector);

    this.db.execute(`
      UPDATE element_mappings SET
        alternative_selectors = ?,
        ai_suggested = ?,
        updated = ?
      WHERE id = ?
    `, [JSON.stringify(alternatives), aiSuggested ? 1 : existing.aiSuggested ? 1 : 0, new Date().toISOString(), existing.id]);

    logger.step('📝 添加备选选择器', { original: originalSelector, alternative: alternativeSelector });
  }

  /**
   * 更新最后工作的选择器
   */
  updateWorkingSelector(project: string, originalSelector: string, workingSelector: string): void {
    const now = new Date().toISOString();

    this.db.execute(`
      UPDATE element_mappings SET
        last_working_selector = ?,
        success_count = success_count + 1,
        last_success = ?,
        updated = ?
      WHERE project = ? AND original_selector = ?
    `, [workingSelector, now, now, project, originalSelector]);

    logger.step('✅ 更新工作选择器', { original: originalSelector, working: workingSelector });
  }

  /**
   * 根据选择器查找映射
   */
  findBySelector(project: string, selector: string): ElementMapping | null {
    const row = this.db.queryOne<{
      id: string;
      project: string;
      page_url: string;
      element_name: string | null;
      original_selector: string;
      alternative_selectors: string;
      last_working_selector: string | null;
      success_count: number;
      failure_count: number;
      last_success: string | null;
      last_failure: string | null;
      ai_suggested: number;
      created: string;
      updated: string;
    }>(
      'SELECT * FROM element_mappings WHERE project = ? AND original_selector = ?',
      [project, selector]
    );

    if (!row) return null;

    return this.rowToMapping(row);
  }

  /**
   * 根据 URL 查找所有映射
   */
  findByPageUrl(project: string, pageUrl: string): ElementMapping[] {
    const rows = this.db.query<{
      id: string;
      project: string;
      page_url: string;
      element_name: string | null;
      original_selector: string;
      alternative_selectors: string;
      last_working_selector: string | null;
      success_count: number;
      failure_count: number;
      last_success: string | null;
      last_failure: string | null;
      ai_suggested: number;
      created: string;
      updated: string;
    }>(
      'SELECT * FROM element_mappings WHERE project = ? AND page_url = ?',
      [project, pageUrl]
    );

    return rows.map(row => this.rowToMapping(row));
  }

  /**
   * 获取需要修复的映射（高失败率）
   */
  getProblematicMappings(project: string, threshold: number = 0.5): ElementMapping[] {
    const rows = this.db.query<{
      id: string;
      project: string;
      page_url: string;
      element_name: string | null;
      original_selector: string;
      alternative_selectors: string;
      last_working_selector: string | null;
      success_count: number;
      failure_count: number;
      last_success: string | null;
      last_failure: string | null;
      ai_suggested: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM element_mappings
      WHERE project = ? AND (failure_count * 1.0 / (success_count + failure_count)) > ?
      ORDER BY failure_count DESC
    `, [project, threshold]);

    return rows.map(row => this.rowToMapping(row));
  }

  /**
   * 获取所有备选选择器
   */
  getAlternativeSelectors(project: string, originalSelector: string): string[] {
    const mapping = this.findBySelector(project, originalSelector);
    if (!mapping) return [];

    // 返回备选选择器列表，优先使用最后工作的选择器
    const selectors: string[] = [];

    if (mapping.lastWorkingSelector && mapping.lastWorkingSelector !== originalSelector) {
      selectors.push(mapping.lastWorkingSelector);
    }

    for (const alt of mapping.alternativeSelectors) {
      if (!selectors.includes(alt) && alt !== originalSelector) {
        selectors.push(alt);
      }
    }

    return selectors;
  }

  /**
   * 查询映射
   */
  query(options: ElementMappingQueryOptions): ElementMapping[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.project) {
      conditions.push('project = ?');
      params.push(options.project);
    }

    if (options.pageUrl) {
      conditions.push('page_url LIKE ?');
      params.push(`%${options.pageUrl}%`);
    }

    if (options.selector) {
      conditions.push('(original_selector = ? OR alternative_selectors LIKE ?)');
      params.push(options.selector, `%"${options.selector}"%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db.query<{
      id: string;
      project: string;
      page_url: string;
      element_name: string | null;
      original_selector: string;
      alternative_selectors: string;
      last_working_selector: string | null;
      success_count: number;
      failure_count: number;
      last_success: string | null;
      last_failure: string | null;
      ai_suggested: number;
      created: string;
      updated: string;
    }>(`SELECT * FROM element_mappings ${whereClause}`, params);

    return rows.map(row => this.rowToMapping(row));
  }

  /**
   * 获取统计信息
   */
  getStats(project?: string): {
    totalMappings: number;
    totalSuccesses: number;
    totalFailures: number;
    aiSuggestedCount: number;
    problematicCount: number;
  } {
    const projectFilter = project ? 'WHERE project = ?' : '';
    const params = project ? [project] : [];

    const totalMappings = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM element_mappings ${projectFilter}`,
      params
    )?.count ?? 0;

    const totalSuccesses = this.db.queryOne<{ sum: number }>(
      `SELECT SUM(success_count) as sum FROM element_mappings ${projectFilter}`,
      params
    )?.sum ?? 0;

    const totalFailures = this.db.queryOne<{ sum: number }>(
      `SELECT SUM(failure_count) as sum FROM element_mappings ${projectFilter}`,
      params
    )?.sum ?? 0;

    const aiSuggestedCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM element_mappings ${projectFilter} ${projectFilter ? 'AND' : 'WHERE'} ai_suggested = 1`,
      params
    )?.count ?? 0;

    const problematicCount = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM element_mappings ${projectFilter} ${projectFilter ? 'AND' : 'WHERE'} failure_count > success_count`,
      params
    )?.count ?? 0;

    return {
      totalMappings,
      totalSuccesses,
      totalFailures,
      aiSuggestedCount,
      problematicCount,
    };
  }

  /**
   * 删除映射
   */
  deleteMapping(id: string): boolean {
    const result = this.db.execute('DELETE FROM element_mappings WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /**
   * 行数据转映射对象
   */
  private rowToMapping(row: {
    id: string;
    project: string;
    page_url: string;
    element_name: string | null;
    original_selector: string;
    alternative_selectors: string;
    last_working_selector: string | null;
    success_count: number;
    failure_count: number;
    last_success: string | null;
    last_failure: string | null;
    ai_suggested: number;
    created: string;
    updated: string;
  }): ElementMapping {
    let alternativeSelectors: string[] = [];
    try {
      alternativeSelectors = JSON.parse(row.alternative_selectors || '[]');
    } catch {
      alternativeSelectors = [];
    }

    return {
      id: row.id,
      project: row.project,
      pageUrl: row.page_url,
      elementName: row.element_name,
      originalSelector: row.original_selector,
      alternativeSelectors,
      lastWorkingSelector: row.last_working_selector,
      successCount: row.success_count,
      failureCount: row.failure_count,
      lastSuccess: row.last_success,
      lastFailure: row.last_failure,
      aiSuggested: row.ai_suggested === 1,
      created: row.created,
      updated: row.updated,
    };
  }
}

/**
 * 快捷函数：创建元素映射管理器
 */
export function createElementMappingManager(db?: KnowledgeDatabase): ElementMappingManager {
  return new ElementMappingManager(db);
}
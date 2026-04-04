/**
 * RAG 长期记忆引擎
 * 支持向量检索和文本检索
 */

import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type { Platform } from '@/types/test-case.types.js';
import type {
  RagMemory,
  RagMemoryType,
  RagQueryOptions,
  RagRetrievalResult,
  RagStats,
} from '@/types/rag.types.js';
import { DEFAULT_RAG_CONFIG } from '@/types/rag.types.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';

/**
 * RAG 记忆写入参数
 */
export interface RagMemoryInput {
  projectId: string;
  platform: Platform | null;
  memoryType: RagMemoryType;
  contextUrl?: string | null;
  contextPackage?: string | null;
  domSummary?: string | null;
  viewSummary?: string | null;
  executionResult: string;
  solutionStrategy?: string | null;
  solutionSteps?: string[] | null;
  relatedScreenshots?: string[] | null;
  relatedLogs?: string[] | null;
  confidence?: number;
}

/**
 * RAG 长期记忆引擎
 * 提供记忆存储和检索能力
 */
export class RagMemoryEngine {
  private db: KnowledgeDatabase;
  private enableVectorSearch: boolean;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
    this.enableVectorSearch = DEFAULT_RAG_CONFIG.enableVectorSearch;
  }

  /**
   * 存储记忆
   */
  store(input: RagMemoryInput): RagMemory {
    const now = new Date().toISOString();
    const id = nanoid(10);

    const memory: RagMemory = {
      id,
      projectId: input.projectId,
      platform: input.platform,
      memoryType: input.memoryType,
      contextUrl: input.contextUrl ?? null,
      contextPackage: input.contextPackage ?? null,
      domSummary: input.domSummary ?? null,
      viewSummary: input.viewSummary ?? null,
      executionResult: input.executionResult,
      solutionStrategy: input.solutionStrategy ?? null,
      solutionSteps: input.solutionSteps ?? null,
      relatedScreenshots: input.relatedScreenshots ?? null,
      relatedLogs: input.relatedLogs ?? null,
      embedding: null,
      confidence: input.confidence ?? 1.0,
      usageCount: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // 持久化到数据库
    this.db.execute(`
      INSERT INTO rag_memories (
        id, project_id, platform, memory_type, context_url, context_package,
        dom_summary, view_summary, execution_result, solution_strategy, solution_steps,
        related_screenshots, related_logs, embedding, confidence, usage_count, success_count,
        created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      memory.id,
      memory.projectId,
      memory.platform,
      memory.memoryType,
      memory.contextUrl,
      memory.contextPackage,
      memory.domSummary,
      memory.viewSummary,
      memory.executionResult,
      memory.solutionStrategy,
      memory.solutionSteps ? JSON.stringify(memory.solutionSteps) : null,
      memory.relatedScreenshots ? JSON.stringify(memory.relatedScreenshots) : null,
      memory.relatedLogs ? JSON.stringify(memory.relatedLogs) : null,
      memory.embedding,
      memory.confidence,
      memory.usageCount,
      memory.successCount,
      memory.createdAt,
      memory.updatedAt,
    ]);

    logger.info('📝 RAG 记忆已存储', {
      id: memory.id,
      type: memory.memoryType,
      project: memory.projectId,
    });

    // 发出事件
    eventBus.emitSafe(TestEventType.RAG_MEMORY_SAVED, {
      memoryId: memory.id,
      memoryType: memory.memoryType,
      projectId: memory.projectId,
    });

    return memory;
  }

  /**
   * 批量存储记忆
   */
  storeBatch(inputs: RagMemoryInput[]): RagMemory[] {
    return inputs.map(input => this.store(input));
  }

  /**
   * 检索相似记忆
   */
  search(options: RagQueryOptions): RagRetrievalResult[] {
    const startTime = Date.now();
    const limit = options.limit ?? DEFAULT_RAG_CONFIG.defaultLimit;
    const threshold = options.minSimilarity ?? DEFAULT_RAG_CONFIG.minSimilarityThreshold;

    // 发出检索事件
    eventBus.emitSafe(TestEventType.RAG_RETRIEVING, {
      queryType: options.memoryTypes?.join(',') ?? 'all',
      projectId: options.projectId ?? 'all',
      limit,
    });

    let memories: RagMemory[];
    let retrievalMethod: 'vector' | 'text' | 'hybrid';

    // 文本检索
    memories = this.textSearch(options);
    retrievalMethod = 'text';

    // 计算相似度并过滤
    const results: RagRetrievalResult[] = memories
      .map(memory => ({
        memory,
        similarity: this.calculateSimilarity(options.queryText ?? '', memory),
        retrievalMethod,
      }))
      .filter(r => r.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    // 更新使用计数
    for (const result of results) {
      this.updateUsage(result.memory.id);
    }

    const durationMs = Date.now() - startTime;

    // 发出检索完成事件
    eventBus.emitSafe(TestEventType.RAG_RETRIEVED, {
      queryType: options.memoryTypes?.join(',') ?? 'all',
      memoriesCount: results.length,
      avgSimilarity: results.length > 0
        ? results.reduce((sum, r) => sum + r.similarity, 0) / results.length
        : 0,
      retrievalMethod,
      durationMs,
    });

    logger.info('🔍 RAG 检索完成', {
      count: results.length,
      method: retrievalMethod,
      durationMs,
    });

    return results;
  }

  /**
   * 文本检索
   */
  private textSearch(options: RagQueryOptions): RagMemory[] {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (options.projectId) {
      conditions.push('project_id = ?');
      params.push(options.projectId);
    }

    if (options.platform) {
      conditions.push('platform = ?');
      params.push(options.platform);
    }

    if (options.memoryTypes && options.memoryTypes.length > 0) {
      const placeholders = options.memoryTypes.map(() => '?').join(',');
      conditions.push(`memory_type IN (${placeholders})`);
      params.push(...options.memoryTypes);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db.query<{
      id: string;
      project_id: string;
      platform: string | null;
      memory_type: string;
      context_url: string | null;
      context_package: string | null;
      dom_summary: string | null;
      view_summary: string | null;
      execution_result: string;
      solution_strategy: string | null;
      solution_steps: string | null;
      related_screenshots: string | null;
      related_logs: string | null;
      embedding: Buffer | null;
      confidence: number;
      usage_count: number;
      success_count: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM rag_memories
      ${whereClause}
      ORDER BY confidence DESC, usage_count DESC
      LIMIT ?
    `, [...params, options.limit ?? DEFAULT_RAG_CONFIG.defaultLimit]);

    return rows.map(row => this.mapRowToMemory(row));
  }

  /**
   * 计算文本相似度
   */
  private calculateSimilarity(query: string, memory: RagMemory): number {
    const queryKeywords = this.extractKeywords(query);
    const memoryText = [
      memory.contextUrl,
      memory.domSummary,
      memory.viewSummary,
      memory.executionResult,
      memory.solutionStrategy,
    ].filter(Boolean).join(' ').toLowerCase();

    if (queryKeywords.length === 0) return 0;

    let matchCount = 0;
    for (const keyword of queryKeywords) {
      if (memoryText.includes(keyword)) {
        matchCount++;
      }
    }

    return matchCount / queryKeywords.length;
  }

  /**
   * 提取关键词
   */
  private extractKeywords(text: string): string[] {
    const stopWords = new Set([
      '的', '是', '在', '有', '和', '了', '不', '这', '我', '你', '他',
      'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'to', 'of',
      'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into',
    ]);

    return text.toLowerCase()
      .split(/[\s\p{P}]+/u)
      .filter(word => word.length > 1 && !stopWords.has(word))
      .slice(0, 10);
  }

  /**
   * 更新使用计数
   */
  private updateUsage(memoryId: string): void {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE rag_memories SET
        usage_count = usage_count + 1,
        updated = ?
      WHERE id = ?
    `, [now, memoryId]);
  }

  /**
   * 记录成功使用
   */
  recordSuccess(memoryId: string): void {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE rag_memories SET
        usage_count = usage_count + 1,
        success_count = success_count + 1,
        updated = ?
      WHERE id = ?
    `, [now, memoryId]);
  }

  /**
   * 获取记忆
   */
  getById(memoryId: string): RagMemory | null {
    const row = this.db.queryOne<{
      id: string;
      project_id: string;
      platform: string | null;
      memory_type: string;
      context_url: string | null;
      context_package: string | null;
      dom_summary: string | null;
      view_summary: string | null;
      execution_result: string;
      solution_strategy: string | null;
      solution_steps: string | null;
      related_screenshots: string | null;
      related_logs: string | null;
      embedding: Buffer | null;
      confidence: number;
      usage_count: number;
      success_count: number;
      created: string;
      updated: string;
    }>('SELECT * FROM rag_memories WHERE id = ?', [memoryId]);

    return row ? this.mapRowToMemory(row) : null;
  }

  /**
   * 删除记忆
   */
  delete(memoryId: string): boolean {
    const result = this.db.execute('DELETE FROM rag_memories WHERE id = ?', [memoryId]);
    return result.changes > 0;
  }

  /**
   * 清理旧记忆
   */
  cleanup(daysOld: number = DEFAULT_RAG_CONFIG.cleanupThresholdDays): number {
    const result = this.db.execute(`
      DELETE FROM rag_memories
      WHERE datetime(created) < datetime('now', '-${daysOld} days')
      AND confidence < 0.5
      AND usage_count < 2
    `);

    logger.info(`🧹 清理了 ${result.changes} 条低价值 RAG 记忆`);
    return result.changes;
  }

  /**
   * 获取统计信息
   */
  getStats(projectId?: string): RagStats {
    const whereClause = projectId ? 'WHERE project_id = ?' : '';
    const params = projectId ? [projectId] : [];

    const totalMemories = this.db.queryOne<{ count: number }>(
      `SELECT COUNT(*) as count FROM rag_memories ${whereClause}`,
      params
    )?.count ?? 0;

    const typeRows = this.db.query<{ memory_type: string; count: number }>(
      `SELECT memory_type, COUNT(*) as count FROM rag_memories ${whereClause} GROUP BY memory_type`,
      params
    );

    const byType: Record<RagMemoryType, number> = {
      failure: 0,
      self_heal: 0,
      auto_fix: 0,
      new_state: 0,
      exploration: 0,
      optimization: 0,
      business_flow: 0,
    };

    for (const row of typeRows) {
      if (row.memory_type in byType) {
        byType[row.memory_type as RagMemoryType] = row.count;
      }
    }

    const totalUsageCount = this.db.queryOne<{ sum: number }>(
      `SELECT SUM(usage_count) as sum FROM rag_memories ${whereClause}`,
      params
    )?.sum ?? 0;

    return {
      totalMemories,
      byType,
      totalUsageCount,
      avgSimilarity: 0,
      cacheHitRate: 0,
      vectorSearchAvailable: this.enableVectorSearch,
    };
  }

  /**
   * 映射数据库行到记忆对象
   */
  private mapRowToMemory(row: {
    id: string;
    project_id: string;
    platform: string | null;
    memory_type: string;
    context_url: string | null;
    context_package: string | null;
    dom_summary: string | null;
    view_summary: string | null;
    execution_result: string;
    solution_strategy: string | null;
    solution_steps: string | null;
    related_screenshots: string | null;
    related_logs: string | null;
    embedding: Buffer | null;
    confidence: number;
    usage_count: number;
    success_count: number;
    created: string;
    updated: string;
  }): RagMemory {
    return {
      id: row.id,
      projectId: row.project_id,
      platform: row.platform as Platform | null,
      memoryType: row.memory_type as RagMemoryType,
      contextUrl: row.context_url,
      contextPackage: row.context_package,
      domSummary: row.dom_summary,
      viewSummary: row.view_summary,
      executionResult: row.execution_result,
      solutionStrategy: row.solution_strategy,
      solutionSteps: row.solution_steps ? JSON.parse(row.solution_steps) : null,
      relatedScreenshots: row.related_screenshots ? JSON.parse(row.related_screenshots) : null,
      relatedLogs: row.related_logs ? JSON.parse(row.related_logs) : null,
      embedding: row.embedding ? Array.from(new Float32Array(row.embedding)) : null,
      confidence: row.confidence,
      usageCount: row.usage_count,
      successCount: row.success_count,
      createdAt: row.created,
      updatedAt: row.updated,
    };
  }
}

/**
 * 快捷函数：创建 RAG 记忆引擎实例
 */
export function createRagMemoryEngine(db?: KnowledgeDatabase): RagMemoryEngine {
  return new RagMemoryEngine(db);
}
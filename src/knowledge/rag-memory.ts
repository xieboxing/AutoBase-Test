/**
 * RAG 长期记忆引擎
 * 支持向量检索和文本检索
 */

import { getDatabase, isDatabaseInitialized, type KnowledgeDatabase } from './db/index.js';
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
import { getAiClient, type AiClient } from '@/ai/client.js';

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
  /** 可选：直接提供 embedding，避免重复计算 */
  embedding?: number[];
}

/**
 * 向量搜索结果
 */
interface VectorSearchResult {
  id: string;
  similarity: number;
}

/**
 * RAG 长期记忆引擎
 * 提供记忆存储和检索能力
 */
export class RagMemoryEngine {
  private db: KnowledgeDatabase | null = null;
  private enableVectorSearch: boolean;
  private aiClient: AiClient | null = null;
  private initialized: boolean = false;

  constructor(database?: KnowledgeDatabase) {
    // 使用传入的数据库实例，或者延迟初始化
    this.db = database ?? null;
    this.enableVectorSearch = DEFAULT_RAG_CONFIG.enableVectorSearch;

    // 初始化 AI 客户端用于生成 embedding
    try {
      this.aiClient = getAiClient();
    } catch {
      logger.warn('⚠️ AI 客户端初始化失败，向量搜索将不可用');
      this.enableVectorSearch = false;
    }
  }

  /**
   * 确保数据库已初始化
   */
  private ensureDb(): KnowledgeDatabase {
    if (!this.db) {
      if (!isDatabaseInitialized()) {
        throw new Error('数据库未初始化，请先调用 initializeDatabase()');
      }
      this.db = getDatabase();
    }
    return this.db;
  }

  /**
   * 存储记忆（支持自动生成 embedding）
   */
  async storeAsync(input: RagMemoryInput): Promise<RagMemory> {
    const db = this.ensureDb();
    const now = new Date().toISOString();
    const id = nanoid(10);

    // 生成 embedding（如果启用且未提供）
    let embedding: number[] | null = input.embedding ?? null;
    if (this.enableVectorSearch && !embedding && this.aiClient?.isConfigured()) {
      try {
        const textForEmbedding = [
          input.contextUrl,
          input.domSummary,
          input.viewSummary,
          input.executionResult,
          input.solutionStrategy,
        ].filter(Boolean).join(' ');
        embedding = await this.aiClient.embed(textForEmbedding);
      } catch (error) {
        logger.warn('⚠️ 生成 embedding 失败，将仅使用文本检索', { error: String(error) });
      }
    }

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
      embedding,
      confidence: input.confidence ?? 1.0,
      usageCount: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // 持久化到数据库
    db.execute(`
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
      embedding ? Buffer.from(new Float32Array(embedding).buffer) : null,
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
      hasEmbedding: !!embedding,
    });

    // 发出事件
    eventBus.emitSafe(TestEventType.RAG_MEMORY_SAVED, {
      memoryId: memory.id,
      memoryType: memory.memoryType,
      projectId: memory.projectId,
    });

    this.initialized = true;
    return memory;
  }

  /**
   * 存储记忆（同步版本，不生成 embedding）
   */
  store(input: RagMemoryInput): RagMemory {
    const db = this.ensureDb();
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
      embedding: input.embedding ?? null,
      confidence: input.confidence ?? 1.0,
      usageCount: 0,
      successCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // 持久化到数据库
    try {
      db.execute(`
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
        memory.embedding ? Buffer.from(new Float32Array(memory.embedding).buffer) : null,
        memory.confidence,
        memory.usageCount,
        memory.successCount,
        memory.createdAt,
        memory.updatedAt,
      ]);
    } catch (dbError) {
      // 记录详细错误信息，但仍然抛出以便上层处理
      const errorMsg = dbError instanceof Error ? dbError.message : String(dbError);
      logger.error('RAG 记忆存储失败', {
        memoryId: id,
        memoryType: memory.memoryType,
        projectId: memory.projectId,
        error: errorMsg,
      });
      throw new Error(`RAG 记忆存储失败: ${errorMsg}`);
    }

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

    this.initialized = true;
    return memory;
  }

  /**
   * 批量存储记忆
   */
  storeBatch(inputs: RagMemoryInput[]): RagMemory[] {
    return inputs.map(input => this.store(input));
  }

  /**
   * 检索相似记忆（支持向量搜索）
   */
  async searchAsync(options: RagQueryOptions): Promise<RagRetrievalResult[]> {
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

    // 尝试向量搜索
    if (this.enableVectorSearch && this.aiClient?.isConfigured() && options.queryText) {
      try {
        const queryEmbedding = await this.aiClient.embed(options.queryText);
        const vectorResults = this.vectorSearch(queryEmbedding, options);

        if (vectorResults.length > 0) {
          // 向量搜索成功
          memories = vectorResults.map(r => this.getById(r.id)).filter((m): m is RagMemory => m !== null);
          retrievalMethod = 'vector';

          const results: RagRetrievalResult[] = memories
            .map((memory, index) => ({
              memory,
              similarity: vectorResults[index]?.similarity ?? 0.5,
              retrievalMethod,
            }))
            .filter(r => r.similarity >= threshold)
            .slice(0, limit);

          // 更新使用计数
          for (const result of results) {
            this.updateUsage(result.memory.id);
          }

          const durationMs = Date.now() - startTime;
          this.emitRetrievedEvent(options, results, retrievalMethod, durationMs);

          return results;
        }
      } catch (error) {
        logger.warn('⚠️ 向量搜索失败，降级为文本搜索', { error: String(error) });
      }
    }

    // 降级到文本检索
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
    this.emitRetrievedEvent(options, results, retrievalMethod, durationMs);

    return results;
  }

  /**
   * 检索相似记忆（同步版本，仅文本搜索）
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
   * 向量搜索
   */
  private vectorSearch(queryEmbedding: number[], options: RagQueryOptions): VectorSearchResult[] {
    const db = this.ensureDb();
    const conditions: string[] = ['embedding IS NOT NULL'];
    const params: (string | number | Buffer)[] = [];

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

    const whereClause = `WHERE ${conditions.join(' AND ')}`;
    const limit = options.limit ?? DEFAULT_RAG_CONFIG.defaultLimit;

    // 获取所有带 embedding 的记忆
    const rows = db.query<{
      id: string;
      embedding: Buffer;
    }>(`
      SELECT id, embedding FROM rag_memories
      ${whereClause}
      LIMIT ?
    `, [...params, limit * 3]); // 获取更多候选用于相似度排序

    // 计算相似度
    const results: VectorSearchResult[] = rows.map(row => {
      const storedEmbedding = Array.from(new Float32Array(row.embedding));
      const similarity = this.cosineSimilarity(queryEmbedding, storedEmbedding);
      return { id: row.id, similarity };
    });

    // 排序并返回 top-k
    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * 计算余弦相似度
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i] ?? 0;
      const bVal = b[i] ?? 0;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * 发出检索完成事件
   */
  private emitRetrievedEvent(
    options: RagQueryOptions,
    results: RagRetrievalResult[],
    retrievalMethod: 'vector' | 'text' | 'hybrid',
    durationMs: number
  ): void {
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
  }

  /**
   * 文本检索
   */
  private textSearch(options: RagQueryOptions): RagMemory[] {
    const db = this.ensureDb();
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

    const rows = db.query<{
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
    try {
      const db = this.ensureDb();
      const now = new Date().toISOString();
      db.execute(`
        UPDATE rag_memories SET
          usage_count = usage_count + 1,
          updated = ?
        WHERE id = ?
      `, [now, memoryId]);
    } catch {
      // 忽略更新错误，不影响主流程
    }
  }

  /**
   * 记录成功使用
   */
  recordSuccess(memoryId: string): void {
    try {
      const db = this.ensureDb();
      const now = new Date().toISOString();
      db.execute(`
        UPDATE rag_memories SET
          usage_count = usage_count + 1,
          success_count = success_count + 1,
          updated = ?
        WHERE id = ?
      `, [now, memoryId]);
    } catch {
      // 忽略更新错误，不影响主流程
    }
  }

  /**
   * 获取记忆
   */
  getById(memoryId: string): RagMemory | null {
    try {
      const db = this.ensureDb();
      const row = db.queryOne<{
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
    } catch {
      return null;
    }
  }

  /**
   * 删除记忆
   */
  delete(memoryId: string): boolean {
    try {
      const db = this.ensureDb();
      const result = db.execute('DELETE FROM rag_memories WHERE id = ?', [memoryId]);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * 清理旧记忆
   */
  cleanup(daysOld: number = DEFAULT_RAG_CONFIG.cleanupThresholdDays): number {
    try {
      const db = this.ensureDb();
      // 使用参数化查询防止 SQL 注入
      const result = db.execute(`
        DELETE FROM rag_memories
        WHERE datetime(created) < datetime('now', '-' || ? || ' days')
        AND confidence < 0.5
        AND usage_count < 2
      `, [daysOld]);

      logger.info(`🧹 清理了 ${result.changes} 条低价值 RAG 记忆`);
      return result.changes;
    } catch {
      return 0;
    }
  }

  /**
   * 为现有记忆生成 embedding
   * 用于批量更新没有 embedding 的记忆
   */
  async generateEmbeddingsForExisting(batchSize: number = 10): Promise<number> {
    if (!this.enableVectorSearch || !this.aiClient?.isConfigured()) {
      logger.warn('⚠️ 向量搜索未启用或 AI 客户端未配置，跳过 embedding 生成');
      return 0;
    }

    try {
      const db = this.ensureDb();

      // 查找没有 embedding 的记忆
      const rows = db.query<{ id: string; context_url: string | null; dom_summary: string | null; view_summary: string | null; execution_result: string; solution_strategy: string | null }>(`
        SELECT id, context_url, dom_summary, view_summary, execution_result, solution_strategy
        FROM rag_memories
        WHERE embedding IS NULL
        LIMIT ?
      `, [batchSize]);

      if (rows.length === 0) {
        logger.info('✅ 所有记忆已有 embedding，无需生成');
        return 0;
      }

      let generatedCount = 0;

      for (const row of rows) {
        try {
          const textForEmbedding = [
            row.context_url,
            row.dom_summary,
            row.view_summary,
            row.execution_result,
            row.solution_strategy,
          ].filter(Boolean).join(' ');

          if (!textForEmbedding.trim()) {
            continue;
          }

          const embedding = await this.aiClient.embed(textForEmbedding);
          const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

          db.execute(`
            UPDATE rag_memories SET embedding = ?, updated = ? WHERE id = ?
          `, [embeddingBuffer, new Date().toISOString(), row.id]);

          generatedCount++;
        } catch (error) {
          logger.warn(`⚠️ 为记忆 ${row.id} 生成 embedding 失败`, { error: String(error) });
        }
      }

      logger.info(`✅ 为 ${generatedCount} 条记忆生成了 embedding`);
      return generatedCount;
    } catch (error) {
      logger.warn('⚠️ 生成 embedding 过程出错', { error: String(error) });
      return 0;
    }
  }

  /**
   * 获取向量搜索状态
   */
  getVectorSearchStatus(): {
    enabled: boolean;
    aiConfigured: boolean;
    memoriesWithEmbedding: number;
    totalMemories: number;
  } {
    const stats = this.getStats();
    try {
      const db = this.ensureDb();
      const withEmbedding = db.queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM rag_memories WHERE embedding IS NOT NULL'
      )?.count ?? 0;

      return {
        enabled: this.enableVectorSearch,
        aiConfigured: this.aiClient?.isConfigured() ?? false,
        memoriesWithEmbedding: withEmbedding,
        totalMemories: stats.totalMemories,
      };
    } catch {
      return {
        enabled: this.enableVectorSearch,
        aiConfigured: this.aiClient?.isConfigured() ?? false,
        memoriesWithEmbedding: 0,
        totalMemories: 0,
      };
    }
  }

  /**
   * 获取统计信息
   */
  getStats(projectId?: string): RagStats {
    try {
      const db = this.ensureDb();
      const whereClause = projectId ? 'WHERE project_id = ?' : '';
      const params = projectId ? [projectId] : [];

      const totalMemories = db.queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM rag_memories ${whereClause}`,
        params
      )?.count ?? 0;

      const typeRows = db.query<{ memory_type: string; count: number }>(
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

      const totalUsageCount = db.queryOne<{ sum: number }>(
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
    } catch {
      return {
        totalMemories: 0,
        byType: {
          failure: 0,
          self_heal: 0,
          auto_fix: 0,
          new_state: 0,
          exploration: 0,
          optimization: 0,
          business_flow: 0,
        },
        totalUsageCount: 0,
        avgSimilarity: 0,
        cacheHitRate: 0,
        vectorSearchAvailable: this.enableVectorSearch,
      };
    }
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
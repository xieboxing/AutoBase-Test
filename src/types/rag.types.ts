/**
 * RAG（检索增强生成）相关类型定义
 */

import type { Platform } from './test-case.types.js';

/**
 * RAG 记忆类型
 */
export type RagMemoryType =
  | 'failure'          // 失败案例
  | 'self_heal'        // 自愈成功
  | 'auto_fix'         // 自动修复
  | 'new_state'        // 新页面/状态发现
  | 'exploration'      // 探索发现
  | 'optimization'     // 优化建议
  | 'business_flow';   // 业务流

/**
 * RAG 记忆记录
 */
export interface RagMemory {
  /** 记忆 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform | null;
  /** 记忆类型 */
  memoryType: RagMemoryType;
  /** 上下文 URL（Web） */
  contextUrl: string | null;
  /** 上下文包名（APP） */
  contextPackage: string | null;
  /** DOM 摘要 */
  domSummary: string | null;
  /** 视图摘要 */
  viewSummary: string | null;
  /** 执行结果描述 */
  executionResult: string;
  /** 解决策略 */
  solutionStrategy: string | null;
  /** 解决步骤 */
  solutionSteps: string[] | null;
  /** 相关截图路径 */
  relatedScreenshots: string[] | null;
  /** 相关日志路径 */
  relatedLogs: string[] | null;
  /** 向量嵌入 */
  embedding: number[] | null;
  /** 置信度 */
  confidence: number;
  /** 使用次数 */
  usageCount: number;
  /** 成功次数 */
  successCount: number;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * RAG 查询选项
 */
export interface RagQueryOptions {
  /** 查询文本 */
  queryText?: string;
  /** 查询向量 */
  queryEmbedding?: number[];
  /** 记忆类型过滤 */
  memoryTypes?: RagMemoryType[];
  /** 项目 ID */
  projectId?: string;
  /** 平台 */
  platform?: Platform;
  /** 返回数量限制 */
  limit?: number;
  /** 最小相似度阈值 */
  minSimilarity?: number;
  /** 是否包含向量 */
  includeEmbedding?: boolean;
}

/**
 * RAG 检索结果
 */
export interface RagRetrievalResult {
  /** 记忆记录 */
  memory: RagMemory;
  /** 相似度分数 (0-1) */
  similarity: number;
  /** 检索方式 */
  retrievalMethod: 'vector' | 'text' | 'hybrid';
}

/**
 * RAG 上下文注入
 */
export interface RagContextInjection {
  /** 原始 Prompt */
  originalPrompt: string;
  /** 检索到的记忆 */
  retrievedMemories: RagRetrievalResult[];
  /** 注入后的 Prompt */
  injectedPrompt: string;
  /** 注入位置 */
  injectionPosition: 'before' | 'after' | 'middle';
  /** 格式化模板 */
  formatTemplate?: string;
}

/**
 * RAG 配置
 */
export interface RagConfig {
  /** 是否启用 RAG */
  enabled: boolean;
  /** 是否启用向量搜索 */
  enableVectorSearch: boolean;
  /** 向量维度 */
  vectorDimension: number;
  /** 默认返回数量 */
  defaultLimit: number;
  /** 最小相似度阈值 */
  minSimilarityThreshold: number;
  /** Embedding 模型 */
  embeddingModel: string;
  /** 是否缓存 Embedding */
  cacheEmbeddings: boolean;
  /** 缓存 TTL（秒） */
  cacheTtl: number;
  /** 最大记忆数量 */
  maxMemories: number;
  /** 清理阈值（天数） */
  cleanupThresholdDays: number;
}

/**
 * 默认 RAG 配置
 */
export const DEFAULT_RAG_CONFIG: RagConfig = {
  enabled: true,
  enableVectorSearch: true,
  vectorDimension: 1536,
  defaultLimit: 3,
  minSimilarityThreshold: 0.7,
  embeddingModel: 'text-embedding-3-small',
  cacheEmbeddings: true,
  cacheTtl: 86400, // 1 天
  maxMemories: 10000,
  cleanupThresholdDays: 90,
};

/**
 * Embedding 请求
 */
export interface EmbeddingRequest {
  /** 输入文本 */
  text: string;
  /** 模型 */
  model?: string;
}

/**
 * Embedding 响应
 */
export interface EmbeddingResponse {
  /** 向量 */
  embedding: number[];
  /** 模型 */
  model: string;
  /** Token 数量 */
  tokenCount: number;
  /** 耗时（ms） */
  durationMs: number;
}

/**
 * RAG 统计信息
 */
export interface RagStats {
  /** 总记忆数 */
  totalMemories: number;
  /** 按类型统计 */
  byType: Record<RagMemoryType, number>;
  /** 总使用次数 */
  totalUsageCount: number;
  /** 平均相似度 */
  avgSimilarity: number;
  /** 缓存命中率 */
  cacheHitRate: number;
  /** 向量搜索可用 */
  vectorSearchAvailable: boolean;
}
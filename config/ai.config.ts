import { z } from 'zod';

/**
 * AI 提供商类型
 */
export type AiProvider = 'anthropic' | 'openai' | 'local';

/**
 * AI 配置 Schema
 */
export const aiConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'local']).default('anthropic'),
  apiKey: z.string().optional(),
  model: z.string().default('claude-sonnet-4-20250514'),
  maxTokens: z.number().int().min(100).max(100000).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
  baseUrl: z.string().optional(),
  timeout: z.number().int().min(1000).max(60000).default(30000),
  retryCount: z.number().int().min(0).max(5).default(3),
  // Embedding 配置（用于 RAG）
  embeddingEnabled: z.boolean().default(true),
  embeddingModel: z.string().default('text-embedding-3-small'),
  embeddingDimension: z.number().int().min(128).max(4096).default(1536),
});

/**
 * AI 配置类型
 */
export type AiConfig = z.infer<typeof aiConfigSchema>;

/**
 * 默认 AI 配置
 */
export const defaultAiConfig: AiConfig = {
  provider: 'anthropic',
  apiKey: undefined,
  model: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
  baseUrl: undefined,
  timeout: 30000,
  retryCount: 3,
  embeddingEnabled: true,
  embeddingModel: process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small',
  embeddingDimension: 1536,
};

/**
 * 各提供商默认模型
 */
export const providerModels: Record<AiProvider, string[]> = {
  anthropic: [
    'claude-opus-4-6',
    'claude-sonnet-4-6',
    'claude-sonnet-4-20250514',
    'claude-haiku-4-5-20251001',
  ],
  openai: [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-3.5-turbo',
  ],
  local: [
    'llama3',
    'mistral',
    'codellama',
  ],
};

/**
 * 各提供商默认 Embedding 模型
 */
export const providerEmbeddingModels: Record<AiProvider, string[]> = {
  anthropic: [], // Anthropic 不提供独立的 Embedding API
  openai: [
    'text-embedding-3-small',
    'text-embedding-3-large',
    'text-embedding-ada-002',
  ],
  local: [
    'all-MiniLM-L6-v2',
    'nomic-embed-text',
  ],
};

/**
 * 获取提供商的默认模型
 */
export function getDefaultModel(provider: AiProvider): string {
  return providerModels[provider]?.[0] ?? '';
}

/**
 * 获取提供商的默认 Embedding 模型
 */
export function getDefaultEmbeddingModel(provider: AiProvider): string | null {
  const models = providerEmbeddingModels[provider];
  return models && models.length > 0 ? models[0] ?? null : null;
}

/**
 * 验证 AI 配置
 */
export function validateAiConfig(config: Partial<AiConfig>): AiConfig {
  return aiConfigSchema.parse(config);
}
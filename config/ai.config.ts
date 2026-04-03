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
  model: 'claude-sonnet-4-20250514',
  maxTokens: 4096,
  temperature: 0.7,
  baseUrl: undefined,
  timeout: 30000,
  retryCount: 3,
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
 * 获取提供商的默认模型
 */
export function getDefaultModel(provider: AiProvider): string {
  return providerModels[provider]?.[0] ?? '';
}

/**
 * 验证 AI 配置
 */
export function validateAiConfig(config: Partial<AiConfig>): AiConfig {
  return aiConfigSchema.parse(config);
}
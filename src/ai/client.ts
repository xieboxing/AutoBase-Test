import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import { logger } from '@/core/logger.js';
import type { AiProvider, AiUsageStats } from '@/types/ai.types.js';
import type { AiConfig } from '../../config/ai.config.js';
import { defaultAiConfig } from '../../config/ai.config.js';

/**
 * Anthropic 消息参数类型（本地定义以匹配 SDK）
 */
type AnthropicMessageParam = {
  role: 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'; data: string } }>;
};

/**
 * AI 客户端配置
 */
export interface AiClientConfig extends AiConfig {
  enabled: boolean; // 是否启用 AI
}

/**
 * 默认客户端配置
 */
const DEFAULT_CLIENT_CONFIG: AiClientConfig = {
  ...defaultAiConfig,
  enabled: true,
};

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ChatContent[];
}

/**
 * 聊天内容（支持多模态）
 */
export interface ChatContent {
  type: 'text' | 'image';
  text?: string;
  source?: {
    type: 'base64';
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    data: string;
  };
}

/**
 * 聊天选项
 */
export interface ChatOptions {
  maxTokens?: number;
  temperature?: number;
  timeout?: number;
  responseFormat?: 'text' | 'json';
}

/**
 * 聊天响应
 */
export interface ChatResponse {
  content: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  model: string;
  provider: AiProvider;
  durationMs: number;
}

/**
 * AI 客户端类
 */
export class AiClient {
  private config: AiClientConfig;
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private usageStats: AiUsageStats;
  private initialized: boolean = false;

  constructor(config: Partial<AiClientConfig> = {}) {
    this.config = { ...DEFAULT_CLIENT_CONFIG, ...config };
    this.usageStats = this.initUsageStats();
  }

  /**
   * 初始化使用统计
   */
  private initUsageStats(): AiUsageStats {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      avgResponseTime: 0,
      errorCount: 0,
      byProvider: {
        anthropic: { requests: 0, tokens: 0, errors: 0 },
        openai: { requests: 0, tokens: 0, errors: 0 },
        local: { requests: 0, tokens: 0, errors: 0 },
      },
    };
  }

  /**
   * 初始化客户端
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.config.enabled) {
      logger.warn('⚠️ AI 客户端已禁用');
      return;
    }

    if (!this.config.apiKey) {
      logger.warn('⚠️ 未配置 AI API Key，将使用降级模式');
      return;
    }

    try {
      switch (this.config.provider) {
        case 'anthropic':
          this.anthropicClient = new Anthropic({
            apiKey: this.config.apiKey,
            timeout: this.config.timeout,
          });
          logger.info('✅ Anthropic 客户端初始化成功');
          break;

        case 'openai':
          this.openaiClient = new OpenAI({
            apiKey: this.config.apiKey,
            timeout: this.config.timeout,
            baseURL: this.config.baseUrl,
          });
          logger.info('✅ OpenAI 客户端初始化成功');
          break;

        case 'local':
          // 本地模型通过 OpenAI 兼容 API
          this.openaiClient = new OpenAI({
            apiKey: this.config.apiKey || 'local',
            baseURL: this.config.baseUrl || 'http://localhost:11434/v1',
            timeout: this.config.timeout,
          });
          logger.info('✅ 本地模型客户端初始化成功');
          break;
      }

      this.initialized = true;
    } catch (error) {
      logger.fail('❌ AI 客户端初始化失败', { error: String(error) });
      throw error;
    }
  }

  /**
   * 发送聊天请求
   */
  async chat(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResponse> {
    // 检查是否启用
    if (!this.config.enabled) {
      throw new Error('AI 客户端已禁用');
    }

    // 懒初始化
    if (!this.initialized) {
      await this.initialize();
    }

    // 检查是否有客户端
    if (!this.hasClient()) {
      throw new Error('AI 客户端未初始化或未配置 API Key');
    }

    const startTime = Date.now();
    const maxTokens = options.maxTokens ?? this.config.maxTokens;
    const temperature = options.temperature ?? this.config.temperature;

    logger.ai('🤖 发送 AI 请求', {
      provider: this.config.provider,
      model: this.config.model,
      messageCount: messages.length,
    });

    try {
      let response: ChatResponse;

      switch (this.config.provider) {
        case 'anthropic':
          response = await this.chatAnthropic(messages, maxTokens, temperature);
          break;

        case 'openai':
        case 'local':
          response = await this.chatOpenAI(messages, maxTokens, temperature, options);
          break;

        default:
          throw new Error(`不支持的 AI 提供商: ${this.config.provider}`);
      }

      // 更新统计
      this.updateStats(response, Date.now() - startTime);

      logger.ai('✅ AI 响应完成', {
        tokensUsed: response.tokensUsed.total,
        durationMs: response.durationMs,
      });

      return response;
    } catch (error) {
      this.usageStats.errorCount++;
      this.usageStats.byProvider[this.config.provider].errors++;

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.fail('❌ AI 请求失败', { error: errorMessage });

      throw error;
    }
  }

  /**
   * Anthropic 聊天
   */
  private async chatAnthropic(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
  ): Promise<ChatResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic 客户端未初始化');
    }

    const startTime = Date.now();
    const timeout = this.config.timeout;

    // 转换消息格式
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    // 使用 Promise.race 添加超时保护
    const responsePromise = this.anthropicClient.messages.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content as string,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: this.convertContentAnthropic(m.content),
      })) as AnthropicMessageParam[],
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Anthropic API 请求超时 (${timeout}ms)`)), timeout);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    // 提取文本内容
    let content = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        content += block.text;
      }
    }

    return {
      content,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      provider: 'anthropic',
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * OpenAI 聊天
   */
  private async chatOpenAI(
    messages: ChatMessage[],
    maxTokens: number,
    temperature: number,
    options: ChatOptions,
  ): Promise<ChatResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI 客户端未初始化');
    }

    const startTime = Date.now();
    const timeout = this.config.timeout;

    // 转换消息格式
    const openaiMessages = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : this.convertContentOpenAI(m.content),
    })) as unknown as OpenAI.ChatCompletionMessageParam[];

    // 使用 Promise.race 添加超时保护
    const responsePromise = this.openaiClient.chat.completions.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      messages: openaiMessages,
      response_format: options.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    });

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`OpenAI API 请求超时 (${timeout}ms)`)), timeout);
    });

    const response = await Promise.race([responsePromise, timeoutPromise]);

    const choice = response.choices[0];
    const content = choice?.message?.content || '';

    return {
      content,
      tokensUsed: {
        input: response.usage?.prompt_tokens ?? 0,
        output: response.usage?.completion_tokens ?? 0,
        total: response.usage?.total_tokens ?? 0,
      },
      model: response.model,
      provider: this.config.provider,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * 转换内容格式为 Anthropic 格式
   */
  private convertContentAnthropic(content: string | ChatContent[]): Array<{ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }> {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    return content.map(c => {
      if (c.type === 'text') {
        return { type: 'text' as const, text: c.text || '' };
      }
      if (c.type === 'image' && c.source) {
        return {
          type: 'image' as const,
          source: {
            type: 'base64' as const,
            media_type: c.source.media_type,
            data: c.source.data,
          },
        };
      }
      return { type: 'text' as const, text: '' };
    });
  }

  /**
   * 转换内容格式为 OpenAI 格式
   */
  private convertContentOpenAI(content: string | ChatContent[]): Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> {
    if (typeof content === 'string') {
      return [{ type: 'text', text: content }];
    }

    return content.map(c => {
      if (c.type === 'text') {
        return { type: 'text' as const, text: c.text || '' };
      }
      if (c.type === 'image' && c.source) {
        return {
          type: 'image_url' as const,
          image_url: {
            url: `data:${c.source.media_type};base64,${c.source.data}`,
          },
        };
      }
      return { type: 'text' as const, text: '' };
    });
  }

  /**
   * 带重试的聊天
   */
  async chatWithRetry(
    messages: ChatMessage[],
    options: ChatOptions = {},
  ): Promise<ChatResponse> {
    const retryCount = this.config.retryCount;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        return await this.chat(messages, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < retryCount) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          logger.warn(`⚠️ AI 请求失败，${delay}ms 后重试 (${attempt + 1}/${retryCount})`);
          await this.delay(delay);
        }
      }
    }

    throw lastError ?? new Error('AI 请求失败');
  }

  /**
   * JSON 模式聊天（确保返回有效 JSON）
   */
  async chatJson<T>(
    messages: ChatMessage[],
    schema?: z.ZodSchema<T>,
    options: ChatOptions = {},
  ): Promise<T> {
    const response = await this.chatWithRetry(messages, {
      ...options,
      responseFormat: 'json',
    });

    try {
      const parsed = JSON.parse(response.content);

      if (schema) {
        return schema.parse(parsed);
      }

      return parsed;
    } catch (error) {
      logger.fail('❌ JSON 解析失败', {
        error: String(error),
        content: response.content.slice(0, 200)
      });
      throw new Error(`AI 返回的内容不是有效的 JSON: ${response.content.slice(0, 100)}`);
    }
  }

  /**
   * 更新使用统计
   */
  private updateStats(response: ChatResponse, durationMs: number): void {
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.tokensUsed.total;
    this.usageStats.totalInputTokens += response.tokensUsed.input;
    this.usageStats.totalOutputTokens += response.tokensUsed.output;

    // 计算平均响应时间
    const prevTotal = this.usageStats.totalRequests - 1;
    this.usageStats.avgResponseTime =
      (this.usageStats.avgResponseTime * prevTotal + durationMs) / this.usageStats.totalRequests;

    // 更新提供商统计
    this.usageStats.byProvider[response.provider].requests++;
    this.usageStats.byProvider[response.provider].tokens += response.tokensUsed.total;
  }

  /**
   * 检查是否有客户端
   */
  private hasClient(): boolean {
    return this.anthropicClient !== null || this.openaiClient !== null;
  }

  /**
   * 检查是否可用
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return !!this.config.apiKey;
  }

  /**
   * 获取使用统计
   */
  getUsageStats(): AiUsageStats {
    return { ...this.usageStats };
  }

  /**
   * 获取配置
   */
  getConfig(): AiClientConfig {
    return { ...this.config };
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ==================== Embedding 抽象 ====================

  /**
   * 生成文本嵌入向量
   * 支持不同 Provider 的 Embedding API
   */
  async embed(text: string): Promise<number[]> {
    if (!this.config.enabled) {
      throw new Error('AI 客户端已禁用');
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // OpenAI 支持 Embedding API
    if (this.openaiClient && (this.config.provider === 'openai' || this.config.provider === 'local')) {
      return this.embedOpenAI(text);
    }

    // Anthropic 暂不支持 Embedding API，使用降级方案
    if (this.anthropicClient) {
      logger.warn('Anthropic 不支持 Embedding API，使用文本哈希降级');
      return this.embedFallback(text);
    }

    throw new Error('无法生成嵌入向量：没有可用的客户端');
  }

  /**
   * 使用 OpenAI API 生成嵌入向量
   */
  private async embedOpenAI(text: string): Promise<number[]> {
    if (!this.openaiClient) {
      throw new Error('OpenAI 客户端未初始化');
    }

    try {
      const response = await this.openaiClient.embeddings.create({
        model: 'text-embedding-ada-002',
        input: text.slice(0, 8000), // 限制输入长度
      });

      const embedding = response.data[0]?.embedding;
      if (!embedding) {
        throw new Error('Embedding API 返回空结果');
      }

      return embedding;
    } catch (error) {
      logger.warn('OpenAI Embedding 失败，使用降级方案', { error: String(error) });
      return this.embedFallback(text);
    }
  }

  /**
   * 嵌入向量降级方案：使用文本哈希生成伪向量
   * 注意：这只是降级方案，相似度计算不如真正的 Embedding 准确
   */
  private embedFallback(text: string): number[] {
    const dimension = 1536; // 与 OpenAI ada-002 相同维度
    const vector: number[] = new Array(dimension).fill(0);

    // 使用简单哈希生成伪向量
    const words = text.toLowerCase().split(/\s+/);
    for (const word of words) {
      let hash = 0;
      for (let i = 0; i < word.length; i++) {
        hash = ((hash << 5) - hash) + word.charCodeAt(i);
        hash = hash & hash; // 转为 32 位整数
      }

      // 将哈希值映射到向量维度
      const index = Math.abs(hash) % dimension;
      vector[index] = (vector[index] ?? 0) + 1;
    }

    // 归一化
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (norm > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] = vector[i]! / norm;
      }
    }

    return vector;
  }

  /**
   * 批量生成嵌入向量
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    const results: number[][] = [];

    for (const text of texts) {
      try {
        const embedding = await this.embed(text);
        results.push(embedding);
      } catch (error) {
        logger.warn('生成嵌入向量失败，使用降级方案', { error: String(error) });
        results.push(this.embedFallback(text));
      }
    }

    return results;
  }

  /**
   * 检查是否支持 Embedding
   */
  supportsEmbedding(): boolean {
    return this.config.enabled && (
      this.config.provider === 'openai' ||
      this.config.provider === 'local'
    );
  }

  // ==================== 结束 Embedding 抽象 ====================

  /**
   * 关闭客户端
   */
  async close(): Promise<void> {
    this.anthropicClient = null;
    this.openaiClient = null;
    this.initialized = false;
  }
}

// 全局默认客户端
let defaultClient: AiClient | null = null;

/**
 * 获取默认 AI 客户端
 */
export function getAiClient(config?: Partial<AiClientConfig>): AiClient {
  if (!defaultClient) {
    defaultClient = new AiClient(config);
  }
  return defaultClient;
}

/**
 * 重置默认客户端
 */
export function resetAiClient(): void {
  defaultClient = null;
}

/**
 * 快捷聊天函数
 */
export async function aiChat(
  messages: ChatMessage[],
  options?: ChatOptions,
): Promise<string> {
  const client = getAiClient();
  const response = await client.chatWithRetry(messages, options);
  return response.content;
}

/**
 * 快捷 JSON 聊天函数
 */
export async function aiChatJson<T>(
  messages: ChatMessage[],
  schema?: z.ZodSchema<T>,
  options?: ChatOptions,
): Promise<T> {
  const client = getAiClient();
  return client.chatJson(messages, schema, options);
}
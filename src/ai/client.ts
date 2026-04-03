import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { z } from 'zod';
import { logger } from '@/core/logger.js';
import type { AiProvider, AiUsageStats } from '@/types/ai.types.js';
import type { AiConfig } from '../../config/ai.config.js';
import { defaultAiConfig } from '../../config/ai.config.js';

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
    media_type: string;
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

    // 转换消息格式
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await this.anthropicClient.messages.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage?.content as string,
      messages: conversationMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: this.convertContent(m.content),
      })),
    } as any);

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

    // 转换消息格式
    const openaiMessages = messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: typeof m.content === 'string' ? m.content : this.convertContentToOpenAI(m.content),
    }));

    const response = await this.openaiClient.chat.completions.create({
      model: this.config.model,
      max_tokens: maxTokens,
      temperature,
      messages: openaiMessages as any,
      response_format: options.responseFormat === 'json' ? { type: 'json_object' } : undefined,
    });

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
  private convertContent(content: string | ChatContent[]): Array<{ type: string; text?: string; source?: { type: string; media_type: string; data: string } }> {
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
  private convertContentToOpenAI(content: string | ChatContent[]): Array<{ type: string; text?: string; image_url?: { url: string } }> {
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
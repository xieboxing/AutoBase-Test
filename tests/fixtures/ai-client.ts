/**
 * 测试夹具 - AI Client Mock
 * 提供模拟的 AI 客户端用于测试
 */

import type { AiClient } from '@/ai/client.js';
import type { AiConfig } from '@/config/ai.config.js';

/**
 * Mock AI 响应配置
 */
export interface MockAiResponse {
  content: string;
  tokensUsed?: number;
  durationMs?: number;
}

/**
 * Mock AI Client
 */
export class MockAiClient implements Partial<AiClient> {
  private enabled: boolean = true;
  private configured: boolean = true;
  private mockResponses: Map<string, MockAiResponse> = new Map();
  private callHistory: Array<{ prompt: string; response: string }> = [];

  constructor(config?: Partial<AiConfig>) {
    if (config) {
      this.enabled = config.apiKey !== undefined;
      this.configured = config.apiKey !== undefined;
    }
  }

  /**
   * 设置 Mock 响应
   */
  setMockResponse(promptPattern: string, response: MockAiResponse): void {
    this.mockResponses.set(promptPattern, response);
  }

  /**
   * 设置默认 Mock 响应
   */
  setDefaultResponse(response: MockAiResponse): void {
    this.mockResponses.set('*', response);
  }

  /**
   * 检查是否启用
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 检查是否已配置
   */
  isConfigured(): boolean {
    return this.configured;
  }

  /**
   * 聊天（模拟）
   */
  async chat(messages: Array<{ role: string; content: string }>): Promise<{ content: string; tokensUsed: number }> {
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage?.content ?? '';

    // 查找匹配的响应
    let response: MockAiResponse | undefined;
    for (const [pattern, mockResponse] of this.mockResponses) {
      if (pattern === '*' || prompt.includes(pattern)) {
        response = mockResponse;
        break;
      }
    }

    if (!response) {
      // 默认 JSON 响应
      response = {
        content: JSON.stringify({ success: true, message: 'Mock response' }),
        tokensUsed: 100,
      };
    }

    this.callHistory.push({ prompt, response: response.content });

    return {
      content: response.content,
      tokensUsed: response.tokensUsed ?? 100,
    };
  }

  /**
   * 带重试的聊天
   */
  async chatWithRetry(
    messages: Array<{ role: string; content: string }>,
    options?: { responseFormat?: string }
  ): Promise<{ content: string; tokensUsed: number }> {
    return this.chat(messages);
  }

  /**
   * 获取调用历史
   */
  getCallHistory(): Array<{ prompt: string; response: string }> {
    return [...this.callHistory];
  }

  /**
   * 清空调用历史
   */
  clearHistory(): void {
    this.callHistory = [];
  }

  /**
   * 设置启用状态
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * 设置配置状态
   */
  setConfigured(configured: boolean): void {
    this.configured = configured;
  }
}

/**
 * 创建 Mock AI Client
 */
export function createMockAiClient(config?: Partial<AiConfig>): MockAiClient {
  return new MockAiClient(config);
}

/**
 * 创建生成测试用例的 Mock 响应
 */
export function createTestCaseMockResponse(): MockAiResponse {
  return {
    content: JSON.stringify({
      cases: [
        {
          id: 'tc-mock-001',
          name: 'Mock 测试用例',
          description: '自动生成的 Mock 测试用例',
          priority: 'P1',
          type: 'functional',
          platform: ['pc-web'],
          steps: [
            { order: 1, action: 'navigate', value: 'https://example.com', description: '打开页面' },
            { order: 2, action: 'click', target: '#button', description: '点击按钮' },
          ],
        },
      ],
    }),
    tokensUsed: 200,
  };
}

/**
 * 创建失败分析的 Mock 响应
 */
export function createFailureAnalysisMockResponse(): MockAiResponse {
  return {
    content: JSON.stringify({
      possibleCauses: ['元素选择器已过时', '页面加载未完成'],
      isProductBug: false,
      isTestIssue: true,
      confidence: 0.85,
      fixSuggestions: ['更新选择器', '增加等待时间'],
      category: 'element_not_found',
      severity: 'high',
    }),
    tokensUsed: 150,
  };
}

/**
 * 创建优化建议的 Mock 响应
 */
export function createOptimizationMockResponse(): MockAiResponse {
  return {
    content: JSON.stringify({
      suggestions: [
        {
          caseId: 'tc-001',
          type: 'increase-timeout',
          reason: '该用例经常超时',
          suggestedValue: 10000,
          confidence: 0.9,
          autoApplicable: true,
        },
      ],
      summary: {
        totalSuggestions: 1,
        autoApplicableCount: 1,
        highImpactCount: 1,
      },
      overallAssessment: '建议优化超时配置',
    }),
    tokensUsed: 180,
  };
}
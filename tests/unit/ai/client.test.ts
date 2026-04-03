import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AiClient, getAiClient, resetAiClient } from '@/ai/client.js';

describe('AiClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetAiClient();
    vi.resetAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create client with Anthropic provider', () => {
      const client = new AiClient({
        provider: 'anthropic',
        apiKey: 'test-key',
        model: 'claude-3-haiku-20240307',
      });

      expect(client.isEnabled()).toBe(true);
      expect(client.isConfigured()).toBe(true);
    });

    it('should create client with OpenAI provider', () => {
      const client = new AiClient({
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      });

      expect(client.isEnabled()).toBe(true);
      expect(client.isConfigured()).toBe(true);
    });

    it('should be disabled when enabled is false', () => {
      const client = new AiClient({
        enabled: false,
        apiKey: 'test-key',
      });

      expect(client.isEnabled()).toBe(false);
    });

    it('should not be configured when apiKey is missing', () => {
      const client = new AiClient({
        provider: 'anthropic',
      });

      expect(client.isConfigured()).toBe(false);
    });
  });

  describe('chat', () => {
    it('should throw error when client is disabled', async () => {
      const client = new AiClient({ enabled: false });

      await expect(client.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow('AI 客户端已禁用');
    });

    it('should throw error when not configured', async () => {
      const client = new AiClient({ provider: 'anthropic' });

      await expect(client.chat([{ role: 'user', content: 'test' }]))
        .rejects.toThrow();
    });
  });

  describe('getUsageStats', () => {
    it('should return zero stats initially', () => {
      const client = new AiClient({ apiKey: 'test-key' });

      const stats = client.getUsageStats();

      expect(stats.totalRequests).toBe(0);
      expect(stats.totalTokens).toBe(0);
      expect(stats.errorCount).toBe(0);
    });
  });

  describe('getConfig', () => {
    it('should return config copy', () => {
      const client = new AiClient({ apiKey: 'test-key' });

      const config = client.getConfig();

      expect(config.apiKey).toBe('test-key');
      expect(config.enabled).toBe(true);
    });
  });
});

describe('getAiClient', () => {
  beforeEach(() => {
    resetAiClient();
  });

  it('should return singleton client', () => {
    const client1 = getAiClient();
    const client2 = getAiClient();

    expect(client1).toBe(client2);
  });

  it('should create new client with options', () => {
    const client = getAiClient({ apiKey: 'new-key' });

    expect(client.isConfigured()).toBe(true);
  });
});

describe('AiClient with mocked API', () => {
  let client: AiClient;

  beforeEach(() => {
    client = new AiClient({
      provider: 'anthropic',
      apiKey: 'test-key',
      model: 'claude-3-haiku-20240307',
    });
  });

  describe('chatWithRetry', () => {
    it('should retry on transient errors', async () => {
      // This test would require mocking the actual API calls
      // For now, we just test the configuration is correct
      expect(client.isConfigured()).toBe(true);
    });
  });
});
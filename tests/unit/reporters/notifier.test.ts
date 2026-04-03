import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Notifier, sendTestNotification, createNotifier } from '@/reporters/notifier.js';
import type { TestRunResult } from '@/types/index.js';
import type { NotificationConfig } from '@/reporters/notifier.js';

// Mock nodemailer
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: vi.fn(async () => ({ messageId: 'test-message-id' })),
    })),
  },
}));

describe('Notifier', () => {
  let sampleResult: TestRunResult;
  let emailConfig: NotificationConfig;
  let webhookConfig: NotificationConfig;
  let combinedConfig: NotificationConfig;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fresh mock for each test
    mockFetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'OK',
    }));
    global.fetch = mockFetch;

    sampleResult = {
      runId: 'test-run-001',
      project: 'test-project',
      startTime: '2024-01-01T00:00:00Z',
      endTime: '2024-01-01T00:01:00Z',
      duration: 60000,
      platform: 'pc-web',
      environment: {
        browser: 'chromium',
        viewport: { width: 1920, height: 1080 },
      },
      summary: {
        total: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        blocked: 0,
        passRate: 0.8,
      },
      categories: {
        functional: { total: 5, passed: 4, failed: 1, skipped: 0, blocked: 0, passRate: 0.8, avgDurationMs: 1000 },
        visual: { total: 2, passed: 2, failed: 0, skipped: 0, blocked: 0, passRate: 1, avgDurationMs: 500 },
        performance: { total: 1, passed: 1, failed: 0, skipped: 0, blocked: 0, passRate: 1, avgDurationMs: 2000, metrics: {} },
        security: { total: 1, passed: 1, failed: 0, skipped: 0, blocked: 0, passRate: 1, avgDurationMs: 1000, issues: [] },
        accessibility: { total: 1, passed: 0, failed: 1, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 1000, violations: [] },
        compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
      },
      cases: [],
      aiAnalysis: {
        overallAssessment: 'Good test run',
        criticalIssues: ['Performance issue on page load'],
        recommendations: ['Add more edge case tests'],
        riskLevel: 'low',
      },
      artifacts: {
        screenshots: [],
        videos: [],
        logs: [],
      },
    };

    emailConfig = {
      email: {
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        user: 'test@example.com',
        password: 'test-password',
        from: 'test@example.com',
        to: ['recipient@example.com'],
      },
    };

    webhookConfig = {
      webhook: {
        type: 'slack',
        url: 'https://hooks.slack.com/services/test',
      },
    };

    combinedConfig = {
      ...emailConfig,
      ...webhookConfig,
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('module exports', () => {
    it('should export Notifier class', () => {
      expect(Notifier).toBeDefined();
      expect(typeof Notifier).toBe('function');
    });

    it('should export sendTestNotification function', () => {
      expect(sendTestNotification).toBeDefined();
      expect(typeof sendTestNotification).toBe('function');
    });

    it('should export createNotifier function', () => {
      expect(createNotifier).toBeDefined();
      expect(typeof createNotifier).toBe('function');
    });
  });

  describe('createNotifier', () => {
    it('should create a Notifier instance', () => {
      const notifier = createNotifier(emailConfig);
      expect(notifier).toBeDefined();
      expect(notifier).toBeInstanceOf(Notifier);
    });
  });

  describe('sendTestNotification', () => {
    it('should send notifications using the provided config', async () => {
      await sendTestNotification(sampleResult, combinedConfig, 'https://example.com/report');
      // Should not throw
    });
  });

  describe('Notifier with email config', () => {
    it('should send email notification', async () => {
      const notifier = new Notifier(emailConfig);
      await notifier.sendEmail({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 1,
        reportUrl: 'https://example.com/report',
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });

      // Check that nodemailer was called
      const nodemailer = await import('nodemailer');
      expect(vi.mocked(nodemailer.default.createTransport)).toHaveBeenCalled();
    });

    it('should handle missing email config gracefully', async () => {
      const notifier = new Notifier({});
      await notifier.sendEmail({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 0,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });
      // Should not throw
    });
  });

  describe('Notifier with webhook config', () => {
    it('should send Slack webhook notification', async () => {
      const notifier = new Notifier({ webhook: { type: 'slack', url: 'https://hooks.slack.com/test' } });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 1,
        reportUrl: 'https://example.com/report',
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
        }),
      );
    });

    it('should send Feishu webhook notification', async () => {
      const notifier = new Notifier({ webhook: { type: 'feishu', url: 'https://open.feishu.cn/test' } });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 0,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://open.feishu.cn/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should send WeCom (企业微信) webhook notification', async () => {
      const notifier = new Notifier({ webhook: { type: 'wecom', url: 'https://qyapi.weixin.qq.com/test' } });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.5,
        total: 10,
        passed: 5,
        failed: 5,
        riskLevel: 'medium',
        criticalIssues: 2,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'h5-web',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://qyapi.weixin.qq.com/test',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should send DingTalk webhook notification with secret', async () => {
      const notifier = new Notifier({
        webhook: { type: 'dingtalk', url: 'https://oapi.dingtalk.com/test', secret: 'test-secret' },
      });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.2,
        total: 10,
        passed: 2,
        failed: 8,
        riskLevel: 'high',
        criticalIssues: 5,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'android-app',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://oapi.dingtalk.com/test',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('timestamp'),
        }),
      );
    });

    it('should send DingTalk webhook notification without secret', async () => {
      const notifier = new Notifier({ webhook: { type: 'dingtalk', url: 'https://oapi.dingtalk.com/test' } });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 0,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });

      expect(mockFetch).toHaveBeenCalled();
    });

    it('should send custom webhook notification', async () => {
      const notifier = new Notifier({
        webhook: {
          type: 'custom',
          url: 'https://custom.example.com/webhook',
          headers: { 'X-Custom-Header': 'custom-value' },
        },
      });
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 0,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://custom.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'custom-value',
          }),
        }),
      );
    });

    it('should handle missing webhook config gracefully', async () => {
      const notifier = new Notifier({});
      await notifier.sendWebhook({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 0,
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });
      // Should not throw
    });
  });

  describe('sendAll', () => {
    it('should send both email and webhook notifications', async () => {
      const notifier = new Notifier(combinedConfig);
      await notifier.sendAll(sampleResult, 'https://example.com/report');
      // Should not throw
    });

    it('should handle partial failures gracefully', async () => {
      // Mock fetch to fail
      mockFetch.mockImplementation(async () => ({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      }));

      const notifier = new Notifier(combinedConfig);
      // Should not throw even if webhook fails
      await notifier.sendAll(sampleResult);
    });
  });

  describe('payload building', () => {
    it('should build correct payload from TestRunResult', async () => {
      const notifier = new Notifier(emailConfig);

      // Access private method via type casting
      const buildPayload = (notifier as unknown as { buildPayload: (r: TestRunResult, u?: string) => object })
        .buildPayload;

      const payload = buildPayload(sampleResult, 'https://example.com/report');

      expect(payload).toEqual({
        project: 'test-project',
        runId: 'test-run-001',
        passRate: 0.8,
        total: 10,
        passed: 8,
        failed: 2,
        riskLevel: 'low',
        criticalIssues: 1,
        reportUrl: 'https://example.com/report',
        duration: 60000,
        startTime: '2024-01-01T00:00:00Z',
        platform: 'pc-web',
      });
    });

    it('should handle missing aiAnalysis', async () => {
      const resultWithoutAI = {
        ...sampleResult,
        aiAnalysis: undefined,
      };

      const notifier = new Notifier(emailConfig);
      const buildPayload = (notifier as unknown as { buildPayload: (r: TestRunResult, u?: string) => object })
        .buildPayload;

      const payload = buildPayload(resultWithoutAI);

      expect(payload.riskLevel).toBe('unknown');
      expect(payload.criticalIssues).toBe(0);
    });
  });

  describe('risk level emoji', () => {
    it('should return correct emoji for each risk level', () => {
      const notifier = new Notifier({});
      const getRiskEmoji = (notifier as unknown as { getRiskEmoji: (l: string) => string }).getRiskEmoji;

      expect(getRiskEmoji('low')).toBe('🟢');
      expect(getRiskEmoji('medium')).toBe('🟡');
      expect(getRiskEmoji('high')).toBe('🟠');
      expect(getRiskEmoji('critical')).toBe('🔴');
      expect(getRiskEmoji('unknown')).toBe('⚪');
    });
  });

  describe('duration formatting', () => {
    it('should format milliseconds correctly', () => {
      const notifier = new Notifier({});
      const formatDuration = (notifier as unknown as { formatDuration: (ms: number) => string }).formatDuration;

      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(5000)).toBe('5.00s');
      expect(formatDuration(65000)).toBe('1m 5s');
      expect(formatDuration(125000)).toBe('2m 5s');
    });
  });
});
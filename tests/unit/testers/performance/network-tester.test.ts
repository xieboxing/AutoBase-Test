import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NetworkTester,
  runNetworkTest,
  NETWORK_PROFILES,
  type NetworkTesterConfig,
  type NetworkProfile,
  type NetworkTestResult,
  type NetworkTestSummary,
} from '@/testers/performance/network-tester.js';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn().mockResolvedValue(undefined),
          reload: vi.fn().mockResolvedValue(undefined),
          locator: vi.fn().mockReturnValue({
            first: vi.fn().mockReturnValue({
              isVisible: vi.fn().mockResolvedValue(false),
            }),
          }),
          title: vi.fn().mockResolvedValue('Test Page'),
          screenshot: vi.fn().mockResolvedValue(undefined),
          close: vi.fn().mockResolvedValue(undefined),
        }),
        setOffline: vi.fn().mockResolvedValue(undefined),
        route: vi.fn().mockResolvedValue(undefined),
        close: vi.fn().mockResolvedValue(undefined),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

// Mock logger
vi.mock('@/core/logger.js', () => ({
  logger: {
    info: vi.fn(),
    step: vi.fn(),
    pass: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
    perf: vi.fn(),
  },
}));

// Mock event-bus
vi.mock('@/core/event-bus.js', () => ({
  eventBus: {
    emit: vi.fn(),
  },
}));

// Mock fs/promises
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

describe('NetworkTester', () => {
  describe('module exports', () => {
    it('should export NetworkTester class', () => {
      expect(NetworkTester).toBeDefined();
      expect(typeof NetworkTester).toBe('function');
    });

    it('should export runNetworkTest function', () => {
      expect(runNetworkTest).toBeDefined();
      expect(typeof runNetworkTest).toBe('function');
    });

    it('should export NETWORK_PROFILES', () => {
      expect(NETWORK_PROFILES).toBeDefined();
      expect(NETWORK_PROFILES['3g']).toBeDefined();
      expect(NETWORK_PROFILES['4g']).toBeDefined();
      expect(NETWORK_PROFILES['offline']).toBeDefined();
    });
  });

  describe('NETWORK_PROFILES', () => {
    it('should have correct 3G profile', () => {
      expect(NETWORK_PROFILES['3g'].name).toBe('3G');
      expect(NETWORK_PROFILES['3g'].download).toBe(1600);
      expect(NETWORK_PROFILES['3g'].upload).toBe(750);
      expect(NETWORK_PROFILES['3g'].latency).toBe(150);
      expect(NETWORK_PROFILES['3g'].offline).toBeFalsy();
    });

    it('should have correct slow-3g profile', () => {
      expect(NETWORK_PROFILES['slow-3g'].name).toBe('Slow 3G');
      expect(NETWORK_PROFILES['slow-3g'].download).toBe(400);
      expect(NETWORK_PROFILES['slow-3g'].latency).toBe(300);
    });

    it('should have correct offline profile', () => {
      expect(NETWORK_PROFILES['offline'].name).toBe('Offline');
      expect(NETWORK_PROFILES['offline'].download).toBe(0);
      expect(NETWORK_PROFILES['offline'].upload).toBe(0);
      expect(NETWORK_PROFILES['offline'].offline).toBe(true);
    });

    it('should have unstable profile', () => {
      expect(NETWORK_PROFILES['unstable']).toBeDefined();
      expect(NETWORK_PROFILES['unstable'].name).toBe('Unstable');
      expect(NETWORK_PROFILES['unstable'].latency).toBe(500);
    });
  });

  describe('NetworkTester class', () => {
    it('should accept configuration with url', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      expect(tester).toBeDefined();
    });

    it('should accept full configuration', () => {
      const config: Partial<NetworkTesterConfig> & { url: string } = {
        url: 'https://example.com',
        devices: ['Desktop', 'iPhone 15'],
        networkProfiles: [NETWORK_PROFILES['4g'], NETWORK_PROFILES['3g']],
        timeout: 60000,
        headless: true,
        artifactsDir: './data/screenshots/network',
      };
      const tester = new NetworkTester(config);
      expect(tester).toBeDefined();
    });

    it('should have getDetailedResults method', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      expect(tester.getDetailedResults).toBeDefined();
      expect(typeof tester.getDetailedResults).toBe('function');
    });

    it('should have getSummaries method', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      expect(tester.getSummaries).toBeDefined();
      expect(typeof tester.getSummaries).toBe('function');
    });

    it('should have getSummary method', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should return empty results before run', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      const results = tester.getDetailedResults();
      expect(results).toEqual([]);
    });

    it('should return empty summaries before run', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      const summaries = tester.getSummaries();
      expect(summaries).toEqual([]);
    });

    it('should generate summary with no results', () => {
      const tester = new NetworkTester({ url: 'https://example.com' });
      const summary = tester.getSummary();
      expect(summary).toContain('弱网测试报告');
      expect(summary).toContain('测试 URL');
    });
  });

  describe('NetworkProfile type', () => {
    it('should have correct structure', () => {
      const profile: NetworkProfile = {
        name: 'Custom',
        download: 1000,
        upload: 500,
        latency: 100,
      };
      expect(profile.name).toBe('Custom');
      expect(profile.download).toBe(1000);
      expect(profile.upload).toBe(500);
      expect(profile.latency).toBe(100);
    });

    it('should support offline flag', () => {
      const offlineProfile: NetworkProfile = {
        name: 'Offline',
        download: 0,
        upload: 0,
        latency: 0,
        offline: true,
      };
      expect(offlineProfile.offline).toBe(true);
    });
  });

  describe('NetworkTestResult type', () => {
    it('should have correct structure', () => {
      const result: NetworkTestResult = {
        url: 'https://example.com',
        device: 'Desktop',
        network: '3G',
        success: true,
        loadTime: 3500,
        timeout: false,
        offlineHandled: false,
        recoveryHandled: false,
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(result.url).toBe('https://example.com');
      expect(result.network).toBe('3G');
      expect(result.success).toBe(true);
      expect(result.loadTime).toBe(3500);
    });

    it('should support error information', () => {
      const failedResult: NetworkTestResult = {
        url: 'https://example.com',
        device: 'Desktop',
        network: 'offline',
        success: false,
        loadTime: 0,
        timeout: true,
        offlineHandled: false,
        recoveryHandled: false,
        errorMessage: 'Page load timeout',
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(failedResult.success).toBe(false);
      expect(failedResult.timeout).toBe(true);
      expect(failedResult.errorMessage).toBe('Page load timeout');
    });
  });

  describe('NetworkTestSummary type', () => {
    it('should have correct structure', () => {
      const summary: NetworkTestSummary = {
        network: '3G',
        total: 10,
        passed: 8,
        failed: 1,
        timeout: 1,
        avgLoadTime: 3500,
        offlineHandledRate: 0.8,
        recoveryHandledRate: 0.9,
      };
      expect(summary.network).toBe('3G');
      expect(summary.total).toBe(10);
      expect(summary.passed).toBe(8);
      expect(summary.avgLoadTime).toBe(3500);
    });
  });
});
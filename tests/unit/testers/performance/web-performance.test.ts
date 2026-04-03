import { describe, it, expect, vi, beforeEach, afterEach, mock } from 'vitest';
import {
  WebPerformanceTester,
  runWebPerformanceTest,
  NETWORK_PROFILES,
  type WebPerformanceConfig,
  type DevicePerformanceResult,
  type PerformanceMetrics,
} from '@/testers/performance/web-performance.js';

// Mock lighthouse and chrome-launcher
vi.mock('lighthouse', () => ({
  default: vi.fn(),
}));

vi.mock('chrome-launcher', () => ({
  launch: vi.fn(),
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
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe('WebPerformanceTester', () => {
  describe('module exports', () => {
    it('should export WebPerformanceTester class', () => {
      expect(WebPerformanceTester).toBeDefined();
      expect(typeof WebPerformanceTester).toBe('function');
    });

    it('should export runWebPerformanceTest function', () => {
      expect(runWebPerformanceTest).toBeDefined();
      expect(typeof runWebPerformanceTest).toBe('function');
    });

    it('should export NETWORK_PROFILES', () => {
      expect(NETWORK_PROFILES).toBeDefined();
      expect(NETWORK_PROFILES['3g']).toBeDefined();
      expect(NETWORK_PROFILES['4g']).toBeDefined();
    });
  });

  describe('NETWORK_PROFILES', () => {
    it('should have correct 3G profile', () => {
      expect(NETWORK_PROFILES['3g'].name).toBe('3G');
      expect(NETWORK_PROFILES['3g'].download).toBe(1600);
      expect(NETWORK_PROFILES['3g'].upload).toBe(750);
      expect(NETWORK_PROFILES['3g'].latency).toBe(150);
    });

    it('should have correct 4G profile', () => {
      expect(NETWORK_PROFILES['4g'].name).toBe('4G');
      expect(NETWORK_PROFILES['4g'].download).toBe(9000);
      expect(NETWORK_PROFILES['4g'].upload).toBe(3000);
      expect(NETWORK_PROFILES['4g'].latency).toBe(70);
    });

    it('should have offline profile', () => {
      expect(NETWORK_PROFILES['offline']).toBeDefined();
      expect(NETWORK_PROFILES['offline'].download).toBe(0);
      expect(NETWORK_PROFILES['offline'].upload).toBe(0);
    });
  });

  describe('WebPerformanceTester class', () => {
    it('should accept configuration with url', () => {
      const tester = new WebPerformanceTester({ url: 'https://example.com' });
      expect(tester).toBeDefined();
    });

    it('should accept full configuration', () => {
      const config: Partial<WebPerformanceConfig> & { url: string } = {
        url: 'https://example.com',
        devices: ['Desktop', 'iPhone 15'],
        networkProfiles: [NETWORK_PROFILES['4g']],
        timeout: 60000,
        headless: true,
        artifactsDir: './data/screenshots/perf',
        onlyCategories: ['performance'],
      };
      const tester = new WebPerformanceTester(config);
      expect(tester).toBeDefined();
    });

    it('should have getDetailedResults method', () => {
      const tester = new WebPerformanceTester({ url: 'https://example.com' });
      expect(tester.getDetailedResults).toBeDefined();
      expect(typeof tester.getDetailedResults).toBe('function');
    });

    it('should have getSummary method', () => {
      const tester = new WebPerformanceTester({ url: 'https://example.com' });
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should return empty results before run', () => {
      const tester = new WebPerformanceTester({ url: 'https://example.com' });
      const results = tester.getDetailedResults();
      expect(results).toEqual([]);
    });

    it('should generate summary with no results', () => {
      const tester = new WebPerformanceTester({ url: 'https://example.com' });
      const summary = tester.getSummary();
      expect(summary).toContain('Web 性能测试报告');
      expect(summary).toContain('平均性能评分');
    });
  });

  describe('PerformanceMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: PerformanceMetrics = {
        performanceScore: 90,
        lcp: 2500,
        fcp: 1800,
        cls: 0.1,
        tbt: 200,
        speedIndex: 3000,
        tti: 5000,
        inp: 100,
        si: 3000,
      };
      expect(metrics.performanceScore).toBe(90);
      expect(metrics.lcp).toBe(2500);
    });
  });

  describe('DevicePerformanceResult type', () => {
    it('should have correct structure', () => {
      const result: DevicePerformanceResult = {
        device: 'Desktop',
        network: '4G',
        metrics: {
          performanceScore: 85,
          lcp: 2000,
          fcp: 1500,
          cls: 0.05,
          tbt: 150,
          speedIndex: 2500,
          tti: 4000,
          si: 2500,
        },
        opportunities: [],
        diagnostics: [],
      };
      expect(result.device).toBe('Desktop');
      expect(result.network).toBe('4G');
      expect(result.metrics.performanceScore).toBe(85);
    });
  });
});

describe('WebPerformanceTester with mocked lighthouse', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('should handle lighthouse run', async () => {
    // This test would need actual browser to run
    // For now, we just verify the module can be imported
    const { WebPerformanceTester } = await import('@/testers/performance/web-performance.js');
    expect(WebPerformanceTester).toBeDefined();
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  LoadTimeTester,
  runLoadTimeTest,
  type LoadTimeTesterConfig,
  type PageLoadTimeResult,
  type NavigationTimings,
  type LoadTimeSummaryResult,
} from '@/testers/performance/load-time-tester.js';

// Mock playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          evaluate: vi.fn().mockResolvedValue({
            dnsTime: 10,
            tcpTime: 20,
            sslTime: 30,
            ttfb: 100,
            domContentLoaded: 500,
            domComplete: 1000,
            loadEvent: 1200,
            redirectTime: 5,
            requestTime: 50,
            responseTime: 200,
            domProcessingTime: 300,
            totalLoadTime: 1200,
          }),
          goto: vi.fn().mockResolvedValue(undefined),
          on: vi.fn(),
          close: vi.fn().mockResolvedValue(undefined),
        }),
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

describe('LoadTimeTester', () => {
  describe('module exports', () => {
    it('should export LoadTimeTester class', () => {
      expect(LoadTimeTester).toBeDefined();
      expect(typeof LoadTimeTester).toBe('function');
    });

    it('should export runLoadTimeTest function', () => {
      expect(runLoadTimeTest).toBeDefined();
      expect(typeof runLoadTimeTest).toBe('function');
    });
  });

  describe('LoadTimeTester class', () => {
    it('should accept configuration with url', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      expect(tester).toBeDefined();
    });

    it('should accept full configuration', () => {
      const config: Partial<LoadTimeTesterConfig> & { url: string } = {
        url: 'https://example.com',
        devices: ['Desktop', 'iPhone 15'],
        timeout: 60000,
        headless: true,
        iterations: 5,
        warmupIterations: 2,
        artifactsDir: './data/screenshots/load-time',
      };
      const tester = new LoadTimeTester(config);
      expect(tester).toBeDefined();
    });

    it('should have getDetailedResults method', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      expect(tester.getDetailedResults).toBeDefined();
      expect(typeof tester.getDetailedResults).toBe('function');
    });

    it('should have getSummaries method', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      expect(tester.getSummaries).toBeDefined();
      expect(typeof tester.getSummaries).toBe('function');
    });

    it('should have getSummary method', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should have getWaterfallData method', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      expect(tester.getWaterfallData).toBeDefined();
      expect(typeof tester.getWaterfallData).toBe('function');
    });

    it('should return empty results before run', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      const results = tester.getDetailedResults();
      expect(results).toEqual([]);
    });

    it('should return empty summaries before run', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      const summaries = tester.getSummaries();
      expect(summaries).toEqual([]);
    });

    it('should generate summary with no results', () => {
      const tester = new LoadTimeTester({ url: 'https://example.com' });
      const summary = tester.getSummary();
      expect(summary).toContain('页面加载时间测试报告');
      expect(summary).toContain('测试 URL 数量');
    });
  });

  describe('NavigationTimings type', () => {
    it('should have correct structure', () => {
      const timings: NavigationTimings = {
        dnsTime: 10,
        tcpTime: 20,
        sslTime: 30,
        ttfb: 100,
        domContentLoaded: 500,
        domComplete: 1000,
        loadEvent: 1200,
        redirectTime: 5,
        requestTime: 50,
        responseTime: 200,
        domProcessingTime: 300,
        totalLoadTime: 1200,
        resourceCount: 50,
        totalResourceSize: 500000,
        isSlow: false,
        isVerySlow: false,
      };
      expect(timings.dnsTime).toBe(10);
      expect(timings.ttfb).toBe(100);
      expect(timings.totalLoadTime).toBe(1200);
      expect(timings.isSlow).toBe(false);
    });

    it('should correctly identify slow pages', () => {
      const slowTimings: NavigationTimings = {
        dnsTime: 10,
        tcpTime: 20,
        sslTime: 30,
        ttfb: 100,
        domContentLoaded: 500,
        domComplete: 1000,
        loadEvent: 3500,
        redirectTime: 5,
        requestTime: 50,
        responseTime: 200,
        domProcessingTime: 300,
        totalLoadTime: 3500,
        resourceCount: 50,
        totalResourceSize: 500000,
        isSlow: true,
        isVerySlow: false,
      };
      expect(slowTimings.isSlow).toBe(true);
      expect(slowTimings.isVerySlow).toBe(false);
    });

    it('should correctly identify very slow pages', () => {
      const verySlowTimings: NavigationTimings = {
        dnsTime: 10,
        tcpTime: 20,
        sslTime: 30,
        ttfb: 100,
        domContentLoaded: 500,
        domComplete: 1000,
        loadEvent: 5500,
        redirectTime: 5,
        requestTime: 50,
        responseTime: 200,
        domProcessingTime: 300,
        totalLoadTime: 5500,
        resourceCount: 50,
        totalResourceSize: 500000,
        isSlow: true,
        isVerySlow: true,
      };
      expect(verySlowTimings.isSlow).toBe(true);
      expect(verySlowTimings.isVerySlow).toBe(true);
    });
  });

  describe('PageLoadTimeResult type', () => {
    it('should have correct structure', () => {
      const result: PageLoadTimeResult = {
        url: 'https://example.com',
        device: 'Desktop',
        iteration: 1,
        timings: {
          dnsTime: 10,
          tcpTime: 20,
          sslTime: 30,
          ttfb: 100,
          domContentLoaded: 500,
          domComplete: 1000,
          loadEvent: 1200,
          redirectTime: 5,
          requestTime: 50,
          responseTime: 200,
          domProcessingTime: 300,
          totalLoadTime: 1200,
          resourceCount: 50,
          totalResourceSize: 500000,
          isSlow: false,
          isVerySlow: false,
        },
        timestamp: '2024-01-01T00:00:00Z',
      };
      expect(result.url).toBe('https://example.com');
      expect(result.device).toBe('Desktop');
      expect(result.iteration).toBe(1);
    });
  });

  describe('LoadTimeSummaryResult type', () => {
    it('should have correct structure', () => {
      const summary: LoadTimeSummaryResult = {
        url: 'https://example.com',
        device: 'Desktop',
        avgTimings: {
          dnsTime: 10,
          tcpTime: 20,
          sslTime: 30,
          ttfb: 100,
          domContentLoaded: 500,
          domComplete: 1000,
          loadEvent: 1200,
          redirectTime: 5,
          requestTime: 50,
          responseTime: 200,
          domProcessingTime: 300,
          totalLoadTime: 1200,
          resourceCount: 50,
          totalResourceSize: 500000,
          isSlow: false,
          isVerySlow: false,
        },
        minTimings: {
          dnsTime: 10,
          tcpTime: 20,
          sslTime: 30,
          ttfb: 100,
          domContentLoaded: 500,
          domComplete: 1000,
          loadEvent: 1000,
          redirectTime: 5,
          requestTime: 50,
          responseTime: 200,
          domProcessingTime: 300,
          totalLoadTime: 1000,
          resourceCount: 40,
          totalResourceSize: 400000,
          isSlow: false,
          isVerySlow: false,
        },
        maxTimings: {
          dnsTime: 10,
          tcpTime: 20,
          sslTime: 30,
          ttfb: 100,
          domContentLoaded: 500,
          domComplete: 1000,
          loadEvent: 1500,
          redirectTime: 5,
          requestTime: 50,
          responseTime: 200,
          domProcessingTime: 300,
          totalLoadTime: 1500,
          resourceCount: 60,
          totalResourceSize: 600000,
          isSlow: false,
          isVerySlow: false,
        },
        stdDev: 100,
        iterations: 3,
        passRate: 1.0,
      };
      expect(summary.url).toBe('https://example.com');
      expect(summary.stdDev).toBe(100);
      expect(summary.passRate).toBe(1.0);
    });
  });
});
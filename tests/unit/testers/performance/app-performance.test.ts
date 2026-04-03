import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppPerformanceTester,
  runAppPerformanceTest,
  type AppPerformanceConfig,
  type PerformanceDataPoint,
  type CpuMetrics,
  type MemoryMetrics,
  type FpsMetrics,
  type NetworkMetrics,
  type BatteryMetrics,
  type AppPerformanceSummary,
} from '@/testers/performance/app-performance.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn().mockReturnValue({
    stdout: {
      on: vi.fn((event, callback) => {
        if (event === 'data') {
          callback('mock output');
        }
      }),
    },
    stderr: {
      on: vi.fn(),
    },
    on: vi.fn((event, callback) => {
      if (event === 'close') {
        callback(0);
      }
    }),
  }),
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

describe('AppPerformanceTester', () => {
  describe('module exports', () => {
    it('should export AppPerformanceTester class', () => {
      expect(AppPerformanceTester).toBeDefined();
      expect(typeof AppPerformanceTester).toBe('function');
    });

    it('should export runAppPerformanceTest function', () => {
      expect(runAppPerformanceTest).toBeDefined();
      expect(typeof runAppPerformanceTest).toBe('function');
    });
  });

  describe('AppPerformanceTester class', () => {
    it('should accept configuration with packageName', () => {
      const tester = new AppPerformanceTester({ packageName: 'com.example.app' });
      expect(tester).toBeDefined();
    });

    it('should accept full configuration', () => {
      const config: Partial<AppPerformanceConfig> & { packageName: string } = {
        packageName: 'com.example.app',
        device: 'emulator-5554',
        adbPath: '/usr/bin/adb',
        duration: 120,
        interval: 500,
        artifactsDir: './data/perf',
      };
      const tester = new AppPerformanceTester(config);
      expect(tester).toBeDefined();
    });

    it('should have getDetailedResults method', () => {
      const tester = new AppPerformanceTester({ packageName: 'com.example.app' });
      expect(tester.getDetailedResults).toBeDefined();
      expect(typeof tester.getDetailedResults).toBe('function');
    });

    it('should have getSummary method', () => {
      const tester = new AppPerformanceTester({ packageName: 'com.example.app' });
      expect(tester.getSummary).toBeDefined();
      expect(typeof tester.getSummary).toBe('function');
    });

    it('should return empty results before run', () => {
      const tester = new AppPerformanceTester({ packageName: 'com.example.app' });
      const results = tester.getDetailedResults();
      expect(results).toEqual([]);
    });

    it('should generate summary with no results', () => {
      const tester = new AppPerformanceTester({ packageName: 'com.example.app' });
      const summary = tester.getSummary();
      expect(summary).toContain('暂无性能数据');
    });
  });

  describe('CpuMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: CpuMetrics = {
        user: 15.5,
        system: 8.2,
        total: 23.7,
        cores: 8,
      };
      expect(metrics.user).toBe(15.5);
      expect(metrics.system).toBe(8.2);
      expect(metrics.total).toBe(23.7);
      expect(metrics.cores).toBe(8);
    });
  });

  describe('MemoryMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: MemoryMetrics = {
        total: 8000000,
        used: 4000000,
        free: 4000000,
        app: 150000,
        native: 50000,
        dalvik: 100000,
      };
      expect(metrics.total).toBe(8000000);
      expect(metrics.app).toBe(150000);
      expect(metrics.native).toBe(50000);
      expect(metrics.dalvik).toBe(100000);
    });
  });

  describe('FpsMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: FpsMetrics = {
        fps: 60,
        droppedFrames: 5,
        jankyFrames: 3,
      };
      expect(metrics.fps).toBe(60);
      expect(metrics.droppedFrames).toBe(5);
      expect(metrics.jankyFrames).toBe(3);
    });
  });

  describe('NetworkMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: NetworkMetrics = {
        rxBytes: 1024000,
        txBytes: 512000,
        rxPackets: 1000,
        txPackets: 500,
      };
      expect(metrics.rxBytes).toBe(1024000);
      expect(metrics.txBytes).toBe(512000);
      expect(metrics.rxPackets).toBe(1000);
      expect(metrics.txPackets).toBe(500);
    });
  });

  describe('BatteryMetrics type', () => {
    it('should have correct structure', () => {
      const metrics: BatteryMetrics = {
        level: 85,
        temperature: 32.5,
        voltage: 4200,
        current: 500,
        power: 2100,
      };
      expect(metrics.level).toBe(85);
      expect(metrics.temperature).toBe(32.5);
      expect(metrics.voltage).toBe(4200);
      expect(metrics.current).toBe(500);
      expect(metrics.power).toBe(2100);
    });
  });

  describe('PerformanceDataPoint type', () => {
    it('should have correct structure', () => {
      const dataPoint: PerformanceDataPoint = {
        timestamp: Date.now(),
        cpu: {
          user: 15,
          system: 8,
          total: 23,
          cores: 8,
        },
        memory: {
          total: 8000000,
          used: 4000000,
          free: 4000000,
          app: 150000,
          native: 50000,
          dalvik: 100000,
        },
        fps: {
          fps: 60,
          droppedFrames: 0,
          jankyFrames: 0,
        },
        network: {
          rxBytes: 1024000,
          txBytes: 512000,
          rxPackets: 1000,
          txPackets: 500,
        },
        battery: {
          level: 85,
          temperature: 32,
          voltage: 4200,
          current: 500,
          power: 2100,
        },
      };
      expect(dataPoint.timestamp).toBeDefined();
      expect(dataPoint.cpu).toBeDefined();
      expect(dataPoint.memory).toBeDefined();
      expect(dataPoint.fps).toBeDefined();
      expect(dataPoint.network).toBeDefined();
      expect(dataPoint.battery).toBeDefined();
    });
  });

  describe('AppPerformanceSummary type', () => {
    it('should have correct structure', () => {
      const summary: AppPerformanceSummary = {
        cpu: {
          avgTotal: 23.5,
          maxTotal: 45.2,
          minTotal: 10.1,
          avgUser: 15.0,
          avgSystem: 8.5,
        },
        memory: {
          avgApp: 150000,
          maxApp: 200000,
          minApp: 100000,
          avgUsed: 4000000,
          peakMemory: 200000,
        },
        fps: {
          avgFps: 58.5,
          minFps: 45,
          droppedFramesTotal: 10,
          jankyFramesTotal: 5,
        },
        network: {
          totalRxBytes: 1024000,
          totalTxBytes: 512000,
          avgRxRate: 16.0,
          avgTxRate: 8.0,
        },
        battery: {
          startLevel: 85,
          endLevel: 83,
          drainRate: 2.0,
          avgTemperature: 32.5,
          avgPower: 2100,
        },
      };
      expect(summary.cpu).toBeDefined();
      expect(summary.memory).toBeDefined();
      expect(summary.fps).toBeDefined();
      expect(summary.network).toBeDefined();
      expect(summary.battery).toBeDefined();
    });
  });
});
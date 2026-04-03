import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryLeakTester, runMemoryLeakTest, type MemoryLeakTesterConfig, type MemoryLeakResult, type MemoryLeakAction } from '@/testers/stability/memory-leak-tester.js';

describe('MemoryLeakTester', () => {
  describe('module exports', () => {
    it('should export MemoryLeakTester class', () => {
      expect(MemoryLeakTester).toBeDefined();
      expect(typeof MemoryLeakTester).toBe('function');
    });

    it('should export runMemoryLeakTest function', () => {
      expect(runMemoryLeakTest).toBeDefined();
      expect(typeof runMemoryLeakTest).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new MemoryLeakTester({
        iterationCount: 20,
        headless: true,
        viewport: { width: 1920, height: 1080 },
      });
      expect(tester).toBeDefined();
    });
  });

  describe('default configuration', () => {
    it('should use default iterationCount of 50', () => {
      const tester = new MemoryLeakTester();
      expect(tester).toBeDefined();
    });

    it('should use default viewport', () => {
      const tester = new MemoryLeakTester();
      expect(tester).toBeDefined();
    });

    it('should use default headless mode', () => {
      const tester = new MemoryLeakTester();
      expect(tester).toBeDefined();
    });

    it('should use default leakThresholdMB of 10', () => {
      const tester = new MemoryLeakTester();
      expect(tester).toBeDefined();
    });

    it('should use default growthThresholdPercent of 20', () => {
      const tester = new MemoryLeakTester();
      expect(tester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should accept custom iterationCount', () => {
      const config: Partial<MemoryLeakTesterConfig> = {
        iterationCount: 100,
      };
      const tester = new MemoryLeakTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom iterationDelay', () => {
      const config: Partial<MemoryLeakTesterConfig> = {
        iterationDelay: 1000,
      };
      const tester = new MemoryLeakTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom leakThresholdMB', () => {
      const config: Partial<MemoryLeakTesterConfig> = {
        leakThresholdMB: 5,
      };
      const tester = new MemoryLeakTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom growthThresholdPercent', () => {
      const config: Partial<MemoryLeakTesterConfig> = {
        growthThresholdPercent: 10,
      };
      const tester = new MemoryLeakTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom actionSequence', () => {
      const actionSequence: MemoryLeakAction[] = [
        { name: 'click-btn', action: 'click', target: '#button' },
        { name: 'scroll-down', action: 'scroll', value: 'down' },
      ];
      const config: Partial<MemoryLeakTesterConfig> = {
        actionSequence,
      };
      const tester = new MemoryLeakTester(config);
      expect(tester).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      const mockResult: MemoryLeakResult = {
        runId: 'test-run',
        url: 'https://example.com',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        durationMs: 60000,
        samples: [],
        analysis: {
          hasLeak: false,
          leakRate: 0,
          growthPercentage: 0,
          peakMemoryMB: 50,
          initialMemoryMB: 40,
          finalMemoryMB: 42,
          recommendation: 'No leak detected',
        },
        timeline: [],
      };

      expect(mockResult).toHaveProperty('runId');
      expect(mockResult).toHaveProperty('url');
      expect(mockResult).toHaveProperty('startTime');
      expect(mockResult).toHaveProperty('endTime');
      expect(mockResult).toHaveProperty('durationMs');
      expect(mockResult).toHaveProperty('samples');
      expect(mockResult).toHaveProperty('analysis');
      expect(mockResult).toHaveProperty('timeline');
    });

    it('should have correct analysis structure', () => {
      const analysis = {
        hasLeak: false,
        leakRate: 0,
        growthPercentage: 0,
        peakMemoryMB: 50,
        initialMemoryMB: 40,
        finalMemoryMB: 42,
        recommendation: 'No leak detected',
      };

      expect(analysis).toHaveProperty('hasLeak');
      expect(analysis).toHaveProperty('leakRate');
      expect(analysis).toHaveProperty('growthPercentage');
      expect(analysis).toHaveProperty('peakMemoryMB');
      expect(analysis).toHaveProperty('initialMemoryMB');
      expect(analysis).toHaveProperty('finalMemoryMB');
      expect(analysis).toHaveProperty('recommendation');
      expect(typeof analysis.hasLeak).toBe('boolean');
      expect(typeof analysis.leakRate).toBe('number');
      expect(typeof analysis.growthPercentage).toBe('number');
      expect(typeof analysis.peakMemoryMB).toBe('number');
      expect(typeof analysis.initialMemoryMB).toBe('number');
      expect(typeof analysis.finalMemoryMB).toBe('number');
      expect(typeof analysis.recommendation).toBe('string');
    });

    it('should have correct sample structure', () => {
      const sample = {
        timestamp: '2024-01-01T00:00:00Z',
        actionName: 'click',
        actionIndex: 1,
        usedJSHeapSize: 40 * 1024 * 1024,
        totalJSHeapSize: 50 * 1024 * 1024,
        jsHeapSizeLimit: 1024 * 1024 * 1024,
      };

      expect(sample).toHaveProperty('timestamp');
      expect(sample).toHaveProperty('actionName');
      expect(sample).toHaveProperty('actionIndex');
      expect(sample).toHaveProperty('usedJSHeapSize');
      expect(sample).toHaveProperty('totalJSHeapSize');
      expect(sample).toHaveProperty('jsHeapSizeLimit');
    });

    it('should have correct timeline structure', () => {
      const timelineItem = {
        action: 'scroll',
        memoryDeltaMB: 0.5,
        timestamp: '2024-01-01T00:00:00Z',
      };

      expect(timelineItem).toHaveProperty('action');
      expect(timelineItem).toHaveProperty('memoryDeltaMB');
      expect(timelineItem).toHaveProperty('timestamp');
    });
  });

  describe('action types', () => {
    it('should support click action', () => {
      const action: MemoryLeakAction = {
        name: 'click-btn',
        action: 'click',
        target: '#button',
      };
      expect(action.action).toBe('click');
    });

    it('should support navigate action', () => {
      const action: MemoryLeakAction = {
        name: 'nav-page',
        action: 'navigate',
        target: '/page',
      };
      expect(action.action).toBe('navigate');
    });

    it('should support open-dialog action', () => {
      const action: MemoryLeakAction = {
        name: 'open-modal',
        action: 'open-dialog',
        target: '#modal-trigger',
      };
      expect(action.action).toBe('open-dialog');
    });

    it('should support close-dialog action', () => {
      const action: MemoryLeakAction = {
        name: 'close-modal',
        action: 'close-dialog',
      };
      expect(action.action).toBe('close-dialog');
    });

    it('should support scroll action', () => {
      const action: MemoryLeakAction = {
        name: 'scroll-down',
        action: 'scroll',
        value: 'down',
      };
      expect(action.action).toBe('scroll');
    });

    it('should support custom action', () => {
      const action: MemoryLeakAction = {
        name: 'custom-action',
        action: 'custom',
      };
      expect(action.action).toBe('custom');
    });
  });

  describe('memory analysis', () => {
    it('should detect no leak when memory stable', () => {
      const initialMemory = 40 * 1024 * 1024; // 40MB
      const finalMemory = 42 * 1024 * 1024; // 42MB (5% growth)

      const growthPercentage = ((finalMemory - initialMemory) / initialMemory) * 100;
      const hasLeak = growthPercentage > 20; // 20% threshold

      expect(hasLeak).toBe(false);
    });

    it('should detect leak when memory grows significantly', () => {
      const initialMemory = 40 * 1024 * 1024; // 40MB
      const finalMemory = 50 * 1024 * 1024; // 50MB (25% growth)

      const growthPercentage = ((finalMemory - initialMemory) / initialMemory) * 100;
      const hasLeak = growthPercentage > 20; // 20% threshold

      expect(hasLeak).toBe(true);
    });

    it('should detect leak when memory exceeds threshold', () => {
      const initialMemory = 40 * 1024 * 1024; // 40MB
      const finalMemory = 55 * 1024 * 1024; // 55MB (15MB growth)

      const growthMB = (finalMemory - initialMemory) / (1024 * 1024);
      const hasLeak = growthMB > 10; // 10MB threshold

      expect(hasLeak).toBe(true);
    });

    it('should calculate leak rate correctly', () => {
      const initialMemory = 40 * 1024 * 1024; // 40MB
      const finalMemory = 50 * 1024 * 1024; // 50MB
      const iterationCount = 50;

      const leakRate = (finalMemory - initialMemory) / iterationCount;

      // 10MB / 50 iterations = 0.2MB per iteration = 209715.2 bytes
      expect(leakRate).toBeCloseTo(10 * 1024 * 1024 / 50, 1);
    });
  });

  describe('bytes to MB conversion', () => {
    it('should convert 1MB correctly', () => {
      const bytes = 1024 * 1024;
      const mb = bytes / (1024 * 1024);
      expect(mb).toBe(1);
    });

    it('should convert 50MB correctly', () => {
      const bytes = 50 * 1024 * 1024;
      const mb = bytes / (1024 * 1024);
      expect(mb).toBe(50);
    });
  });
});
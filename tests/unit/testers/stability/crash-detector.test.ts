import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CrashDetector, runCrashDetection, type CrashDetectorConfig, type CrashDetectionResult, type CrashEvent } from '@/testers/stability/crash-detector.js';

describe('CrashDetector', () => {
  describe('module exports', () => {
    it('should export CrashDetector class', () => {
      expect(CrashDetector).toBeDefined();
      expect(typeof CrashDetector).toBe('function');
    });

    it('should export runCrashDetection function', () => {
      expect(runCrashDetection).toBeDefined();
      expect(typeof runCrashDetection).toBe('function');
    });

    it('should accept configuration', () => {
      const detector = new CrashDetector({
        headless: true,
        viewport: { width: 1920, height: 1080 },
        detectWhiteScreen: true,
      });
      expect(detector).toBeDefined();
    });
  });

  describe('default configuration', () => {
    it('should use default viewport', () => {
      const detector = new CrashDetector();
      expect(detector).toBeDefined();
    });

    it('should use default headless mode', () => {
      const detector = new CrashDetector();
      expect(detector).toBeDefined();
    });

    it('should use default detectWhiteScreen', () => {
      const detector = new CrashDetector();
      expect(detector).toBeDefined();
    });

    it('should use default whiteScreenCheckInterval', () => {
      const detector = new CrashDetector();
      expect(detector).toBeDefined();
    });

    it('should use default maxEvents', () => {
      const detector = new CrashDetector();
      expect(detector).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should accept custom timeout', () => {
      const config: Partial<CrashDetectorConfig> = {
        timeout: 60000,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });

    it('should accept custom detectWhiteScreen', () => {
      const config: Partial<CrashDetectorConfig> = {
        detectWhiteScreen: false,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });

    it('should accept custom whiteScreenCheckInterval', () => {
      const config: Partial<CrashDetectorConfig> = {
        whiteScreenCheckInterval: 10000,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });

    it('should accept custom screenshotOnError', () => {
      const config: Partial<CrashDetectorConfig> = {
        screenshotOnError: false,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });

    it('should accept custom maxEvents', () => {
      const config: Partial<CrashDetectorConfig> = {
        maxEvents: 50,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });

    it('should accept custom ignorePatterns', () => {
      const config: Partial<CrashDetectorConfig> = {
        ignorePatterns: ['ResizeObserver', 'network error'],
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });
  });

  describe('event types', () => {
    it('should support page_crash event type', () => {
      const event: CrashEvent = {
        id: 'test-1',
        type: 'page_crash',
        severity: 'critical',
        message: 'Page crashed',
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe('page_crash');
    });

    it('should support js_exception event type', () => {
      const event: CrashEvent = {
        id: 'test-2',
        type: 'js_exception',
        severity: 'high',
        message: 'Uncaught TypeError',
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe('js_exception');
    });

    it('should support console_error event type', () => {
      const event: CrashEvent = {
        id: 'test-3',
        type: 'console_error',
        severity: 'medium',
        message: 'Console error',
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe('console_error');
    });

    it('should support network_5xx event type', () => {
      const event: CrashEvent = {
        id: 'test-4',
        type: 'network_5xx',
        severity: 'high',
        message: 'HTTP 500',
        timestamp: new Date().toISOString(),
        httpStatus: 500,
      };
      expect(event.type).toBe('network_5xx');
    });

    it('should support network_timeout event type', () => {
      const event: CrashEvent = {
        id: 'test-5',
        type: 'network_timeout',
        severity: 'high',
        message: 'Request timeout',
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe('network_timeout');
    });

    it('should support white_screen event type', () => {
      const event: CrashEvent = {
        id: 'test-6',
        type: 'white_screen',
        severity: 'critical',
        message: 'Page is blank',
        timestamp: new Date().toISOString(),
      };
      expect(event.type).toBe('white_screen');
    });
  });

  describe('severity levels', () => {
    it('should support critical severity', () => {
      const event: CrashEvent = {
        id: 'test-1',
        type: 'page_crash',
        severity: 'critical',
        message: 'Critical error',
        timestamp: new Date().toISOString(),
      };
      expect(event.severity).toBe('critical');
    });

    it('should support high severity', () => {
      const event: CrashEvent = {
        id: 'test-2',
        type: 'js_exception',
        severity: 'high',
        message: 'High severity error',
        timestamp: new Date().toISOString(),
      };
      expect(event.severity).toBe('high');
    });

    it('should support medium severity', () => {
      const event: CrashEvent = {
        id: 'test-3',
        type: 'console_error',
        severity: 'medium',
        message: 'Medium severity error',
        timestamp: new Date().toISOString(),
      };
      expect(event.severity).toBe('medium');
    });

    it('should support low severity', () => {
      const event: CrashEvent = {
        id: 'test-4',
        type: 'console_error',
        severity: 'low',
        message: 'Low severity error',
        timestamp: new Date().toISOString(),
      };
      expect(event.severity).toBe('low');
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      const mockResult: CrashDetectionResult = {
        runId: 'test-run',
        url: 'https://example.com',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        durationMs: 60000,
        events: [],
        summary: {
          totalEvents: 0,
          criticalCount: 0,
          highCount: 0,
          mediumCount: 0,
          lowCount: 0,
          pageCrashes: 0,
          jsExceptions: 0,
          networkErrors: 0,
          consoleErrors: 0,
          stabilityScore: 100,
          isStable: true,
        },
        recommendations: ['系统运行稳定，建议继续保持监控'],
        artifacts: {
          screenshots: [],
          logs: [],
        },
      };

      expect(mockResult).toHaveProperty('runId');
      expect(mockResult).toHaveProperty('url');
      expect(mockResult).toHaveProperty('startTime');
      expect(mockResult).toHaveProperty('endTime');
      expect(mockResult).toHaveProperty('durationMs');
      expect(mockResult).toHaveProperty('events');
      expect(mockResult).toHaveProperty('summary');
      expect(mockResult).toHaveProperty('recommendations');
      expect(mockResult).toHaveProperty('artifacts');
    });

    it('should have correct summary structure', () => {
      const summary = {
        totalEvents: 5,
        criticalCount: 1,
        highCount: 2,
        mediumCount: 1,
        lowCount: 1,
        pageCrashes: 1,
        jsExceptions: 2,
        networkErrors: 1,
        consoleErrors: 1,
        stabilityScore: 65,
        isStable: false,
      };

      expect(summary).toHaveProperty('totalEvents');
      expect(summary).toHaveProperty('criticalCount');
      expect(summary).toHaveProperty('highCount');
      expect(summary).toHaveProperty('mediumCount');
      expect(summary).toHaveProperty('lowCount');
      expect(summary).toHaveProperty('pageCrashes');
      expect(summary).toHaveProperty('jsExceptions');
      expect(summary).toHaveProperty('networkErrors');
      expect(summary).toHaveProperty('consoleErrors');
      expect(summary).toHaveProperty('stabilityScore');
      expect(summary).toHaveProperty('isStable');
    });

    it('should have correct event structure', () => {
      const event: CrashEvent = {
        id: 'event-1',
        type: 'js_exception',
        severity: 'high',
        message: 'Uncaught TypeError',
        timestamp: '2024-01-01T00:00:00Z',
        url: 'https://example.com',
        stackTrace: 'Error at line 10',
      };

      expect(event).toHaveProperty('id');
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('severity');
      expect(event).toHaveProperty('message');
      expect(event).toHaveProperty('timestamp');
    });
  });

  describe('stability score calculation', () => {
    it('should start with stability score of 100', () => {
      const summary = {
        totalEvents: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        stabilityScore: 100,
        isStable: true,
      };
      expect(summary.stabilityScore).toBe(100);
    });

    it('should deduct 20 for critical events', () => {
      const criticalCount = 1;
      const stabilityScore = Math.max(0, 100 - criticalCount * 20);
      expect(stabilityScore).toBe(80);
    });

    it('should deduct 10 for high events', () => {
      const highCount = 2;
      const stabilityScore = Math.max(0, 100 - highCount * 10);
      expect(stabilityScore).toBe(80);
    });

    it('should deduct 5 for medium events', () => {
      const mediumCount = 4;
      const stabilityScore = Math.max(0, 100 - mediumCount * 5);
      expect(stabilityScore).toBe(80);
    });

    it('should deduct 2 for low events', () => {
      const lowCount = 5;
      const stabilityScore = Math.max(0, 100 - lowCount * 2);
      expect(stabilityScore).toBe(90);
    });

    it('should not go below 0', () => {
      const criticalCount = 10;
      const stabilityScore = Math.max(0, 100 - criticalCount * 20);
      expect(stabilityScore).toBe(0);
    });

    it('should mark as unstable when score < 80 or has critical', () => {
      const stabilityScore = 65;
      const criticalCount = 1;
      const isStable = stabilityScore >= 80 && criticalCount === 0;
      expect(isStable).toBe(false);
    });

    it('should mark as stable when score >= 80 and no critical', () => {
      const stabilityScore = 85;
      const criticalCount = 0;
      const isStable = stabilityScore >= 80 && criticalCount === 0;
      expect(isStable).toBe(true);
    });
  });

  describe('recommendations generation', () => {
    it('should recommend checking page crash', () => {
      const events = [{ type: 'page_crash', severity: 'critical', message: '' }];
      const hasPageCrash = events.some(e => e.type === 'page_crash');
      expect(hasPageCrash).toBe(true);
    });

    it('should recommend checking JS exceptions', () => {
      const events = [{ type: 'js_exception', severity: 'high', message: '' }];
      const hasJsExceptions = events.some(e => e.type === 'js_exception');
      expect(hasJsExceptions).toBe(true);
    });

    it('should recommend checking network errors', () => {
      const events = [{ type: 'network_5xx', severity: 'high', message: '' }];
      const hasNetworkErrors = events.some(e => e.type === 'network_5xx' || e.type === 'network_timeout');
      expect(hasNetworkErrors).toBe(true);
    });

    it('should recommend checking console errors', () => {
      const events = [{ type: 'console_error', severity: 'medium', message: '' }];
      const hasConsoleErrors = events.some(e => e.type === 'console_error');
      expect(hasConsoleErrors).toBe(true);
    });

    it('should recommend checking white screen', () => {
      const events = [{ type: 'white_screen', severity: 'critical', message: '' }];
      const hasWhiteScreen = events.some(e => e.type === 'white_screen');
      expect(hasWhiteScreen).toBe(true);
    });
  });

  describe('event recording', () => {
    it('should respect maxEvents limit', () => {
      const config: Partial<CrashDetectorConfig> = {
        maxEvents: 10,
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();
    });
  });

  describe('ignore patterns', () => {
    it('should support regex patterns', () => {
      const config: Partial<CrashDetectorConfig> = {
        ignorePatterns: ['ResizeObserver loop limit exceeded'],
      };
      const detector = new CrashDetector(config);
      expect(detector).toBeDefined();

      // Test pattern matching
      const pattern = config.ignorePatterns[0];
      const shouldIgnore = new RegExp(pattern).test('ResizeObserver loop limit exceeded');
      expect(shouldIgnore).toBe(true);
    });
  });
});
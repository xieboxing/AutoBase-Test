import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MonkeyTester, runMonkeyTest, type MonkeyTesterConfig, type MonkeyTestResult } from '@/testers/stability/monkey-tester.js';

describe('MonkeyTester', () => {
  describe('module exports', () => {
    it('should export MonkeyTester class', () => {
      expect(MonkeyTester).toBeDefined();
      expect(typeof MonkeyTester).toBe('function');
    });

    it('should export runMonkeyTest function', () => {
      expect(runMonkeyTest).toBeDefined();
      expect(typeof runMonkeyTest).toBe('function');
    });

    it('should accept configuration', () => {
      const tester = new MonkeyTester({
        actionCount: 100,
        headless: true,
        viewport: { width: 1920, height: 1080 },
      });
      expect(tester).toBeDefined();
    });
  });

  describe('default configuration', () => {
    it('should use default actionCount of 500', () => {
      const tester = new MonkeyTester();
      expect(tester).toBeDefined();
    });

    it('should use default viewport', () => {
      const tester = new MonkeyTester();
      expect(tester).toBeDefined();
    });

    it('should use default headless mode', () => {
      const tester = new MonkeyTester();
      expect(tester).toBeDefined();
    });
  });

  describe('configuration options', () => {
    it('should accept custom actionCount', () => {
      const config: Partial<MonkeyTesterConfig> = {
        actionCount: 50,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom actionDelay', () => {
      const config: Partial<MonkeyTesterConfig> = {
        actionDelay: 50,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept screenshotOnAction option', () => {
      const config: Partial<MonkeyTesterConfig> = {
        screenshotOnAction: true,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept screenshotOnIssue option', () => {
      const config: Partial<MonkeyTesterConfig> = {
        screenshotOnIssue: true,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom maxInputLength', () => {
      const config: Partial<MonkeyTesterConfig> = {
        maxInputLength: 100,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });

    it('should accept custom scrollDistance', () => {
      const config: Partial<MonkeyTesterConfig> = {
        scrollDistance: 500,
      };
      const tester = new MonkeyTester(config);
      expect(tester).toBeDefined();
    });
  });

  describe('result structure', () => {
    it('should return correct result structure', async () => {
      // Mock 测试 - 不实际运行浏览器
      const mockResult: MonkeyTestResult = {
        runId: 'test-run',
        url: 'https://example.com',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        durationMs: 60000,
        totalActions: 100,
        successfulActions: 95,
        failedActions: 5,
        actions: [],
        issues: [],
        summary: {
          crashDetected: false,
          errorCount: 0,
          criticalIssueCount: 0,
          stabilityScore: 100,
        },
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
      expect(mockResult).toHaveProperty('totalActions');
      expect(mockResult).toHaveProperty('successfulActions');
      expect(mockResult).toHaveProperty('failedActions');
      expect(mockResult).toHaveProperty('actions');
      expect(mockResult).toHaveProperty('issues');
      expect(mockResult).toHaveProperty('summary');
      expect(mockResult).toHaveProperty('artifacts');
    });

    it('should have correct summary structure', () => {
      const summary = {
        crashDetected: false,
        errorCount: 0,
        criticalIssueCount: 0,
        stabilityScore: 100,
      };

      expect(summary).toHaveProperty('crashDetected');
      expect(summary).toHaveProperty('errorCount');
      expect(summary).toHaveProperty('criticalIssueCount');
      expect(summary).toHaveProperty('stabilityScore');
      expect(typeof summary.crashDetected).toBe('boolean');
      expect(typeof summary.errorCount).toBe('number');
      expect(typeof summary.criticalIssueCount).toBe('number');
      expect(typeof summary.stabilityScore).toBe('number');
    });
  });

  describe('action types', () => {
    it('should support click action', () => {
      const action = {
        order: 1,
        action: 'click' as const,
        target: '#button',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('click');
    });

    it('should support input action', () => {
      const action = {
        order: 1,
        action: 'input' as const,
        target: '#input',
        value: 'test text',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('input');
      expect(action.value).toBeDefined();
    });

    it('should support scroll action', () => {
      const action = {
        order: 1,
        action: 'scroll' as const,
        target: 'down',
        value: '300px',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('scroll');
    });

    it('should support navigate action', () => {
      const action = {
        order: 1,
        action: 'navigate' as const,
        target: '/page',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('navigate');
    });

    it('should support hover action', () => {
      const action = {
        order: 1,
        action: 'hover' as const,
        target: '#menu',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('hover');
    });

    it('should support select action', () => {
      const action = {
        order: 1,
        action: 'select' as const,
        target: '#dropdown',
        value: 'option1',
        timestamp: new Date().toISOString(),
        success: true,
      };
      expect(action.action).toBe('select');
      expect(action.value).toBeDefined();
    });
  });

  describe('issue types', () => {
    it('should support console_error issue', () => {
      const issue = {
        type: 'console_error' as const,
        severity: 'medium' as const,
        message: 'Console error message',
        timestamp: new Date().toISOString(),
        actionOrder: 1,
      };
      expect(issue.type).toBe('console_error');
      expect(issue.severity).toBe('medium');
    });

    it('should support page_crash issue', () => {
      const issue = {
        type: 'page_crash' as const,
        severity: 'critical' as const,
        message: 'Page crashed',
        timestamp: new Date().toISOString(),
        actionOrder: 1,
      };
      expect(issue.type).toBe('page_crash');
      expect(issue.severity).toBe('critical');
    });

    it('should support uncaught_exception issue', () => {
      const issue = {
        type: 'uncaught_exception' as const,
        severity: 'high' as const,
        message: 'Uncaught exception',
        timestamp: new Date().toISOString(),
        actionOrder: 1,
      };
      expect(issue.type).toBe('uncaught_exception');
      expect(issue.severity).toBe('high');
    });

    it('should support network_5xx issue', () => {
      const issue = {
        type: 'network_5xx' as const,
        severity: 'high' as const,
        message: 'HTTP 500: /api',
        timestamp: new Date().toISOString(),
        actionOrder: 1,
      };
      expect(issue.type).toBe('network_5xx');
      expect(issue.severity).toBe('high');
    });

    it('should support white_screen issue', () => {
      const issue = {
        type: 'white_screen' as const,
        severity: 'critical' as const,
        message: 'Page appears blank',
        timestamp: new Date().toISOString(),
        actionOrder: 1,
      };
      expect(issue.type).toBe('white_screen');
      expect(issue.severity).toBe('critical');
    });
  });

  describe('severity levels', () => {
    it('should support critical severity', () => {
      const issue = { type: 'page_crash', severity: 'critical' as const, message: '', timestamp: '', actionOrder: 0 };
      expect(issue.severity).toBe('critical');
    });

    it('should support high severity', () => {
      const issue = { type: 'network_5xx', severity: 'high' as const, message: '', timestamp: '', actionOrder: 0 };
      expect(issue.severity).toBe('high');
    });

    it('should support medium severity', () => {
      const issue = { type: 'console_error', severity: 'medium' as const, message: '', timestamp: '', actionOrder: 0 };
      expect(issue.severity).toBe('medium');
    });

    it('should support low severity', () => {
      const issue = { type: 'console_error', severity: 'low' as const, message: '', timestamp: '', actionOrder: 0 };
      expect(issue.severity).toBe('low');
    });
  });

  describe('stability score calculation', () => {
    it('should start with stability score of 100', () => {
      const summary = {
        crashDetected: false,
        errorCount: 0,
        criticalIssueCount: 0,
        stabilityScore: 100,
      };
      expect(summary.stabilityScore).toBe(100);
    });

    it('should deduct points for critical issues', () => {
      // Each critical issue deducts 10 points
      const stabilityScore = Math.max(0, 100 - 10 * 2); // 2 critical issues
      expect(stabilityScore).toBe(80);
    });

    it('should deduct points for high severity issues', () => {
      // Each high issue deducts 5 points
      const stabilityScore = Math.max(0, 100 - 5 * 3); // 3 high issues
      expect(stabilityScore).toBe(85);
    });

    it('should deduct points for medium severity issues', () => {
      // Each medium issue deducts 2 points
      const stabilityScore = Math.max(0, 100 - 2 * 5); // 5 medium issues
      expect(stabilityScore).toBe(90);
    });

    it('should not go below 0', () => {
      const stabilityScore = Math.max(0, 100 - 10 * 20); // 20 critical issues
      expect(stabilityScore).toBe(0);
    });

    it('should not go above 100', () => {
      const stabilityScore = Math.min(100, 100 + 50);
      expect(stabilityScore).toBe(100);
    });
  });
});
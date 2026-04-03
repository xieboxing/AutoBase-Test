import { describe, it, expect, beforeEach } from 'vitest';
import { ConsoleReporter, createConsoleReporter } from '@/reporters/console-reporter.js';
import type { TestRunResult, TestCaseResult } from '@/types/index.js';

describe('ConsoleReporter', () => {
  let reporter: ConsoleReporter;
  let sampleResult: TestRunResult;

  beforeEach(() => {
    reporter = new ConsoleReporter({ verbose: false, showSteps: true, progressBars: true });

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
  });

  describe('module exports', () => {
    it('should export ConsoleReporter class', () => {
      expect(ConsoleReporter).toBeDefined();
      expect(typeof ConsoleReporter).toBe('function');
    });

    it('should export createConsoleReporter function', () => {
      expect(createConsoleReporter).toBeDefined();
      expect(typeof createConsoleReporter).toBe('function');
    });

    it('should create reporter with default config', () => {
      const r = createConsoleReporter();
      expect(r).toBeDefined();
    });
  });

  describe('startRun', () => {
    it('should not throw error', () => {
      expect(() => reporter.startRun('test-project', 10)).not.toThrow();
    });
  });

  describe('startCase', () => {
    it('should not throw error', () => {
      expect(() => reporter.startCase('Test Case 1', 'case-001')).not.toThrow();
    });
  });

  describe('endCase', () => {
    it('should not throw error for passed case', () => {
      const testCase: TestCaseResult = {
        caseId: 'case-001',
        caseName: 'Test Case 1',
        status: 'passed',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:10Z',
        durationMs: 10000,
        platform: 'pc-web',
        environment: {},
        steps: [],
        retryCount: 0,
        selfHealed: false,
        artifacts: { screenshots: [], logs: [] },
      };

      expect(() => reporter.endCase(testCase)).not.toThrow();
    });

    it('should not throw error for failed case', () => {
      const testCase: TestCaseResult = {
        caseId: 'case-002',
        caseName: 'Test Case 2',
        status: 'failed',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:00:10Z',
        durationMs: 10000,
        platform: 'pc-web',
        environment: {},
        steps: [
          { order: 1, action: 'navigate', status: 'passed', durationMs: 1000 },
          { order: 2, action: 'click', status: 'failed', durationMs: 500, errorMessage: 'Element not found' },
        ],
        retryCount: 1,
        selfHealed: false,
        artifacts: { screenshots: ['/path/to/screenshot.png'], logs: [] },
      };

      expect(() => reporter.endCase(testCase)).not.toThrow();
    });
  });

  describe('endRun', () => {
    it('should not throw error', () => {
      expect(() => reporter.endRun(sampleResult)).not.toThrow();
    });

    it('should handle result without AI analysis', () => {
      const resultWithoutAI = {
        ...sampleResult,
        aiAnalysis: undefined,
      };

      expect(() => reporter.endRun(resultWithoutAI)).not.toThrow();
    });
  });

  describe('showError', () => {
    it('should not throw error', () => {
      expect(() => reporter.showError('Test error', new Error('Detail'))).not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should accept verbose config', () => {
      const r = new ConsoleReporter({ verbose: true });
      expect(r).toBeDefined();
    });

    it('should accept showSteps config', () => {
      const r = new ConsoleReporter({ showSteps: false });
      expect(r).toBeDefined();
    });

    it('should accept progressBars config', () => {
      const r = new ConsoleReporter({ progressBars: false });
      expect(r).toBeDefined();
    });
  });
});
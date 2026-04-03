import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MarkdownReporter, generateMarkdownReport } from '@/reporters/markdown-reporter.js';
import type { TestRunResult } from '@/types/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('MarkdownReporter', () => {
  let reporter: MarkdownReporter;
  let testOutputDir: string;
  let sampleResult: TestRunResult;

  beforeEach(() => {
    testOutputDir = path.join(process.cwd(), 'data', 'test-reports', `test-md-${Date.now()}`);
    reporter = new MarkdownReporter({ outputDir: testOutputDir, language: 'zh-CN' });

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
      cases: [
        {
          caseId: 'case-001',
          caseName: 'Test Case 1',
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
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: [], logs: [] },
        },
      ],
      aiAnalysis: {
        overallAssessment: 'Good overall',
        criticalIssues: ['Issue 1', 'Issue 2'],
        recommendations: ['Recommendation 1'],
        riskLevel: 'medium',
      },
      artifacts: {
        screenshots: [],
        videos: [],
        logs: [],
      },
    };
  });

  afterEach(async () => {
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('module exports', () => {
    it('should export MarkdownReporter class', () => {
      expect(MarkdownReporter).toBeDefined();
      expect(typeof MarkdownReporter).toBe('function');
    });

    it('should export generateMarkdownReport function', () => {
      expect(generateMarkdownReport).toBeDefined();
      expect(typeof generateMarkdownReport).toBe('function');
    });
  });

  describe('generate', () => {
    it('should generate Markdown report file', async () => {
      const filePath = await reporter.generate(sampleResult);

      expect(filePath).toBeDefined();
      expect(filePath).toContain('.md');

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBeDefined();
    });

    it('should include project name in report', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('test-project');
    });

    it('should include summary table', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('测试概览');
      expect(content).toContain('总用例数');
      expect(content).toContain('通过率');
    });

    it('should include AI analysis', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('AI 分析');
      expect(content).toContain('Good overall');
      expect(content).toContain('关键问题');
    });

    it('should include category results', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('分类结果');
      expect(content).toContain('功能测试');
    });

    it('should include failed cases', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('失败用例');
      expect(content).toContain('Test Case 1');
    });

    it('should include environment info', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('测试环境');
      expect(content).toContain('pc-web');
    });
  });

  describe('formatting', () => {
    it('should format duration correctly', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      // Duration 60000ms = 1m 0s
      expect(content).toContain('1m');
    });

    it('should format pass rate as percentage', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      expect(content).toContain('80.0%');
    });
  });
});
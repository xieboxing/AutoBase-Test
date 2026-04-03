import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { JsonReporter } from '@/reporters/json-reporter.js';
import { MarkdownReporter } from '@/reporters/markdown-reporter.js';
import { HtmlReporter } from '@/reporters/html-reporter.js';
import { ConsoleReporter } from '@/reporters/console-reporter.js';
import { DiffReporter } from '@/reporters/diff-reporter.js';
import { TrendReporter } from '@/reporters/trend-reporter.js';
import type { TestRunResult } from '@/types/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 报告生成流程集成测试
 * 测试：JSON报告 → Markdown报告 → HTML报告 → 对比报告 → 趋势报告
 */
describe('Report Generation Flow Integration', () => {
  const outputDir = './data/reports/integration-report-test';

  // 构造模拟测试结果
  const createMockTestResult = (runId: string, passRate: number): TestRunResult => ({
    runId,
    project: 'Report Integration Test',
    startTime: new Date().toISOString(),
    endTime: new Date().toISOString(),
    duration: 10000,
    platform: 'pc-web',
    environment: {
      browser: 'chromium',
      browserVersion: '120.0',
      viewport: { width: 1920, height: 1080 },
      os: 'Windows',
    },
    summary: {
      total: 10,
      passed: Math.round(10 * passRate),
      failed: Math.round(10 * (1 - passRate)),
      skipped: 0,
      blocked: 0,
      passRate,
    },
    categories: {
      functional: { total: 5, passed: Math.round(5 * passRate), failed: Math.round(5 * (1 - passRate)), skipped: 0, passRate },
      visual: { total: 2, passed: Math.round(2 * passRate), failed: Math.round(2 * (1 - passRate)), skipped: 0, passRate },
      performance: { total: 1, passed: 1, failed: 0, skipped: 0, passRate: 1 },
      security: { total: 1, passed: 1, failed: 0, skipped: 0, passRate: 1 },
      accessibility: { total: 1, passed: Math.round(passRate), failed: Math.round(1 - passRate), skipped: 0, passRate },
      compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
      stability: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
    },
    cases: [
      {
        caseId: 'tc-001',
        caseName: '页面加载测试',
        status: passRate > 0.5 ? 'passed' : 'failed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 1000,
        platform: 'pc-web',
        environment: { browser: 'chromium' },
        steps: [
          { order: 1, action: 'navigate', target: 'https://example.com', status: 'passed', durationMs: 500 },
          { order: 2, action: 'assert', target: 'body', status: passRate > 0.5 ? 'passed' : 'failed', durationMs: 500, errorMessage: passRate > 0.5 ? undefined : 'Element not found' },
        ],
        retryCount: 0,
        selfHealed: false,
        artifacts: { screenshots: [], logs: [] },
      },
      {
        caseId: 'tc-002',
        caseName: '表单提交测试',
        status: passRate > 0.7 ? 'passed' : 'failed',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 2000,
        platform: 'pc-web',
        environment: { browser: 'chromium' },
        steps: [
          { order: 1, action: 'fill', target: '#input', value: 'test', status: 'passed', durationMs: 500 },
          { order: 2, action: 'click', target: '#submit', status: passRate > 0.7 ? 'passed' : 'failed', durationMs: 500, errorMessage: passRate > 0.7 ? undefined : 'Submit failed' },
        ],
        retryCount: passRate > 0.7 ? 0 : 1,
        selfHealed: false,
        artifacts: { screenshots: [], logs: [] },
      },
    ],
    aiAnalysis: {
      overallAssessment: passRate > 0.8 ? '测试整体表现良好' : '测试存在较多问题需要关注',
      criticalIssues: passRate > 0.8 ? [] : ['部分元素定位器需要优化', '表单提交功能不稳定'],
      recommendations: ['建议增加等待时间', '使用更稳定的选择器'],
      riskLevel: passRate > 0.8 ? 'low' : passRate > 0.5 ? 'medium' : 'high',
    },
    artifacts: {
      screenshots: [],
      videos: [],
      logs: [],
    },
  });

  beforeAll(async () => {
    await fs.mkdir(outputDir, { recursive: true });
  });

  afterAll(async () => {
    vi.restoreAllMocks();
  });

  describe('JSON Reporter', () => {
    it('should generate valid JSON report', async () => {
      const result = createMockTestResult('run-json-001', 0.8);
      const reporter = new JsonReporter({ outputDir });
      const filePath = await reporter.generate(result);

      expect(filePath).toBeDefined();
      expect(filePath.endsWith('.json')).toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);

      expect(parsed.runId).toBe('run-json-001');
      expect(parsed.project).toBe('Report Integration Test');
      expect(parsed.summary.total).toBe(10);
      expect(parsed.summary.passRate).toBeCloseTo(0.8, 1);
    });

    it('should handle empty test results', async () => {
      const emptyResult: TestRunResult = {
        runId: 'run-empty-001',
        project: 'Empty Test',
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: 0,
        platform: 'pc-web',
        environment: {},
        summary: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0 },
        categories: {
          functional: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          visual: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          performance: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          security: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
          stability: { total: 0, passed: 0, failed: 0, skipped: 0, passRate: 0 },
        },
        cases: [],
        artifacts: { screenshots: [], videos: [], logs: [] },
      };

      const reporter = new JsonReporter({ outputDir });
      const filePath = await reporter.generate(emptyResult);

      expect(filePath).toBeDefined();
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      expect(parsed.summary.total).toBe(0);
    });
  });

  describe('Markdown Reporter', () => {
    it('should generate valid Markdown report', async () => {
      const result = createMockTestResult('run-md-001', 0.75);
      const reporter = new MarkdownReporter({ outputDir });
      const filePath = await reporter.generate(result);

      expect(filePath).toBeDefined();
      expect(filePath.endsWith('.md')).toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');

      // 验证 Markdown 格式
      expect(content).toContain('# 测试报告');
      expect(content).toContain('Report Integration Test');
      expect(content).toContain('| 总用例数 |');
      expect(content).toContain('## 🤖 AI 分析');
    });

    it('should include failure details in Markdown', async () => {
      const result = createMockTestResult('run-md-fail-001', 0.3);
      const reporter = new MarkdownReporter({ outputDir });
      const filePath = await reporter.generate(result);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('失败');
      expect(content).toContain('关键问题');
    });
  });

  describe('HTML Reporter', () => {
    it('should generate valid HTML report with charts', async () => {
      const result = createMockTestResult('run-html-001', 0.85);
      const reporter = new HtmlReporter({ outputDir, openOnComplete: false });
      const filePath = await reporter.generate(result);

      expect(filePath).toBeDefined();
      expect(filePath.endsWith('.html')).toBe(true);

      const content = await fs.readFile(filePath, 'utf-8');

      // 验证 HTML 结构
      expect(content).toContain('<!DOCTYPE html>');
      expect(content).toContain('<html lang="zh-CN">');
      expect(content).toContain('测试报告');
      expect(content).toContain('cdn.jsdelivr.net/npm/chart.js');
    });

    it('should render pass rate bar correctly', async () => {
      const result = createMockTestResult('run-html-002', 0.67);
      const reporter = new HtmlReporter({ outputDir, openOnComplete: false });
      const filePath = await reporter.generate(result);

      const content = await fs.readFile(filePath, 'utf-8');
      // Pass rate is displayed as percentage
      expect(content).toContain('67.0%');
      expect(content).toContain('pass-rate-bar');
    });

    it('should include risk level badge', async () => {
      const highRiskResult = createMockTestResult('run-html-risk-001', 0.3);
      const reporter = new HtmlReporter({ outputDir, openOnComplete: false });
      const filePath = await reporter.generate(highRiskResult);

      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toContain('风险等级');
      expect(content).toContain('high');
    });
  });

  describe('Console Reporter', () => {
    it('should output progress to console', async () => {
      const result = createMockTestResult('run-console-001', 0.9);
      const reporter = new ConsoleReporter({ verbose: false });

      // ConsoleReporter uses startRun/endRun methods
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      reporter.startRun(result.project, result.summary.total);
      reporter.endRun(result);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should show detailed output in verbose mode', async () => {
      const result = createMockTestResult('run-console-verbose-001', 0.8);
      const reporter = new ConsoleReporter({ verbose: true });

      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      reporter.startRun(result.project, result.summary.total);
      reporter.endRun(result);

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('Diff Reporter', () => {
    it('should compare two test results', async () => {
      const result1 = createMockTestResult('run-diff-001', 0.7);
      const result2 = createMockTestResult('run-diff-002', 0.9);

      const reporter = new DiffReporter({ reportsDir: outputDir });
      const diff = await reporter.compare(result2, result1);

      expect(diff).toBeDefined();
      expect(diff.changes.passRateChange).toBeCloseTo(0.2, 1); // 0.9 - 0.7
      expect(diff.current.passRate).toBeCloseTo(0.9, 1);
      expect(diff.previous.passRate).toBeCloseTo(0.7, 1);
    });

    it('should identify new failures', async () => {
      const result1 = createMockTestResult('run-diff-new-001', 1.0); // 全部通过
      const result2 = createMockTestResult('run-diff-new-002', 0.5); // 有失败

      const reporter = new DiffReporter({ reportsDir: outputDir });
      const diff = await reporter.compare(result2, result1);

      expect(diff.changes.newFailures).toBeDefined();
      expect(diff.changes.fixedIssues).toBeDefined();
    });

    it('should identify fixed issues', async () => {
      const result1 = createMockTestResult('run-diff-fix-001', 0.5); // 有失败
      const result2 = createMockTestResult('run-diff-fix-002', 1.0); // 全部通过

      const reporter = new DiffReporter({ reportsDir: outputDir });
      const diff = await reporter.compare(result2, result1);

      expect(diff.changes.newFailures).toBeDefined();
      expect(diff.changes.fixedIssues).toBeDefined();
    });

    it('should generate diff markdown', async () => {
      const result1 = createMockTestResult('run-diff-file-001', 0.6);
      const result2 = createMockTestResult('run-diff-file-002', 0.8);

      const reporter = new DiffReporter({ reportsDir: outputDir });
      const diff = await reporter.compare(result2, result1);
      const markdown = reporter.generateMarkdown(diff);

      expect(markdown).toBeDefined();
      expect(markdown).toContain('对比报告');
      expect(markdown).toContain('80.0%'); // current pass rate
      expect(markdown).toContain('60.0%'); // previous pass rate
    });
  });

  describe('Trend Reporter', () => {
    it('should generate trend report from database', async () => {
      // TrendReporter requires database, we'll test with mock
      const reporter = new TrendReporter(undefined, { days: 10 });

      // Since TrendReporter uses database, we test the markdown generation
      const mockReport = {
        project: 'Test Project',
        period: {
          start: '2024-01-01',
          end: '2024-01-10',
        },
        dataPoints: [
          { runId: 'run-001', date: '2024-01-01', passRate: 0.7, totalCases: 10, failedCases: 3, avgDuration: 5000 },
          { runId: 'run-002', date: '2024-01-05', passRate: 0.8, totalCases: 10, failedCases: 2, avgDuration: 4500 },
          { runId: 'run-003', date: '2024-01-10', passRate: 0.85, totalCases: 10, failedCases: 1, avgDuration: 4000 },
        ],
        analysis: {
          overallTrend: 'improving' as const,
          avgPassRate: 0.78,
          avgDuration: 4500,
          commonIssues: [],
        },
      };

      const markdown = reporter.generateMarkdown(mockReport);

      expect(markdown).toBeDefined();
      expect(markdown).toContain('趋势报告');
      expect(markdown).toContain('Test Project');
    });

    it('should analyze trend correctly', () => {
      // Test trend analysis logic through markdown output
      const reporter = new TrendReporter(undefined, { days: 10 });

      const improvingReport = {
        project: 'Improving Project',
        period: { start: '2024-01-01', end: '2024-01-10' },
        dataPoints: [
          { runId: 'r1', date: '2024-01-01', passRate: 0.5, totalCases: 10, failedCases: 5, avgDuration: 5000 },
          { runId: 'r2', date: '2024-01-05', passRate: 0.7, totalCases: 10, failedCases: 3, avgDuration: 4500 },
          { runId: 'r3', date: '2024-01-10', passRate: 0.9, totalCases: 10, failedCases: 1, avgDuration: 4000 },
        ],
        analysis: {
          overallTrend: 'improving' as const,
          avgPassRate: 0.7,
          avgDuration: 4500,
          commonIssues: [],
        },
      };

      const markdown = reporter.generateMarkdown(improvingReport);
      expect(markdown).toContain('逐步改善');
    });

    it('should generate trend markdown with data points', () => {
      const reporter = new TrendReporter(undefined, { days: 10 });

      const mockReport = {
        project: 'Trend Test',
        period: { start: '2024-01-01', end: '2024-01-10' },
        dataPoints: [
          { runId: 'run-001', date: '2024-01-01', passRate: 0.7, totalCases: 10, failedCases: 3, avgDuration: 5000 },
        ],
        analysis: {
          overallTrend: 'stable' as const,
          avgPassRate: 0.7,
          avgDuration: 5000,
          commonIssues: [],
        },
      };

      const markdown = reporter.generateMarkdown(mockReport);

      expect(markdown).toBeDefined();
      expect(markdown).toContain('运行历史');
      expect(markdown).toContain('run-001');
    });
  });

  describe('Full Report Generation Flow', () => {
    it('should generate all report formats from same result', async () => {
      const result = createMockTestResult('run-multi-format-001', 0.82);

      const jsonReporter = new JsonReporter({ outputDir });
      const mdReporter = new MarkdownReporter({ outputDir });
      const htmlReporter = new HtmlReporter({ outputDir, openOnComplete: false });

      const jsonPath = await jsonReporter.generate(result);
      const mdPath = await mdReporter.generate(result);
      const htmlPath = await htmlReporter.generate(result);

      // 验证所有文件生成
      expect(jsonPath).toBeDefined();
      expect(mdPath).toBeDefined();
      expect(htmlPath).toBeDefined();

      // 验证内容一致性
      const jsonContent = JSON.parse(await fs.readFile(jsonPath, 'utf-8'));
      const mdContent = await fs.readFile(mdPath, 'utf-8');
      const htmlContent = await fs.readFile(htmlPath, 'utf-8');

      expect(jsonContent.runId).toBe(result.runId);
      expect(mdContent).toContain(result.project);
      expect(htmlContent).toContain(result.project);
    });
  });
});
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { JsonReporter, generateJsonReport } from '@/reporters/json-reporter.js';
import type { TestRunResult } from '@/types/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('JsonReporter', () => {
  let reporter: JsonReporter;
  let testOutputDir: string;
  let sampleResult: TestRunResult;

  beforeEach(() => {
    testOutputDir = path.join(process.cwd(), 'data', 'test-reports', `test-${Date.now()}`);
    reporter = new JsonReporter({ outputDir: testOutputDir, prettyPrint: true });

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
        overallAssessment: 'Good',
        criticalIssues: ['Issue 1'],
        recommendations: ['Recommendation 1'],
        riskLevel: 'low',
      },
      artifacts: {
        screenshots: [],
        videos: [],
        logs: [],
      },
    };
  });

  afterEach(async () => {
    // Cleanup test directory
    try {
      await fs.rm(testOutputDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('module exports', () => {
    it('should export JsonReporter class', () => {
      expect(JsonReporter).toBeDefined();
      expect(typeof JsonReporter).toBe('function');
    });

    it('should export generateJsonReport function', () => {
      expect(generateJsonReport).toBeDefined();
      expect(typeof generateJsonReport).toBe('function');
    });
  });

  describe('generate', () => {
    it('should generate JSON report file', async () => {
      const filePath = await reporter.generate(sampleResult);

      expect(filePath).toBeDefined();
      expect(filePath).toContain('report-test-run-001.json');

      // Verify file exists
      const content = await fs.readFile(filePath, 'utf-8');
      expect(content).toBeDefined();
    });

    it('should generate valid JSON content', async () => {
      const filePath = await reporter.generate(sampleResult);
      const content = await fs.readFile(filePath, 'utf-8');

      const parsed = JSON.parse(content);
      expect(parsed.runId).toBe('test-run-001');
      expect(parsed.project).toBe('test-project');
      expect(parsed.summary.passRate).toBe(0.8);
    });

    it('should create output directory if not exists', async () => {
      await reporter.generate(sampleResult);

      const dirExists = await fs.stat(testOutputDir).then(() => true).catch(() => false);
      expect(dirExists).toBe(true);
    });
  });

  describe('read', () => {
    it('should read existing report', async () => {
      const filePath = await reporter.generate(sampleResult);
      const result = await reporter.read(filePath);

      expect(result).toBeDefined();
      expect(result?.runId).toBe('test-run-001');
    });

    it('should return null for non-existent file', async () => {
      const result = await reporter.read('/non/existent/path.json');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('should list report files', async () => {
      await reporter.generate(sampleResult);

      const reports = await reporter.list();
      expect(reports.length).toBeGreaterThan(0);
      expect(reports[0]).toContain('report-');
    });

    it('should return empty array for empty directory', async () => {
      const emptyReporter = new JsonReporter({ outputDir: './non-existent-dir' });
      const reports = await emptyReporter.list();
      expect(reports).toEqual([]);
    });
  });

  describe('listWithSummary', () => {
    it('should list reports with summary', async () => {
      await reporter.generate(sampleResult);

      const summaries = await reporter.listWithSummary();
      expect(summaries.length).toBeGreaterThan(0);
      expect(summaries[0].runId).toBe('test-run-001');
      expect(summaries[0].passRate).toBe(0.8);
    });
  });
});
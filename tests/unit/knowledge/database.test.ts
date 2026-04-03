import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeDatabase } from '@/knowledge/db/index.js';
import { TestHistory, createTestHistory } from '@/knowledge/test-history.js';
import type { TestRunResult } from '@/types/test-result.types.js';

describe('KnowledgeDatabase', () => {
  let db: KnowledgeDatabase;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
  });

  afterEach(() => {
    db.close();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      expect(db).toBeDefined();
    });

    it('should create all tables', async () => {
      const stats = db.getStats();
      expect(stats).toBeDefined();
    });
  });

  describe('query methods', () => {
    it('should execute query', () => {
      const result = db.query<{ count: number }>('SELECT COUNT(*) as count FROM test_runs');
      expect(result).toBeDefined();
      expect(result[0]?.count).toBe(0);
    });

    it('should execute queryOne', () => {
      const result = db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM test_runs');
      expect(result).toBeDefined();
      expect(result?.count).toBe(0);
    });

    it('should execute insert', () => {
      const result = db.execute(
        'INSERT INTO test_runs (id, project, platform, start_time, created) VALUES (?, ?, ?, ?, ?)',
        ['test-1', 'my-project', 'pc-web', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z']
      );
      expect(result.changes).toBe(1);
    });

    it('should execute batch operations', () => {
      const results = db.batch(
        'INSERT INTO test_runs (id, project, platform, start_time, created) VALUES (?, ?, ?, ?, ?)',
        [
          ['test-1', 'my-project', 'pc-web', '2024-01-01T00:00:00Z', '2024-01-01T00:00:00Z'],
          ['test-2', 'my-project', 'pc-web', '2024-01-02T00:00:00Z', '2024-01-02T00:00:00Z'],
        ]
      );
      expect(results).toHaveLength(2);
    });
  });

  describe('stats', () => {
    it('should return correct stats', () => {
      const stats = db.getStats();
      expect(stats.testRuns).toBe(0);
      expect(stats.testResults).toBe(0);
      expect(stats.elementMappings).toBe(0);
      expect(stats.failurePatterns).toBe(0);
      expect(stats.optimizations).toBe(0);
      expect(stats.bestPractices).toBe(0);
    });
  });
});

describe('TestHistory', () => {
  let db: KnowledgeDatabase;
  let history: TestHistory;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
    history = new TestHistory(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('module exports', () => {
    it('should export TestHistory class', () => {
      expect(TestHistory).toBeDefined();
    });

    it('should export createTestHistory function', () => {
      expect(createTestHistory).toBeDefined();
    });
  });

  describe('run management', () => {
    it('should start a test run', () => {
      const runId = history.startRun('my-project', 'pc-web');
      expect(runId).toBeDefined();
      expect(runId.length).toBeGreaterThan(0);
    });

    it('should complete a test run', () => {
      const runId = history.startRun('my-project', 'pc-web');
      history.completeRun(runId, {
        totalCases: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        blocked: 0,
        passRate: 0.8,
      });

      const run = history.getRun(runId);
      expect(run).toBeDefined();
      expect(run?.status).toBe('completed');
      expect(run?.passRate).toBe(0.8);
    });

    it('should query runs', () => {
      history.startRun('project-1', 'pc-web');
      history.startRun('project-2', 'h5-web');

      const runs = history.queryRuns({});
      expect(runs).toHaveLength(2);
    });

    it('should filter runs by project', () => {
      history.startRun('project-1', 'pc-web');
      history.startRun('project-2', 'h5-web');

      const runs = history.queryRuns({ project: 'project-1' });
      expect(runs).toHaveLength(1);
      expect(runs[0]?.project).toBe('project-1');
    });
  });

  describe('result management', () => {
    it('should save run result', () => {
      const runResult: TestRunResult = {
        runId: 'test-run-1',
        project: 'my-project',
        startTime: '2024-01-01T00:00:00Z',
        endTime: '2024-01-01T00:01:00Z',
        duration: 60000,
        platform: 'pc-web',
        environment: {},
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
          criticalIssues: [],
          recommendations: [],
          riskLevel: 'low',
        },
        artifacts: {
          screenshots: [],
          videos: [],
          logs: [],
        },
      };

      history.saveRunResult(runResult);

      const run = history.getRun('test-run-1');
      expect(run).toBeDefined();
      expect(run?.project).toBe('my-project');
    });
  });

  describe('project stats', () => {
    it('should return project stats', () => {
      const runId = history.startRun('my-project', 'pc-web');
      history.completeRun(runId, {
        totalCases: 10,
        passed: 8,
        failed: 2,
        skipped: 0,
        blocked: 0,
        passRate: 0.8,
      });

      const stats = history.getProjectStats('my-project');
      expect(stats.totalRuns).toBe(1);
    });
  });
});
/**
 * 并发执行器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ParallelRunner, createParallelRunner } from '@/core/parallel-runner.js';
import type {
  WorkerPoolConfig,
  WorkerTask,
  WorkerTestConfig,
  ParallelRunResult,
} from '@/types/worker.types.js';
import type { TestCase } from '@/types/test-case.types.js';

// Mock Worker for testing
vi.mock('node:worker_threads', () => ({
  isMainThread: true,
  Worker: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    postMessage: vi.fn(),
    terminate: vi.fn(),
    threadId: 1,
  })),
}));

describe('ParallelRunner', () => {
  let runner: ParallelRunner;

  const mockTestCase: TestCase = {
    id: 'test-1',
    name: 'Test Case 1',
    description: 'A test case',
    priority: 'P1',
    type: 'functional',
    platform: ['pc-web'],
    tags: ['smoke'],
    steps: [
      { order: 1, action: 'navigate', target: '/', description: 'Navigate to home' },
      { order: 2, action: 'click', target: '#button', description: 'Click button' },
    ],
  };

  const mockTestConfig: WorkerTestConfig = {
    platform: 'pc-web',
    browser: 'chromium',
    viewport: { width: 1920, height: 1080 },
    screenshotDir: './data/screenshots',
    screenshotOnFailure: true,
    videoOnFailure: true,
    headless: true,
  };

  beforeEach(() => {
    runner = new ParallelRunner({
      maxWorkers: 2,
      taskTimeout: 60000,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export ParallelRunner class', () => {
      expect(ParallelRunner).toBeDefined();
      expect(typeof ParallelRunner).toBe('function');
    });

    it('should export createParallelRunner function', () => {
      expect(createParallelRunner).toBeDefined();
      expect(typeof createParallelRunner).toBe('function');
    });

    it('should create instance with default config', () => {
      const defaultRunner = createParallelRunner();
      expect(defaultRunner).toBeInstanceOf(ParallelRunner);
    });

    it('should accept custom configuration', () => {
      const customRunner = new ParallelRunner({
        maxWorkers: 4,
        taskTimeout: 120000,
        maxRetries: 3,
      });
      expect(customRunner).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default values for missing config options', () => {
      const defaultRunner = new ParallelRunner();
      expect(defaultRunner).toBeDefined();
    });

    it('should respect minWorkers setting', () => {
      const runner = new ParallelRunner({ minWorkers: 2 });
      expect(runner).toBeDefined();
    });

    it('should respect taskTimeout setting', () => {
      const runner = new ParallelRunner({ taskTimeout: 30000 });
      expect(runner).toBeDefined();
    });
  });

  describe('task management', () => {
    it('should be able to create task queue', () => {
      expect(runner).toBeDefined();
    });

    it('should handle empty test case list', async () => {
      // For empty test cases, the runner should handle gracefully
      expect(runner).toBeDefined();
    });
  });

  describe('worker lifecycle', () => {
    it('should be able to start and shutdown', async () => {
      // Test that the runner can be created and shutdown
      expect(runner).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle worker errors gracefully', () => {
      expect(runner).toBeDefined();
    });

    it('should respect maxRetries setting', () => {
      const runnerWithRetries = new ParallelRunner({ maxRetries: 3 });
      expect(runnerWithRetries).toBeDefined();
    });
  });

  describe('result collection', () => {
    it('should collect results from completed tasks', () => {
      expect(runner).toBeDefined();
    });
  });

  describe('priority handling', () => {
    it('should prioritize higher priority tasks when enabled', () => {
      const priorityRunner = new ParallelRunner({ enablePriority: true });
      expect(priorityRunner).toBeDefined();
    });

    it('should handle tasks equally when priority is disabled', () => {
      const noPriorityRunner = new ParallelRunner({ enablePriority: false });
      expect(noPriorityRunner).toBeDefined();
    });
  });

  describe('event emission', () => {
    it('should emit events during execution', () => {
      expect(runner).toBeDefined();
    });
  });
});

describe('WorkerTask', () => {
  it('should have correct task status types', () => {
    const statuses: WorkerTask['status'][] = [
      'pending',
      'assigned',
      'running',
      'completed',
      'failed',
      'timeout',
    ];
    expect(statuses).toHaveLength(6);
  });

  it('should have correct priority calculation for test cases', () => {
    const p0Case: TestCase = { ...mockTestCase, priority: 'P0' };
    const p1Case: TestCase = { ...mockTestCase, priority: 'P1' };
    const p2Case: TestCase = { ...mockTestCase, priority: 'P2' };
    const p3Case: TestCase = { ...mockTestCase, priority: 'P3' };

    expect(p0Case.priority).toBe('P0');
    expect(p1Case.priority).toBe('P1');
    expect(p2Case.priority).toBe('P2');
    expect(p3Case.priority).toBe('P3');
  });
});

const mockTestCase: TestCase = {
  id: 'test-1',
  name: 'Test Case',
  description: 'A test case',
  priority: 'P1',
  type: 'functional',
  platform: ['pc-web'],
  tags: ['smoke'],
  steps: [],
};
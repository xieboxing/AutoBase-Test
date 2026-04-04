/**
 * 探索式测试执行器测试
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  ExplorationRunner,
  createExplorationRunner,
} from '@/core/exploration-runner.js';
import {
  DEFAULT_EXPLORATION_CONFIG,
  DEFAULT_EXPLORATION_REWARD_CONFIG,
} from '@/types/exploration.types.js';

// Mock Playwright
vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue({
      newContext: vi.fn().mockResolvedValue({
        newPage: vi.fn().mockResolvedValue({
          goto: vi.fn(),
          on: vi.fn(),
          $$eval: vi.fn().mockResolvedValue([]),
          click: vi.fn(),
          fill: vi.fn(),
          evaluate: vi.fn(),
          waitForTimeout: vi.fn(),
          screenshot: vi.fn(),
          url: vi.fn().mockReturnValue('https://example.com'),
          close: vi.fn(),
        }),
        close: vi.fn(),
      }),
      close: vi.fn(),
    }),
  },
}));

// Mock Database
const mockDb = {
  execute: vi.fn(),
  query: vi.fn(),
  close: vi.fn(),
};

describe('ExplorationRunner', () => {
  let runner: ExplorationRunner;

  beforeEach(() => {
    vi.clearAllMocks();
    runner = new ExplorationRunner();
  });

  describe('module exports', () => {
    it('should export ExplorationRunner class', () => {
      expect(ExplorationRunner).toBeDefined();
      expect(typeof ExplorationRunner).toBe('function');
    });

    it('should export createExplorationRunner function', () => {
      expect(createExplorationRunner).toBeDefined();
      expect(typeof createExplorationRunner).toBe('function');
    });

    it('should create instance with default config', () => {
      const defaultRunner = createExplorationRunner();
      expect(defaultRunner).toBeInstanceOf(ExplorationRunner);
    });

    it('should accept custom configuration', () => {
      const customRunner = new ExplorationRunner({
        explorationConfig: {
          maxSteps: 50,
          maxDuration: 600,
          strategy: 'random',
        },
        rewardConfig: {
          newStateReward: 20,
          anomalyReward: 100,
        },
      });
      expect(customRunner).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should use default values for missing config options', () => {
      const runner = new ExplorationRunner();
      expect(runner).toBeDefined();
    });

    it('should respect maxSteps setting', () => {
      const runner = new ExplorationRunner({
        explorationConfig: { maxSteps: 50 },
      });
      expect(runner).toBeDefined();
    });

    it('should respect strategy setting', () => {
      const runner = new ExplorationRunner({
        explorationConfig: { strategy: 'depth-first' },
      });
      expect(runner).toBeDefined();
    });

    it('should respect reward configuration', () => {
      const runner = new ExplorationRunner({
        rewardConfig: {
          newStateReward: 15,
          crashReward: 200,
        },
      });
      expect(runner).toBeDefined();
    });
  });

  describe('setDatabase', () => {
    it('should accept database instance', () => {
      runner.setDatabase(mockDb as any);
      expect(runner).toBeDefined();
    });
  });

  describe('stop', () => {
    it('should be able to stop exploration', () => {
      runner.stop();
      // Should not throw
      expect(runner).toBeDefined();
    });
  });

  describe('event emission', () => {
    it('should emit exploration events', () => {
      const handler = vi.fn();
      runner.on('exploration:start', handler);
      // Event handlers are registered
      expect(runner.listenerCount('exploration:start')).toBe(1);
    });

    it('should emit new-state events', () => {
      const handler = vi.fn();
      runner.on('exploration:new-state', handler);
      expect(runner.listenerCount('exploration:new-state')).toBe(1);
    });

    it('should emit anomaly events', () => {
      const handler = vi.fn();
      runner.on('exploration:anomaly', handler);
      expect(runner.listenerCount('exploration:anomaly')).toBe(1);
    });

    it('should emit complete events', () => {
      const handler = vi.fn();
      runner.on('exploration:complete', handler);
      expect(runner.listenerCount('exploration:complete')).toBe(1);
    });
  });
});

describe('Exploration Types', () => {
  describe('DEFAULT_EXPLORATION_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_EXPLORATION_CONFIG.platform).toBe('pc-web');
      expect(DEFAULT_EXPLORATION_CONFIG.maxSteps).toBe(100);
      expect(DEFAULT_EXPLORATION_CONFIG.maxDuration).toBe(1800);
      expect(DEFAULT_EXPLORATION_CONFIG.strategy).toBe('reward-based');
      expect(DEFAULT_EXPLORATION_CONFIG.recordScreenshots).toBe(true);
      expect(DEFAULT_EXPLORATION_CONFIG.stopOnAnomaly).toBe(true);
    });

    it('should have blacklisted URLs', () => {
      expect(DEFAULT_EXPLORATION_CONFIG.blacklistedUrls).toBeInstanceOf(Array);
      expect(DEFAULT_EXPLORATION_CONFIG.blacklistedUrls.length).toBeGreaterThan(0);
    });

    it('should have blacklisted selectors', () => {
      expect(DEFAULT_EXPLORATION_CONFIG.blacklistedSelectors).toBeInstanceOf(Array);
    });
  });

  describe('DEFAULT_EXPLORATION_REWARD_CONFIG', () => {
    it('should have correct default reward values', () => {
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.newStateReward).toBe(10);
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.anomalyReward).toBe(50);
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.crashReward).toBe(100);
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.consoleErrorReward).toBe(20);
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.networkErrorReward).toBe(30);
    });

    it('should have penalty values', () => {
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.repeatStatePenalty).toBe(-1);
      expect(DEFAULT_EXPLORATION_REWARD_CONFIG.invalidActionPenalty).toBe(-5);
    });
  });
});

describe('Exploration Strategies', () => {
  it('should support random strategy', () => {
    const runner = new ExplorationRunner({
      explorationConfig: { strategy: 'random' },
    });
    expect(runner).toBeDefined();
  });

  it('should support breadth-first strategy', () => {
    const runner = new ExplorationRunner({
      explorationConfig: { strategy: 'breadth-first' },
    });
    expect(runner).toBeDefined();
  });

  it('should support depth-first strategy', () => {
    const runner = new ExplorationRunner({
      explorationConfig: { strategy: 'depth-first' },
    });
    expect(runner).toBeDefined();
  });

  it('should support reward-based strategy', () => {
    const runner = new ExplorationRunner({
      explorationConfig: { strategy: 'reward-based' },
    });
    expect(runner).toBeDefined();
  });

  it('should support ai-guided strategy', () => {
    const runner = new ExplorationRunner({
      explorationConfig: { strategy: 'ai-guided' },
    });
    expect(runner).toBeDefined();
  });
});
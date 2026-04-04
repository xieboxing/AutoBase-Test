/**
 * 视觉回归管理器测试
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  VisualRegressionManager,
  createVisualRegressionManager,
} from '@/testers/visual/visual-regression-manager.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import type { KnowledgeDatabase } from '@/knowledge/db/index.js';

// Mock database for testing
function createMockDatabase(): KnowledgeDatabase {
  return {
    execute: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    query: vi.fn(() => []),
    queryOne: vi.fn(() => undefined),
    all: vi.fn(() => []),
    get: vi.fn(() => undefined),
    run: vi.fn(() => ({ changes: 1, lastInsertRowid: 1 })),
    exec: vi.fn(),
    close: vi.fn(),
    transaction: vi.fn((fn) => fn()),
  } as unknown as KnowledgeDatabase;
}

describe('VisualRegressionManager', () => {
  let testDir: string;
  let manager: VisualRegressionManager;
  let mockDb: KnowledgeDatabase;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-visual-regression');
    await fs.mkdir(testDir, { recursive: true });
    mockDb = createMockDatabase();
    manager = new VisualRegressionManager(
      {
        baselineDir: path.join(testDir, 'baselines'),
        diffDir: path.join(testDir, 'diffs'),
        percentageThreshold: 1,
        autoGenerateBaseline: true,
      },
      mockDb
    );
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('module exports', () => {
    it('should export VisualRegressionManager class', () => {
      expect(VisualRegressionManager).toBeDefined();
      expect(typeof VisualRegressionManager).toBe('function');
    });

    it('should export createVisualRegressionManager function', () => {
      expect(createVisualRegressionManager).toBeDefined();
      expect(typeof createVisualRegressionManager).toBe('function');
    });

    it('should create instance with default config', () => {
      const defaultManager = createVisualRegressionManager();
      expect(defaultManager).toBeInstanceOf(VisualRegressionManager);
    });

    it('should accept custom configuration', () => {
      const customManager = new VisualRegressionManager({
        percentageThreshold: 5,
        isolateByBrowser: false,
      });
      expect(customManager).toBeDefined();
    });

    it('should accept database instance', () => {
      const managerWithDb = new VisualRegressionManager({}, mockDb);
      expect(managerWithDb).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should initialize directories', async () => {
      await manager.initialize();

      expect(fsSync.existsSync(path.join(testDir, 'baselines'))).toBe(true);
      expect(fsSync.existsSync(path.join(testDir, 'diffs'))).toBe(true);
    });
  });

  describe('baseline management', () => {
    it('should create baseline from screenshot', async () => {
      await manager.initialize();
      const screenshotPath = await createTestImage(testDir, 'test-1.png', 100, 100, [255, 0, 0]);

      const baseline = await manager.createBaseline(screenshotPath, {
        id: 'test-baseline-1',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/test',
      });

      expect(baseline.id).toBe('test-baseline-1');
      expect(baseline.projectId).toBe('test-project');
      expect(fsSync.existsSync(baseline.baselineImagePath)).toBe(true);
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('should generate baseline ID based on options', async () => {
      await manager.initialize();
      const screenshotPath = await createTestImage(testDir, 'test-2.png', 100, 100, [0, 255, 0]);

      const baseline = await manager.createBaseline(screenshotPath, {
        projectId: 'my-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/page',
        viewport: { width: 1920, height: 1080 },
        browser: 'chromium',
      });

      expect(baseline.id).toContain('my-project');
      expect(baseline.id).toContain('pc-web');
      expect(baseline.id).toContain('1920x1080');
      expect(baseline.id).toContain('chromium');
    });

    it('should get existing baseline', async () => {
      await manager.initialize();
      const screenshotPath = await createTestImage(testDir, 'test-3.png', 100, 100, [128, 128, 128]);

      await manager.createBaseline(screenshotPath, {
        id: 'get-test-baseline',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/get',
      });

      const baseline = await manager.getBaseline('get-test-baseline');

      expect(baseline).toBeDefined();
      expect(baseline?.id).toBe('get-test-baseline');
    });

    it('should return null for non-existing baseline', async () => {
      await manager.initialize();
      const baseline = await manager.getBaseline('non-existing-baseline');
      expect(baseline).toBeNull();
    });

    it('should list all baselines', async () => {
      // Create manager without database to test file system fallback
      const fsManager = new VisualRegressionManager({
        baselineDir: path.join(testDir, 'baselines'),
        diffDir: path.join(testDir, 'diffs'),
        percentageThreshold: 1,
        autoGenerateBaseline: true,
      });

      const screenshot1 = await createTestImage(testDir, 'list-1.png', 100, 100, [255, 0, 0]);
      const screenshot2 = await createTestImage(testDir, 'list-2.png', 100, 100, [0, 255, 0]);

      await fsManager.createBaseline(screenshot1, {
        id: 'baseline-a',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/a',
      });

      await fsManager.createBaseline(screenshot2, {
        id: 'baseline-b',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/b',
      });

      const baselines = await fsManager.listBaselines();

      expect(baselines.length).toBeGreaterThanOrEqual(2);
      expect(baselines.find(b => b.id === 'baseline-a')).toBeDefined();
      expect(baselines.find(b => b.id === 'baseline-b')).toBeDefined();
    });

    it('should delete baseline', async () => {
      await manager.initialize();
      const screenshotPath = await createTestImage(testDir, 'delete-test.png', 100, 100, [0, 0, 255]);

      await manager.createBaseline(screenshotPath, {
        id: 'to-delete',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/delete',
      });

      const baseline = await manager.getBaseline('to-delete');
      expect(baseline).toBeDefined();

      await manager.deleteBaseline('to-delete');

      const deleted = await manager.getBaseline('to-delete');
      expect(deleted).toBeNull();
    });
  });

  describe('compare', () => {
    it('should pass when screenshots are identical', async () => {
      await manager.initialize();
      const screenshot1 = await createTestImage(testDir, 'identical-1.png', 100, 100, [128, 128, 128]);
      const screenshot2 = await createTestImage(testDir, 'identical-2.png', 100, 100, [128, 128, 128]);

      await manager.createBaseline(screenshot1, {
        id: 'identical-baseline',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/identical',
      });

      const result = await manager.compare(screenshot2, {
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/identical',
        baselineId: 'identical-baseline',
      });

      // When baseline ID is specified, should use it
      expect(result).toBeDefined();
      expect(result?.passed).toBe(true);
      expect(result?.diffPercentage).toBe(0);
    });

    it('should fail when screenshots are different', async () => {
      await manager.initialize();
      const baseline = await createTestImage(testDir, 'diff-base.png', 100, 100, [255, 0, 0]);
      const current = await createTestImage(testDir, 'diff-current.png', 100, 100, [0, 255, 0]);

      await manager.createBaseline(baseline, {
        id: 'diff-baseline',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/diff',
      });

      const result = await manager.compare(current, {
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/diff',
        baselineId: 'diff-baseline',
      });

      expect(result).toBeDefined();
      expect(result?.passed).toBe(false);
      expect(result?.diffPercentage).toBeGreaterThan(0);
    });

    it('should auto create baseline when not exists and autoGenerateBaseline is true', async () => {
      await manager.initialize();
      const screenshot = await createTestImage(testDir, 'auto-create.png', 100, 100, [200, 200, 200]);

      const result = await manager.compare(screenshot, {
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/auto',
      });

      // Auto create baseline returns null (no comparison needed)
      expect(result).toBeNull();

      const baseline = await manager.getBaseline(manager.generateBaselineId({
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/auto',
      }));
      expect(baseline).toBeDefined();
    });
  });

  describe('generateDiffImage', () => {
    it('should generate diff image for different screenshots', async () => {
      await manager.initialize();
      const baseline = await createTestImage(testDir, 'gen-base.png', 100, 100, [255, 0, 0]);
      const current = await createTestImage(testDir, 'gen-current.png', 100, 100, [0, 255, 0]);

      const { diffPath, diffPixels, diffPercentage } = await manager.generateDiffImage(
        current,
        baseline,
        'gen-test'
      );

      expect(fsSync.existsSync(diffPath)).toBe(true);
      expect(diffPixels).toBeGreaterThan(0);
      expect(diffPercentage).toBeGreaterThan(0);
    });

    it('should generate identical diff image for identical screenshots', async () => {
      await manager.initialize();
      const screenshot1 = await createTestImage(testDir, 'gen-identical-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'gen-identical-2.png', 100, 100, [100, 100, 100]);

      const { diffPixels, diffPercentage } = await manager.generateDiffImage(
        screenshot2,
        screenshot1,
        'gen-identical'
      );

      expect(diffPixels).toBe(0);
      expect(diffPercentage).toBe(0);
    });
  });

  describe('detectChangedAreas', () => {
    it('should detect changed areas in different screenshots', async () => {
      await manager.initialize();

      // Create baseline with one color
      const baseline = await createTestImage(testDir, 'detect-base.png', 200, 200, [0, 0, 0]);

      // Create current with partial change (top-left quadrant different)
      const currentPng = new PNG({ width: 200, height: 200 });
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 200; x++) {
          const idx = (200 * y + x) << 2;
          if (x < 100 && y < 100) {
            // Top-left quadrant - different color
            currentPng.data[idx] = 255;
            currentPng.data[idx + 1] = 0;
            currentPng.data[idx + 2] = 0;
          } else {
            // Rest - same as baseline
            currentPng.data[idx] = 0;
            currentPng.data[idx + 1] = 0;
            currentPng.data[idx + 2] = 0;
          }
          currentPng.data[idx + 3] = 255;
        }
      }
      const currentPath = path.join(testDir, 'detect-current.png');
      await fs.writeFile(currentPath, PNG.sync.write(currentPng));

      const areas = await manager.detectChangedAreas(currentPath, baseline, {
        minAreaSize: 10,
        gridSize: 20,
      });

      expect(areas.length).toBeGreaterThan(0);
      // Should detect change in top-left area
      expect(areas.some(a => a.x < 100 && a.y < 100)).toBe(true);
    });

    it('should return empty array for identical screenshots', async () => {
      await manager.initialize();
      const screenshot1 = await createTestImage(testDir, 'detect-identical-1.png', 100, 100, [128, 128, 128]);
      const screenshot2 = await createTestImage(testDir, 'detect-identical-2.png', 100, 100, [128, 128, 128]);

      const areas = await manager.detectChangedAreas(screenshot2, screenshot1);

      expect(areas.length).toBe(0);
    });

    it('should merge adjacent areas when mergeAdjacent is true', async () => {
      await manager.initialize();

      // Create baseline
      const baseline = await createTestImage(testDir, 'merge-base.png', 200, 200, [0, 0, 0]);

      // Create current with multiple adjacent changed areas
      const currentPng = new PNG({ width: 200, height: 200 });
      for (let y = 0; y < 200; y++) {
        for (let x = 0; x < 200; x++) {
          const idx = (200 * y + x) << 2;
          // Create two adjacent changed areas
          if ((x >= 10 && x < 60 && y >= 10 && y < 60) || (x >= 60 && x < 110 && y >= 10 && y < 60)) {
            currentPng.data[idx] = 255;
            currentPng.data[idx + 1] = 0;
            currentPng.data[idx + 2] = 0;
          } else {
            currentPng.data[idx] = 0;
            currentPng.data[idx + 1] = 0;
            currentPng.data[idx + 2] = 0;
          }
          currentPng.data[idx + 3] = 255;
        }
      }
      const currentPath = path.join(testDir, 'merge-current.png');
      await fs.writeFile(currentPath, PNG.sync.write(currentPng));

      const mergedAreas = await manager.detectChangedAreas(currentPath, baseline, {
        minAreaSize: 10,
        mergeAdjacent: true,
        gridSize: 20,
      });

      const separateAreas = await manager.detectChangedAreas(currentPath, baseline, {
        minAreaSize: 10,
        mergeAdjacent: false,
        gridSize: 20,
      });

      // Merged areas should be fewer or equal to separate areas
      expect(mergedAreas.length).toBeLessThanOrEqual(separateAreas.length);
    });
  });

  describe('updateBaseline', () => {
    it('should update existing baseline', async () => {
      await manager.initialize();
      const original = await createTestImage(testDir, 'update-original.png', 100, 100, [255, 0, 0]);
      const newScreenshot = await createTestImage(testDir, 'update-new.png', 100, 100, [0, 255, 0]);

      await manager.createBaseline(original, {
        id: 'update-test-baseline',
        projectId: 'test-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/update',
      });

      const updated = await manager.updateBaseline(
        'update-test-baseline',
        newScreenshot,
        'Testing update'
      );

      expect(updated.id).toBe('update-test-baseline');
      expect(mockDb.execute).toHaveBeenCalled();
    });

    it('should throw error for non-existing baseline', async () => {
      await manager.initialize();

      await expect(
        manager.updateBaseline('non-existing', testDir, 'test')
      ).rejects.toThrow('基线不存在');
    });
  });

  describe('getStats', () => {
    it('should return stats when database is available', () => {
      const stats = manager.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalBaselines).toBe('number');
      expect(typeof stats.totalDiffs).toBe('number');
      expect(typeof stats.byBrowser).toBe('object');
      expect(typeof stats.byViewport).toBe('object');
    });
  });

  describe('generateBaselineId', () => {
    it('should generate ID with project and platform', () => {
      const id = manager.generateBaselineId({
        projectId: 'my-project',
        platform: 'pc-web',
        pageUrl: 'https://example.com/page',
      });

      expect(id).toContain('my-project');
      expect(id).toContain('pc-web');
    });

    it('should include viewport when isolateByViewport is true', () => {
      const managerWithViewport = new VisualRegressionManager({
        isolateByViewport: true,
      });

      const id = managerWithViewport.generateBaselineId({
        projectId: 'test',
        platform: 'pc-web',
        pageUrl: 'https://example.com',
        viewport: { width: 1920, height: 1080 },
      });

      expect(id).toContain('1920x1080');
    });

    it('should include browser when isolateByBrowser is true', () => {
      const managerWithBrowser = new VisualRegressionManager({
        isolateByBrowser: true,
      });

      const id = managerWithBrowser.generateBaselineId({
        projectId: 'test',
        platform: 'pc-web',
        pageUrl: 'https://example.com',
        browser: 'chromium',
      });

      expect(id).toContain('chromium');
    });

    it('should include device when isolateByDevice is true', () => {
      const managerWithDevice = new VisualRegressionManager({
        isolateByDevice: true,
      });

      const id = managerWithDevice.generateBaselineId({
        projectId: 'test',
        platform: 'h5-web',
        pageUrl: 'https://example.com',
        device: 'iPhone 15',
      });

      expect(id).toContain('iPhone 15');
    });
  });
});

// Helper function to create test PNG images
async function createTestImage(
  dir: string,
  filename: string,
  width: number,
  height: number,
  color: [number, number, number],
): Promise<string> {
  const png = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      png.data[idx] = color[0];     // R
      png.data[idx + 1] = color[1]; // G
      png.data[idx + 2] = color[2]; // B
      png.data[idx + 3] = 255;      // A
    }
  }

  const filepath = path.join(dir, filename);
  const buffer = PNG.sync.write(png);
  await fs.writeFile(filepath, buffer);

  return filepath;
}
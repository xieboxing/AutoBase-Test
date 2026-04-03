import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  BaselineManager,
  createBaselineManager,
} from '@/testers/visual/baseline-manager.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

describe('BaselineManager', () => {
  let testDir: string;
  let manager: BaselineManager;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-baselines');
    await fs.mkdir(testDir, { recursive: true });
    manager = new BaselineManager({
      baselineDir: testDir,
      backupDir: path.join(testDir, 'backup'),
      metadataFile: path.join(testDir, 'metadata.json'),
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('module exports', () => {
    it('should export BaselineManager class', () => {
      expect(BaselineManager).toBeDefined();
      expect(typeof BaselineManager).toBe('function');
    });

    it('should export createBaselineManager function', () => {
      expect(createBaselineManager).toBeDefined();
      expect(typeof createBaselineManager).toBe('function');
    });

    it('should accept configuration', () => {
      const customManager = new BaselineManager({
        maxHistoryVersions: 10,
        maxBaselines: 100,
      });
      expect(customManager).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should initialize directories', async () => {
      await manager.initialize();

      expect(fsSync.existsSync(testDir)).toBe(true);
      expect(fsSync.existsSync(path.join(testDir, 'backup'))).toBe(true);
    });

    it('should load existing metadata', async () => {
      // Create metadata file manually
      const metadata = [
        {
          id: 'existing-baseline',
          sourcePath: '/path/to/source.png',
          baselinePath: path.join(testDir, 'existing-baseline.png'),
          createdAt: '2024-01-01T00:00:00Z',
          updatedAt: '2024-01-01T00:00:00Z',
          version: 1,
          history: [],
        },
      ];

      await fs.writeFile(
        path.join(testDir, 'metadata.json'),
        JSON.stringify(metadata)
      );

      // Create the baseline file
      await createTestImage(testDir, 'existing-baseline.png', 100, 100, [128, 128, 128]);

      await manager.initialize();

      expect(manager.hasBaseline('existing-baseline')).toBe(true);
    });
  });

  describe('baseline creation', () => {
    it('should create baseline from screenshot', async () => {
      const screenshotPath = await createTestImage(testDir, 'source-1.png', 100, 100, [255, 0, 0]);

      const metadata = await manager.createBaseline(screenshotPath, {
        id: 'test-baseline-1',
        url: 'https://example.com',
        browser: 'chromium',
      });

      expect(metadata.id).toBe('test-baseline-1');
      expect(metadata.version).toBe(1);
      expect(metadata.url).toBe('https://example.com');
      expect(metadata.browser).toBe('chromium');
      expect(manager.hasBaseline('test-baseline-1')).toBe(true);
    });

    it('should create baseline with auto-generated ID', async () => {
      const screenshotPath = await createTestImage(testDir, 'source-2.png', 100, 100, [0, 255, 0]);

      const metadata = await manager.createBaseline(screenshotPath, {
        url: 'https://test.com/page',
        viewport: { width: 1920, height: 1080 },
      });

      expect(metadata.id).toBeDefined();
      expect(metadata.id.length).toBeGreaterThan(0);
      expect(metadata.url).toBe('https://test.com/page');
    });

    it('should throw error when creating duplicate baseline', async () => {
      const screenshot1 = await createTestImage(testDir, 'dup-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'dup-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, { id: 'duplicate-test' });

      await expect(
        manager.createBaseline(screenshot2, { id: 'duplicate-test' })
      ).rejects.toThrow('基线已存在');
    });

    it('should create baseline with tags', async () => {
      const screenshotPath = await createTestImage(testDir, 'tagged.png', 100, 100, [200, 200, 200]);

      const metadata = await manager.createBaseline(screenshotPath, {
        id: 'tagged-baseline',
        tags: ['smoke', 'critical'],
      });

      expect(metadata.tags).toEqual(['smoke', 'critical']);
    });
  });

  describe('baseline update', () => {
    it('should update existing baseline', async () => {
      const screenshot1 = await createTestImage(testDir, 'update-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'update-2.png', 100, 100, [200, 200, 200]);

      await manager.createBaseline(screenshot1, { id: 'update-test' });

      const updatedMetadata = await manager.updateBaseline('update-test', screenshot2, 'Updated for new design');

      expect(updatedMetadata.version).toBe(2);
      expect(updatedMetadata.note).toBeUndefined();
      expect(updatedMetadata.history.length).toBe(1);
      expect(updatedMetadata.history[0].version).toBe(1);
    });

    it('should backup previous version', async () => {
      const screenshot1 = await createTestImage(testDir, 'backup-1.png', 100, 100, [50, 50, 50]);
      const screenshot2 = await createTestImage(testDir, 'backup-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, { id: 'backup-test' });
      await manager.updateBaseline('backup-test', screenshot2);

      // Check backup exists
      const backupDir = path.join(testDir, 'backup');
      const backups = await fs.readdir(backupDir);
      expect(backups.some(f => f.startsWith('backup-test_v1_'))).toBe(true);
    });

    it('should throw error when updating non-existing baseline', async () => {
      const screenshot = await createTestImage(testDir, 'noexist.png', 100, 100, [100, 100, 100]);

      await expect(
        manager.updateBaseline('non-existing', screenshot)
      ).rejects.toThrow('基线不存在');
    });
  });

  describe('baseline deletion', () => {
    it('should delete baseline', async () => {
      const screenshot = await createTestImage(testDir, 'delete-1.png', 100, 100, [100, 100, 100]);

      await manager.createBaseline(screenshot, { id: 'delete-test' });
      expect(manager.hasBaseline('delete-test')).toBe(true);

      await manager.deleteBaseline('delete-test');
      expect(manager.hasBaseline('delete-test')).toBe(false);
    });

    it('should delete baseline with history', async () => {
      const screenshot1 = await createTestImage(testDir, 'del-history-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'del-history-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, { id: 'delete-with-history' });
      await manager.updateBaseline('delete-with-history', screenshot2);

      await manager.deleteBaseline('delete-with-history', false);

      // Check backup is also deleted
      const backupDir = path.join(testDir, 'backup');
      const backups = await fs.readdir(backupDir);
      expect(backups.some(f => f.startsWith('delete-with-history'))).toBe(false);
    });

    it('should handle non-existing baseline deletion gracefully', async () => {
      await manager.deleteBaseline('non-existing');
      // Should not throw
    });
  });

  describe('baseline listing and filtering', () => {
    it('should list all baselines', async () => {
      const screenshot1 = await createTestImage(testDir, 'list-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'list-2.png', 100, 100, [150, 150, 150]);
      const screenshot3 = await createTestImage(testDir, 'list-3.png', 100, 100, [200, 200, 200]);

      await manager.createBaseline(screenshot1, { id: 'list-a', browser: 'chromium' });
      await manager.createBaseline(screenshot2, { id: 'list-b', browser: 'firefox' });
      await manager.createBaseline(screenshot3, { id: 'list-c', browser: 'chromium' });

      const allBaselines = manager.listBaselines();

      expect(allBaselines.length).toBe(3);
      expect(allBaselines.map(b => b.id)).toContain('list-a');
      expect(allBaselines.map(b => b.id)).toContain('list-b');
      expect(allBaselines.map(b => b.id)).toContain('list-c');
    });

    it('should filter baselines by browser', async () => {
      const screenshot1 = await createTestImage(testDir, 'filter-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'filter-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, { id: 'filter-chrome', browser: 'chromium' });
      await manager.createBaseline(screenshot2, { id: 'filter-firefox', browser: 'firefox' });

      const chromeBaselines = manager.listBaselines({ browser: 'chromium' });

      expect(chromeBaselines.length).toBe(1);
      expect(chromeBaselines[0].id).toBe('filter-chrome');
    });

    it('should filter baselines by viewport', async () => {
      const screenshot1 = await createTestImage(testDir, 'viewport-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'viewport-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, {
        id: 'viewport-desktop',
        viewport: { width: 1920, height: 1080 },
      });
      await manager.createBaseline(screenshot2, {
        id: 'viewport-mobile',
        viewport: { width: 375, height: 667 },
      });

      const desktopBaselines = manager.listBaselines({
        viewport: { width: 1920, height: 1080 },
      });

      expect(desktopBaselines.length).toBe(1);
      expect(desktopBaselines[0].id).toBe('viewport-desktop');
    });
  });

  describe('version restoration', () => {
    it('should restore previous version', async () => {
      const screenshot1 = await createTestImage(testDir, 'restore-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'restore-2.png', 100, 100, [200, 200, 200]);

      await manager.createBaseline(screenshot1, { id: 'restore-test' });
      await manager.updateBaseline('restore-test', screenshot2);

      const restored = await manager.restoreVersion('restore-test', 1);

      expect(restored.version).toBe(3);
      expect(restored.note).toContain('从 v1 恢复');
    });

    it('should throw error when restoring non-existing version', async () => {
      const screenshot = await createTestImage(testDir, 'restore-noexist.png', 100, 100, [100, 100, 100]);

      await manager.createBaseline(screenshot, { id: 'restore-noexist' });

      await expect(
        manager.restoreVersion('restore-noexist', 99)
      ).rejects.toThrow('历史版本不存在');
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', async () => {
      const screenshot1 = await createTestImage(testDir, 'stats-1.png', 100, 100, [100, 100, 100]);
      const screenshot2 = await createTestImage(testDir, 'stats-2.png', 100, 100, [150, 150, 150]);

      await manager.createBaseline(screenshot1, {
        id: 'stats-chrome',
        browser: 'chromium',
        viewport: { width: 1920, height: 1080 },
      });
      await manager.createBaseline(screenshot2, {
        id: 'stats-ff',
        browser: 'firefox',
        viewport: { width: 375, height: 667 },
      });

      const stats = manager.getStats();

      expect(stats.totalBaselines).toBe(2);
      expect(stats.byBrowser.chromium).toBe(1);
      expect(stats.byBrowser.firefox).toBe(1);
      expect(stats.byViewport['1920x1080']).toBe(1);
      expect(stats.byViewport['375x667']).toBe(1);
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
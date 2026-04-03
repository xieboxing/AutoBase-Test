import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  ScreenshotTester,
  compareScreenshots,
  createBaseline,
} from '@/testers/visual/screenshot-tester.js';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

describe('ScreenshotTester', () => {
  let testDir: string;
  let tester: ScreenshotTester;

  beforeEach(async () => {
    testDir = path.join(process.cwd(), 'data', 'test-screenshots');
    await fs.mkdir(testDir, { recursive: true });
    tester = new ScreenshotTester({
      artifactsDir: testDir,
      baselineDir: path.join(testDir, 'baselines'),
      diffDir: path.join(testDir, 'diff'),
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe('module exports', () => {
    it('should export ScreenshotTester class', () => {
      expect(ScreenshotTester).toBeDefined();
      expect(typeof ScreenshotTester).toBe('function');
    });

    it('should export compareScreenshots function', () => {
      expect(compareScreenshots).toBeDefined();
      expect(typeof compareScreenshots).toBe('function');
    });

    it('should export createBaseline function', () => {
      expect(createBaseline).toBeDefined();
      expect(typeof createBaseline).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new ScreenshotTester({
        diffThreshold: 5,
        autoCreateBaseline: false,
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('initialization', () => {
    it('should initialize directories', async () => {
      await tester.initialize();

      expect(fsSync.existsSync(path.join(testDir, 'baselines'))).toBe(true);
      expect(fsSync.existsSync(path.join(testDir, 'diff'))).toBe(true);
    });
  });

  describe('baseline management', () => {
    it('should create baseline from screenshot', async () => {
      // Create a test screenshot
      const screenshotPath = await createTestImage(testDir, 'test-1.png', 100, 100, [255, 0, 0]);

      const baselinePath = await tester.createBaseline(screenshotPath, 'test-baseline');

      expect(fsSync.existsSync(baselinePath)).toBe(true);
    });

    it('should detect if baseline exists', async () => {
      const screenshotPath = await createTestImage(testDir, 'test-2.png', 100, 100, [0, 255, 0]);

      await tester.createBaseline(screenshotPath, 'existing-baseline');

      expect(tester.hasBaseline('existing-baseline')).toBe(true);
      expect(tester.hasBaseline('non-existing')).toBe(false);
    });

    it('should list all baselines', async () => {
      const screenshot1 = await createTestImage(testDir, 'list-1.png', 100, 100, [255, 0, 0]);
      const screenshot2 = await createTestImage(testDir, 'list-2.png', 100, 100, [0, 255, 0]);

      await tester.createBaseline(screenshot1, 'baseline-a');
      await tester.createBaseline(screenshot2, 'baseline-b');

      const baselines = await tester.listBaselines();

      expect(baselines).toContain('baseline-a');
      expect(baselines).toContain('baseline-b');
    });

    it('should delete baseline', async () => {
      const screenshotPath = await createTestImage(testDir, 'delete-test.png', 100, 100, [0, 0, 255]);

      await tester.createBaseline(screenshotPath, 'to-delete');
      expect(tester.hasBaseline('to-delete')).toBe(true);

      await tester.deleteBaseline('to-delete');
      expect(tester.hasBaseline('to-delete')).toBe(false);
    });
  });

  describe('screenshot comparison', () => {
    it('should pass when screenshots are identical', async () => {
      const screenshot1 = await createTestImage(testDir, 'identical-1.png', 100, 100, [128, 128, 128]);
      const screenshot2 = await createTestImage(testDir, 'identical-2.png', 100, 100, [128, 128, 128]);

      await tester.createBaseline(screenshot1, 'identical-baseline');

      const result = await tester.compare(screenshot2, 'identical-baseline');

      expect(result.passed).toBe(true);
      expect(result.diffPixels).toBe(0);
      expect(result.diffPercentage).toBe(0);
    });

    it('should fail when screenshots are different', async () => {
      const baseline = await createTestImage(testDir, 'diff-base.png', 100, 100, [255, 0, 0]);
      const current = await createTestImage(testDir, 'diff-current.png', 100, 100, [0, 255, 0]);

      await tester.createBaseline(baseline, 'diff-baseline');

      const result = await tester.compare(current, 'diff-baseline');

      expect(result.passed).toBe(false);
      expect(result.diffPixels).toBeGreaterThan(0);
      expect(result.diffPercentage).toBeGreaterThan(0);
    });

    it('should auto create baseline when not exists', async () => {
      const screenshot = await createTestImage(testDir, 'auto-create.png', 100, 100, [200, 200, 200]);

      const result = await tester.compare(screenshot, 'auto-baseline');

      expect(result.passed).toBe(true);
      expect(result.diffPixels).toBe(0);
      expect(tester.hasBaseline('auto-baseline')).toBe(true);
    });

    it('should detect size mismatch', async () => {
      const baseline = await createTestImage(testDir, 'size-base.png', 100, 100, [100, 100, 100]);
      const current = await createTestImage(testDir, 'size-current.png', 200, 200, [100, 100, 100]);

      await tester.createBaseline(baseline, 'size-baseline');

      const result = await tester.compare(current, 'size-baseline');

      expect(result.passed).toBe(false);
      expect(result.diffPixels).toBe(-1);
    });

    it('should respect diff threshold', async () => {
      const testerStrict = new ScreenshotTester({
        artifactsDir: testDir,
        baselineDir: path.join(testDir, 'baselines-strict'),
        diffDir: path.join(testDir, 'diff-strict'),
        diffThreshold: 0.1, // Very strict threshold
      });

      // Create almost identical images with slight difference
      const baseline = await createTestImage(testDir, 'threshold-base.png', 100, 100, [100, 100, 100]);
      const current = await createTestImage(testDir, 'threshold-current.png', 100, 100, [101, 101, 101]);

      await testerStrict.createBaseline(baseline, 'threshold-baseline');

      const result = await testerStrict.compare(current, 'threshold-baseline');

      // Small color difference should be detected with strict threshold
      expect(result.threshold).toBe(0.1);
    });
  });

  describe('batch comparison', () => {
    it('should compare multiple screenshots', async () => {
      const baseline1 = await createTestImage(testDir, 'batch-base-1.png', 50, 50, [255, 0, 0]);
      const baseline2 = await createTestImage(testDir, 'batch-base-2.png', 50, 50, [0, 255, 0]);
      const current1 = await createTestImage(testDir, 'batch-cur-1.png', 50, 50, [255, 0, 0]);
      const current2 = await createTestImage(testDir, 'batch-cur-2.png', 50, 50, [0, 0, 255]);

      await tester.createBaseline(baseline1, 'batch-1');
      await tester.createBaseline(baseline2, 'batch-2');

      const results = await tester.compareBatch([
        { path: current1, baselineId: 'batch-1' },
        { path: current2, baselineId: 'batch-2' },
      ]);

      expect(results.length).toBe(2);
      expect(results[0].passed).toBe(true);
      expect(results[1].passed).toBe(false);
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
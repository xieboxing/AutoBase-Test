/**
 * 视觉回归管理器
 * 统一管理视觉基线、对比、差异检测和结果持久化
 */

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';
import type { KnowledgeDatabase } from '@/knowledge/db/index.js';
import type {
  VisualRegressionConfig,
  VisualDiffResult,
  DiffArea,
  VisualBaseline,
  DEFAULT_VISUAL_REGRESSION_CONFIG,
} from '@/types/visual.types.js';
import type { Platform } from '@/types/test-case.types.js';

/**
 * 默认视觉回归配置
 */
const DEFAULT_CONFIG: VisualRegressionConfig = {
  enabled: true,
  baselineDir: './data/baselines',
  diffDir: './data/visual-diffs',
  pixelThreshold: 0.1,
  percentageThreshold: 0.5,
  ignoreAreas: [],
  ignoreSelectors: [],
  isolateByBrowser: true,
  isolateByDevice: true,
  isolateByViewport: true,
  autoGenerateBaseline: true,
  baselineUpdateStrategy: 'manual',
};

/**
 * 视觉回归管理器
 */
export class VisualRegressionManager {
  private config: VisualRegressionConfig;
  private db: KnowledgeDatabase | null = null;

  constructor(
    config: Partial<VisualRegressionConfig> = {},
    db?: KnowledgeDatabase
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = db || null;
  }

  /**
   * 设置数据库实例
   */
  setDatabase(db: KnowledgeDatabase): void {
    this.db = db;
  }

  /**
   * 初始化目录
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.baselineDir, { recursive: true });
    await fs.mkdir(this.config.diffDir, { recursive: true });
    logger.pass('✅ 视觉回归管理器初始化完成');
  }

  /**
   * 对比截图与基线
   * @param currentScreenshot 当前截图路径
   * @param options 对比选项
   */
  async compare(
    currentScreenshot: string,
    options: {
      projectId: string;
      platform: Platform;
      pageUrl: string;
      pageName?: string;
      caseId?: string;
      runId?: string;
      viewport?: { width: number; height: number };
      browser?: string;
      device?: string;
      /** 显式指定基线 ID（可选，不传则自动生成） */
      baselineId?: string;
    },
  ): Promise<VisualDiffResult | null> {
    await this.initialize();

    // 生成基线 ID（考虑隔离策略）
    const baselineId = options.baselineId || this.generateBaselineId(options);

    // 检查基线是否存在
    const baseline = await this.getBaseline(baselineId);

    if (!baseline) {
      if (this.config.autoGenerateBaseline) {
        // 自动创建基线
        await this.createBaseline(currentScreenshot, {
          id: baselineId,
          ...options,
        });

        eventBus.emitSafe(TestEventType.VISUAL_BASELINE_CREATED, {
          baselineId,
          pageUrl: options.pageUrl,
          imagePath: currentScreenshot,
        });

        logger.info(`📸 自动创建基线: ${baselineId}`);

        // 返回 null 表示新基线，无需对比
        return null;
      } else {
        logger.warn(`⚠️ 基线不存在: ${baselineId}`);
        return null;
      }
    }

    // 执行对比
    logger.step(`🔍 对比截图: ${baselineId}`);

    const result = await this.performComparison(
      currentScreenshot,
      baseline.baselineImagePath,
      baselineId,
      options,
    );

    // 发送对比结果事件
    if (result.passed) {
      eventBus.emitSafe(TestEventType.VISUAL_PASSED, {
        caseId: options.caseId || '',
        pageUrl: options.pageUrl,
        diffPercentage: result.diffPercentage,
      });
    } else {
      eventBus.emitSafe(TestEventType.VISUAL_FAILED, {
        caseId: options.caseId || '',
        pageUrl: options.pageUrl,
        diffPercentage: result.diffPercentage,
        diffImagePath: result.diffImagePath || '',
      });
    }

    eventBus.emitSafe(TestEventType.VISUAL_DIFF, {
      baselineId,
      caseId: options.caseId || '',
      diffPercentage: result.diffPercentage,
      passed: result.passed,
    });

    return result;
  }

  /**
   * 更新基线
   * @param baselineId 基线 ID
   * @param newScreenshotPath 新截图路径
   * @param reason 更新原因
   */
  async updateBaseline(
    baselineId: string,
    newScreenshotPath: string,
    reason: string = '手动更新',
  ): Promise<VisualBaseline> {
    await this.initialize();

    const baseline = await this.getBaseline(baselineId);
    if (!baseline) {
      throw new Error(`基线不存在: ${baselineId}`);
    }

    // 备份旧基线
    const backupDir = path.join(this.config.baselineDir, 'backup');
    await fs.mkdir(backupDir, { recursive: true });

    const backupPath = path.join(
      backupDir,
      `${baselineId}_${dayjs().format('YYYYMMDD_HHmmss')}.png`
    );
    await fs.copyFile(baseline.baselineImagePath, backupPath);

    // 更新基线文件
    await fs.copyFile(newScreenshotPath, baseline.baselineImagePath);

    // 更新数据库记录
    if (this.db) {
      this.db.execute(
        `UPDATE visual_baselines
         SET baseline_image = ?, baseline_hash = ?, updated = ?
         WHERE id = ?`,
        [
          baseline.baselineImagePath,
          await this.computeImageHash(newScreenshotPath),
          dayjs().toISOString(),
          baselineId,
        ]
      );
    }

    logger.pass(`📸 更新基线: ${baselineId} (${reason})`);

    return {
      ...baseline,
      updatedAt: dayjs().toISOString(),
    };
  }

  /**
   * 生成差异图
   * @param currentScreenshot 当前截图路径
   * @param baselinePath 基线路径
   * @param baselineId 基线 ID
   * @returns 差异图路径
   */
  async generateDiffImage(
    currentScreenshot: string,
    baselinePath: string,
    baselineId: string,
  ): Promise<{ diffPath: string; diffPixels: number; diffPercentage: number }> {
    const currentImg = await this.loadPng(currentScreenshot);
    const baselineImg = await this.loadPng(baselinePath);

    // 尺寸不一致时调整
    const width = Math.max(currentImg.width, baselineImg.width);
    const height = Math.max(currentImg.height, baselineImg.height);

    // 创建差异图
    const diffImg = new PNG({ width, height });

    // 执行像素对比
    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      width,
      height,
      {
        threshold: this.config.pixelThreshold,
        diffMask: true,
      }
    );

    // 计算差异百分比
    const totalPixels = width * height;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    // 保存差异图
    const diffPath = path.join(
      this.config.diffDir,
      `${baselineId}_diff_${dayjs().format('YYYYMMDD_HHmmss')}_${nanoid(6)}.png`
    );
    const buffer = PNG.sync.write(diffImg);
    await fs.writeFile(diffPath, buffer);

    return { diffPath, diffPixels, diffPercentage };
  }

  /**
   * 检测变化区域
   * @param currentScreenshot 当前截图路径
   * @param baselinePath 基线路径
   * @param options 检测选项
   * @returns 变化区域列表
   */
  async detectChangedAreas(
    currentScreenshot: string,
    baselinePath: string,
    options: {
      minAreaSize?: number;
      mergeAdjacent?: boolean;
      gridSize?: number;
    } = {},
  ): Promise<DiffArea[]> {
    const currentImg = await this.loadPng(currentScreenshot);
    const baselineImg = await this.loadPng(baselinePath);

    const width = Math.max(currentImg.width, baselineImg.width);
    const height = Math.max(currentImg.height, baselineImg.height);

    const gridSize = options.gridSize || 50; // 检测网格大小
    const minAreaSize = options.minAreaSize || 100; // 最小区域像素数
    const mergeAdjacent = options.mergeAdjacent ?? true;

    // 创建差异标记矩阵
    const diffMatrix: boolean[][] = [];

    for (let y = 0; y < height; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r1 = baselineImg.data[idx] ?? 0;
        const g1 = baselineImg.data[idx + 1] ?? 0;
        const b1 = baselineImg.data[idx + 2] ?? 0;
        const r2 = currentImg.data[idx] ?? 0;
        const g2 = currentImg.data[idx + 2] ?? 0;
        const b2 = currentImg.data[idx + 2] ?? 0;

        // 计算颜色差异
        const colorDiff = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);
        row.push(colorDiff > 30); // 阈值
      }
      diffMatrix.push(row);
    }

    // 查找连续变化区域（基于网格）
    const areas: DiffArea[] = [];
    const visited: boolean[][] = Array(height)
      .fill(null)
      .map(() => Array(width).fill(false));

    for (let y = 0; y < height; y += gridSize) {
      for (let x = 0; x < width; x += gridSize) {
        const visitedRow = visited[y];
        if (!visitedRow || visitedRow[x]) continue;

        // 检查网格内是否有差异
        let hasDiff = false;
        for (let dy = y; dy < Math.min(y + gridSize, height); dy++) {
          const diffRow = diffMatrix[dy];
          if (!diffRow) continue;
          for (let dx = x; dx < Math.min(x + gridSize, width); dx++) {
            if (diffRow[dx]) {
              hasDiff = true;
              break;
            }
          }
          if (hasDiff) break;
        }

        if (hasDiff) {
          // BFS 找到完整的差异区域
          const area = this.findConnectedArea(
            diffMatrix,
            visited,
            x,
            y,
            gridSize,
            width,
            height
          );

          if (area.pixelCount >= minAreaSize) {
            areas.push({
              x: area.minX,
              y: area.minY,
              width: area.maxX - area.minX,
              height: area.maxY - area.minY,
              diffPercentage: (area.pixelCount / area.totalPixels) * 100,
            });
          }
        }
      }
    }

    // 合并相邻区域
    if (mergeAdjacent && areas.length > 1) {
      return this.mergeAdjacentAreas(areas);
    }

    return areas;
  }

  /**
   * 创建基线
   */
  async createBaseline(
    screenshotPath: string,
    options: {
      id?: string;
      projectId: string;
      platform: Platform;
      pageUrl: string;
      pageName?: string;
      viewport?: { width: number; height: number };
      browser?: string;
      device?: string;
    },
  ): Promise<VisualBaseline> {
    await this.initialize();

    const baselineId = options.id || this.generateBaselineId(options);
    const baselinePath = path.join(this.config.baselineDir, `${baselineId}.png`);

    // 复制截图到基线目录
    await fs.copyFile(screenshotPath, baselinePath);

    // 计算图片哈希
    const baselineHash = await this.computeImageHash(screenshotPath);

    // 创建数据库记录
    const baseline: VisualBaseline = {
      id: baselineId,
      projectId: options.projectId,
      platform: options.platform,
      pageUrl: options.pageUrl,
      pageName: options.pageName || null,
      viewportWidth: options.viewport?.width || 1920,
      viewportHeight: options.viewport?.height || 1080,
      browser: options.browser || null,
      device: options.device || null,
      baselineImagePath: baselinePath,
      baselineHash,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
    };

    if (this.db) {
      this.db.execute(
        `INSERT OR REPLACE INTO visual_baselines
         (id, project, platform, page_url, viewport_width, viewport_height,
          browser, device, baseline_image, baseline_hash, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          baseline.id,
          baseline.projectId,
          baseline.platform,
          baseline.pageUrl,
          baseline.viewportWidth,
          baseline.viewportHeight,
          baseline.browser,
          baseline.device,
          baseline.baselineImagePath,
          baseline.baselineHash,
          baseline.createdAt,
          baseline.updatedAt,
        ]
      );
    }

    logger.pass(`📸 创建基线: ${baselineId}`);
    return baseline;
  }

  /**
   * 获取基线信息
   */
  async getBaseline(baselineId: string): Promise<VisualBaseline | null> {
    if (this.db) {
      const row = this.db.queryOne<{
        id: string;
        project: string;
        platform: string;
        page_url: string;
        viewport_width: number;
        viewport_height: number;
        browser: string | null;
        device: string | null;
        baseline_image: string;
        baseline_hash: string | null;
        created: string;
        updated: string;
      }>(
        'SELECT * FROM visual_baselines WHERE id = ?',
        [baselineId]
      );

      if (row) {
        return {
          id: row.id,
          projectId: row.project,
          platform: row.platform as Platform,
          pageUrl: row.page_url,
          pageName: null,
          viewportWidth: row.viewport_width,
          viewportHeight: row.viewport_height,
          browser: row.browser,
          device: row.device,
          baselineImagePath: row.baseline_image,
          baselineHash: row.baseline_hash,
          createdAt: row.created,
          updatedAt: row.updated,
        };
      }
    }

    // 检查文件是否存在
    const baselinePath = path.join(this.config.baselineDir, `${baselineId}.png`);
    if (fsSync.existsSync(baselinePath)) {
      return {
        id: baselineId,
        projectId: 'unknown',
        platform: 'pc-web',
        pageUrl: '',
        pageName: null,
        viewportWidth: 1920,
        viewportHeight: 1080,
        browser: null,
        device: null,
        baselineImagePath: baselinePath,
        baselineHash: null,
        createdAt: dayjs().toISOString(),
        updatedAt: dayjs().toISOString(),
      };
    }

    return null;
  }

  /**
   * 列出所有基线
   */
  async listBaselines(options?: {
    projectId?: string;
    platform?: Platform;
    pageUrl?: string;
  }): Promise<VisualBaseline[]> {
    if (this.db) {
      let sql = 'SELECT * FROM visual_baselines WHERE 1=1';
      const params: unknown[] = [];

      if (options?.projectId) {
        sql += ' AND project = ?';
        params.push(options.projectId);
      }
      if (options?.platform) {
        sql += ' AND platform = ?';
        params.push(options.platform);
      }
      if (options?.pageUrl) {
        sql += ' AND page_url LIKE ?';
        params.push(`%${options.pageUrl}%`);
      }

      const rows = this.db.query<{
        id: string;
        project: string;
        platform: string;
        page_url: string;
        viewport_width: number;
        viewport_height: number;
        browser: string | null;
        device: string | null;
        baseline_image: string;
        baseline_hash: string | null;
        created: string;
        updated: string;
      }>(sql, params);

      return rows.map(row => ({
        id: row.id,
        projectId: row.project,
        platform: row.platform as Platform,
        pageUrl: row.page_url,
        pageName: null,
        viewportWidth: row.viewport_width,
        viewportHeight: row.viewport_height,
        browser: row.browser,
        device: row.device,
        baselineImagePath: row.baseline_image,
        baselineHash: row.baseline_hash,
        createdAt: row.created,
        updatedAt: row.updated,
      }));
    }

    // 从文件系统读取
    const files = await fs.readdir(this.config.baselineDir);
    const baselines: VisualBaseline[] = [];

    for (const file of files) {
      if (file.endsWith('.png')) {
        const id = file.replace('.png', '');
        baselines.push({
          id,
          projectId: 'unknown',
          platform: 'pc-web',
          pageUrl: '',
          pageName: null,
          viewportWidth: 1920,
          viewportHeight: 1080,
          browser: null,
          device: null,
          baselineImagePath: path.join(this.config.baselineDir, file),
          baselineHash: null,
          createdAt: dayjs().toISOString(),
          updatedAt: dayjs().toISOString(),
        });
      }
    }

    return baselines;
  }

  /**
   * 删除基线
   */
  async deleteBaseline(baselineId: string): Promise<void> {
    const baseline = await this.getBaseline(baselineId);
    if (!baseline) {
      logger.warn(`⚠️ 基线不存在: ${baselineId}`);
      return;
    }

    // 删除文件
    await fs.unlink(baseline.baselineImagePath).catch(() => {});

    // 删除数据库记录
    if (this.db) {
      this.db.execute('DELETE FROM visual_baselines WHERE id = ?', [baselineId]);
    }

    logger.pass(`🗑️ 删除基线: ${baselineId}`);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalBaselines: number;
    totalDiffs: number;
    byBrowser: Record<string, number>;
    byViewport: Record<string, number>;
  } {
    const stats = {
      totalBaselines: 0,
      totalDiffs: 0,
      byBrowser: {} as Record<string, number>,
      byViewport: {} as Record<string, number>,
    };

    if (this.db) {
      stats.totalBaselines =
        this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM visual_baselines')?.count || 0;
      stats.totalDiffs =
        this.db.queryOne<{ count: number }>('SELECT COUNT(*) as count FROM visual_diffs')?.count || 0;

      // 按浏览器统计
      const browserStats = this.db.query<{ browser: string; count: number }>(
        'SELECT browser, COUNT(*) as count FROM visual_baselines WHERE browser IS NOT NULL GROUP BY browser'
      );
      for (const row of browserStats) {
        stats.byBrowser[row.browser] = row.count;
      }

      // 按视口统计
      const viewportStats = this.db.query<{ viewport: string; count: number }>(
        `SELECT viewport_width || 'x' || viewport_height as viewport, COUNT(*) as count
         FROM visual_baselines GROUP BY viewport_width, viewport_height`
      );
      for (const row of viewportStats) {
        stats.byViewport[row.viewport] = row.count;
      }
    }

    return stats;
  }

  /**
   * 生成基线 ID（考虑隔离策略）
   */
  public generateBaselineId(options: {
    projectId: string;
    platform: Platform;
    pageUrl: string;
    viewport?: { width: number; height: number };
    browser?: string;
    device?: string;
  }): string {
    const parts: string[] = [options.projectId, options.platform];

    // URL 标识（简化）
    const urlPart = options.pageUrl
      .replace(/^https?:\/\//, '')
      .replace(/[\/\.]/g, '_')
      .slice(0, 50);
    parts.push(urlPart);

    // 视口隔离
    if (this.config.isolateByViewport && options.viewport) {
      parts.push(`${options.viewport.width}x${options.viewport.height}`);
    }

    // 浏览器隔离
    if (this.config.isolateByBrowser && options.browser) {
      parts.push(options.browser);
    }

    // 设备隔离
    if (this.config.isolateByDevice && options.device) {
      parts.push(options.device);
    }

    return parts.join('_');
  }

  /**
   * 执行对比
   */
  private async performComparison(
    currentScreenshot: string,
    baselinePath: string,
    baselineId: string,
    options: {
      projectId: string;
      platform: Platform;
      pageUrl: string;
      caseId?: string;
      runId?: string;
    },
  ): Promise<VisualDiffResult> {
    const { diffPath, diffPixels, diffPercentage } = await this.generateDiffImage(
      currentScreenshot,
      baselinePath,
      baselineId,
    );

    // 检测变化区域
    const diffAreas = await this.detectChangedAreas(currentScreenshot, baselinePath);

    // 判断是否通过
    const passed = diffPercentage <= this.config.percentageThreshold;

    // 生成对比 ID
    const diffId = `${baselineId}_diff_${nanoid(8)}`;

    // 保存对比结果到数据库
    if (this.db && options.runId) {
      this.db.execute(
        `INSERT INTO visual_diffs
         (id, run_id, baseline_id, current_image, diff_image, diff_percentage,
          diff_regions, threshold, passed, created)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          diffId,
          options.runId,
          baselineId,
          currentScreenshot,
          diffPath,
          diffPercentage,
          JSON.stringify(diffAreas),
          this.config.percentageThreshold,
          passed ? 1 : 0,
          dayjs().toISOString(),
        ]
      );
    }

    return {
      id: diffId,
      runId: options.runId || '',
      baselineId,
      currentImagePath: currentScreenshot,
      diffImagePath: diffPath,
      diffPercentage,
      diffPixels,
      totalPixels: await this.getTotalPixels(currentScreenshot),
      diffAreas,
      threshold: this.config.percentageThreshold,
      passed,
      createdAt: dayjs().toISOString(),
    };
  }

  /**
   * 加载 PNG 图片
   */
  private async loadPng(filePath: string): Promise<PNG> {
    const buffer = await fs.readFile(filePath);
    return PNG.sync.read(buffer);
  }

  /**
   * 计算图片哈希
   */
  private async computeImageHash(filePath: string): Promise<string> {
    const img = await this.loadPng(filePath);
    const data = img.data.slice(0, Math.min(img.data.length, 1000)); // 取前 1000 字节
    const hash = this.simpleHash(Array.from(data));
    return hash;
  }

  /**
   * 简单哈希函数
   */
  private simpleHash(data: number[]): string {
    let hash = 0;
    for (const num of data) {
      hash = ((hash << 5) - hash + num) | 0;
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * 获取总像素数
   */
  private async getTotalPixels(filePath: string): Promise<number> {
    const img = await this.loadPng(filePath);
    return img.width * img.height;
  }

  /**
   * BFS 查找连接的差异区域
   */
  private findConnectedArea(
    diffMatrix: boolean[][],
    visited: boolean[][],
    startX: number,
    startY: number,
    gridSize: number,
    width: number,
    height: number,
  ): { minX: number; minY: number; maxX: number; maxY: number; pixelCount: number; totalPixels: number } {
    const queue: [number, number][] = [[startX, startY]];
    let minX = startX;
    let minY = startY;
    let maxX = startX + gridSize;
    let maxY = startY + gridSize;
    let pixelCount = 0;

    while (queue.length > 0) {
      const [x, y] = queue.shift()!;

      const visitedRow = visited[y];
      if (!visitedRow || x < 0 || x >= width || y < 0 || y >= height || visitedRow[x]) continue;

      visitedRow[x] = true;

      const diffRow = diffMatrix[y];
      if (diffRow && diffRow[x]) {
        pixelCount++;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + 1);
        maxY = Math.max(maxY, y + 1);
      }

      // 添加相邻点
      if (x + gridSize < width) queue.push([x + gridSize, y]);
      if (x - gridSize >= 0) queue.push([x - gridSize, y]);
      if (y + gridSize < height) queue.push([x, y + gridSize]);
      if (y - gridSize >= 0) queue.push([x, y - gridSize]);
    }

    return {
      minX,
      minY,
      maxX,
      maxY,
      pixelCount,
      totalPixels: (maxX - minX) * (maxY - minY),
    };
  }

  /**
   * 合并相邻区域
   */
  private mergeAdjacentAreas(areas: DiffArea[]): DiffArea[] {
    const merged: DiffArea[] = [];
    const used: boolean[] = Array(areas.length).fill(false);

    for (let i = 0; i < areas.length; i++) {
      if (used[i]) continue;

      const areaI = areas[i];
      if (!areaI) continue;

      const current: DiffArea = { ...areaI };
      used[i] = true;

      for (let j = i + 1; j < areas.length; j++) {
        if (used[j]) continue;

        const other = areas[j];
        if (!other) continue;

        // 检查是否相邻（边缘距离小于阈值）
        const gapX = Math.max(0, Math.max(current.x, other.x) - Math.min(current.x + current.width, other.x + other.width));
        const gapY = Math.max(0, Math.max(current.y, other.y) - Math.min(current.y + current.height, other.y + other.height));

        if (gapX < 20 && gapY < 20) {
          // 合并
          current.x = Math.min(current.x, other.x);
          current.y = Math.min(current.y, other.y);
          current.width = Math.max(current.x + current.width, other.x + other.width) - current.x;
          current.height = Math.max(current.y + current.height, other.y + other.height) - current.y;
          used[j] = true;
        }
      }

      merged.push(current);
    }

    return merged;
  }
}

/**
 * 快捷创建视觉回归管理器实例
 */
export function createVisualRegressionManager(
  config?: Partial<VisualRegressionConfig>,
  db?: KnowledgeDatabase,
): VisualRegressionManager {
  return new VisualRegressionManager(config, db);
}
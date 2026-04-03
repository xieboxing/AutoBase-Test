import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import dayjs from 'dayjs';

/**
 * 基线图元数据
 */
export interface BaselineMetadata {
  /** 基线 ID */
  id: string;
  /** 原始截图路径 */
  sourcePath: string;
  /** 基线文件路径 */
  baselinePath: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  /** 版本号 */
  version: number;
  /** 关联的 URL */
  url?: string;
  /** 关联的视口 */
  viewport?: {
    width: number;
    height: number;
    name?: string;
  };
  /** 关联的浏览器 */
  browser?: string;
  /** 标签 */
  tags?: string[];
  /** 备注 */
  note?: string;
  /** 历史版本 */
  history: BaselineHistoryEntry[];
}

/**
 * 基线历史记录
 */
export interface BaselineHistoryEntry {
  version: number;
  path: string;
  createdAt: string;
  note?: string;
}

/**
 * 基线管理器配置
 */
export interface BaselineManagerConfig {
  /** 基线存储目录 */
  baselineDir: string;
  /** 备份目录 */
  backupDir: string;
  /** 元数据文件路径 */
  metadataFile: string;
  /** 最大历史版本数 */
  maxHistoryVersions: number;
  /** 最大基线数量 */
  maxBaselines: number;
}

/**
 * 默认配置
 */
const DEFAULT_BASELINE_MANAGER_CONFIG: BaselineManagerConfig = {
  baselineDir: './data/baselines',
  backupDir: './data/baselines/backup',
  metadataFile: './data/baselines/metadata.json',
  maxHistoryVersions: 5,
  maxBaselines: 1000,
};

/**
 * 基线图管理器
 * 管理测试基线图的创建、更新、版本控制和查询
 */
export class BaselineManager {
  private config: BaselineManagerConfig;
  private metadata: Map<string, BaselineMetadata> = new Map();

  constructor(config: Partial<BaselineManagerConfig> = {}) {
    this.config = { ...DEFAULT_BASELINE_MANAGER_CONFIG, ...config };
  }

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.baselineDir, { recursive: true });
    await fs.mkdir(this.config.backupDir, { recursive: true });
    await this.loadMetadata();
    logger.pass('✅ 基线管理器初始化完成');
  }

  /**
   * 创建新基线
   * @param screenshotPath 截图路径
   * @param options 基线选项
   */
  async createBaseline(
    screenshotPath: string,
    options: {
      id?: string;
      url?: string;
      viewport?: { width: number; height: number; name?: string };
      browser?: string;
      tags?: string[];
      note?: string;
    } = {},
  ): Promise<BaselineMetadata> {
    await this.initialize();

    // 生成基线 ID
    const baselineId = options.id || this.generateBaselineId(options);

    // 检查是否已存在
    if (this.metadata.has(baselineId)) {
      throw new Error(`基线已存在: ${baselineId}，请使用 updateBaseline 更新`);
    }

    // 复制截图到基线目录
    const baselinePath = path.join(this.config.baselineDir, `${baselineId}.png`);
    await fs.copyFile(screenshotPath, baselinePath);

    // 创建元数据
    const metadata: BaselineMetadata = {
      id: baselineId,
      sourcePath: screenshotPath,
      baselinePath,
      createdAt: dayjs().toISOString(),
      updatedAt: dayjs().toISOString(),
      version: 1,
      url: options.url,
      viewport: options.viewport,
      browser: options.browser,
      tags: options.tags,
      note: options.note,
      history: [],
    };

    this.metadata.set(baselineId, metadata);
    await this.saveMetadata();

    logger.pass(`📸 创建基线: ${baselineId}`);
    return metadata;
  }

  /**
   * 更新基线
   * @param baselineId 基线 ID
   * @param screenshotPath 新截图路径
   * @param note 更新备注
   */
  async updateBaseline(
    baselineId: string,
    screenshotPath: string,
    note?: string,
  ): Promise<BaselineMetadata> {
    await this.initialize();

    const existing = this.metadata.get(baselineId);
    if (!existing) {
      throw new Error(`基线不存在: ${baselineId}`);
    }

    // 备份当前版本
    const backupPath = path.join(
      this.config.backupDir,
      `${baselineId}_v${existing.version}_${dayjs().format('YYYYMMDD_HHmmss')}.png`
    );
    await fs.copyFile(existing.baselinePath, backupPath);

    // 添加历史记录
    existing.history.push({
      version: existing.version,
      path: backupPath,
      createdAt: existing.updatedAt,
      note,
    });

    // 限制历史版本数量
    if (existing.history.length > this.config.maxHistoryVersions) {
      const oldest = existing.history.shift();
      if (oldest) {
        await fs.unlink(oldest.path).catch(() => {});
      }
    }

    // 更新基线文件
    await fs.copyFile(screenshotPath, existing.baselinePath);

    // 更新元数据
    existing.version += 1;
    existing.updatedAt = dayjs().toISOString();
    existing.sourcePath = screenshotPath;

    this.metadata.set(baselineId, existing);
    await this.saveMetadata();

    logger.pass(`📸 更新基线: ${baselineId} (v${existing.version})`);
    return existing;
  }

  /**
   * 删除基线
   * @param baselineId 基线 ID
   * @param keepHistory 是否保留历史版本
   */
  async deleteBaseline(baselineId: string, keepHistory = false): Promise<void> {
    await this.initialize();

    const existing = this.metadata.get(baselineId);
    if (!existing) {
      logger.warn(`⚠️ 基线不存在: ${baselineId}`);
      return;
    }

    // 删除基线文件
    await fs.unlink(existing.baselinePath).catch(() => {});

    // 删除历史版本
    if (!keepHistory) {
      for (const entry of existing.history) {
        await fs.unlink(entry.path).catch(() => {});
      }
    }

    // 删除元数据
    this.metadata.delete(baselineId);
    await this.saveMetadata();

    logger.pass(`🗑️ 删除基线: ${baselineId}`);
  }

  /**
   * 获取基线信息
   * @param baselineId 基线 ID
   */
  getBaseline(baselineId: string): BaselineMetadata | undefined {
    return this.metadata.get(baselineId);
  }

  /**
   * 检查基线是否存在
   * @param baselineId 基线 ID
   */
  hasBaseline(baselineId: string): boolean {
    return this.metadata.has(baselineId);
  }

  /**
   * 获取基线路径
   * @param baselineId 基线 ID
   */
  getBaselinePath(baselineId: string): string {
    return path.join(this.config.baselineDir, `${baselineId}.png`);
  }

  /**
   * 列出所有基线
   * @param filter 过滤条件
   */
  listBaselines(filter?: {
    url?: string;
    browser?: string;
    viewport?: { width: number; height: number };
    tags?: string[];
  }): BaselineMetadata[] {
    let results = Array.from(this.metadata.values());

    if (filter) {
      if (filter.url) {
        results = results.filter(b => b.url === filter.url);
      }
      if (filter.browser) {
        results = results.filter(b => b.browser === filter.browser);
      }
      if (filter.viewport) {
        results = results.filter(
          b =>
            b.viewport?.width === filter.viewport!.width &&
            b.viewport?.height === filter.viewport!.height
        );
      }
      if (filter.tags && filter.tags.length > 0) {
        results = results.filter(
          b => b.tags && filter.tags!.some(tag => b.tags!.includes(tag))
        );
      }
    }

    return results;
  }

  /**
   * 恢复历史版本
   * @param baselineId 基线 ID
   * @param version 版本号
   */
  async restoreVersion(baselineId: string, version: number): Promise<BaselineMetadata> {
    await this.initialize();

    const existing = this.metadata.get(baselineId);
    if (!existing) {
      throw new Error(`基线不存在: ${baselineId}`);
    }

    const historyEntry = existing.history.find(h => h.version === version);
    if (!historyEntry) {
      throw new Error(`历史版本不存在: v${version}`);
    }

    // 备份当前版本
    const currentBackupPath = path.join(
      this.config.backupDir,
      `${baselineId}_v${existing.version}_restore_${dayjs().format('YYYYMMDD_HHmmss')}.png`
    );
    await fs.copyFile(existing.baselinePath, currentBackupPath);

    // 添加当前版本到历史
    existing.history.push({
      version: existing.version,
      path: currentBackupPath,
      createdAt: existing.updatedAt,
      note: '恢复前备份',
    });

    // 恢复历史版本
    await fs.copyFile(historyEntry.path, existing.baselinePath);

    // 更新元数据
    existing.version += 1;
    existing.updatedAt = dayjs().toISOString();
    existing.note = `从 v${version} 恢复`;

    this.metadata.set(baselineId, existing);
    await this.saveMetadata();

    logger.pass(`📸 恢复基线: ${baselineId} 到 v${version}`);
    return existing;
  }

  /**
   * 清理过期历史
   * @param maxAgeDays 最大保留天数
   */
  async cleanupHistory(maxAgeDays = 30): Promise<number> {
    await this.initialize();

    const cutoffDate = dayjs().subtract(maxAgeDays, 'day');
    let cleanedCount = 0;

    for (const [id, metadata] of this.metadata) {
      const oldHistory = metadata.history.filter(
        h => dayjs(h.createdAt).isBefore(cutoffDate)
      );

      for (const entry of oldHistory) {
        await fs.unlink(entry.path).catch(() => {});
        cleanedCount++;
      }

      metadata.history = metadata.history.filter(
        h => dayjs(h.createdAt).isAfter(cutoffDate)
      );
    }

    await this.saveMetadata();
    logger.pass(`🧹 清理 ${cleanedCount} 个过期历史版本`);
    return cleanedCount;
  }

  /**
   * 导出基线
   * @param exportDir 导出目录
   * @param baselineIds 要导出的基线 ID（不传则导出全部）
   */
  async exportBaselines(exportDir: string, baselineIds?: string[]): Promise<string> {
    await fs.mkdir(exportDir, { recursive: true });

    const toExport = baselineIds
      ? baselineIds.map(id => this.metadata.get(id)).filter(Boolean) as BaselineMetadata[]
      : Array.from(this.metadata.values());

    // 复制基线文件
    for (const metadata of toExport) {
      const targetPath = path.join(exportDir, `${metadata.id}.png`);
      await fs.copyFile(metadata.baselinePath, targetPath);
    }

    // 导出元数据
    const exportMetadataPath = path.join(exportDir, 'metadata.json');
    await fs.writeFile(
      exportMetadataPath,
      JSON.stringify(toExport, null, 2),
      'utf-8'
    );

    logger.pass(`📦 导出 ${toExport.length} 个基线到 ${exportDir}`);
    return exportDir;
  }

  /**
   * 导入基线
   * @param importDir 导入目录
   * @param merge 是否合并（覆盖同名基线）
   */
  async importBaselines(importDir: string, merge = false): Promise<number> {
    await this.initialize();

    const metadataPath = path.join(importDir, 'metadata.json');
    const metadataContent = await fs.readFile(metadataPath, 'utf-8');
    const importedMetadata: BaselineMetadata[] = JSON.parse(metadataContent);

    let importedCount = 0;

    for (const metadata of importedMetadata) {
      const sourcePath = path.join(importDir, `${metadata.id}.png`);

      if (!fsSync.existsSync(sourcePath)) {
        logger.warn(`⚠️ 基线文件不存在: ${metadata.id}`);
        continue;
      }

      const existing = this.metadata.get(metadata.id);

      if (existing && !merge) {
        logger.warn(`⚠️ 基线已存在，跳过: ${metadata.id}`);
        continue;
      }

      // 复制基线文件
      const targetPath = this.getBaselinePath(metadata.id);
      await fs.copyFile(sourcePath, targetPath);

      // 更新元数据
      metadata.baselinePath = targetPath;
      metadata.createdAt = dayjs().toISOString();
      metadata.updatedAt = dayjs().toISOString();
      this.metadata.set(metadata.id, metadata);

      importedCount++;
    }

    await this.saveMetadata();
    logger.pass(`📥 导入 ${importedCount} 个基线`);
    return importedCount;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalBaselines: number;
    totalHistoryVersions: number;
    byBrowser: Record<string, number>;
    byViewport: Record<string, number>;
  } {
    const all = Array.from(this.metadata.values());

    const byBrowser: Record<string, number> = {};
    const byViewport: Record<string, number> = {};

    for (const metadata of all) {
      if (metadata.browser) {
        byBrowser[metadata.browser] = (byBrowser[metadata.browser] || 0) + 1;
      }
      if (metadata.viewport) {
        const key = `${metadata.viewport.width}x${metadata.viewport.height}`;
        byViewport[key] = (byViewport[key] || 0) + 1;
      }
    }

    return {
      totalBaselines: all.length,
      totalHistoryVersions: all.reduce((sum, m) => sum + m.history.length, 0),
      byBrowser,
      byViewport,
    };
  }

  /**
   * 生成基线 ID
   */
  private generateBaselineId(options: {
    url?: string;
    viewport?: { width: number; height: number; name?: string };
    browser?: string;
  }): string {
    const parts: string[] = [];

    if (options.url) {
      // 从 URL 提取标识
      const urlPart = options.url
        .replace(/^https?:\/\//, '')
        .replace(/[\/\.]/g, '_')
        .slice(0, 50);
      parts.push(urlPart);
    }

    if (options.viewport) {
      parts.push(`${options.viewport.width}x${options.viewport.height}`);
    }

    if (options.browser) {
      parts.push(options.browser);
    }

    // 添加随机后缀避免冲突
    parts.push(nanoid(6));

    return parts.join('_');
  }

  /**
   * 加载元数据
   */
  private async loadMetadata(): Promise<void> {
    try {
      if (fsSync.existsSync(this.config.metadataFile)) {
        const content = await fs.readFile(this.config.metadataFile, 'utf-8');
        const data: BaselineMetadata[] = JSON.parse(content);

        for (const metadata of data) {
          this.metadata.set(metadata.id, metadata);
        }

        logger.info(`📚 加载 ${data.length} 个基线元数据`);
      }
    } catch {
      // 元数据文件不存在或格式错误，忽略
    }
  }

  /**
   * 保存元数据
   */
  private async saveMetadata(): Promise<void> {
    const data = Array.from(this.metadata.values());
    await fs.writeFile(
      this.config.metadataFile,
      JSON.stringify(data, null, 2),
      'utf-8'
    );
  }
}

/**
 * 快捷创建基线管理器实例
 */
export function createBaselineManager(
  config?: Partial<BaselineManagerConfig>,
): BaselineManager {
  return new BaselineManager(config);
}
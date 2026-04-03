import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 截图对比结果
 */
export interface ScreenshotCompareResult {
  /** 当前截图路径 */
  currentScreenshot: string;
  /** 基线截图路径 */
  baselineScreenshot: string;
  /** 差异图路径 */
  diffScreenshot: string;
  /** 差异像素数量 */
  diffPixels: number;
  /** 差异百分比 (0-100) */
  diffPercentage: number;
  /** 是否通过（差异在阈值内） */
  passed: boolean;
  /** 差异阈值 */
  threshold: number;
  /** 截图尺寸 */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * 截图对比配置
 */
export interface ScreenshotTesterConfig {
  /** 工作目录 */
  artifactsDir: string;
  /** 基线图存储目录 */
  baselineDir: string;
  /** 差异图存储目录 */
  diffDir: string;
  /** 差异阈值百分比 (0-100)，默认 1% */
  diffThreshold: number;
  /** 是否自动创建基线（当基线不存在时） */
  autoCreateBaseline: boolean;
  /** 对比时忽略的区域 */
  ignoreRegions?: IgnoreRegion[];
}

/**
 * 忽略区域
 */
export interface IgnoreRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 默认配置
 */
const DEFAULT_SCREENSHOT_TESTER_CONFIG: ScreenshotTesterConfig = {
  artifactsDir: './data/screenshots',
  baselineDir: './data/baselines',
  diffDir: './data/screenshots/diff',
  diffThreshold: 1,
  autoCreateBaseline: true,
};

/**
 * 截图对比测试器
 * 使用 pixelmatch 进行像素级对比
 */
export class ScreenshotTester {
  private config: ScreenshotTesterConfig;

  constructor(config: Partial<ScreenshotTesterConfig> = {}) {
    this.config = { ...DEFAULT_SCREENSHOT_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化目录
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.baselineDir, { recursive: true });
    await fs.mkdir(this.config.diffDir, { recursive: true });
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    logger.pass('✅ 截图对比测试器初始化完成');
  }

  /**
   * 对比截图与基线图
   * @param currentScreenshot 当前截图路径
   * @param baselineId 基线标识（用于查找基线图）
   * @returns 对比结果
   */
  async compare(
    currentScreenshot: string,
    baselineId: string,
  ): Promise<ScreenshotCompareResult> {
    await this.initialize();

    const baselinePath = this.getBaselinePath(baselineId);
    const baselineExists = fsSync.existsSync(baselinePath);

    // 如果基线不存在，自动创建
    if (!baselineExists) {
      if (this.config.autoCreateBaseline) {
        await this.createBaseline(currentScreenshot, baselineId);
        logger.info(`📸 基线不存在，已自动创建: ${baselineId}`);
        return {
          currentScreenshot,
          baselineScreenshot: baselinePath,
          diffScreenshot: '',
          diffPixels: 0,
          diffPercentage: 0,
          passed: true,
          threshold: this.config.diffThreshold,
          dimensions: await this.getImageDimensions(currentScreenshot),
        };
      } else {
        throw new Error(`基线不存在: ${baselineId}`);
      }
    }

    logger.step(`🔍 对比截图: ${baselineId}`);

    // 读取两张图片
    const currentImg = await this.loadPng(currentScreenshot);
    const baselineImg = await this.loadPng(baselinePath);

    // 检查尺寸是否一致
    if (currentImg.width !== baselineImg.width || currentImg.height !== baselineImg.height) {
      logger.warn(`⚠️ 截图尺寸不一致: 当前 ${currentImg.width}x${currentImg.height}, 基线 ${baselineImg.width}x${baselineImg.height}`);
      // 创建一个调整尺寸后的对比结果
      return {
        currentScreenshot,
        baselineScreenshot: baselinePath,
        diffScreenshot: '',
        diffPixels: -1, // 表示尺寸不一致
        diffPercentage: -1,
        passed: false,
        threshold: this.config.diffThreshold,
        dimensions: {
          width: currentImg.width,
          height: currentImg.height,
        },
      };
    }

    // 创建差异图
    const diffImg = new PNG({ width: currentImg.width, height: currentImg.height });

    // 执行像素对比
    const diffPixels = pixelmatch(
      baselineImg.data,
      currentImg.data,
      diffImg.data,
      currentImg.width,
      currentImg.height,
      {
        threshold: 0.1, // pixelmatch 内部阈值（颜色相似度）
        diffMask: true, // 差异图高亮显示
      }
    );

    // 计算差异百分比
    const totalPixels = currentImg.width * currentImg.height;
    const diffPercentage = (diffPixels / totalPixels) * 100;

    // 判断是否通过
    const passed = diffPercentage <= this.config.diffThreshold;

    // 保存差异图
    const diffPath = await this.saveDiffImage(diffImg, baselineId);

    if (passed) {
      logger.pass(`✅ 截图对比通过: 差异 ${diffPercentage.toFixed(2)}%`);
    } else {
      logger.fail(`❌ 截图对比失败: 差异 ${diffPercentage.toFixed(2)}% > 阈值 ${this.config.diffThreshold}%`);
    }

    return {
      currentScreenshot,
      baselineScreenshot: baselinePath,
      diffScreenshot: diffPath,
      diffPixels,
      diffPercentage: Math.round(diffPercentage * 100) / 100,
      passed,
      threshold: this.config.diffThreshold,
      dimensions: {
        width: currentImg.width,
        height: currentImg.height,
      },
    };
  }

  /**
   * 创建基线图
   * @param screenshotPath 截图路径
   * @param baselineId 基线标识
   */
  async createBaseline(screenshotPath: string, baselineId: string): Promise<string> {
    await this.initialize();

    const baselinePath = this.getBaselinePath(baselineId);
    await fs.copyFile(screenshotPath, baselinePath);

    logger.pass(`📸 创建基线图: ${baselineId}`);
    return baselinePath;
  }

  /**
   * 更新基线图
   * @param screenshotPath 截图路径
   * @param baselineId 基线标识
   */
  async updateBaseline(screenshotPath: string, baselineId: string): Promise<string> {
    await this.initialize();

    const baselinePath = this.getBaselinePath(baselineId);

    // 如果基线存在，先备份
    if (fsSync.existsSync(baselinePath)) {
      const backupPath = path.join(
        this.config.baselineDir,
        'backup',
        `${baselineId}_${Date.now()}.png`
      );
      await fs.mkdir(path.join(this.config.baselineDir, 'backup'), { recursive: true });
      await fs.copyFile(baselinePath, backupPath);
      logger.info(`📦 备份旧基线: ${backupPath}`);
    }

    await fs.copyFile(screenshotPath, baselinePath);
    logger.pass(`📸 更新基线图: ${baselineId}`);
    return baselinePath;
  }

  /**
   * 删除基线图
   * @param baselineId 基线标识
   */
  async deleteBaseline(baselineId: string): Promise<void> {
    const baselinePath = this.getBaselinePath(baselineId);

    if (fsSync.existsSync(baselinePath)) {
      await fs.unlink(baselinePath);
      logger.pass(`🗑️ 删除基线图: ${baselineId}`);
    } else {
      logger.warn(`⚠️ 基线不存在: ${baselineId}`);
    }
  }

  /**
   * 检查基线是否存在
   * @param baselineId 基线标识
   */
  hasBaseline(baselineId: string): boolean {
    return fsSync.existsSync(this.getBaselinePath(baselineId));
  }

  /**
   * 列出所有基线
   */
  async listBaselines(): Promise<string[]> {
    await this.initialize();

    const files = await fs.readdir(this.config.baselineDir);
    return files
      .filter(f => f.endsWith('.png'))
      .map(f => f.replace('.png', ''));
  }

  /**
   * 批量对比
   * @param screenshots 截图列表，每个包含路径和基线ID
   */
  async compareBatch(
    screenshots: Array<{ path: string; baselineId: string }>,
  ): Promise<ScreenshotCompareResult[]> {
    const results: ScreenshotCompareResult[] = [];

    logger.step(`🔍 开始批量对比: ${screenshots.length} 张截图`);

    for (const screenshot of screenshots) {
      const result = await this.compare(screenshot.path, screenshot.baselineId);
      results.push(result);
    }

    const passedCount = results.filter(r => r.passed).length;
    const failedCount = results.length - passedCount;

    logger.info(`📊 批量对比完成: ${passedCount} 通过, ${failedCount} 失败`);

    return results;
  }

  /**
   * 获取基线路径
   */
  private getBaselinePath(baselineId: string): string {
    return path.join(this.config.baselineDir, `${baselineId}.png`);
  }

  /**
   * 获取差异图路径
   */
  private getDiffPath(baselineId: string): string {
    const runId = nanoid(8);
    return path.join(this.config.diffDir, `${baselineId}_diff_${runId}.png`);
  }

  /**
   * 加载 PNG 图片
   */
  private async loadPng(filePath: string): Promise<PNG> {
    const buffer = await fs.readFile(filePath);
    return PNG.sync.read(buffer);
  }

  /**
   * 保存差异图
   */
  private async saveDiffImage(diffImg: PNG, baselineId: string): Promise<string> {
    const diffPath = this.getDiffPath(baselineId);
    const buffer = PNG.sync.write(diffImg);
    await fs.writeFile(diffPath, buffer);
    return diffPath;
  }

  /**
   * 获取图片尺寸
   */
  private async getImageDimensions(filePath: string): Promise<{ width: number; height: number }> {
    const img = await this.loadPng(filePath);
    return { width: img.width, height: img.height };
  }

  /**
   * 创建忽略区域的 mask
   * pixelmatch 需要 RGBA 格式的 Buffer
   * @deprecated - ignoreMask 参数在新版本 pixelmatch 中已移除
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private createIgnoreMask(_width: number, _height: number): undefined {
    // 此方法保留以供未来使用，当前 pixelmatch 版本不支持 ignoreMask 参数
    return undefined;
  }
}

/**
 * 快捷对比函数
 */
export async function compareScreenshots(
  currentScreenshot: string,
  baselineId: string,
  config?: Partial<ScreenshotTesterConfig>,
): Promise<ScreenshotCompareResult> {
  const tester = new ScreenshotTester(config);
  return tester.compare(currentScreenshot, baselineId);
}

/**
 * 快捷创建基线函数
 */
export async function createBaseline(
  screenshotPath: string,
  baselineId: string,
  config?: Partial<ScreenshotTesterConfig>,
): Promise<string> {
  const tester = new ScreenshotTester(config);
  return tester.createBaseline(screenshotPath, baselineId);
}
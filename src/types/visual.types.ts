/**
 * 视觉回归相关类型定义
 */

import type { Platform } from './test-case.types.js';

/**
 * 视觉基线
 */
export interface VisualBaseline {
  /** 基线 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 页面 URL */
  pageUrl: string;
  /** 页面名称 */
  pageName: string | null;
  /** 视口宽度 */
  viewportWidth: number;
  /** 视口高度 */
  viewportHeight: number;
  /** 浏览器 */
  browser: string | null;
  /** 设备 */
  device: string | null;
  /** 基线图片路径 */
  baselineImagePath: string;
  /** 基线哈希 */
  baselineHash: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 视觉对比结果
 */
export interface VisualDiffResult {
  /** 对比 ID */
  id: string;
  /** 运行 ID */
  runId: string;
  /** 基线 ID */
  baselineId: string;
  /** 当前图片路径 */
  currentImagePath: string;
  /** 对比图片路径 */
  diffImagePath: string | null;
  /** 差异百分比 (0-100) */
  diffPercentage: number;
  /** 差异像素数 */
  diffPixels: number;
  /** 总像素数 */
  totalPixels: number;
  /** 差异区域 */
  diffAreas: DiffArea[];
  /** 对比阈值 */
  threshold: number;
  /** 是否通过 */
  passed: boolean;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 差异区域
 */
export interface DiffArea {
  /** 左上角 X */
  x: number;
  /** 左上角 Y */
  y: number;
  /** 宽度 */
  width: number;
  /** 高度 */
  height: number;
  /** 差异百分比 */
  diffPercentage: number;
  /** 区域描述 */
  description?: string;
}

/**
 * 视觉回归配置
 */
export interface VisualRegressionConfig {
  /** 是否启用视觉回归 */
  enabled: boolean;
  /** 基线目录 */
  baselineDir: string;
  /** 对比结果目录 */
  diffDir: string;
  /** 像素差异阈值 (0-1) */
  pixelThreshold: number;
  /** 百分比差异阈值 (0-100) */
  percentageThreshold: number;
  /** 忽略区域 */
  ignoreAreas: IgnoreArea[];
  /** 忽略选择器 */
  ignoreSelectors: string[];
  /** 是否跨浏览器隔离基线 */
  isolateByBrowser: boolean;
  /** 是否跨设备隔离基线 */
  isolateByDevice: boolean;
  /** 是否跨视口隔离基线 */
  isolateByViewport: boolean;
  /** 首次运行是否自动生成基线 */
  autoGenerateBaseline: boolean;
  /** 基线更新策略 */
  baselineUpdateStrategy: 'manual' | 'auto' | 'approval';
}

/**
 * 忽略区域
 */
export interface IgnoreArea {
  /** 名称 */
  name: string;
  /** 选择器 */
  selector?: string;
  /** 矩形区域 */
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 默认视觉回归配置
 */
export const DEFAULT_VISUAL_REGRESSION_CONFIG: VisualRegressionConfig = {
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
 * 视觉回归测试结果
 */
export interface VisualRegressionTestResult {
  /** 测试用例 ID */
  caseId: string;
  /** 页面 URL */
  pageUrl: string;
  /** 是否有基线 */
  hasBaseline: boolean;
  /** 基线 ID */
  baselineId: string | null;
  /** 对比结果 */
  diffResult: VisualDiffResult | null;
  /** 状态 */
  status: VisualRegressionStatus;
  /** 消息 */
  message: string;
}

/**
 * 视觉回归状态
 */
export type VisualRegressionStatus =
  | 'passed'           // 通过
  | 'failed'           // 失败
  | 'new-baseline'     // 新基线
  | 'no-baseline'      // 无基线
  | 'error';           // 错误

/**
 * 基线管理选项
 */
export interface BaselineManageOptions {
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 页面 URL 模式 */
  urlPattern?: string;
  /** 是否包含过期基线 */
  includeOutdated?: boolean;
  /** 排序字段 */
  sortBy?: 'createdAt' | 'updatedAt' | 'pageUrl';
  /** 排序方向 */
  sortOrder?: 'asc' | 'desc';
  /** 限制数量 */
  limit?: number;
}

/**
 * 基线更新请求
 */
export interface BaselineUpdateRequest {
  /** 基线 ID */
  baselineId: string;
  /** 新基线图片路径 */
  newBaselinePath: string;
  /** 更新原因 */
  reason: string;
  /** 是否自动批准 */
  autoApprove?: boolean;
}

/**
 * 视觉回归报告
 */
export interface VisualRegressionReport {
  /** 运行 ID */
  runId: string;
  /** 项目 ID */
  projectId: string;
  /** 总对比数 */
  totalComparisons: number;
  /** 通过数 */
  passedCount: number;
  /** 失败数 */
  failedCount: number;
  /** 新基线数 */
  newBaselineCount: number;
  /** 无基线数 */
  noBaselineCount: number;
  /** 错误数 */
  errorCount: number;
  /** 通过率 */
  passRate: number;
  /** 详细结果 */
  results: VisualRegressionTestResult[];
  /** 生成时间 */
  generatedAt: string;
}
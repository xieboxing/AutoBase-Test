/**
 * 探索式测试相关类型定义
 */

import type { Platform, TestActionType } from './test-case.types.js';
import type { StateNode, StateEdge } from './state-graph.types.js';

/**
 * 探索配置
 */
export interface ExplorationConfig {
  /** 目标 URL（Web） */
  url?: string;
  /** 包名（APP） */
  packageName?: string;
  /** APK 路径（APP） */
  apkPath?: string;
  /** 平台 */
  platform: Platform;
  /** 最大步数 */
  maxSteps: number;
  /** 最大时间（秒） */
  maxDuration: number;
  /** 最大深度 */
  maxDepth: number;
  /** 探索策略 */
  strategy: ExplorationStrategy;
  /** 是否记录截图 */
  recordScreenshots: boolean;
  /** 是否记录视频 */
  recordVideo: boolean;
  /** 是否发现新状态时停止 */
  stopOnNewState: boolean;
  /** 是否发现异常时停止 */
  stopOnAnomaly: boolean;
  /** 黑名单 URL 模式 */
  blacklistedUrls: string[];
  /** 黑名单元素选择器 */
  blacklistedSelectors: string[];
}

/**
 * 探索策略
 */
export type ExplorationStrategy =
  | 'random'           // 随机探索
  | 'breadth-first'    // 广度优先
  | 'depth-first'      // 深度优先
  | 'reward-based'     // 基于奖励
  | 'ai-guided';       // AI 引导

/**
 * 默认探索配置
 */
export const DEFAULT_EXPLORATION_CONFIG: ExplorationConfig = {
  platform: 'pc-web',
  maxSteps: 100,
  maxDuration: 1800, // 30 分钟
  maxDepth: 5,
  strategy: 'reward-based',
  recordScreenshots: true,
  recordVideo: false,
  stopOnNewState: false,
  stopOnAnomaly: true,
  blacklistedUrls: [
    '*/logout*',
    '*/signout*',
    '*/delete*',
  ],
  blacklistedSelectors: [
    '[data-testid="logout"]',
    'button[title="删除"]',
  ],
};

/**
 * 探索轨迹
 */
export interface ExplorationTrajectory {
  /** 轨迹 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 起始 URL/页面 */
  startUrl: string;
  /** 探索步骤 */
  steps: ExplorationStep[];
  /** 发现的状态 */
  discoveredStates: StateNode[];
  /** 发现的异常 */
  anomalies: ExplorationAnomaly[];
  /** 总奖励 */
  totalReward: number;
  /** 开始时间 */
  startedAt: string;
  /** 结束时间 */
  endedAt: string;
  /** 持续时间（ms） */
  durationMs: number;
  /** 状态 */
  status: ExplorationStatus;
}

/**
 * 探索步骤
 */
export interface ExplorationStep {
  /** 步骤序号 */
  order: number;
  /** 当前状态哈希 */
  currentStateHash: string;
  /** 执行的动作 */
  action: ExplorationAction;
  /** 目标状态哈希 */
  targetStateHash: string | null;
  /** 是否发现新状态 */
  isNewState: boolean;
  /** 是否发现异常 */
  hasAnomaly: boolean;
  /** 奖励分数 */
  reward: number;
  /** 截图路径 */
  screenshotPath: string | null;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 探索动作
 */
export interface ExplorationAction {
  /** 动作类型 */
  type: TestActionType;
  /** 目标选择器 */
  target: string | null;
  /** 动作值 */
  value: string | null;
  /** 动作描述 */
  description: string;
  /** 元素信息 */
  elementInfo: ExplorationElementInfo | null;
}

/**
 * 探索元素信息
 */
export interface ExplorationElementInfo {
  /** 选择器 */
  selector: string;
  /** 标签 */
  tag: string;
  /** 文本 */
  text: string | null;
  /** 属性 */
  attributes: Record<string, string>;
  /** 是否可交互 */
  interactive: boolean;
  /** 是否已访问 */
  visited: boolean;
}

/**
 * 探索异常
 */
export interface ExplorationAnomaly {
  /** 异常 ID */
  id: string;
  /** 异常类型 */
  type: AnomalyType;
  /** 严重级别 */
  severity: 'critical' | 'high' | 'medium' | 'low';
  /** 发生步骤 */
  stepOrder: number;
  /** 页面 URL */
  pageUrl: string;
  /** 描述 */
  description: string;
  /** 错误消息 */
  errorMessage: string | null;
  /** 堆栈 */
  stackTrace: string | null;
  /** 截图路径 */
  screenshotPath: string | null;
  /** 控制台日志 */
  consoleLogs: string[];
  /** 网络错误 */
  networkErrors: NetworkError[];
  /** 时间戳 */
  timestamp: string;
  /** 是否已生成回归用例 */
  regressionCaseGenerated: boolean;
  /** 回归用例 ID */
  regressionCaseId: string | null;
}

/**
 * 异常类型
 */
export type AnomalyType =
  | 'crash'              // 崩溃
  | 'js-error'           // JS 错误
  | 'console-error'      // 控制台错误
  | 'network-error'      // 网络错误
  | 'http-500'           // HTTP 500
  | 'http-404'           // HTTP 404
  | 'timeout'            // 超时
  | 'element-not-found'  // 元素未找到
  | 'unexpected-popup'   // 意外弹窗
  | 'permission-denied'  // 权限拒绝
  | 'assertion-failed'   // 断言失败
  | 'visual-anomaly';    // 视觉异常

/**
 * 网络错误
 */
export interface NetworkError {
  /** URL */
  url: string;
  /** HTTP 状态码 */
  statusCode: number | null;
  /** 错误消息 */
  errorMessage: string;
  /** 请求方法 */
  method: string;
  /** 时间戳 */
  timestamp: string;
}

/**
 * 探索状态
 */
export type ExplorationStatus =
  | 'running'     // 运行中
  | 'completed'   // 已完成
  | 'stopped'     // 已停止
  | 'error';      // 错误

/**
 * 探索奖励配置
 */
export interface ExplorationRewardConfig {
  /** 新状态奖励 */
  newStateReward: number;
  /** 异常发现奖励 */
  anomalyReward: number;
  /** 崩溃发现奖励 */
  crashReward: number;
  /** 控制台错误奖励 */
  consoleErrorReward: number;
  /** 网络错误奖励 */
  networkErrorReward: number;
  /** HTTP 500 奖励 */
  http500Reward: number;
  /** 重复状态惩罚 */
  repeatStatePenalty: number;
  /** 无效动作惩罚 */
  invalidActionPenalty: number;
}

/**
 * 默认探索奖励配置
 */
export const DEFAULT_EXPLORATION_REWARD_CONFIG: ExplorationRewardConfig = {
  newStateReward: 10,
  anomalyReward: 50,
  crashReward: 100,
  consoleErrorReward: 20,
  networkErrorReward: 30,
  http500Reward: 40,
  repeatStatePenalty: -1,
  invalidActionPenalty: -5,
};

/**
 * 探索报告
 */
export interface ExplorationReport {
  /** 报告 ID */
  id: string;
  /** 轨迹 ID */
  trajectoryId: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 探索摘要 */
  summary: ExplorationSummary;
  /** 发现的异常 */
  anomalies: ExplorationAnomaly[];
  /** 发现的新状态 */
  newStates: StateNode[];
  /** 自动生成的回归用例 */
  generatedCases: GeneratedTestCase[];
  /** 开始时间 */
  startedAt: string;
  /** 结束时间 */
  endedAt: string;
}

/**
 * 探索摘要
 */
export interface ExplorationSummary {
  /** 总步数 */
  totalSteps: number;
  /** 发现的新状态数 */
  newStatesCount: number;
  /** 发现的异常数 */
  anomaliesCount: number;
  /** 按严重级别统计异常 */
  anomaliesBySeverity: Record<'critical' | 'high' | 'medium' | 'low', number>;
  /** 按类型统计异常 */
  anomaliesByType: Record<AnomalyType, number>;
  /** 总奖励 */
  totalReward: number;
  /** 平均奖励 */
  avgReward: number;
  /** 覆盖的状态数 */
  coveredStatesCount: number;
  /** 生成的回归用例数 */
  generatedCasesCount: number;
}

/**
 * 自动生成的测试用例
 */
export interface GeneratedTestCase {
  /** 用例 ID */
  caseId: string;
  /** 用例名称 */
  caseName: string;
  /** 描述 */
  description: string;
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  /** 触发异常 */
  anomalyId: string;
  /** 重现步骤 */
  reproduceSteps: ExplorationAction[];
  /** 预期结果 */
  expectedResult: string;
  /** 创建时间 */
  createdAt: string;
}
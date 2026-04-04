/**
 * Worker 并发执行相关类型定义
 */

import type { TestCase, TestStatus } from './test-case.types.js';
import type { TestCaseResult } from './test-result.types.js';

/**
 * Worker 消息类型
 */
export type WorkerMessageType =
  | 'run-test'        // 运行测试
  | 'shutdown'        // 关闭 Worker
  | 'test-complete'   // 测试完成
  | 'test-progress'   // 测试进度
  | 'screenshot'      // 截图
  | 'error'           // 错误
  | 'log'             // 日志
  | 'ready'           // Worker 就绪
  | 'heartbeat';      // 心跳

/**
 * Worker 消息
 */
export interface WorkerMessage {
  /** 消息类型 */
  type: WorkerMessageType;
  /** Worker ID */
  workerId: string;
  /** 消息 ID */
  messageId: string;
  /** 时间戳 */
  timestamp: string;
  /** 消息数据 */
  data: unknown;
}

/**
 * 运行测试消息
 */
export interface RunTestMessage {
  /** 测试用例 */
  testCase: TestCase;
  /** 运行配置 */
  config: WorkerTestConfig;
  /** 超时时间（ms） */
  timeout: number;
  /** 重试次数 */
  retryCount: number;
  /** Worker ID */
  workerId: string;
  /** 任务 ID */
  taskId: string;
}

/**
 * Worker 测试配置
 */
export interface WorkerTestConfig {
  /** 平台 */
  platform: 'pc-web' | 'h5-web' | 'android-app';
  /** 浏览器 */
  browser: 'chromium' | 'firefox' | 'webkit';
  /** 视口 */
  viewport?: {
    width: number;
    height: number;
  };
  /** 设备（H5） */
  device?: string;
  /** 基础 URL */
  baseUrl?: string;
  /** 截图目录 */
  screenshotDir: string;
  /** 失败时截图 */
  screenshotOnFailure: boolean;
  /** 失败时录屏 */
  videoOnFailure: boolean;
  /** 是否无头模式 */
  headless: boolean;
}

/**
 * 测试完成消息
 */
export interface TestCompleteMessage {
  /** Worker ID */
  workerId: string;
  /** 任务 ID */
  taskId: string;
  /** 测试结果 */
  result: TestCaseResult;
  /** 耗时（ms） */
  durationMs: number;
  /** 重试次数 */
  retryCount: number;
}

/**
 * 测试进度消息
 */
export interface TestProgressMessage {
  /** Worker ID */
  workerId: string;
  /** 任务 ID */
  taskId: string;
  /** 当前步骤 */
  currentStep: number;
  /** 总步骤 */
  totalSteps: number;
  /** 步骤描述 */
  stepDescription: string;
  /** 步骤状态 */
  stepStatus: TestStatus;
}

/**
 * Worker 错误消息
 */
export interface WorkerErrorMessage {
  /** Worker ID */
  workerId: string;
  /** 任务 ID */
  taskId: string | null;
  /** 错误类型 */
  errorType: WorkerErrorType;
  /** 错误消息 */
  errorMessage: string;
  /** 错误堆栈 */
  errorStack?: string;
  /** 是否可恢复 */
  recoverable: boolean;
}

/**
 * Worker 错误类型
 */
export type WorkerErrorType =
  | 'browser_launch_failed'
  | 'page_crash'
  | 'timeout'
  | 'memory_limit'
  | 'unexpected_error'
  | 'task_validation_failed';

/**
 * Worker 任务
 */
export interface WorkerTask {
  /** 任务 ID */
  taskId: string;
  /** 测试用例 */
  testCase: TestCase;
  /** 优先级 */
  priority: number;
  /** 分配的 Worker ID */
  assignedWorkerId: string | null;
  /** 状态 */
  status: WorkerTaskStatus;
  /** 重试次数 */
  retryCount: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 创建时间 */
  createdAt: string;
  /** 开始时间 */
  startedAt: string | null;
  /** 完成时间 */
  completedAt: string | null;
}

/**
 * Worker 任务状态
 */
export type WorkerTaskStatus =
  | 'pending'      // 待处理
  | 'assigned'     // 已分配
  | 'running'      // 运行中
  | 'completed'    // 已完成
  | 'failed'       // 失败
  | 'timeout';     // 超时

/**
 * Worker 信息
 */
export interface WorkerInfo {
  /** Worker ID */
  workerId: string;
  /** 状态 */
  status: WorkerStatus;
  /** 当前任务 ID */
  currentTaskId: string | null;
  /** 已完成任务数 */
  completedTasks: number;
  /** 失败任务数 */
  failedTasks: number;
  /** 启动时间 */
  startedAt: string;
  /** 最后心跳时间 */
  lastHeartbeat: string;
  /** 进程 PID */
  pid: number | null;
}

/**
 * Worker 状态
 */
export type WorkerStatus =
  | 'idle'         // 空闲
  | 'busy'         // 忙碌
  | 'error'        // 错误
  | 'shutting-down' // 关闭中
  | 'terminated';  // 已终止

/**
 * Worker Pool 配置
 */
export interface WorkerPoolConfig {
  /** 最小 Worker 数 */
  minWorkers: number;
  /** 最大 Worker 数 */
  maxWorkers: number;
  /** 任务超时（ms） */
  taskTimeout: number;
  /** Worker 空闲超时（ms） */
  idleTimeout: number;
  /** 心跳间隔（ms） */
  heartbeatInterval: number;
  /** 最大重试次数 */
  maxRetries: number;
  /** 任务队列大小 */
  taskQueueSize: number;
  /** 是否启用任务优先级 */
  enablePriority: boolean;
}

/**
 * 默认 Worker Pool 配置
 */
export const DEFAULT_WORKER_POOL_CONFIG: WorkerPoolConfig = {
  minWorkers: 1,
  maxWorkers: 4,
  taskTimeout: 300000, // 5 分钟
  idleTimeout: 60000,  // 1 分钟
  heartbeatInterval: 5000,
  maxRetries: 2,
  taskQueueSize: 100,
  enablePriority: true,
};

/**
 * 并发执行结果
 */
export interface ParallelRunResult {
  /** 运行 ID */
  runId: string;
  /** 总用例数 */
  totalCases: number;
  /** 完成用例数 */
  completedCases: number;
  /** 通过用例数 */
  passedCases: number;
  /** 失败用例数 */
  failedCases: number;
  /** 超时用例数 */
  timeoutCases: number;
  /** 所有测试结果 */
  results: TestCaseResult[];
  /** 总耗时（ms） */
  totalDurationMs: number;
  /** 平均耗时（ms） */
  avgDurationMs: number;
  /** Worker 统计 */
  workerStats: WorkerStats[];
  /** 并行效率 */
  parallelEfficiency: number;
}

/**
 * Worker 统计
 */
export interface WorkerStats {
  /** Worker ID */
  workerId: string;
  /** 完成任务数 */
  completedTasks: number;
  /** 失败任务数 */
  failedTasks: number;
  /** 总工作时间（ms） */
  totalWorkTime: number;
  /** 空闲时间（ms） */
  idleTime: number;
  /** 平均任务耗时（ms） */
  avgTaskDuration: number;
}

/**
 * 任务调度器
 */
export interface TaskScheduler {
  /** 添加任务 */
  addTask: (task: WorkerTask) => void;
  /** 获取下一个任务 */
  getNextTask: (workerId: string) => WorkerTask | null;
  /** 任务完成 */
  completeTask: (taskId: string, result: TestCaseResult) => void;
  /** 任务失败 */
  failTask: (taskId: string, error: Error) => void;
  /** 获取待处理任务数 */
  getPendingCount: () => number;
  /** 获取运行中任务数 */
  getRunningCount: () => number;
}
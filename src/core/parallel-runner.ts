/**
 * 并发执行器
 * 管理 Worker 池、任务调度、并发执行测试用例
 */

import { EventEmitter } from 'node:events';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { logger } from '@/core/logger.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';
import { nanoid } from 'nanoid';
import type {
  WorkerPoolConfig,
  DEFAULT_WORKER_POOL_CONFIG,
  WorkerTask,
  WorkerTaskStatus,
  WorkerInfo,
  WorkerStatus,
  WorkerMessage,
  WorkerMessageType,
  WorkerTestConfig,
  TestCompleteMessage,
  WorkerErrorMessage,
  ParallelRunResult,
  WorkerStats,
} from '@/types/worker.types.js';
import type { TestCase, TestCaseResult } from '@/types/index.js';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: WorkerPoolConfig = {
  minWorkers: 1,
  maxWorkers: 4,
  taskTimeout: 300000,
  idleTimeout: 60000,
  heartbeatInterval: 5000,
  maxRetries: 2,
  taskQueueSize: 100,
  enablePriority: true,
};

/**
 * 并发执行器
 */
export class ParallelRunner extends EventEmitter {
  private config: WorkerPoolConfig;
  private workers: Map<string, WorkerInfo> = new Map();
  private workerProcesses: Map<string, Worker> = new Map();
  private taskQueue: WorkerTask[] = [];
  private runningTasks: Map<string, WorkerTask> = new Map();
  private completedResults: Map<string, TestCaseResult> = new Map();
  private runId: string = '';
  private startTime: number = 0;
  private isShuttingDown: boolean = false;
  private testConfig: WorkerTestConfig | null = null;

  constructor(config: Partial<WorkerPoolConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 运行测试用例并发执行
   */
  async run(
    testCases: TestCase[],
    config: WorkerTestConfig,
    options?: {
      runId?: string;
    },
  ): Promise<ParallelRunResult> {
    this.runId = options?.runId || nanoid(8);
    this.startTime = Date.now();
    this.testConfig = config;
    this.completedResults = new Map();

    logger.info(`🚀 启动并发测试执行`, {
      totalCases: testCases.length,
      maxWorkers: this.config.maxWorkers,
      runId: this.runId,
    });

    // 发送并发开始事件
    eventBus.emitSafe(TestEventType.PARALLEL_START, {
      runId: this.runId,
      workerCount: this.config.maxWorkers,
      totalCases: testCases.length,
    });

    // 创建任务
    const tasks = this.createTasks(testCases);
    this.taskQueue = [...tasks];

    // 启动 Worker 池
    await this.startWorkers();

    // 等待所有任务完成
    await this.waitForCompletion();

    // 收集结果
    const results = Array.from(this.completedResults.values());

    // 关闭 Worker 池
    await this.shutdown();

    // 计算统计
    const result = this.buildResult(results);

    // 发送并发完成事件
    eventBus.emitSafe(TestEventType.PARALLEL_COMPLETE, {
      runId: this.runId,
      passed: result.passedCases,
      failed: result.failedCases,
      totalDurationMs: result.totalDurationMs,
      parallelEfficiency: result.parallelEfficiency,
    });

    logger.pass(`✅ 并发测试执行完成`, {
      totalCases: result.totalCases,
      passed: result.passedCases,
      failed: result.failedCases,
      duration: `${(result.totalDurationMs / 1000).toFixed(2)}s`,
    });

    return result;
  }

  /**
   * 创建任务
   */
  private createTasks(testCases: TestCase[]): WorkerTask[] {
    return testCases.map((testCase, index) => ({
      taskId: `task-${this.runId}-${index}`,
      testCase,
      priority: this.getPriority(testCase),
      assignedWorkerId: null,
      status: 'pending' as WorkerTaskStatus,
      retryCount: 0,
      maxRetries: this.config.maxRetries,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    }));
  }

  /**
   * 获取用例优先级
   */
  private getPriority(testCase: TestCase): number {
    switch (testCase.priority) {
      case 'P0': return 100;
      case 'P1': return 75;
      case 'P2': return 50;
      case 'P3': return 25;
      default: return 50;
    }
  }

  /**
   * 启动 Worker 池
   */
  private async startWorkers(): Promise<void> {
    const workerCount = Math.min(this.config.maxWorkers, this.taskQueue.length);

    logger.step(`🔧 启动 ${workerCount} 个 Worker`);

    for (let i = 0; i < workerCount; i++) {
      await this.spawnWorker(i);
    }
  }

  /**
   * 创建单个 Worker
   */
  private async spawnWorker(index: number): Promise<void> {
    const workerId = `worker-${this.runId}-${index}`;

    // 获取 worker 脚本路径
    const workerPath = this.getWorkerPath();

    const worker = new Worker(workerPath, {
      workerData: {
        workerId,
        config: this.testConfig,
      },
    });

    const workerInfo: WorkerInfo = {
      workerId,
      status: 'idle',
      currentTaskId: null,
      completedTasks: 0,
      failedTasks: 0,
      startedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      pid: null,
    };

    this.workers.set(workerId, workerInfo);
    this.workerProcesses.set(workerId, worker);

    // 设置消息处理
    worker.on('message', (message: WorkerMessage) => {
      this.handleWorkerMessage(workerId, message);
    });

    worker.on('error', (error: Error) => {
      this.handleWorkerError(workerId, error);
    });

    worker.on('exit', (code: number) => {
      this.handleWorkerExit(workerId, code);
    });

    // 发送 Worker 启动事件
    eventBus.emitSafe(TestEventType.WORKER_LAUNCH, {
      workerId,
      workerIndex: index,
      pid: worker.threadId,
    });

    logger.info(`👤 Worker 已启动: ${workerId}`);
  }

  /**
   * 获取 Worker 脚本路径
   * 支持开发模式（tsx）和生产模式（编译后的 JS）
   */
  private getWorkerPath(): string {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));

    // 优先使用编译后的 JS 文件
    const jsPath = path.join(currentDir, 'workers', 'test-worker.js');
    const tsPath = path.join(currentDir, 'workers', 'test-worker.ts');

    // 检查是否存在编译后的 JS 文件
    try {
      // 同步检查文件是否存在（使用顶层导入的 fs 模块）
      if (fs.existsSync(jsPath)) {
        return jsPath;
      }
    } catch {
      // 忽略错误
    }

    // 开发模式：返回 TS 文件路径（需要 tsx 或 ts-node 支持）
    // 注意：Node.js Worker 原生不支持 TS，需要通过 tsx 等工具启动
    logger.warn('⚠️ 未找到编译后的 Worker 文件，请确保已运行 npm run build');
    logger.info(`💡 Worker 路径: ${jsPath} 或 ${tsPath}`);

    return jsPath;
  }

  /**
   * 处理 Worker 消息
   */
  private handleWorkerMessage(workerId: string, message: WorkerMessage): void {
    const workerInfo = this.workers.get(workerId);
    if (!workerInfo) return;

    workerInfo.lastHeartbeat = new Date().toISOString();

    switch (message.type) {
      case 'ready':
        logger.info(`✅ Worker 就绪: ${workerId}`);
        this.assignTask(workerId);
        break;

      case 'test-complete':
        this.handleTestComplete(workerId, message.data as TestCompleteMessage);
        break;

      case 'error':
        this.handleWorkerErrorMessage(workerId, message.data as WorkerErrorMessage);
        break;

      case 'heartbeat':
        // 心跳更新已在上面处理
        break;

      default:
        logger.debug(`收到 Worker 消息: ${message.type}`);
    }

    // 发送 Worker 消息事件
    eventBus.emitSafe(TestEventType.WORKER_MESSAGE, {
      workerId,
      messageType: message.type,
      taskId: message.messageId,
    });
  }

  /**
   * 处理测试完成
   */
  private handleTestComplete(workerId: string, data: TestCompleteMessage): void {
    const { taskId, result } = data;
    const task = this.runningTasks.get(taskId);

    if (task) {
      task.status = 'completed';
      task.completedAt = new Date().toISOString();
      this.runningTasks.delete(taskId);

      // 保存结果
      this.completedResults.set(taskId, result);

      // 更新 Worker 统计
      const workerInfo = this.workers.get(workerId);
      if (workerInfo) {
        workerInfo.status = 'idle';
        workerInfo.currentTaskId = null;
        workerInfo.completedTasks++;
      }

      logger.pass(`✅ 测试完成: ${result.caseName} (${workerId})`);
    }

    // 分配下一个任务
    this.assignTask(workerId);
  }

  /**
   * 处理 Worker 错误消息
   */
  private handleWorkerErrorMessage(workerId: string, data: WorkerErrorMessage): void {
    const { taskId, errorType, errorMessage, recoverable } = data;
    logger.error(`❌ Worker 错误 (${workerId}): ${errorType} - ${errorMessage}`);

    // 发送 Worker 错误事件
    eventBus.emitSafe(TestEventType.WORKER_ERROR, {
      workerId,
      error: new Error(errorMessage),
      taskId: taskId || undefined,
    });

    if (taskId) {
      const task = this.runningTasks.get(taskId);
      if (task) {
        if (recoverable && task.retryCount < task.maxRetries) {
          // 重试任务
          task.retryCount++;
          task.status = 'pending';
          task.assignedWorkerId = null;
          task.startedAt = null;
          this.runningTasks.delete(taskId);
          this.taskQueue.unshift(task);
          logger.warn(`⚠️ 任务重试: ${task.testCase.name} (第 ${task.retryCount} 次)`);
        } else {
          // 任务失败
          task.status = 'failed';
          task.completedAt = new Date().toISOString();
          this.runningTasks.delete(taskId);

          // 创建失败结果
          const failedResult: TestCaseResult = {
            caseId: task.testCase.id,
            caseName: task.testCase.name,
            status: 'failed',
            startTime: task.startedAt || new Date().toISOString(),
            endTime: new Date().toISOString(),
            durationMs: 0,
            platform: 'pc-web',
            environment: {},
            steps: [],
            retryCount: task.retryCount,
            selfHealed: false,
            artifacts: {
              screenshots: [],
              logs: [errorMessage],
            },
          };
          this.completedResults.set(taskId, failedResult);

          const workerInfo = this.workers.get(workerId);
          if (workerInfo) {
            workerInfo.status = 'idle';
            workerInfo.currentTaskId = null;
            workerInfo.failedTasks++;
          }
        }
      }
    }

    // 分配下一个任务
    const workerInfo = this.workers.get(workerId);
    if (workerInfo && workerInfo.status !== 'error') {
      this.assignTask(workerId);
    }
  }

  /**
   * 处理 Worker 错误
   */
  private handleWorkerError(workerId: string, error: Error): void {
    logger.error(`❌ Worker 进程错误 (${workerId}): ${error.message}`);

    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.status = 'error';
    }

    // 重新分配该 Worker 的任务
    this.reassignWorkerTasks(workerId);
  }

  /**
   * 处理 Worker 退出
   */
  private handleWorkerExit(workerId: string, code: number): void {
    logger.info(`🔚 Worker 退出: ${workerId} (code: ${code})`);

    const workerInfo = this.workers.get(workerId);
    if (workerInfo) {
      workerInfo.status = code === 0 ? 'terminated' : 'error';
    }

    // 重新分配任务
    if (code !== 0) {
      this.reassignWorkerTasks(workerId);
    }

    // 清理
    this.workerProcesses.delete(workerId);
  }

  /**
   * 重新分配 Worker 的任务
   */
  private reassignWorkerTasks(workerId: string): void {
    for (const [taskId, task] of this.runningTasks) {
      if (task.assignedWorkerId === workerId) {
        task.status = 'pending';
        task.assignedWorkerId = null;
        task.startedAt = null;
        this.runningTasks.delete(taskId);
        this.taskQueue.unshift(task);
        logger.warn(`⚠️ 任务重新分配: ${task.testCase.name}`);
      }
    }
  }

  /**
   * 分配任务给 Worker
   */
  private assignTask(workerId: string): void {
    if (this.isShuttingDown) return;
    if (this.taskQueue.length === 0) return;

    const workerInfo = this.workers.get(workerId);
    if (!workerInfo || workerInfo.status !== 'idle') return;

    // 获取下一个任务
    const task = this.getNextTask();
    if (!task) return;

    // 分配任务
    task.status = 'running';
    task.assignedWorkerId = workerId;
    task.startedAt = new Date().toISOString();
    this.runningTasks.set(task.taskId, task);

    workerInfo.status = 'busy';
    workerInfo.currentTaskId = task.taskId;

    // 发送任务给 Worker
    const worker = this.workerProcesses.get(workerId);
    if (worker) {
      worker.postMessage({
        type: 'run-test',
        taskId: task.taskId,
        testCase: task.testCase,
        config: this.testConfig,
        timeout: this.config.taskTimeout,
      });
    }

    logger.step(`📍 分配任务: ${task.testCase.name} → ${workerId}`);
  }

  /**
   * 获取下一个任务
   */
  private getNextTask(): WorkerTask | null {
    if (this.taskQueue.length === 0) return null;

    if (this.config.enablePriority) {
      // 按优先级排序
      this.taskQueue.sort((a, b) => b.priority - a.priority);
    }

    return this.taskQueue.shift() || null;
  }

  /**
   * 等待所有任务完成
   */
  private async waitForCompletion(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.taskQueue.length === 0 && this.runningTasks.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);

      // 设置超时
      const timeout = setTimeout(() => {
        clearInterval(checkInterval);
        logger.warn('⚠️ 并发执行超时，强制结束');
        resolve();
      }, this.config.taskTimeout * 2);
    });
  }

  /**
   * 关闭 Worker 池
   */
  async shutdown(): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info('🛑 关闭 Worker 池');

    const shutdownPromises: Promise<void>[] = [];

    for (const [workerId, worker] of this.workerProcesses) {
      const workerInfo = this.workers.get(workerId);
      if (workerInfo) {
        workerInfo.status = 'shutting-down';

        // 发送关闭事件
        eventBus.emitSafe(TestEventType.WORKER_SHUTDOWN, {
          workerId,
          completedTasks: workerInfo.completedTasks,
          failedTasks: workerInfo.failedTasks,
        });
      }

      // 发送关闭消息
      try {
        worker.postMessage({ type: 'shutdown' });
      } catch {
        // 如果发送失败，直接终止
      }

      // 等待 Worker 退出（带强制终止机制）
      const promise = new Promise<void>((resolve) => {
        // 第一阶段：等待5秒让Worker优雅退出
        const gracefulTimeout = setTimeout(() => {
          logger.warn(`⚠️ Worker ${workerId} 优雅退出超时，尝试强制终止`);
          try {
            worker.terminate();
          } catch {
            // 忽略终止错误
          }
        }, 5000);

        // 第二阶段：如果terminate后仍不退出，再等3秒后强制kill
        const forceKillTimeout = setTimeout(() => {
          logger.warn(`⚠️ Worker ${workerId} 未响应terminate，可能已成为僵尸进程`);
          // 注意：Worker线程无法直接发送SIGKILL，只能依赖terminate
          // 但我们可以记录日志并继续，避免阻塞整个关闭流程
          resolve();
        }, 8000);

        worker.on('exit', () => {
          clearTimeout(gracefulTimeout);
          clearTimeout(forceKillTimeout);
          resolve();
        });

        worker.on('error', (error) => {
          clearTimeout(gracefulTimeout);
          clearTimeout(forceKillTimeout);
          logger.warn(`⚠️ Worker ${workerId} 发生错误: ${error}`);
          try {
            worker.terminate();
          } catch {
            // 忽略终止错误
          }
          resolve();
        });
      });

      shutdownPromises.push(promise);
    }

    // 等待所有 Worker 关闭
    await Promise.allSettled(shutdownPromises);

    // 清理状态
    this.workers.clear();
    this.workerProcesses.clear();
    this.taskQueue = [];
    this.runningTasks.clear();

    logger.pass('✅ Worker 池已关闭');
  }

  /**
   * 构建结果
   */
  private buildResult(results: TestCaseResult[]): ParallelRunResult {
    const totalDurationMs = Date.now() - this.startTime;
    const passedCases = results.filter(r => r.status === 'passed').length;
    const failedCases = results.filter(r => r.status === 'failed').length;
    const timeoutCases = results.filter(r => r.status === 'failed' && r.artifacts.logs.some(l => l.includes('timeout'))).length;

    // 计算 Worker 统计
    const workerStats: WorkerStats[] = [];
    for (const [workerId, info] of this.workers) {
      workerStats.push({
        workerId,
        completedTasks: info.completedTasks,
        failedTasks: info.failedTasks,
        totalWorkTime: 0, // 简化计算
        idleTime: 0,
        avgTaskDuration: 0,
      });
    }

    // 计算并行效率
    const avgDurationMs = results.length > 0
      ? results.reduce((sum, r) => sum + r.durationMs, 0) / results.length
      : 0;
    const serialDuration = results.reduce((sum, r) => sum + r.durationMs, 0);
    const parallelEfficiency = totalDurationMs > 0
      ? (serialDuration / (totalDurationMs * this.config.maxWorkers)) * 100
      : 0;

    return {
      runId: this.runId,
      totalCases: results.length,
      completedCases: results.length,
      passedCases,
      failedCases,
      timeoutCases,
      results,
      totalDurationMs,
      avgDurationMs,
      workerStats,
      parallelEfficiency: Math.min(100, parallelEfficiency),
    };
  }
}

/**
 * 快捷创建并发执行器
 */
export function createParallelRunner(
  config?: Partial<WorkerPoolConfig>,
): ParallelRunner {
  return new ParallelRunner(config);
}
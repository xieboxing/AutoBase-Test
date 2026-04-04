/**
 * 测试 Worker
 * 在独立线程中执行测试用例
 */

import { parentPort, workerData, isMainThread } from 'node:worker_threads';
import { PcTester } from '@/testers/web/pc-tester.js';
import { H5Tester } from '@/testers/web/h5-tester.js';
import type { TestCase, TestCaseResult } from '@/types/index.js';
import type {
  WorkerTestConfig,
  WorkerMessage,
  TestCompleteMessage,
  TestProgressMessage,
  WorkerErrorMessage,
} from '@/types/worker.types.js';
import { nanoid } from 'nanoid';

if (isMainThread) {
  // 不应该在主线程运行
  process.exit(1);
}

interface WorkerData {
  workerId: string;
  config: WorkerTestConfig;
}

const data = workerData as WorkerData;
const { workerId, config } = data;

/**
 * 发送消息到主线程
 */
function sendMessage(message: Omit<WorkerMessage, 'workerId' | 'messageId' | 'timestamp'>): void {
  parentPort?.postMessage({
    ...message,
    workerId,
    messageId: nanoid(8),
    timestamp: new Date().toISOString(),
  });
}

/**
 * 发送就绪信号
 */
function sendReady(): void {
  sendMessage({ type: 'ready', data: { workerId } });
}

/**
 * 发送测试完成消息
 */
function sendTestComplete(taskId: string, result: TestCaseResult, durationMs: number, retryCount: number): void {
  const data: TestCompleteMessage = {
    workerId,
    taskId,
    result,
    durationMs,
    retryCount,
  };
  sendMessage({ type: 'test-complete', data });
}

/**
 * 发送测试进度消息
 */
function sendProgress(taskId: string, currentStep: number, totalSteps: number, description: string, status: 'passed' | 'failed'): void {
  const data: TestProgressMessage = {
    workerId,
    taskId,
    currentStep,
    totalSteps,
    stepDescription: description,
    stepStatus: status,
  };
  sendMessage({ type: 'test-progress', data });
}

/**
 * 发送错误消息
 */
function sendError(taskId: string | null, errorType: WorkerErrorMessage['errorType'], error: Error, recoverable: boolean): void {
  const data: WorkerErrorMessage = {
    workerId,
    taskId,
    errorType,
    errorMessage: error.message,
    errorStack: error.stack,
    recoverable,
  };
  sendMessage({ type: 'error', data });
}

/**
 * 发送心跳
 */
function sendHeartbeat(): void {
  sendMessage({ type: 'heartbeat', data: { workerId } });
}

/**
 * 执行测试
 */
async function runTest(testCase: TestCase, config: WorkerTestConfig): Promise<TestCaseResult> {
  const startTime = Date.now();

  try {
    let tester: PcTester | H5Tester;

    if (config.platform === 'h5-web') {
      tester = new H5Tester({
        browser: config.browser,
        device: config.device || 'iPhone 14',
        headless: config.headless,
        timeout: 30000,
        screenshotOnFailure: config.screenshotOnFailure,
        videoOnFailure: config.videoOnFailure,
        artifactsDir: config.screenshotDir,
        baseUrl: config.baseUrl,
      });
    } else {
      tester = new PcTester({
        browser: config.browser,
        viewport: config.viewport || { width: 1920, height: 1080 },
        headless: config.headless,
        timeout: 30000,
        screenshotOnFailure: config.screenshotOnFailure,
        videoOnFailure: config.videoOnFailure,
        artifactsDir: config.screenshotDir,
        baseUrl: config.baseUrl,
      });
    }

    try {
      const result = await tester.runTest(testCase);
      return result;
    } finally {
      await tester.close();
    }
  } catch (error) {
    // 返回失败结果
    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status: 'failed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      platform: config.platform,
      environment: {},
      steps: [],
      retryCount: 0,
      selfHealed: false,
      artifacts: {
        screenshots: [],
        logs: [error instanceof Error ? error.message : String(error)],
      },
    };
  }
}

// 监听主线程消息
parentPort?.on('message', async (message: {
  type: string;
  taskId: string;
  testCase: TestCase;
  config: WorkerTestConfig;
  timeout: number;
}) => {
  const { type, taskId, testCase, config: taskConfig, timeout } = message;

  switch (type) {
    case 'run-test':
      try {
        // 设置超时
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Test timeout')), timeout);
        });

        const result = await Promise.race([
          runTest(testCase, taskConfig),
          timeoutPromise,
        ]);

        sendTestComplete(taskId, result, result.durationMs, 0);
      } catch (error) {
        sendError(
          taskId,
          error instanceof Error && error.message === 'Test timeout' ? 'timeout' : 'unexpected_error',
          error instanceof Error ? error : new Error(String(error)),
          true
        );
      }
      break;

    case 'shutdown':
      // 清理心跳interval后再退出，避免僵尸进程
      clearInterval(heartbeatInterval);
      process.exit(0);
      break;

    default:
      sendError(null, 'task_validation_failed', new Error(`Unknown message type: ${type}`), false);
  }
});

// 启动心跳（保存interval引用以便清理）
const heartbeatInterval = setInterval(sendHeartbeat, 5000);

// 发送就绪信号
sendReady();
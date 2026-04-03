import { EventEmitter } from 'node:events';

/**
 * 预定义事件类型
 */
export enum TestEventType {
  // 测试生命周期事件
  TEST_START = 'test:start',
  TEST_STEP = 'test:step',
  TEST_PASS = 'test:pass',
  TEST_FAIL = 'test:fail',
  TEST_COMPLETE = 'test:complete',
  TEST_RETRY = 'test:retry',
  TEST_SKIP = 'test:skip',

  // 运行生命周期事件
  RUN_START = 'run:start',
  RUN_COMPLETE = 'run:complete',
  RUN_ERROR = 'run:error',

  // AI 相关事件
  AI_ANALYZING = 'ai:analyzing',
  AI_RESULT = 'ai:result',
  AI_ERROR = 'ai:error',
  AI_SELF_HEAL = 'ai:self-heal',

  // 报告事件
  REPORT_GENERATING = 'report:generating',
  REPORT_GENERATED = 'report:generated',

  // 爬虫事件
  CRAWLER_START = 'crawler:start',
  CRAWLER_PAGE = 'crawler:page',
  CRAWLER_COMPLETE = 'crawler:complete',
  CRAWLER_ERROR = 'crawler:error',

  // 设备事件
  DEVICE_CONNECTED = 'device:connected',
  DEVICE_DISCONNECTED = 'device:disconnected',
  BROWSER_LAUNCH = 'browser:launch',
  BROWSER_CLOSE = 'browser:close',
}

/**
 * 事件数据类型映射
 */
export interface TestEventMap {
  [TestEventType.TEST_START]: { caseId: string; caseName: string; platform: string };
  [TestEventType.TEST_STEP]: { caseId: string; step: number; action: string; target?: string };
  [TestEventType.TEST_PASS]: { caseId: string; step: number; durationMs: number };
  [TestEventType.TEST_FAIL]: { caseId: string; step: number; error: Error; screenshot?: string };
  [TestEventType.TEST_COMPLETE]: { caseId: string; status: string; durationMs: number };
  [TestEventType.TEST_RETRY]: { caseId: string; retryCount: number; reason: string };
  [TestEventType.TEST_SKIP]: { caseId: string; reason: string };

  [TestEventType.RUN_START]: { runId: string; project: string; totalCases: number };
  [TestEventType.RUN_COMPLETE]: { runId: string; summary: { passed: number; failed: number; total: number } };
  [TestEventType.RUN_ERROR]: { runId: string; error: Error };

  [TestEventType.AI_ANALYZING]: { type: string; input: unknown };
  [TestEventType.AI_RESULT]: { type: string; result: unknown; tokensUsed?: number };
  [TestEventType.AI_ERROR]: { type: string; error: Error };
  [TestEventType.AI_SELF_HEAL]: { caseId: string; originalSelector: string; newSelector: string };

  [TestEventType.REPORT_GENERATING]: { runId: string; format: string };
  [TestEventType.REPORT_GENERATED]: { runId: string; format: string; path: string };

  [TestEventType.CRAWLER_START]: { url: string; depth: number };
  [TestEventType.CRAWLER_PAGE]: { url: string; title: string; depth: number };
  [TestEventType.CRAWLER_COMPLETE]: { totalPages: number; durationMs: number };
  [TestEventType.CRAWLER_ERROR]: { url: string; error: Error };

  [TestEventType.DEVICE_CONNECTED]: { deviceId: string; name: string };
  [TestEventType.DEVICE_DISCONNECTED]: { deviceId: string };
  [TestEventType.BROWSER_LAUNCH]: { browser: string; headless: boolean };
  [TestEventType.BROWSER_CLOSE]: { browser: string };
}

/**
 * 类型安全的事件总线
 */
export class EventBus extends EventEmitter {
  /**
   * 发出类型安全的事件
   */
  emitSafe<K extends keyof TestEventMap>(
    event: K,
    data: TestEventMap[K],
  ): boolean {
    return this.emit(event, data);
  }

  /**
   * 添加类型安全的事件监听器
   */
  onSafe<K extends keyof TestEventMap>(
    event: K,
    listener: (data: TestEventMap[K]) => void,
  ): this {
    return this.on(event, listener as (...args: unknown[]) => void);
  }

  /**
   * 添加一次性类型安全的事件监听器
   */
  onceSafe<K extends keyof TestEventMap>(
    event: K,
    listener: (data: TestEventMap[K]) => void,
  ): this {
    return this.once(event, listener as (...args: unknown[]) => void);
  }

  /**
   * 移除类型安全的事件监听器
   */
  offSafe<K extends keyof TestEventMap>(
    event: K,
    listener: (data: TestEventMap[K]) => void,
  ): this {
    return this.off(event, listener as (...args: unknown[]) => void);
  }

  /**
   * 等待事件（Promise 版本）
   */
  waitFor<K extends keyof TestEventMap>(
    event: K,
    timeoutMs?: number,
  ): Promise<TestEventMap[K]> {
    return new Promise((resolve, reject) => {
      const timer = timeoutMs
        ? setTimeout(() => {
            reject(new Error(`等待事件 ${event} 超时 (${timeoutMs}ms)`));
          }, timeoutMs)
        : undefined;

      this.onceSafe(event, (data) => {
        if (timer) clearTimeout(timer);
        resolve(data);
      });
    });
  }
}

// 全局事件总线实例
export const eventBus = new EventBus();

// 导出便捷方法
export function emitTestStart(caseId: string, caseName: string, platform: string): void {
  eventBus.emitSafe(TestEventType.TEST_START, { caseId, caseName, platform });
}

export function emitTestPass(caseId: string, step: number, durationMs: number): void {
  eventBus.emitSafe(TestEventType.TEST_PASS, { caseId, step, durationMs });
}

export function emitTestFail(caseId: string, step: number, error: Error, screenshot?: string): void {
  eventBus.emitSafe(TestEventType.TEST_FAIL, { caseId, step, error, screenshot });
}

export function emitRunStart(runId: string, project: string, totalCases: number): void {
  eventBus.emitSafe(TestEventType.RUN_START, { runId, project, totalCases });
}

export function emitRunComplete(runId: string, summary: { passed: number; failed: number; total: number }): void {
  eventBus.emitSafe(TestEventType.RUN_COMPLETE, { runId, summary });
}
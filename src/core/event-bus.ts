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

  // ===== 新增：智能化升级相关事件 =====

  // 知识库事件
  KNOWLEDGE_LOADED = 'knowledge:loaded',
  KNOWLEDGE_SAVED = 'knowledge:saved',

  // 调度器事件
  SCHEDULER_DECISION = 'scheduler:decision',
  SCHEDULER_SKIP = 'scheduler:skip',
  SCHEDULER_PRIORITIZE = 'scheduler:prioritize',
  SCHEDULING_COMPLETE = 'scheduling:complete',

  // 失败模式事件
  FAILURE_PATTERN_MATCHED = 'failure:pattern-matched',
  FAILURE_PATTERN_CREATED = 'failure:pattern-created',
  AUTO_FIX_APPLIED = 'failure:auto-fix-applied',
  AUTO_FIX_SUCCESS = 'failure:auto-fix-success',
  AUTO_FIX_FAILED = 'failure:auto-fix-failed',

  // RAG 事件
  RAG_RETRIEVING = 'rag:retrieving',
  RAG_RETRIEVED = 'rag:retrieved',
  RAG_MEMORY_SAVED = 'rag:memory-saved',

  // 视觉回归事件
  VISUAL_BASELINE_CREATED = 'visual:baseline-created',
  VISUAL_DIFF = 'visual:diff',
  VISUAL_PASSED = 'visual:passed',
  VISUAL_FAILED = 'visual:failed',

  // 并发执行事件
  WORKER_LAUNCH = 'worker:launch',
  WORKER_MESSAGE = 'worker:message',
  WORKER_ERROR = 'worker:error',
  WORKER_SHUTDOWN = 'worker:shutdown',
  PARALLEL_START = 'parallel:start',
  PARALLEL_COMPLETE = 'parallel:complete',

  // 状态图谱事件
  STATE_GRAPH_NODE_CREATED = 'state-graph:node-created',
  STATE_GRAPH_EDGE_CREATED = 'state-graph:edge-created',
  STATE_GRAPH_TRANSITION = 'state-graph:transition',
  STATE_GRAPH_PATH_FOUND = 'state-graph:path-found',
  STATE_DISCOVERED = 'state:discovered',
  STATE_TRANSITION = 'state:transition',

  // 业务流事件
  BUSINESS_FLOW_DETECTED = 'business-flow:detected',
  BUSINESS_FLOW_ANALYZED = 'business-flow:analyzed',
  BUSINESS_FLOW_EXECUTED = 'business-flow:executed',

  // 探索式测试事件
  EXPLORATION_START = 'exploration:start',
  EXPLORATION_STEP = 'exploration:step',
  EXPLORATION_NEW_STATE = 'exploration:new-state',
  EXPLORATION_ANOMALY = 'exploration:anomaly',
  EXPLORATION_REWARD = 'exploration:reward',
  EXPLORATION_COMPLETE = 'exploration:complete',

  // 优化事件
  OPTIMIZATION_SUGGESTED = 'optimization:suggested',
  OPTIMIZATION_APPLIED = 'optimization:applied',
  OPTIMIZATION_VERIFIED = 'optimization:verified',
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

  // ===== 新增：智能化升级事件类型 =====

  // 知识库事件
  [TestEventType.KNOWLEDGE_LOADED]: {
    project: string;
    platform: string;
    passedCasesCount: number;
    failedCasesCount: number;
    stableCasesCount: number;
    highRiskCasesCount: number;
    loadTimeMs: number;
  };
  [TestEventType.KNOWLEDGE_SAVED]: {
    project: string;
    type: 'statistics' | 'pattern' | 'mapping' | 'optimization';
    id: string;
  };

  // 调度器事件
  [TestEventType.SCHEDULER_DECISION]: {
    caseId: string;
    decision: 'schedule' | 'skip' | 'defer';
    riskScore: number;
    reason: string;
  };
  [TestEventType.SCHEDULER_SKIP]: {
    caseId: string;
    reason: string;
    consecutivePasses: number;
  };
  [TestEventType.SCHEDULER_PRIORITIZE]: {
    caseId: string;
    order: number;
    riskScore: number;
  };
  [TestEventType.SCHEDULING_COMPLETE]: {
    projectId: string;
    platform: string;
    summary: {
      totalCases: number;
      scheduledCount: number;
      skippedCount: number;
      highRiskCount: number;
      avgRiskScore: number;
    };
    duration: number;
  };

  // 失败模式事件
  [TestEventType.FAILURE_PATTERN_MATCHED]: {
    patternId: string;
    patternType: string;
    frequency: number;
    autoFixable: boolean;
  };
  [TestEventType.FAILURE_PATTERN_CREATED]: {
    patternId: string;
    patternType: string;
    patternKey: string;
    description: string;
  };
  [TestEventType.AUTO_FIX_APPLIED]: {
    caseId: string;
    patternId: string;
    fixType: string;
    fixValue?: string | number;
  };
  [TestEventType.AUTO_FIX_SUCCESS]: {
    caseId: string;
    patternId: string;
    retryCount: number;
  };
  [TestEventType.AUTO_FIX_FAILED]: {
    caseId: string;
    patternId: string;
    error: Error;
    needsManualIntervention: boolean;
  };

  // RAG 事件
  [TestEventType.RAG_RETRIEVING]: {
    queryType: string;
    projectId: string;
    limit: number;
  };
  [TestEventType.RAG_RETRIEVED]: {
    queryType: string;
    memoriesCount: number;
    avgSimilarity: number;
    retrievalMethod: 'vector' | 'text' | 'hybrid';
    durationMs: number;
  };
  [TestEventType.RAG_MEMORY_SAVED]: {
    memoryId: string;
    memoryType: string;
    projectId: string;
    caseId?: string;
  };

  // 视觉回归事件
  [TestEventType.VISUAL_BASELINE_CREATED]: {
    baselineId: string;
    pageUrl: string;
    imagePath: string;
  };
  [TestEventType.VISUAL_DIFF]: {
    baselineId: string;
    caseId: string;
    diffPercentage: number;
    passed: boolean;
  };
  [TestEventType.VISUAL_PASSED]: {
    caseId: string;
    pageUrl: string;
    diffPercentage: number;
  };
  [TestEventType.VISUAL_FAILED]: {
    caseId: string;
    pageUrl: string;
    diffPercentage: number;
    diffImagePath: string;
  };

  // 并发执行事件
  [TestEventType.WORKER_LAUNCH]: {
    workerId: string;
    workerIndex: number;
    pid: number;
  };
  [TestEventType.WORKER_MESSAGE]: {
    workerId: string;
    messageType: string;
    taskId?: string;
  };
  [TestEventType.WORKER_ERROR]: {
    workerId: string;
    error: Error;
    taskId?: string;
  };
  [TestEventType.WORKER_SHUTDOWN]: {
    workerId: string;
    completedTasks: number;
    failedTasks: number;
  };
  [TestEventType.PARALLEL_START]: {
    runId: string;
    workerCount: number;
    totalCases: number;
  };
  [TestEventType.PARALLEL_COMPLETE]: {
    runId: string;
    passed: number;
    failed: number;
    totalDurationMs: number;
    parallelEfficiency: number;
  };

  // 状态图谱事件
  [TestEventType.STATE_GRAPH_NODE_CREATED]: {
    nodeHash: string;
    stateType: string;
    urlPattern?: string;
  };
  [TestEventType.STATE_GRAPH_EDGE_CREATED]: {
    sourceHash: string;
    targetHash: string;
    actionType: string;
  };
  [TestEventType.STATE_GRAPH_TRANSITION]: {
    sourceHash: string;
    targetHash: string;
    actionType: string;
    success: boolean;
  };
  [TestEventType.STATE_GRAPH_PATH_FOUND]: {
    sourceHash: string;
    targetHash: string;
    pathLength: number;
    confidence: number;
  };
  [TestEventType.STATE_DISCOVERED]: {
    stateId: string;
    stateHash: string;
    projectId: string;
    platform: string;
    urlPattern?: string;
  };
  [TestEventType.STATE_TRANSITION]: {
    edgeId: string;
    sourceStateHash: string;
    targetStateHash: string;
    action: string;
    success: boolean;
  };

  // 业务流事件
  [TestEventType.BUSINESS_FLOW_DETECTED]: {
    flowId: string;
    flowName: string;
    flowType: string;
    stepsCount: number;
    confidence: number;
  };
  [TestEventType.BUSINESS_FLOW_ANALYZED]: {
    pageUrl: string;
    pageName: string;
    flowsCount: number;
    scenariosCount: number;
  };
  [TestEventType.BUSINESS_FLOW_EXECUTED]: {
    flowId: string;
    flowName: string;
    passed: boolean;
    durationMs: number;
  };

  // 探索式测试事件
  [TestEventType.EXPLORATION_START]: {
    trajectoryId: string;
    project: string;
    platform: string;
    startUrl: string;
    maxSteps: number;
    maxDuration?: number;
  };
  [TestEventType.EXPLORATION_STEP]: {
    trajectoryId: string;
    stepOrder: number;
    actionType: string;
    target?: string;
    reward: number;
    isNewState: boolean;
  };
  [TestEventType.EXPLORATION_NEW_STATE]: {
    trajectoryId: string;
    stateHash: string;
    stateType: string;
    stateName?: string;
    url?: string;
  };
  [TestEventType.EXPLORATION_ANOMALY]: {
    trajectoryId: string;
    anomalyId: string;
    anomalyType: string;
    type?: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    pageUrl?: string;
  };
  [TestEventType.EXPLORATION_REWARD]: {
    trajectoryId: string;
    stepOrder: number;
    rewardType: string;
    rewardValue: number;
    totalReward: number;
  };
  [TestEventType.EXPLORATION_COMPLETE]: {
    trajectoryId: string;
    totalSteps: number;
    newStatesCount: number;
    anomaliesCount: number;
    totalReward: number;
    durationMs?: number;
    generatedCasesCount: number;
  };

  // 优化事件
  [TestEventType.OPTIMIZATION_SUGGESTED]: {
    suggestionId: string;
    caseId?: string;
    suggestionType: string;
    confidence: number;
    autoApplicable: boolean;
  };
  [TestEventType.OPTIMIZATION_APPLIED]: {
    suggestionId: string;
    caseId?: string;
    suggestionType: string;
    effectivenessScore?: number;
  };
  [TestEventType.OPTIMIZATION_VERIFIED]: {
    suggestionId: string;
    caseId: string;
    effective: boolean;
    effectivenessScore: number;
    passRateChange: number;
    durationChange?: number;
    shouldRetain: boolean;
  };
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
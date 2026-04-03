// 核心引擎模块导出
export { logger, createLogger, type TestLogger, type LogLevel } from './logger.js';
export {
  TestError,
  TestErrorCode,
  setupGlobalErrorHandler,
  isRecoverable,
  getErrorSeverity,
  type ErrorHandlingResult,
} from './error-handler.js';
export {
  EventBus,
  eventBus,
  TestEventType,
  emitTestStart,
  emitTestPass,
  emitTestFail,
  emitRunStart,
  emitRunComplete,
  type TestEventMap,
} from './event-bus.js';
export {
  Orchestrator,
  type OrchestratorConfig,
} from './orchestrator.js';
export {
  TestRunner,
  type TestRunnerConfig,
  type StepResult,
  type CaseResult,
} from './test-runner.js';
export {
  ResultCollector,
} from './result-collector.js';
export {
  LifecycleManager,
  lifecycleManager,
  type LifecycleState,
} from './lifecycle.js';
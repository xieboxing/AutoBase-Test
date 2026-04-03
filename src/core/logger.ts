import type { DestinationStream } from 'pino';
import { pino, destination } from 'pino';
import path from 'node:path';
import fs from 'node:fs';
import { nanoid } from 'nanoid';

// 日志文件路径
const LOG_DIR = path.resolve(process.cwd(), 'data/logs');

// 确保日志目录存在
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 生成运行 ID
const runId = nanoid(8);

// 当前日志文件路径
const logFile = path.join(LOG_DIR, `run-${runId}.log`);

// 是否为开发环境
const isDev = process.env.NODE_ENV !== 'production';

// 创建文件输出流（同步写入，避免退出时丢失）
const fileStream: DestinationStream = destination({
  dest: logFile,
  sync: true, // 同步写入确保数据不丢失
});

// 开发环境使用彩色 emoji 输出的自定义格式化
const formatMessage = (_: string, message: string, type?: string): string => {
  const icons: Record<string, string> = {
    step: '📍',
    pass: '✅',
    fail: '❌',
    ai: '🤖',
    perf: '📊',
  };
  const icon = type ? icons[type] || '' : '';
  return `${icon} ${message}`;
};

// 基础日志配置
const baseConfig = {
  level: isDev ? 'debug' : 'info',
  base: {
    runId,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

// 创建主日志实例
const mainLogger = pino(baseConfig, fileStream);

// 开发环境包装日志输出到控制台
if (isDev) {
  const originalInfo = mainLogger.info.bind(mainLogger);
  const originalError = mainLogger.error.bind(mainLogger);
  const originalDebug = mainLogger.debug.bind(mainLogger);
  const originalWarn = mainLogger.warn.bind(mainLogger);

  // 包装日志方法以在控制台显示美化输出
  mainLogger.info = (obj: unknown, msg?: unknown) => {
    const messageType = (obj as { type?: string })?.type;
    const message = formatMessage('info', String(msg || ''), messageType);
    console.log(message);
    return originalInfo(obj as never, msg as never);
  };

  mainLogger.error = (obj: unknown, msg?: unknown) => {
    const messageType = (obj as { type?: string })?.type;
    const message = formatMessage('error', String(msg || ''), messageType);
    console.error(message);
    return originalError(obj as never, msg as never);
  };

  mainLogger.warn = (obj: unknown, msg?: unknown) => {
    const messageType = (obj as { type?: string })?.type;
    const message = formatMessage('warn', String(msg || ''), messageType);
    console.warn(message);
    return originalWarn(obj as never, msg as never);
  };

  mainLogger.debug = (obj: unknown, msg?: unknown) => {
    const messageType = (obj as { type?: string })?.type;
    const message = formatMessage('debug', String(msg || ''), messageType);
    console.debug(message);
    return originalDebug(obj as never, msg as never);
  };
}

/**
 * 测试专用日志方法封装
 */
export interface TestLogger {
  debug: (message: string, data?: Record<string, unknown>) => void;
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
  fatal: (message: string, data?: Record<string, unknown>) => void;

  // 测试专用方法
  step: (message: string, data?: Record<string, unknown>) => void;
  pass: (message: string, data?: Record<string, unknown>) => void;
  fail: (message: string, data?: Record<string, unknown>) => void;
  ai: (message: string, data?: Record<string, unknown>) => void;
  perf: (message: string, data?: Record<string, unknown>) => void;

  // 子日志
  child: (bindings: Record<string, unknown>) => TestLogger;

  // 运行 ID
  runId: string;
  logFile: string;
}

/**
 * 创建测试日志实例
 */
function createTestLogger(bindings: Record<string, unknown> = {}): TestLogger {
  const childLogger = mainLogger.child(bindings);

  const logger: TestLogger = {
    debug: (message: string, data?: Record<string, unknown>) => {
      childLogger.debug(data ?? {}, message);
    },

    info: (message: string, data?: Record<string, unknown>) => {
      childLogger.info(data ?? {}, message);
    },

    warn: (message: string, data?: Record<string, unknown>) => {
      childLogger.warn(data ?? {}, message);
    },

    error: (message: string, data?: Record<string, unknown>) => {
      childLogger.error(data ?? {}, message);
    },

    fatal: (message: string, data?: Record<string, unknown>) => {
      childLogger.fatal(data ?? {}, message);
    },

    // 📍 步骤日志
    step: (message: string, data?: Record<string, unknown>) => {
      childLogger.info({ ...data, type: 'step' }, `📍 ${message}`);
    },

    // ✅ 通过日志
    pass: (message: string, data?: Record<string, unknown>) => {
      childLogger.info({ ...data, type: 'pass' }, `✅ ${message}`);
    },

    // ❌ 失败日志
    fail: (message: string, data?: Record<string, unknown>) => {
      childLogger.error({ ...data, type: 'fail' }, `❌ ${message}`);
    },

    // 🤖 AI 分析日志
    ai: (message: string, data?: Record<string, unknown>) => {
      childLogger.info({ ...data, type: 'ai' }, `🤖 ${message}`);
    },

    // 📊 性能日志
    perf: (message: string, data?: Record<string, unknown>) => {
      childLogger.info({ ...data, type: 'perf' }, `📊 ${message}`);
    },

    child: (newBindings: Record<string, unknown>) => {
      return createTestLogger({ ...bindings, ...newBindings });
    },

    runId,
    logFile,
  };

  return logger;
}

// 默认日志实例
export const logger = createTestLogger();

// 导出创建函数
export function createLogger(bindings: Record<string, unknown>): TestLogger {
  return createTestLogger(bindings);
}

// 导出类型
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
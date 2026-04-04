/**
 * 测试错误代码
 */
export enum TestErrorCode {
  // 环境错误
  BROWSER_LAUNCH_FAILED = 'BROWSER_LAUNCH_FAILED',
  APPIUM_CONNECTION_FAILED = 'APPIUM_CONNECTION_FAILED',
  DEVICE_NOT_FOUND = 'DEVICE_NOT_FOUND',
  ENVIRONMENT_NOT_READY = 'ENVIRONMENT_NOT_READY',

  // 测试执行错误
  ELEMENT_NOT_FOUND = 'ELEMENT_NOT_FOUND',       // → 触发自愈
  NAVIGATION_TIMEOUT = 'NAVIGATION_TIMEOUT',
  ASSERTION_FAILED = 'ASSERTION_FAILED',
  ACTION_FAILED = 'ACTION_FAILED',
  TEST_TIMEOUT = 'TEST_TIMEOUT',
  PAGE_CRASH = 'PAGE_CRASH',

  // AI 错误
  AI_API_FAILED = 'AI_API_FAILED',
  AI_PARSE_FAILED = 'AI_PARSE_FAILED',
  AI_NOT_AVAILABLE = 'AI_NOT_AVAILABLE',

  // 配置错误
  INVALID_CONFIG = 'INVALID_CONFIG',
  MISSING_DEPENDENCY = 'MISSING_DEPENDENCY',
  INVALID_TEST_CASE = 'INVALID_TEST_CASE',

  // 报告错误
  REPORT_GENERATION_FAILED = 'REPORT_GENERATION_FAILED',

  // 通用错误
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * 测试错误类
 */
export class TestError extends Error {
  constructor(
    message: string,
    public readonly code: TestErrorCode,
    public readonly context?: Record<string, unknown>,
    public readonly screenshot?: string,
    public readonly recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'TestError';
  }

  /**
   * 转换为 JSON 格式
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      screenshot: this.screenshot,
      recoverable: this.recoverable,
      stack: this.stack,
    };
  }

  /**
   * 创建元素未找到错误（可恢复）
   */
  static elementNotFound(
    selector: string,
    context?: Record<string, unknown>,
    screenshot?: string,
  ): TestError {
    return new TestError(
      `元素未找到: ${selector}`,
      TestErrorCode.ELEMENT_NOT_FOUND,
      { selector, ...context },
      screenshot,
      true, // 可通过自愈恢复
    );
  }

  /**
   * 创建断言失败错误
   */
  static assertionFailed(
    assertionType: string,
    expected: unknown,
    actual: unknown,
    context?: Record<string, unknown>,
    screenshot?: string,
  ): TestError {
    return new TestError(
      `断言失败: ${assertionType}, 期望: ${expected}, 实际: ${actual}`,
      TestErrorCode.ASSERTION_FAILED,
      { assertionType, expected, actual, ...context },
      screenshot,
      false,
    );
  }

  /**
   * 创建超时错误
   */
  static timeout(
    operation: string,
    timeoutMs: number,
    context?: Record<string, unknown>,
  ): TestError {
    return new TestError(
      `${operation} 超时 (${timeoutMs}ms)`,
      TestErrorCode.NAVIGATION_TIMEOUT,
      { operation, timeoutMs, ...context },
      undefined,
      false,
    );
  }

  /**
   * 创建 AI 错误
   */
  static aiError(
    message: string,
    originalError?: Error,
  ): TestError {
    return new TestError(
      `AI 错误: ${message}`,
      TestErrorCode.AI_API_FAILED,
      { originalError: originalError?.message },
      undefined,
      true, // 可降级到规则引擎
    );
  }
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult {
  handled: boolean;
  recovered: boolean;
  action?: 'retry' | 'skip' | 'fallback' | 'abort';
  newSelector?: string; // 自愈后的新选择器
  message?: string;
}

/**
 * 全局错误处理器
 */
export function setupGlobalErrorHandler(): void {
  // 处理未捕获的异常
  process.on('uncaughtException', (error: Error) => {
    if (error instanceof TestError) {
      console.error(`❌ 测试错误 [${error.code}]: ${error.message}`);
      if (error.screenshot) {
        console.error(`   截图: ${error.screenshot}`);
      }
    } else {
      console.error('❌ 未捕获的异常:', error);
    }
    // 给日志写入和清理工作足够时间（2秒）
    setTimeout(() => {
      process.exit(1);
    }, 2000);
  });

  // 处理未处理的 Promise 拒绝
  process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
    console.error('❌ 未处理的 Promise 拒绝:');
    console.error('  原因:', reason);
    console.error('  Promise:', promise);
    // 记录但不退出，让程序有机会优雅处理
  });

  // 优雅清理函数
  async function gracefulShutdown(signal: string): Promise<void> {
    console.log(`\n⏹️ 收到 ${signal}，正在优雅退出...`);

    try {
      // 尝试清理所有浏览器实例
      try {
        const { closeAllBrowsers } = await import('@/testers/web/browser-manager.js');
        const browserCount = await closeAllBrowsers();
        if (browserCount > 0) {
          console.log(`  ✓ 已关闭 ${browserCount} 个浏览器实例`);
        }
      } catch {
        // 浏览器管理器可能未初始化
      }

      // 尝试清理所有 Appium 会话
      try {
        const { closeAllAppiumSessions } = await import('@/testers/app/appium-manager.js');
        const sessionCount = await closeAllAppiumSessions();
        if (sessionCount > 0) {
          console.log(`  ✓ 已关闭 ${sessionCount} 个 Appium 会话`);
        }
      } catch {
        // Appium 管理器可能未初始化
      }

      // 尝试关闭数据库连接
      try {
        const { getDatabase } = await import('@/knowledge/db/index.js');
        const db = getDatabase();
        if (db) {
          db.close();
          console.log('  ✓ 已关闭数据库连接');
        }
      } catch {
        // 数据库可能未初始化
      }

      console.log('  ✓ 清理完成，退出');
      process.exit(0);
    } catch (error) {
      console.error('  ✗ 清理过程中出错:', error);
      process.exit(1);
    }
  }

  // 处理 SIGTERM
  process.on('SIGTERM', () => {
    // 设置超时保护，防止清理卡住
    const timeout = setTimeout(() => {
      console.log('⏹️ 清理超时（8秒），强制退出');
      process.exit(1);
    }, 8000);

    gracefulShutdown('SIGTERM').finally(() => {
      clearTimeout(timeout);
    });
  });

  // 处理 SIGINT (Ctrl+C)
  process.on('SIGINT', () => {
    // 设置超时保护，防止清理卡住
    const timeout = setTimeout(() => {
      console.log('⏹️ 清理超时（8秒），强制退出');
      process.exit(1);
    }, 8000);

    gracefulShutdown('SIGINT').finally(() => {
      clearTimeout(timeout);
    });
  });
}

/**
 * 判断错误是否可恢复
 */
export function isRecoverable(error: Error): boolean {
  if (error instanceof TestError) {
    return error.recoverable;
  }
  return false;
}

/**
 * 获取错误的严重级别
 */
export function getErrorSeverity(error: Error): 'critical' | 'high' | 'medium' | 'low' {
  if (error instanceof TestError) {
    const criticalCodes = [
      TestErrorCode.BROWSER_LAUNCH_FAILED,
      TestErrorCode.APPIUM_CONNECTION_FAILED,
      TestErrorCode.ENVIRONMENT_NOT_READY,
    ];
    const highCodes = [
      TestErrorCode.PAGE_CRASH,
      TestErrorCode.TEST_TIMEOUT,
    ];

    if (criticalCodes.includes(error.code)) {
      return 'critical';
    }
    if (highCodes.includes(error.code)) {
      return 'high';
    }
  }
  return 'medium';
}
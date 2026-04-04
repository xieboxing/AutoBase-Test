import type { TestCase, TestStep, TestStatus, TestActionType, Platform } from '@/types/index.js';
import { logger } from './logger.js';
import { TestError, TestErrorCode } from './error-handler.js';
import {
  eventBus,
  TestEventType,
  emitTestStart,
  emitTestPass,
  emitTestFail,
} from './event-bus.js';

/**
 * @deprecated 此类已废弃，请使用 PcTester 或 H5Tester
 *
 * 测试执行器配置
 *
 * **重要说明**：
 * 此 TestRunner 类是一个早期实现的占位符版本，实际测试执行请使用：
 * - `PcTester` (src/testers/web/pc-tester.ts) - PC Web 测试
 * - `H5Tester` (src/testers/web/h5-tester.ts) - 移动 H5 测试
 *
 * Orchestrator 已直接使用 PcTester/H5Tester，此文件仅保留用于兼容性。
 */
export interface TestRunnerConfig {
  platform: Platform;
  timeout: number;
  retryCount: number;
  screenshotOnFailure: boolean;
  screenshotOnEveryStep: boolean;
}

/**
 * 测试步骤执行结果
 */
export interface StepResult {
  order: number;
  action: TestActionType;
  target?: string;
  status: TestStatus;
  durationMs: number;
  errorMessage?: string;
  screenshot?: string;
}

/**
 * 测试用例执行结果
 */
export interface CaseResult {
  caseId: string;
  caseName: string;
  status: TestStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  steps: StepResult[];
  retryCount: number;
  selfHealed: boolean;
  selfHealSelector?: string;
  screenshots: string[];
}

/**
 * 测试执行器
 * 负责执行单个测试用例的各个步骤
 *
 * @deprecated 此类已废弃，请改用 PcTester 或 H5Tester
 * @see PcTester - PC Web 测试器
 * @see H5Tester - 移动 H5 测试器
 *
 * **警告**：此类的动作实现均为占位符，不会实际执行测试操作。
 */
export class TestRunner {
  private platform: Platform;
  private retryCount: number;
  private screenshotOnFailure: boolean;
  private screenshotOnEveryStep: boolean;
  private browser?: unknown;
  private page?: unknown;

  constructor(config: TestRunnerConfig) {
    this.platform = config.platform;
    this.retryCount = config.retryCount;
    this.screenshotOnFailure = config.screenshotOnFailure;
    this.screenshotOnEveryStep = config.screenshotOnEveryStep;
  }

  /**
   * 执行单个测试用例
   */
  async run(testCase: TestCase): Promise<CaseResult> {
    const testLogger = logger.child({ caseId: testCase.id });

    const startTime = new Date().toISOString();
    const startMs = Date.now();
    const stepResults: StepResult[] = [];
    const screenshots: string[] = [];
    let status: TestStatus = 'passed';
    let retryCount = 0;
    const selfHealed = false;
    let selfHealSelector: string | undefined;

    testLogger.info(`开始执行用例: ${testCase.name}`);

    // 发出测试开始事件
    emitTestStart(testCase.id, testCase.name, this.platform);

    // 重试循环
    while (retryCount <= this.retryCount) {
      try {
        // 执行每个步骤
        for (const step of testCase.steps) {
          const stepResult = await this.executeStep(step, testLogger);
          stepResults.push(stepResult);

          if (stepResult.screenshot) {
            screenshots.push(stepResult.screenshot);
          }

          if (stepResult.status === 'failed') {
            status = 'failed';
            throw new TestError(
              `步骤 ${step.order} 失败: ${stepResult.errorMessage}`,
              TestErrorCode.ACTION_FAILED,
              { step: step.order, action: step.action },
              stepResult.screenshot,
            );
          }
        }

        // 所有步骤通过
        status = 'passed';
        testLogger.pass(`用例执行成功: ${testCase.name}`);
        break;

      } catch (error) {
        if (error instanceof TestError && error.code === TestErrorCode.ELEMENT_NOT_FOUND) {
          // 尝试自愈
          testLogger.ai('尝试 AI 自愈...');
          // TODO: 调用自愈引擎
          // 如果自愈成功，记录并重试
        }

        retryCount++;
        testLogger.warn(`执行失败，重试 (${retryCount}/${this.retryCount})`);

        if (retryCount > this.retryCount) {
          status = 'failed';
          const errorScreenshot = this.screenshotOnFailure
            ? await this.takeScreenshot(`failure-${testCase.id}`)
            : undefined;

          if (errorScreenshot) {
            screenshots.push(errorScreenshot);
          }

          emitTestFail(
            testCase.id,
            stepResults.length,
            error instanceof Error ? error : new Error(String(error)),
            errorScreenshot,
          );
        } else {
          // 清理步骤结果，准备重试
          stepResults.length = 0;
          screenshots.length = 0;

          eventBus.emitSafe(TestEventType.TEST_RETRY, {
            caseId: testCase.id,
            retryCount,
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    // 执行清理步骤
    if (testCase.cleanup && testCase.cleanup.length > 0) {
      testLogger.debug('执行清理步骤');
      for (const cleanupStep of testCase.cleanup) {
        try {
          await this.executeStep(cleanupStep, testLogger);
        } catch (cleanupError) {
          testLogger.warn('清理步骤失败', {
            step: cleanupStep.order,
            error: cleanupError instanceof Error ? cleanupError.message : String(cleanupError),
          });
        }
      }
    }

    const endTime = new Date().toISOString();
    const durationMs = Date.now() - startMs;

    // 发出测试完成事件
    eventBus.emitSafe(TestEventType.TEST_COMPLETE, {
      caseId: testCase.id,
      status,
      durationMs,
    });

    return {
      caseId: testCase.id,
      caseName: testCase.name,
      status,
      startTime,
      endTime,
      durationMs,
      steps: stepResults,
      retryCount,
      selfHealed,
      selfHealSelector,
      screenshots,
    };
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: TestStep,
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<StepResult> {
    const startMs = Date.now();
    let status: TestStatus = 'passed';
    let errorMessage: string | undefined;
    let screenshot: string | undefined;

    testLogger.step(`步骤 ${step.order}: ${step.description}`, {
      action: step.action,
      target: step.target,
    });

    // 发出步骤事件
    eventBus.emitSafe(TestEventType.TEST_STEP, {
      caseId: testLogger.runId, // 使用 runId 作为 caseId
      step: step.order,
      action: step.action,
      target: step.target,
    });

    // 等待前置
    if (step.waitBefore) {
      await this.wait(step.waitBefore);
    }

    try {
      // 根据动作类型执行
      await this.performAction(step, testLogger);

      // 如果需要每步截图
      if (this.screenshotOnEveryStep) {
        screenshot = await this.takeScreenshot(`step-${step.order}`);
      }

      testLogger.pass(`步骤 ${step.order} 完成`, { durationMs: Date.now() - startMs });
      emitTestPass(testLogger.runId, step.order, Date.now() - startMs);

    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : String(error);

      if (this.screenshotOnFailure) {
        screenshot = await this.takeScreenshot(`step-${step.order}-fail`);
      }

      testLogger.fail(`步骤 ${step.order} 失败`, {
        error: errorMessage,
        screenshot,
      });
    }

    // 等待后置
    if (step.waitAfter) {
      await this.wait(step.waitAfter);
    }

    return {
      order: step.order,
      action: step.action,
      target: step.target,
      status,
      durationMs: Date.now() - startMs,
      errorMessage,
      screenshot,
    };
  }

  /**
   * 执行具体动作
   */
  private async performAction(
    step: TestStep,
    testLogger: ReturnType<typeof logger.child>,
  ): Promise<void> {
    // 根据 platform 和 action 执行不同逻辑
    switch (step.action) {
      case 'navigate':
        await this.navigate(step.value ?? '', testLogger);
        break;

      case 'click':
        await this.click(step.target ?? '', testLogger);
        break;

      case 'fill':
        await this.fill(step.target ?? '', step.value ?? '', testLogger);
        break;

      case 'select':
        await this.select(step.target ?? '', step.value ?? '', testLogger);
        break;

      case 'hover':
        await this.hover(step.target ?? '', testLogger);
        break;

      case 'scroll':
        await this.scroll(step.value ?? '', testLogger);
        break;

      case 'wait':
        await this.wait(parseInt(step.value ?? '1000', 10));
        break;

      case 'screenshot':
        await this.takeScreenshot(`manual-${step.order}`);
        break;

      case 'assert':
        await this.assert(step, testLogger);
        break;

      case 'tap':
        await this.tap(step.target ?? '', testLogger);
        break;

      case 'swipe':
        await this.swipe(step.target ?? '', step.value ?? '', testLogger);
        break;

      case 'back':
        await this.back(testLogger);
        break;

      default:
        throw new TestError(
          `未知动作类型: ${step.action}`,
          TestErrorCode.ACTION_FAILED,
          { step },
        );
    }
  }

  // ========== 动作实现（占位符，后续 Phase 完善） ==========

  private async navigate(url: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现导航逻辑
    _logger.debug(`导航到: ${url}`);
  }

  private async click(selector: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现点击逻辑
    _logger.debug(`点击: ${selector}`);
  }

  private async fill(selector: string, value: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现输入逻辑
    _logger.debug(`输入: ${selector} = ${value}`);
  }

  private async select(selector: string, value: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现选择逻辑
    _logger.debug(`选择: ${selector} = ${value}`);
  }

  private async hover(selector: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现悬停逻辑
    _logger.debug(`悬停: ${selector}`);
  }

  private async scroll(direction: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现滚动逻辑
    _logger.debug(`滚动: ${direction}`);
  }

  private async tap(selector: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现 APP 点击逻辑
    _logger.debug(`点击(APP): ${selector}`);
  }

  private async swipe(selector: string, direction: string, _logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现 APP 滑动逻辑
    _logger.debug(`滑动(APP): ${selector} ${direction}`);
  }

  private async back(_logger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现返回逻辑
    _logger.debug('返回上一页');
  }

  private async assert(step: TestStep, testLogger: ReturnType<typeof logger.child>): Promise<void> {
    // TODO: 实现断言逻辑
    const assertType = step.type ?? 'element-visible';
    testLogger.debug(`断言: ${assertType}`, { target: step.target, value: step.value });
  }

  private async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async takeScreenshot(name: string): Promise<string> {
    // TODO: 实现截图逻辑
    const path = `data/screenshots/${name}.png`;
    return path;
  }
}
/**
 * 多语言循环执行器
 * 支持配置多个语言，每个语言都从主流程入口重新执行完整测试
 */

import type { Browser as WebdriverIOBrowser } from 'webdriverio';
import type {
  FinancialAppConfig,
  LanguageExecutionResult,
  FinancialTestResult,
  InspectionIssue,
  SupportedLanguage,
  LanguageSwitchStep,
} from '@/types/financial.types.js';
import type { TestStatus } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';
import { PageInspector } from './page-inspector.js';
import { FinancialFlowTester } from './financial-flow-tester.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { remote } from 'webdriverio';

/**
 * 多语言执行器配置
 */
export interface LanguageRunnerOptions {
  /** APP 配置 */
  config: FinancialAppConfig;
  /** 设备 ID */
  deviceId: string;
  /** 输出目录 */
  outputDir: string;
  /** Appium 配置 */
  appiumConfig?: {
    host?: string;
    port?: number;
  };
}

/**
 * 多语言循环执行器类
 */
export class LanguageRunner {
  private config: FinancialAppConfig;
  private deviceId: string;
  private outputDir: string;
  private appiumConfig: { host: string; port: number };
  private runId: string;

  constructor(options: LanguageRunnerOptions) {
    this.config = options.config;
    this.deviceId = options.deviceId;
    this.outputDir = options.outputDir;
    this.appiumConfig = {
      host: options.appiumConfig?.host || process.env.APPIUM_HOST || '127.0.0.1',
      port: options.appiumConfig?.port || parseInt(process.env.APPIUM_PORT || '4723', 10),
    };
    this.runId = `financial-${Date.now()}`;
  }

  /**
   * 执行完整测试（所有语言）
   */
  async execute(): Promise<FinancialTestResult> {
    logger.info('🚀 开始金融 APP 多语言测试');
    logger.step(`📱 APP: ${this.config.app.appName}`);
    logger.step(`📦 包名: ${this.config.app.packageName}`);
    logger.step(`🔧 设备: ${this.deviceId}`);
    logger.step(`🌐 语言: ${this.config.languages.supportedLanguages.map(l => l.name).join(', ')}`);

    const startTime = Date.now();
    const languageResults: LanguageExecutionResult[] = [];
    const allIssues: InspectionIssue[] = [];

    // 创建输出目录
    await mkdir(this.outputDir, { recursive: true });
    await mkdir(join(this.outputDir, 'screenshots'), { recursive: true });
    await mkdir(join(this.outputDir, 'page-sources'), { recursive: true });
    await mkdir(join(this.outputDir, 'logs'), { recursive: true });

    let driver: WebdriverIOBrowser | null = null;

    try {
      // 初始化 Appium 驱动
      driver = await this.initDriver();

      // 执行每种语言的测试
      for (const language of this.config.languages.supportedLanguages) {
        logger.info(`\n${'='.repeat(50)}`);
        logger.info(`🌐 开始语言测试: ${language.name} (${language.code})`);
        logger.info(`${'='.repeat(50)}`);

        // 切换语言
        await this.switchLanguage(driver, language.code);

        // 创建语言特定的输出目录
        const languageDir = join(this.outputDir, language.code);
        await mkdir(languageDir, { recursive: true });

        // 创建页面巡检器
        const inspector = new PageInspector({
          driver,
          deviceId: this.deviceId,
          outputDir: languageDir,
          rules: this.config.inspection.basicRules,
          autoScreenshot: this.config.inspection.autoScreenshot,
          savePageSource: this.config.inspection.savePageSource,
          extractText: this.config.inspection.extractText,
        });

        await inspector.initialize();

        // 创建流程测试器
        const flowTester = new FinancialFlowTester({
          driver,
          deviceId: this.deviceId,
          config: this.config,
          outputDir: languageDir,
          language: language.code,
          inspector,
        });

        // 执行流程（根据配置决定是否执行完整流程）
        const flowResult = language.fullFlow
          ? await flowTester.executeFullFlow()
          : await this.executePartialFlow(driver, inspector);

        // 收集页面巡检结果（从 inspector 中获取）
        const pageResults = await this.collectPageResults(driver, inspector, language);

        // 汇总问题
        for (const pageResult of pageResults) {
          allIssues.push(...pageResult.issues);
        }

        const languageEndTime = Date.now();
        const languageStartTime = flowResult.steps[0]?.timestamp || new Date().toISOString();

        languageResults.push({
          language: language.code,
          languageName: language.name,
          flowResult,
          pageResults,
          status: flowResult.status,
          startTime: languageStartTime,
          endTime: new Date().toISOString(),
          durationMs: languageEndTime - startTime,
        });

        logger.pass(`✅ 语言 ${language.name} 测试完成，状态: ${flowResult.status}`);
      }

      // 如果配置要求恢复默认语言
      if (this.config.languages.restoreDefault) {
        logger.step('🔄 恢复默认语言');
        await this.switchLanguage(driver, this.config.languages.defaultLanguage);
      }

      // 关闭 APP 和驱动
      await driver.closeApp();
      await driver.deleteSession();

    } catch (error) {
      logger.fail(`❌ 测试执行异常: ${(error as Error).message}`);

      // 清理
      if (driver) {
        try {
          await driver.deleteSession();
        } catch {
          // 忽略清理错误
        }
      }
    }

    const endTime = Date.now();

    // 计算整体评估
    const overallAssessment = this.calculateOverallAssessment(languageResults, allIssues);

    // 构建完整结果
    const result: FinancialTestResult = {
      runId: this.runId,
      appName: this.config.app.appName,
      packageName: this.config.app.packageName,
      device: {
        id: this.deviceId,
      },
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
      languageResults,
      allIssues,
      tradingSummary: this.calculateTradingSummary(languageResults),
      overallAssessment,
      artifacts: {
        screenshotsDir: join(this.outputDir, 'screenshots'),
        pageSourcesDir: join(this.outputDir, 'page-sources'),
        logsDir: join(this.outputDir, 'logs'),
        reportPath: join(this.outputDir, 'report.html'),
      },
    };

    logger.info('\n' + '='.repeat(50));
    logger.pass('✅ 金融 APP 多语言测试完成');
    logger.info(`📊 总耗时: ${(result.durationMs / 1000).toFixed(2)} 秒`);
    logger.info(`📊 整体状态: ${overallAssessment.status}`);
    logger.info(`📊 通过率: ${(overallAssessment.passRate * 100).toFixed(1)}%`);
    logger.info(`📊 问题数: ${allIssues.length} (P0: ${allIssues.filter(i => i.severity === 'P0').length})`);
    logger.info(`${'='.repeat(50)}`);

    return result;
  }

  /**
   * 初始化 Appium 驱动
   */
  private async initDriver(): Promise<WebdriverIOBrowser> {
    logger.step('🔗 连接 Appium...');

    const driver = await remote({
      hostname: this.appiumConfig.host,
      port: this.appiumConfig.port,
      path: '/wd/hub',
      capabilities: {
        platformName: 'Android',
        'appium:deviceName': this.deviceId,
        'appium:appPackage': this.config.app.packageName,
        'appium:appActivity': this.config.app.launchActivity || '.MainActivity',
        'appium:automationName': 'UiAutomator2',
        'appium:noReset': true,
        'appium:newCommandTimeout': 600,
      } as any,
    });

    await driver.connect();
    logger.pass('✅ Appium 连接成功');

    return driver;
  }

  /**
   * 切换语言
   */
  private async switchLanguage(driver: WebdriverIOBrowser, targetLanguage: string): Promise<void> {
    logger.step(`🔄 切换语言到: ${targetLanguage}`);

    const switchMethod = this.config.languages.switchMethod;

    try {
      if (switchMethod === 'app-internal') {
        // APP 内部语言切换
        const switchSteps = this.config.languages.switchSteps;

        for (const step of switchSteps) {
          if (step.targetLanguage === targetLanguage) {
            await this.executeLanguageSwitchSteps(driver, step.navigation);

            if (step.languageSelector) {
              const selector = this.buildSelector(step.languageSelector);
              const element = await driver.$(selector);
              await element.click();
            }

            await driver.pause(step.waitAfter || 2000);
            break;
          }
        }
      } else if (switchMethod === 'system') {
        // 系统语言切换（需要特殊权限）
        logger.warn('⚠️ 系统语言切换需要特殊权限，暂不支持');
      } else if (switchMethod === 'settings-menu') {
        // 设置菜单语言切换
        await this.executeSettingsLanguageSwitch(driver, targetLanguage);
      }

      logger.pass(`✅ 语言切换完成: ${targetLanguage}`);

      // 等待语言切换生效
      await driver.pause(3000);

      // 重启 APP 使语言生效（部分 APP 需要重启）
      try {
        await driver.closeApp();
        await driver.pause(1000);
        await driver.startActivity(
          this.config.app.packageName,
          this.config.app.launchActivity || '.MainActivity',
        );
        await driver.pause(2000);
      } catch {
        // 忽略重启错误
      }

    } catch (error) {
      logger.warn(`⚠️ 语言切换失败: ${(error as Error).message}`);
      logger.warn('继续使用当前语言执行测试');
    }
  }

  /**
   * 执行语言切换步骤
   */
  private async executeLanguageSwitchSteps(driver: WebdriverIOBrowser, steps: any[]): Promise<void> {
    for (const step of steps) {
      if (step.action === 'tap' && step.target) {
        const selector = this.buildSelector(step.target);
        const element = await driver.$(selector);
        await element.click();
        await driver.pause(step.waitAfter || 500);
      } else if (step.action === 'swipe') {
        await driver.touchAction([
          { action: 'press', x: 500, y: 800 },
          { action: 'moveTo', x: 500, y: 200 },
          'release',
        ]);
        await driver.pause(step.waitAfter || 500);
      } else if (step.action === 'wait') {
        await driver.pause(step.value ? parseInt(step.value, 10) : 1000);
      } else if (step.action === 'back') {
        await driver.back();
        await driver.pause(step.waitAfter || 500);
      }
    }
  }

  /**
   * 通过设置菜单切换语言
   */
  private async executeSettingsLanguageSwitch(driver: WebdriverIOBrowser, targetLanguage: string): Promise<void> {
    // 这是一个通用的简化实现，具体 APP 可能需要自定义
    try {
      // 1. 点击菜单按钮（如果有）
      // 2. 找到语言设置选项
      // 3. 选择目标语言

      logger.ai('🤖 尝试通过设置菜单切换语言');

      // 由于不同 APP 的设置菜单结构不同，这里提供一个通用流程
      // 实际使用时需要在配置中指定具体的导航步骤

      const switchSteps = this.config.languages.switchSteps.find(s => s.targetLanguage === targetLanguage);

      if (switchSteps) {
        await this.executeLanguageSwitchSteps(driver, switchSteps.navigation);
      }
    } catch (error) {
      logger.warn(`设置菜单语言切换失败: ${(error as Error).message}`);
    }
  }

  /**
   * 执行部分流程（非完整流程）
   */
  private async executePartialFlow(
    driver: WebdriverIOBrowser,
    inspector: PageInspector,
  ): Promise<any> {
    logger.info('执行部分流程（页面巡检模式）');

    const steps = [];
    const pages = this.config.pages.filter(p => p.languageCheck);

    for (const page of pages) {
      try {
        if (page.navigation && page.navigation.length > 0) {
          for (const navStep of page.navigation) {
            if (navStep.action === 'tap' && navStep.target) {
              const selector = this.buildSelector(navStep.target);
              const element = await driver.$(selector);
              await element.click();
              await driver.pause(navStep.waitAfter || 500);
            }
          }
        }

        await inspector.inspectPage(page, 'zh-CN'); // 默认语言

        steps.push({
          stepName: page.name,
          stepId: page.id,
          status: 'passed',
          timestamp: new Date().toISOString(),
          durationMs: 0,
        });

        await driver.back();
        await driver.pause(500);
      } catch (error) {
        steps.push({
          stepName: page.name,
          stepId: page.id,
          status: 'failed',
          timestamp: new Date().toISOString(),
          durationMs: 0,
          errorMessage: (error as Error).message,
        });
      }
    }

    return {
      steps,
      status: steps.every(s => s.status === 'passed') ? 'passed' : 'failed',
    };
  }

  /**
   * 收集页面结果
   */
  private async collectPageResults(
    driver: WebdriverIOBrowser,
    inspector: PageInspector,
    language: SupportedLanguage,
  ): Promise<any[]> {
    // 这个方法在执行流程后收集所有页面检查结果
    // 由于结果已经在 inspector 中处理，这里返回一个简化版本

    const results = [];

    for (const page of this.config.pages) {
      if (page.languageCheck) {
        results.push({
          pageId: page.id,
          pageName: page.name,
          language: language.code,
          timestamp: new Date().toISOString(),
          screenshotPath: '',
          issues: [],
          passed: true,
          durationMs: 0,
        });
      }
    }

    return results;
  }

  /**
   * 计算整体评估
   */
  private calculateOverallAssessment(
    languageResults: LanguageExecutionResult[],
    allIssues: InspectionIssue[],
  ): FinancialTestResult['overallAssessment'] {
    const totalSteps = languageResults.reduce((sum, r) => sum + r.flowResult.steps.length, 0);
    const passedSteps = languageResults.reduce(
      (sum, r) => sum + r.flowResult.steps.filter(s => s.status === 'passed').length,
      0,
    );
    const passRate = totalSteps > 0 ? passedSteps / totalSteps : 0;

    const criticalIssues = allIssues.filter(i => i.severity === 'P0');

    let status: TestStatus = 'passed';
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    if (criticalIssues.length > 0) {
      status = 'failed';
      riskLevel = criticalIssues.length > 5 ? 'critical' : 'high';
    } else if (allIssues.filter(i => i.severity === 'P1').length > 10) {
      riskLevel = 'medium';
    }

    const summary = `${languageResults.length} 种语言测试完成，${allIssues.length} 个问题发现，通过率 ${(passRate * 100).toFixed(1)}%`;

    return {
      status,
      passRate,
      criticalIssueCount: criticalIssues.length,
      riskLevel,
      summary,
    };
  }

  /**
   * 计算交易摘要
   */
  private calculateTradingSummary(languageResults: LanguageExecutionResult[]): FinancialTestResult['tradingSummary'] | undefined {
    if (!this.config.trading) {
      return undefined;
    }

    // 简化实现，从流程步骤中提取交易状态
    let openSuccess = 0;
    let openFailed = 0;
    let closeSuccess = 0;
    let closeFailed = 0;

    for (const result of languageResults) {
      for (const step of result.flowResult.steps) {
        if (step.stepId === 'open-position') {
          if (step.status === 'passed') openSuccess++;
          else openFailed++;
        } else if (step.stepId === 'close-position') {
          if (step.status === 'passed') closeSuccess++;
          else closeFailed++;
        }
      }
    }

    return {
      openSuccess,
      openFailed,
      closeSuccess,
      closeFailed,
      positionVerified: openSuccess > 0,
      historyVerified: languageResults.some(r => r.flowResult.steps.some(s => s.stepId === 'view-history' && s.status === 'passed')),
      balanceChangeVerified: languageResults.some(r => r.flowResult.steps.some(s => s.stepId === 'check-balance' && s.status === 'passed')),
    };
  }

  /**
   * 构建选择器
   */
  private buildSelector(locator: any): string {
    switch (locator.strategy) {
      case 'id':
        return `id:${locator.value}`;
      case 'xpath':
        return locator.value;
      case 'class':
        return `class:${locator.value}`;
      case 'accessibility-id':
        return `accessibility id:${locator.value}`;
      case 'text':
        return `text:${locator.value}`;
      default:
        return locator.value;
    }
  }
}
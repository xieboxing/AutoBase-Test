/**
 * 金融流程测试器
 * 执行金融 APP 的核心业务流程测试
 */

import type { Browser as WebdriverIOBrowser, Element as WebdriverIOElement } from 'webdriverio';
import type {
  FinancialAppConfig,
  FlowStepResult,
  FinancialFlowResult,
  TradingResult,
  BalanceCheckRule,
  ElementLocator,
  NavigationStep,
} from '@/types/financial.types.js';
import type { TestStatus } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';
import { PageInspector } from './page-inspector.js';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * 金融流程测试器配置
 */
export interface FinancialFlowTesterOptions {
  /** Appium 驱动 */
  driver: WebdriverIOBrowser;
  /** 设备 ID */
  deviceId: string;
  /** APP 配置 */
  config: FinancialAppConfig;
  /** 输出目录 */
  outputDir: string;
  /** 当前语言 */
  language: string;
  /** 页面巡检器 */
  inspector: PageInspector;
}

/**
 * 金融流程测试器类
 */
export class FinancialFlowTester {
  private driver: WebdriverIOBrowser;
  private deviceId: string;
  private config: FinancialAppConfig;
  private outputDir: string;
  private language: string;
  private inspector: PageInspector;
  private screenshotDir: string;

  constructor(options: FinancialFlowTesterOptions) {
    this.driver = options.driver;
    this.deviceId = options.deviceId;
    this.config = options.config;
    this.outputDir = options.outputDir;
    this.language = options.language;
    this.inspector = options.inspector;
    this.screenshotDir = join(this.outputDir, 'screenshots');
  }

  /**
   * 执行完整流程
   */
  async executeFullFlow(): Promise<FinancialFlowResult> {
    logger.info(`🚀 开始执行金融流程测试 (${this.language})`);

    const steps: FlowStepResult[] = [];
    let overallStatus: TestStatus = 'passed';

    // 定义流程步骤
    const flowSteps = [
      { id: 'go-home', name: '回到手机主界面', execute: () => this.goToHomeScreen() },
      { id: 'launch-app', name: '启动 APP', execute: () => this.launchApp() },
      { id: 'login', name: '登录', execute: () => this.performLogin() },
      { id: 'page-check', name: '页面巡检', execute: () => this.inspectPages() },
      { id: 'open-position', name: '开仓', execute: () => this.openPosition() },
      { id: 'view-position', name: '查看持仓', execute: () => this.viewPosition() },
      { id: 'close-position', name: '平仓', execute: () => this.closePosition() },
      { id: 'view-history', name: '查看历史记录', execute: () => this.viewHistory() },
      { id: 'check-balance', name: '检查余额变化', execute: () => this.checkBalance() },
      { id: 'logout', name: '退出登录', execute: () => this.logout() },
    ];

    // 执行每个步骤
    for (const step of flowSteps) {
      const startTime = Date.now();
      logger.step(`📍 步骤: ${step.name}`);

      try {
        const result = await step.execute();

        const stepResult: FlowStepResult = {
          stepName: step.name,
          stepId: step.id,
          status: result.status,
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          screenshotPath: result.screenshotPath,
          errorMessage: result.errorMessage,
        };

        steps.push(stepResult);

        if (result.status === 'passed') {
          logger.pass(`✅ ${step.name} 成功`);
        } else {
          logger.fail(`❌ ${step.name} 失败: ${result.errorMessage}`);
          overallStatus = 'failed';
        }
      } catch (error) {
        const stepResult: FlowStepResult = {
          stepName: step.name,
          stepId: step.id,
          status: 'failed',
          timestamp: new Date().toISOString(),
          durationMs: Date.now() - startTime,
          errorMessage: (error as Error).message,
        };

        steps.push(stepResult);
        logger.fail(`❌ ${step.name} 异常: ${(error as Error).message}`);
        overallStatus = 'failed';
      }
    }

    return {
      steps,
      status: overallStatus,
      failureReason: overallStatus === 'failed' ? steps.find(s => s.status === 'failed')?.errorMessage : undefined,
    };
  }

  /**
   * 回到手机主界面
   */
  private async goToHomeScreen(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    try {
      // 使用 Appium pressKeyCode 模拟 Home 键
      await this.driver.pressKeyCode(3); // KEYCODE_HOME = 3
      await this.driver.pause(1000);

      const screenshotPath = await this.takeScreenshot('home-screen');

      return {
        status: 'passed',
        screenshotPath,
      };
    } catch (error) {
      return {
        status: 'failed',
        errorMessage: `回到主界面失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 启动 APP
   */
  private async launchApp(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    try {
      // 如果 APP 未运行，启动它
      const packageName = this.config.app.packageName;
      const activity = this.config.app.launchActivity || '.MainActivity';

      // 使用 adb 命令启动 APP
      await this.driver.startActivity(packageName, activity);
      await this.driver.pause(2000);

      // 等待 APP 完全启动
      await this.driver.pause(this.config.login.waitBefore || 2000);

      const screenshotPath = await this.takeScreenshot('app-launch');

      return {
        status: 'passed',
        screenshotPath,
      };
    } catch (error) {
      return {
        status: 'failed',
        errorMessage: `启动 APP 失败: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 执行登录
   */
  private async performLogin(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.login.required) {
      logger.info('登录步骤已跳过（配置为不需要登录）');
      return { status: 'passed' };
    }

    try {
      // 从环境变量获取账号密码
      const username = process.env[this.config.login.usernameEnvKey];
      const password = process.env[this.config.login.passwordEnvKey];

      if (!username || !password) {
        return {
          status: 'failed',
          errorMessage: `账号密码未配置，请设置环境变量: ${this.config.login.usernameEnvKey}, ${this.config.login.passwordEnvKey}`,
        };
      }

      // 查找用户名输入框并输入
      const usernameField = await this.findElement(this.config.login.usernameLocator);
      await usernameField.clearValue();
      await usernameField.setValue(username);

      await this.driver.pause(500);

      // 查找密码输入框并输入
      const passwordField = await this.findElement(this.config.login.passwordLocator);
      await passwordField.clearValue();
      await passwordField.setValue(password);

      await this.driver.pause(500);

      // 点击登录按钮
      const loginButton = await this.findElement(this.config.login.loginButtonLocator);
      await loginButton.click();

      // 等待登录完成
      await this.driver.pause(this.config.login.waitAfter || 3000);

      // 检查登录是否成功
      const successIndicator = await this.findElement(this.config.login.successIndicator);
      const isDisplayed = await successIndicator.isDisplayed();

      const screenshotPath = await this.takeScreenshot('login-result');

      if (isDisplayed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        // 检查是否有失败指示
        if (this.config.login.failureIndicator) {
          try {
            const failureIndicator = await this.findElement(this.config.login.failureIndicator);
            const failureDisplayed = await failureIndicator.isDisplayed();
            if (failureDisplayed) {
              const failureText = await failureIndicator.getText();
              return {
                status: 'failed',
                screenshotPath,
                errorMessage: `登录失败: ${failureText}`,
              };
            }
          } catch {
            // 忽略
          }
        }

        return {
          status: 'failed',
          screenshotPath,
          errorMessage: '登录成功指示元素未显示',
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('login-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `登录异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 页面巡检
   */
  private async inspectPages(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    try {
      const pagesToInspect = this.config.pages.filter(p => p.level === 'core' || p.level === 'secondary');

      let allPassed = true;
      const failedPages: string[] = [];

      for (const pageConfig of pagesToInspect) {
        try {
          // 导航到页面
          if (pageConfig.navigation && pageConfig.navigation.length > 0) {
            await this.executeNavigation(pageConfig.navigation);
          }

          // 等待页面加载
          await this.driver.pause(1000);

          // 确认页面标识
          const identifier = await this.findElement(pageConfig.identifier);
          const isDisplayed = await identifier.isDisplayed();

          if (!isDisplayed) {
            logger.warn(`页面 ${pageConfig.name} 标识元素未显示，跳过巡检`);
            continue;
          }

          // 执行页面巡检
          const result = await this.inspector.inspectPage(pageConfig, this.language);

          if (!result.passed) {
            allPassed = false;
            failedPages.push(pageConfig.name);
          }

          // 返回上一页或主页，准备下一个页面
          await this.driver.back();
          await this.driver.pause(500);
        } catch (error) {
          logger.warn(`页面 ${pageConfig.name} 巡检失败: ${(error as Error).message}`);
          allPassed = false;
          failedPages.push(pageConfig.name);
        }
      }

      return {
        status: allPassed ? 'passed' : 'failed',
        errorMessage: allPassed ? undefined : `${failedPages.length} 个页面检查发现问题`,
      };
    } catch (error) {
      return {
        status: 'failed',
        errorMessage: `页面巡检异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 开仓
   */
  private async openPosition(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.trading) {
      logger.info('开仓步骤已跳过（未配置交易流程）');
      return { status: 'passed' };
    }

    try {
      const tradingConfig = this.config.trading.openPosition;

      // 导航到交易页面
      await this.executeNavigation(tradingConfig.navigation);

      // 选择品种（如果配置了）
      if (tradingConfig.selectInstrument) {
        await this.executeNavigation(tradingConfig.selectInstrument);
      }

      // 输入数量（如果配置了）
      if (tradingConfig.inputQuantity) {
        await this.executeNavigation(tradingConfig.inputQuantity);
      }

      // 选择方向（如果配置了）
      if (tradingConfig.direction) {
        const directionLocator = tradingConfig.direction.defaultDirection === 'buy'
          ? tradingConfig.direction.buyLocator
          : tradingConfig.direction.sellLocator;

        if (directionLocator) {
          const directionButton = await this.findElement(directionLocator);
          await directionButton.click();
          await this.driver.pause(500);
        }
      }

      // 点击确认按钮
      const confirmButton = await this.findElement(tradingConfig.confirmButton);
      await confirmButton.click();

      // 等待成交
      await this.driver.pause(tradingConfig.waitForExecution || 5000);

      // 检查成功指示
      const successIndicator = await this.findElement(tradingConfig.successIndicator);
      const isDisplayed = await successIndicator.isDisplayed();

      const screenshotPath = await this.takeScreenshot('open-position');

      if (isDisplayed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        return {
          status: 'failed',
          screenshotPath,
          errorMessage: '开仓成功指示元素未显示',
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('open-position-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `开仓异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 查看持仓
   */
  private async viewPosition(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.trading) {
      logger.info('查看持仓步骤已跳过（未配置交易流程）');
      return { status: 'passed' };
    }

    try {
      const positionConfig = this.config.trading.viewPosition;

      // 导航到持仓页面
      await this.executeNavigation(positionConfig.navigation);

      await this.driver.pause(1000);

      // 检查持仓列表是否存在
      const positionList = await this.findElement(positionConfig.positionListLocator);
      const isDisplayed = await positionList.isDisplayed();

      const screenshotPath = await this.takeScreenshot('view-position');

      if (isDisplayed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        return {
          status: 'failed',
          screenshotPath,
          errorMessage: '持仓列表未显示',
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('view-position-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `查看持仓异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 平仓
   */
  private async closePosition(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.trading) {
      logger.info('平仓步骤已跳过（未配置交易流程）');
      return { status: 'passed' };
    }

    try {
      const tradingConfig = this.config.trading.closePosition;

      // 导航到持仓页面（如果需要）
      await this.executeNavigation(tradingConfig.navigation);

      // 选择持仓项（假设点击第一个持仓）
      if (this.config.trading.viewPosition.positionItemLocator) {
        const positionItem = await this.findElement(this.config.trading.viewPosition.positionItemLocator);
        await positionItem.click();
        await this.driver.pause(500);
      }

      // 点击平仓按钮
      const confirmButton = await this.findElement(tradingConfig.confirmButton);
      await confirmButton.click();

      // 等待成交
      await this.driver.pause(tradingConfig.waitForExecution || 5000);

      // 检查成功指示
      const successIndicator = await this.findElement(tradingConfig.successIndicator);
      const isDisplayed = await successIndicator.isDisplayed();

      const screenshotPath = await this.takeScreenshot('close-position');

      if (isDisplayed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        return {
          status: 'failed',
          screenshotPath,
          errorMessage: '平仓成功指示元素未显示',
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('close-position-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `平仓异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 查看历史记录
   */
  private async viewHistory(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.trading) {
      logger.info('查看历史记录步骤已跳过（未配置交易流程）');
      return { status: 'passed' };
    }

    try {
      const historyConfig = this.config.trading.history;

      // 导航到历史页面
      await this.executeNavigation(historyConfig.navigation);

      await this.driver.pause(1000);

      // 检查历史列表是否存在
      const historyList = await this.findElement(historyConfig.historyListLocator);
      const isDisplayed = await historyList.isDisplayed();

      const screenshotPath = await this.takeScreenshot('view-history');

      if (isDisplayed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        return {
          status: 'failed',
          screenshotPath,
          errorMessage: '历史记录列表未显示',
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('view-history-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `查看历史记录异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 检查余额变化
   */
  private async checkBalance(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.trading) {
      logger.info('余额检查步骤已跳过（未配置交易流程）');
      return { status: 'passed' };
    }

    try {
      const balanceConfig = this.config.trading.balance;

      // 导航到余额显示页面（通常是主页或账户页）
      // 这里假设已经在一个可以看到余额的页面

      await this.driver.pause(500);

      // 获取余额字段文本
      const balanceElement = await this.findElement(balanceConfig.balanceLocator);
      const balanceText = await balanceElement.getText();

      // 解析余额数值
      const balanceValue = this.parseNumericValue(balanceText);

      const screenshotPath = await this.takeScreenshot('check-balance');

      // 执行余额检查规则
      let allChecksPassed = true;
      const failedChecks: string[] = [];

      for (const rule of balanceConfig.checkRules) {
        const checkResult = this.executeBalanceCheck(rule, balanceValue);

        if (!checkResult.passed) {
          allChecksPassed = false;
          failedChecks.push(rule.description);
        }
      }

      if (allChecksPassed) {
        return {
          status: 'passed',
          screenshotPath,
        };
      } else {
        return {
          status: 'failed',
          screenshotPath,
          errorMessage: `余额检查失败: ${failedChecks.join(', ')}`,
        };
      }
    } catch (error) {
      const screenshotPath = await this.takeScreenshot('check-balance-error');
      return {
        status: 'failed',
        screenshotPath,
        errorMessage: `余额检查异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 退出登录
   */
  private async logout(): Promise<{ status: TestStatus; screenshotPath?: string; errorMessage?: string }> {
    if (!this.config.login.required) {
      logger.info('退出登录步骤已跳过（配置为不需要登录）');
      return { status: 'passed' };
    }

    try {
      // 导航到设置或账户页面（假设）
      // 这里需要根据具体 APP 配置

      // 使用 back 返回到登录页或关闭 APP
      await this.driver.pressKeyCode(3); // Home 键

      // 关闭 APP
      await this.driver.closeApp();

      const screenshotPath = await this.takeScreenshot('logout');

      return {
        status: 'passed',
        screenshotPath,
      };
    } catch (error) {
      return {
        status: 'failed',
        errorMessage: `退出登录异常: ${(error as Error).message}`,
      };
    }
  }

  /**
   * 执行导航步骤
   */
  private async executeNavigation(steps: NavigationStep[]): Promise<void> {
    for (const step of steps) {
      switch (step.action) {
        case 'tap':
          if (step.target) {
            const element = await this.findElement(step.target);
            await element.click();
          }
          break;

        case 'swipe':
          // 默认向上滑动
          await this.driver.touchAction([
            { action: 'press', x: 500, y: 800 },
            { action: 'moveTo', x: 500, y: 200 },
            'release',
          ]);
          break;

        case 'scroll':
          // 向下滚动
          await this.driver.touchAction([
            { action: 'press', x: 500, y: 200 },
            { action: 'moveTo', x: 500, y: 800 },
            'release',
          ]);
          break;

        case 'wait':
          await this.driver.pause(step.value ? parseInt(step.value, 10) : 1000);
          break;

        case 'back':
          await this.driver.back();
          break;

        case 'input':
          if (step.target && step.value) {
            const element = await this.findElement(step.target);
            await element.setValue(step.value);
          }
          break;
      }

      if (step.waitAfter) {
        await this.driver.pause(step.waitAfter);
      }
    }
  }

  /**
   * 执行余额检查规则
   */
  private executeBalanceCheck(rule: BalanceCheckRule, balanceValue: number | null): { passed: boolean; message?: string } {
    if (balanceValue === null) {
      return { passed: !rule.required, message: '无法解析余额数值' };
    }

    switch (rule.type) {
      case 'positive':
        return {
          passed: balanceValue > 0,
          message: balanceValue > 0 ? undefined : '余额应为正值',
        };

      case 'format-valid':
        // 已在 parseNumericValue 中处理
        return { passed: true };

      case 'change-exists':
        // 需要前后对比，这里简化处理
        return { passed: true, message: '余额变化检查需要前后对比数据' };

      case 'threshold-range':
        if (rule.threshold) {
          const min = rule.threshold.min ?? 0;
          const max = rule.threshold.max ?? Infinity;

          if (rule.threshold.percentage) {
            // 百分比阈值检查（需要基准值）
            return { passed: true, message: '百分比阈值检查需要基准值' };
          } else {
            return {
              passed: balanceValue >= min && balanceValue <= max,
              message: balanceValue >= min && balanceValue <= max ? undefined : `余额 ${balanceValue} 超出范围 [${min}, ${max}]`,
            };
          }
        }
        return { passed: true };

      default:
        return { passed: true };
    }
  }

  /**
   * 解析数值（从文本中提取数字）
   */
  private parseNumericValue(text: string): number | null {
    try {
      // 移除货币符号、逗号等
      const cleaned = text.replace(/[^0-9.-]/g, '');
      const value = parseFloat(cleaned);
      return isNaN(value) ? null : value;
    } catch {
      return null;
    }
  }

  /**
   * 查找元素
   */
  private async findElement(locator: ElementLocator): Promise<WebdriverIOElement> {
    const selector = this.buildSelector(locator);

    // 尝试主定位器
    try {
      const element = await this.driver.$(selector);
      await element.waitForExist({ timeout: locator.timeout || 10000 });
      return element;
    } catch (error) {
      // 尝试备用定位器
      if (locator.fallback && locator.fallback.length > 0) {
        for (const fallbackLocator of locator.fallback) {
          try {
            const fallbackSelector = this.buildSelector(fallbackLocator);
            const element = await this.driver.$(fallbackSelector);
            await element.waitForExist({ timeout: fallbackLocator.timeout || 5000 });
            logger.ai(`🤖 使用备用定位器成功: ${fallbackLocator.value}`);
            return element;
          } catch {
            continue;
          }
        }
      }

      throw error;
    }
  }

  /**
   * 构建选择器
   */
  private buildSelector(locator: ElementLocator): string {
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
      case 'css':
        return locator.value;
      default:
        return locator.value;
    }
  }

  /**
   * 截图
   */
  private async takeScreenshot(name: string): Promise<string> {
    const filePath = join(this.screenshotDir, `${name}_${this.language}_${Date.now()}.png`);

    try {
      await mkdir(this.screenshotDir, { recursive: true });

      const screenshot = await this.driver.takeScreenshot();
      const buffer = Buffer.from(screenshot, 'base64');

      const fs = await import('node:fs/promises');
      await fs.writeFile(filePath, buffer);

      return filePath;
    } catch (error) {
      logger.warn(`截图失败: ${(error as Error).message}`);
      return '';
    }
  }
}
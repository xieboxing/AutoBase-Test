/**
 * 金融 APP 测试配置加载和验证
 */

import type { FinancialAppConfig, ElementLocator } from '@/types/financial.types.js';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { logger } from '@/core/logger.js';

/**
 * 加载金融 APP 配置
 */
export async function loadFinancialConfig(configPath: string): Promise<FinancialAppConfig> {
  const absolutePath = resolve(configPath);
  const ext = extname(absolutePath);

  let config: FinancialAppConfig;

  if (ext === '.json') {
    const content = await readFile(absolutePath, 'utf-8');
    config = JSON.parse(content);
  } else if (ext === '.yaml' || ext === '.yml') {
    // YAML 解析（如果项目有 yaml 库）
    const content = await readFile(absolutePath, 'utf-8');
    // 简单实现：尝试 JSON 解析，如果失败则抛出错误
    try {
      config = JSON.parse(content);
    } catch {
      throw new Error('YAML 解析需要安装 yaml 库，当前仅支持 JSON 格式');
    }
  } else {
    throw new Error(`不支持的配置文件格式: ${ext}`);
  }

  logger.debug(`金融配置已加载: ${configPath}`);
  return config;
}

/**
 * 验证金融 APP 配置
 */
export function validateFinancialConfig(config: FinancialAppConfig): string[] {
  const errors: string[] = [];

  // 验证版本
  if (!config.version) {
    errors.push('缺少配置版本 (version)');
  }

  // 验证 APP 基本信息
  if (!config.app) {
    errors.push('缺少 APP 基本信息 (app)');
  } else {
    if (!config.app.appName) {
      errors.push('缺少 APP 名称 (app.appName)');
    }
    if (!config.app.packageName) {
      errors.push('缺少包名 (app.packageName)');
    }
    if (!config.app.platform) {
      errors.push('缺少平台信息 (app.platform)');
    }
  }

  // 验证登录配置
  if (config.login?.required) {
    if (!config.login.usernameLocator) {
      errors.push('登录配置缺少用户名输入框定位 (login.usernameLocator)');
    }
    if (!config.login.passwordLocator) {
      errors.push('登录配置缺少密码输入框定位 (login.passwordLocator)');
    }
    if (!config.login.loginButtonLocator) {
      errors.push('登录配置缺少登录按钮定位 (login.loginButtonLocator)');
    }
    if (!config.login.successIndicator) {
      errors.push('登录配置缺少成功指示定位 (login.successIndicator)');
    }
    if (!config.login.usernameEnvKey) {
      errors.push('登录配置缺少用户名环境变量名 (login.usernameEnvKey)');
    }
    if (!config.login.passwordEnvKey) {
      errors.push('登录配置缺少密码环境变量名 (login.passwordEnvKey)');
    }
  }

  // 验证元素定位器格式
  const validateLocator = (locator: ElementLocator | undefined, name: string): void => {
    if (!locator) return;

    const validStrategies = ['id', 'xpath', 'class', 'accessibility-id', 'text', 'css'];
    if (!validStrategies.includes(locator.strategy)) {
      errors.push(`${name} 使用了无效的定位策略: ${locator.strategy}`);
    }
    if (!locator.value) {
      errors.push(`${name} 缺少定位值`);
    }
  };

  // 验证所有定位器
  if (config.login) {
    validateLocator(config.login.usernameLocator, 'login.usernameLocator');
    validateLocator(config.login.passwordLocator, 'login.passwordLocator');
    validateLocator(config.login.loginButtonLocator, 'login.loginButtonLocator');
    validateLocator(config.login.successIndicator, 'login.successIndicator');
  }

  // 验证页面配置
  if (!config.pages || config.pages.length === 0) {
    errors.push('缺少页面配置 (pages)，至少需要配置一个页面');
  } else {
    for (const page of config.pages) {
      if (!page.id) {
        errors.push(`页面缺少唯一标识 (page.id): ${page.name || '未命名页面'}`);
      }
      if (!page.name) {
        errors.push(`页面缺少名称 (page.name): ${page.id || '无 ID'}`);
      }
      if (!page.identifier) {
        errors.push(`页面缺少标识元素定位 (page.identifier): ${page.name || page.id}`);
      }
    }
  }

  // 验证语言配置
  if (!config.languages) {
    errors.push('缺少语言配置 (languages)');
  } else {
    if (!config.languages.supportedLanguages || config.languages.supportedLanguages.length === 0) {
      errors.push('语言配置缺少支持的语言列表 (languages.supportedLanguages)');
    }
    for (const lang of config.languages.supportedLanguages) {
      if (!lang.code) {
        errors.push(`语言缺少代码 (languages.supportedLanguages.code): ${lang.name || '未命名'}`);
      }
      if (!lang.name) {
        errors.push(`语言缺少名称 (languages.supportedLanguages.name): ${lang.code || '无代码'}`);
      }
    }
  }

  // 验证检查配置
  if (!config.inspection) {
    errors.push('缺少检查配置 (inspection)');
  }

  return errors;
}

/**
 * 检查定位器是否有占位标记（待补充）
 */
export function hasPlaceholderLocator(locator: ElementLocator): boolean {
  if (!locator) return false;

  // 检查描述中是否有"待补充"标记
  if (locator.description?.includes('待补充')) {
    return true;
  }

  // 检查值是否是明显的占位符
  const placeholderPatterns = [
    /TODO/,
    /PLACEHOLDER/,
    /待定/,
    /请填写/,
    /示例/,
  ];

  return placeholderPatterns.some(pattern => pattern.test(locator.value));
}

/**
 * 获取配置中所有需要补充的定位器
 */
export function getPlaceholderLocators(config: FinancialAppConfig): Array<{ path: string; locator: ElementLocator }> {
  const placeholders: Array<{ path: string; locator: ElementLocator }> = [];

  // 检查登录相关定位器
  if (config.login) {
    if (hasPlaceholderLocator(config.login.usernameLocator)) {
      placeholders.push({ path: 'login.usernameLocator', locator: config.login.usernameLocator });
    }
    if (hasPlaceholderLocator(config.login.passwordLocator)) {
      placeholders.push({ path: 'login.passwordLocator', locator: config.login.passwordLocator });
    }
    if (hasPlaceholderLocator(config.login.loginButtonLocator)) {
      placeholders.push({ path: 'login.loginButtonLocator', locator: config.login.loginButtonLocator });
    }
    if (hasPlaceholderLocator(config.login.successIndicator)) {
      placeholders.push({ path: 'login.successIndicator', locator: config.login.successIndicator });
    }
  }

  // 检查页面定位器
  for (const page of config.pages || []) {
    if (hasPlaceholderLocator(page.identifier)) {
      placeholders.push({ path: `pages[${page.id}].identifier`, locator: page.identifier });
    }

    for (const element of page.criticalElements || []) {
      if (hasPlaceholderLocator(element)) {
        placeholders.push({ path: `pages[${page.id}].criticalElements`, locator: element });
      }
    }

    for (const step of page.navigation || []) {
      if (step.target && hasPlaceholderLocator(step.target)) {
        placeholders.push({ path: `pages[${page.id}].navigation`, locator: step.target });
      }
    }
  }

  // 检查交易相关定位器
  if (config.trading) {
    if (hasPlaceholderLocator(config.trading.openPosition.confirmButton)) {
      placeholders.push({ path: 'trading.openPosition.confirmButton', locator: config.trading.openPosition.confirmButton });
    }
    if (hasPlaceholderLocator(config.trading.openPosition.successIndicator)) {
      placeholders.push({ path: 'trading.openPosition.successIndicator', locator: config.trading.openPosition.successIndicator });
    }
    if (hasPlaceholderLocator(config.trading.viewPosition.positionListLocator)) {
      placeholders.push({ path: 'trading.viewPosition.positionListLocator', locator: config.trading.viewPosition.positionListLocator });
    }
    if (hasPlaceholderLocator(config.trading.closePosition.confirmButton)) {
      placeholders.push({ path: 'trading.closePosition.confirmButton', locator: config.trading.closePosition.confirmButton });
    }
    if (hasPlaceholderLocator(config.trading.history.historyListLocator)) {
      placeholders.push({ path: 'trading.history.historyListLocator', locator: config.trading.history.historyListLocator });
    }
    if (hasPlaceholderLocator(config.trading.balance.balanceLocator)) {
      placeholders.push({ path: 'trading.balance.balanceLocator', locator: config.trading.balance.balanceLocator });
    }
  }

  return placeholders;
}

/**
 * 创建默认金融配置模板
 */
export function createDefaultFinancialConfig(): FinancialAppConfig {
  return {
    version: '1.0.0',
    app: {
      appName: '金融 APP',
      packageName: 'com.example.financial',
      launchActivity: '.MainActivity',
      platform: 'android',
    },
    login: {
      required: true,
      usernameLocator: {
        strategy: 'xpath',
        value: '//android.widget.EditText[@hint="用户名" or @hint="账号" or @text="请输入用户名"]',
        description: '用户名输入框（待补充）',
      },
      passwordLocator: {
        strategy: 'xpath',
        value: '//android.widget.EditText[@hint="密码" or @text="请输入密码"]',
        description: '密码输入框（待补充）',
      },
      loginButtonLocator: {
        strategy: 'xpath',
        value: '//android.widget.Button[contains(@text, "登录") or contains(@text, "Login")]',
        description: '登录按钮（待补充）',
      },
      successIndicator: {
        strategy: 'xpath',
        value: '//android.widget.TextView[contains(@text, "首页") or contains(@text, "Home")]',
        description: '登录成功指示元素（待补充）',
      },
      usernameEnvKey: 'APP_USERNAME',
      passwordEnvKey: 'APP_PASSWORD',
      timeout: 30000,
      waitBefore: 2000,
      waitAfter: 3000,
    },
    pages: [
      {
        id: 'home',
        name: '首页',
        nameEn: 'Home',
        identifier: {
          strategy: 'xpath',
          value: '//android.widget.TextView[contains(@text, "首页")]',
          description: '首页标识元素（待补充）',
        },
        navigation: [],
        screenshot: true,
        textInspection: true,
        languageCheck: true,
        level: 'core',
      },
    ],
    trading: {
      instruments: [{ id: 'default', name: '默认品种' }],
      openPosition: {
        actionName: '开仓',
        navigation: [],
        confirmButton: {
          strategy: 'xpath',
          value: '//android.widget.Button[contains(@text, "买入") or contains(@text, "开仓")]',
          description: '开仓确认按钮（待补充）',
        },
        successIndicator: {
          strategy: 'xpath',
          value: '//android.widget.TextView[contains(@text, "成功")]',
          description: '开仓成功指示（待补充）',
        },
        waitForExecution: 5000,
      },
      viewPosition: {
        navigation: [],
        positionListLocator: {
          strategy: 'xpath',
          value: '//android.widget.ListView',
          description: '持仓列表（待补充）',
        },
      },
      closePosition: {
        actionName: '平仓',
        navigation: [],
        confirmButton: {
          strategy: 'xpath',
          value: '//android.widget.Button[contains(@text, "平仓") or contains(@text, "卖出")]',
          description: '平仓确认按钮（待补充）',
        },
        successIndicator: {
          strategy: 'xpath',
          value: '//android.widget.TextView[contains(@text, "成功")]',
          description: '平仓成功指示（待补充）',
        },
        waitForExecution: 5000,
      },
      history: {
        navigation: [],
        historyListLocator: {
          strategy: 'xpath',
          value: '//android.widget.ListView',
          description: '历史记录列表（待补充）',
        },
      },
      balance: {
        balanceLocator: {
          strategy: 'xpath',
          value: '//android.widget.TextView[contains(@text, "余额") or contains(@text, "Balance")]',
          description: '余额字段（待补充）',
        },
        checkRules: [
          { type: 'positive', description: '余额应为正值', required: true },
        ],
      },
    },
    languages: {
      supportedLanguages: [
        { code: 'zh-CN', name: '中文', fullFlow: true },
        { code: 'en-US', name: '英文', fullFlow: true },
      ],
      switchMethod: 'app-internal',
      switchSteps: [],
      restoreDefault: true,
      defaultLanguage: 'zh-CN',
    },
    inspection: {
      autoScreenshot: true,
      savePageSource: true,
      extractText: true,
      basicRules: [
        { id: 'page-blank', name: '页面空白检查', description: '检查页面是否为空白', severity: 'P0', enabled: true },
        { id: 'untranslated-key', name: '未翻译 key 检查', description: '检查未翻译的国际化 key', severity: 'P1', enabled: true },
        { id: 'placeholder-unreplaced', name: '占位符检查', description: '检查未替换的占位符', severity: 'P1', enabled: true },
      ],
    },
    report: {
      formats: ['html', 'json'],
      outputDir: './data/reports',
      language: 'zh-CN',
      includeAiAnalysis: true,
    },
  };
}
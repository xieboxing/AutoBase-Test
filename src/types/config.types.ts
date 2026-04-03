import type { Platform, TestType } from './test-case.types.js';
import type { ReportFormat } from './report.types.js';

/**
 * 测试目标配置
 */
export interface TestTargetConfig {
  web?: {
    url: string;
    loginUrl?: string;
    credentials?: {
      username: string;
      password: string;
    };
  };
  h5?: {
    url: string;
    devices?: string[];
  };
  app?: {
    apkPath?: string;
    packageName?: string;
    mainActivity?: string;
  };
  api?: {
    baseUrl: string;
    authToken?: string;
  };
}

/**
 * 测试设置配置
 */
export interface TestSettingsConfig {
  testDepth: number;
  timeout: number;
  retryCount: number;
  parallelism: number;
  screenshotOnFailure: boolean;
  screenshotOnEveryStep: boolean;
  videoOnFailure: boolean;
  enableAiOptimization: boolean;
  enableAiFallback: boolean;
  reportFormats: ReportFormat[];
  reportLanguage: 'zh-CN' | 'en-US';
  defaultTestType: TestType;
  defaultPlatform: Platform;
  defaultBrowser: 'chromium' | 'firefox' | 'webkit';
  defaultViewport: {
    width: number;
    height: number;
  };
}

/**
 * 通知配置
 */
export interface NotifyConfig {
  email?: string;
  webhook?: string;
}

/**
 * 定时任务配置
 */
export interface ScheduleConfig {
  enabled: boolean;
  cron?: string;
}

/**
 * 项目配置
 */
export interface ProjectConfig {
  project: {
    name: string;
    description?: string;
  };
  targets: TestTargetConfig;
  settings: TestSettingsConfig;
  schedule?: ScheduleConfig;
  notify?: NotifyConfig;
}
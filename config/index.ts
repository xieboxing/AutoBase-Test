import { z } from 'zod';
import { defaultConfig } from './default.config.js';
import { aiConfigSchema, type AiConfig } from './ai.config.js';

/**
 * 全局配置 Schema
 */
export const globalConfigSchema = z.object({
  testDepth: z.number().int().min(1).max(10).default(defaultConfig.testDepth),
  timeout: z.number().int().min(1000).max(300000).default(defaultConfig.timeout),
  retryCount: z.number().int().min(0).max(10).default(defaultConfig.retryCount),
  parallelism: z.number().int().min(1).max(10).default(defaultConfig.parallelism),
  screenshotOnFailure: z.boolean().default(defaultConfig.screenshotOnFailure),
  screenshotOnEveryStep: z.boolean().default(defaultConfig.screenshotOnEveryStep),
  videoOnFailure: z.boolean().default(defaultConfig.videoOnFailure),
  enableAiOptimization: z.boolean().default(defaultConfig.enableAiOptimization),
  enableAiFallback: z.boolean().default(defaultConfig.enableAiFallback),
  reportFormats: z.array(z.enum(['html', 'json', 'markdown', 'console'])).default(defaultConfig.reportFormats),
  reportLanguage: z.enum(['zh-CN', 'en-US']).default('zh-CN'),
  defaultTestType: z.enum(['smoke', 'full', 'regression', 'performance', 'security', 'accessibility', 'visual', 'monkey']).default(defaultConfig.defaultTestType),
  defaultPlatform: z.enum(['pc-web', 'h5-web', 'android-app', 'api']).default(defaultConfig.defaultPlatform),
  defaultBrowser: z.enum(['chromium', 'firefox', 'webkit']).default(defaultConfig.defaultBrowser),
  defaultViewport: z.object({
    width: z.number().int().min(320).max(3840),
    height: z.number().int().min(240).max(2160),
  }).default(defaultConfig.defaultViewport),
  ai: aiConfigSchema.optional(),
});

/**
 * 全局配置类型
 */
export type GlobalConfig = z.infer<typeof globalConfigSchema> & {
  ai?: AiConfig;
};

/**
 * 项目测试目标配置
 */
export const targetConfigSchema = z.object({
  web: z.object({
    url: z.string().url(),
    loginUrl: z.string().optional(),
    credentials: z.object({
      username: z.string(),
      password: z.string(),
    }).optional(),
  }).optional(),
  h5: z.object({
    url: z.string().url(),
    devices: z.array(z.string()).optional(),
  }).optional(),
  app: z.object({
    apkPath: z.string().optional(),
    packageName: z.string().optional(),
    mainActivity: z.string().optional(),
  }).optional(),
  api: z.object({
    baseUrl: z.string().url(),
    authToken: z.string().optional(),
  }).optional(),
});

/**
 * 项目配置 Schema
 */
export const projectConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
  }),
  targets: targetConfigSchema,
  settings: globalConfigSchema,
  schedule: z.object({
    enabled: z.boolean().default(false),
    cron: z.string().optional(),
  }).optional(),
});

/**
 * 项目配置类型
 */
export type ProjectConfig = z.infer<typeof projectConfigSchema>;

/**
 * 验证全局配置
 */
export function validateGlobalConfig(config: Partial<GlobalConfig>): GlobalConfig {
  return globalConfigSchema.parse(config);
}

/**
 * 验证项目配置
 */
export function validateProjectConfig(config: unknown): ProjectConfig {
  return projectConfigSchema.parse(config);
}

/**
 * 合并配置（用户配置覆盖默认配置）
 */
export function mergeConfig(userConfig: Partial<GlobalConfig>): GlobalConfig {
  return {
    ...defaultConfig,
    ...userConfig,
    defaultViewport: {
      ...defaultConfig.defaultViewport,
      ...userConfig.defaultViewport,
    },
  } as GlobalConfig;
}

// 导出子模块
export { defaultConfig, type DefaultConfig } from './default.config.js';
export { devices, responsiveViewports, getDeviceConfig, getMobileDevices, getTabletDevices, type DeviceConfig } from './devices.config.js';
export { aiConfigSchema, defaultAiConfig, providerModels, getDefaultModel, validateAiConfig, type AiConfig, type AiProvider } from './ai.config.js';
import type { TestType, ReportFormat, Platform } from '../src/types/index.js';

/**
 * 默认全局配置
 */
export const defaultConfig = {
  // 测试设置
  testDepth: 3,                         // AI 探索深度
  timeout: 30000,                       // 单步超时 ms
  retryCount: 2,                        // 失败重试次数
  parallelism: 3,                       // 并行度

  // 截图/录屏
  screenshotOnFailure: true,            // 失败时截图
  screenshotOnEveryStep: false,         // 每步截图（调试用）
  videoOnFailure: true,                 // 失败时录屏

  // AI 设置
  enableAiOptimization: true,           // 启用 AI 自优化
  enableAiFallback: true,               // AI 不可用时降级到规则引擎

  // 报告设置
  reportFormats: ['html', 'json'] as ReportFormat[],
  reportLanguage: 'zh-CN',              // 报告语言

  // 默认测试类型
  defaultTestType: 'smoke' as TestType,

  // 默认平台
  defaultPlatform: 'pc-web' as Platform,

  // 默认浏览器
  defaultBrowser: 'chromium' as const,

  // 默认视口
  defaultViewport: {
    width: 1920,
    height: 1080,
  },
};

export type DefaultConfig = typeof defaultConfig;
/**
 * 金融 APP 测试类型定义
 * 用于配置化和可复用的金融业务流程测试
 */

import type { TestCasePriority, TestStatus } from './test-case.types.js';

// 重新导出 TestCasePriority 供其他模块使用
export type { TestCasePriority } from './test-case.types.js';

/**
 * 金融 APP 配置
 */
export interface FinancialAppConfig {
  /** 配置版本 */
  version: string;
  /** APP 基本信息 */
  app: AppInfo;
  /** 登录配置 */
  login: LoginConfig;
  /** 页面清单配置 */
  pages: PageConfig[];
  /** 交易流程配置 */
  trading?: TradingConfig;
  /** 语言切换配置 */
  languages: LanguageConfig;
  /** 检查配置 */
  inspection: InspectionConfig;
  /** 报告配置 */
  report?: ReportConfig;
}

/**
 * APP 基本信息
 */
export interface AppInfo {
  /** APP 名称 */
  appName: string;
  /** APK 文件路径（相对或绝对） */
  apkPath?: string;
  /** 包名（已安装应用） */
  packageName: string;
  /** 主 Activity */
  launchActivity?: string;
  /** 版本号 */
  version?: string;
  /** 平台信息 */
  platform: 'android' | 'ios';
  /** 设备要求 */
  deviceRequirements?: DeviceRequirements;
}

/**
 * 设备要求
 */
export interface DeviceRequirements {
  /** 最低 Android 版本 */
  minAndroidVersion?: string;
  /** 最低 iOS 版本 */
  minIosVersion?: string;
  /** 屏幕分辨率要求 */
  screenResolution?: string;
  /** 是否需要 root/越狱 */
  requiresRoot?: boolean;
}

/**
 * 登录配置
 */
export interface LoginConfig {
  /** 是否需要登录 */
  required: boolean;
  /** 用户名输入框定位 */
  usernameLocator: ElementLocator;
  /** 密码输入框定位 */
  passwordLocator: ElementLocator;
  /** 登录按钮定位 */
  loginButtonLocator: ElementLocator;
  /** 登录成功判定元素 */
  successIndicator: ElementLocator;
  /** 登录失败判定元素（可选） */
  failureIndicator?: ElementLocator;
  /** 账号环境变量名（不硬编码账号） */
  usernameEnvKey: string;
  /** 密码环境变量名 */
  passwordEnvKey: string;
  /** 登录超时时间（毫秒） */
  timeout?: number;
  /** 登录前等待时间 */
  waitBefore?: number;
  /** 登录后等待时间 */
  waitAfter?: number;
}

/**
 * 元素定位器
 */
export interface ElementLocator {
  /** 定位策略 */
  strategy: 'id' | 'xpath' | 'class' | 'accessibility-id' | 'text' | 'css';
  /** 定位值 */
  value: string;
  /** 描述说明 */
  description?: string;
  /** 备用定位器（用于自愈） */
  fallback?: ElementLocator[];
  /** 等待超时 */
  timeout?: number;
}

/**
 * 页面配置
 */
export interface PageConfig {
  /** 页面唯一标识 */
  id: string;
  /** 页面名称（中文） */
  name: string;
  /** 页面名称（英文） */
  nameEn?: string;
  /** 页面标识元素（用于确认进入该页面） */
  identifier: ElementLocator;
  /** 导航进入方式 */
  navigation: NavigationStep[];
  /** 是否需要截图 */
  screenshot: boolean;
  /** 是否需要文本巡检 */
  textInspection: boolean;
  /** 是否纳入多语言检查 */
  languageCheck: boolean;
  /** 页面级别 */
  level: 'core' | 'secondary' | 'optional';
  /** 关键元素检查 */
  criticalElements?: ElementLocator[];
  /** 页面特定检查规则 */
  customRules?: PageInspectionRule[];
}

/**
 * 导航步骤
 */
export interface NavigationStep {
  /** 步骤顺序 */
  order: number;
  /** 动作类型 */
  action: 'tap' | 'swipe' | 'scroll' | 'wait' | 'back' | 'input';
  /** 目标元素定位 */
  target?: ElementLocator;
  /** 输入值（环境变量名或固定值） */
  value?: string;
  /** 等待时间（毫秒） */
  waitAfter?: number;
  /** 步骤描述 */
  description: string;
}

/**
 * 交易流程配置
 */
export interface TradingConfig {
  /** 交易品种 */
  instruments: TradingInstrument[];
  /** 开仓配置 */
  openPosition: TradingActionConfig;
  /** 查看持仓配置 */
  viewPosition: ViewPositionConfig;
  /** 平仓配置 */
  closePosition: TradingActionConfig;
  /** 历史记录配置 */
  history: HistoryConfig;
  /** 余额检查配置 */
  balance: BalanceConfig;
}

/**
 * 交易品种配置
 */
export interface TradingInstrument {
  /** 品种标识 */
  id: string;
  /** 品种名称 */
  name: string;
  /** 品种定位（如何选择该品种） */
  locator?: ElementLocator;
  /** 默认数量/手数 */
  defaultQuantity?: number;
  /** 最小数量 */
  minQuantity?: number;
  /** 最大数量 */
  maxQuantity?: number;
}

/**
 * 交易动作配置（开仓/平仓）
 */
export interface TradingActionConfig {
  /** 动作名称 */
  actionName: string;
  /** 进入交易页面的导航步骤 */
  navigation: NavigationStep[];
  /** 选择品种的步骤 */
  selectInstrument?: NavigationStep[];
  /** 输入数量/手数的步骤 */
  inputQuantity?: NavigationStep[];
  /** 方向选择（买入/卖出） */
  direction?: DirectionConfig;
  /** 确认按钮定位 */
  confirmButton: ElementLocator;
  /** 成功判定 */
  successIndicator: ElementLocator;
  /** 失败判定（可选） */
  failureIndicator?: ElementLocator;
  /** 超时时间 */
  timeout?: number;
  /** 等待成交时间 */
  waitForExecution?: number;
}

/**
 * 方向配置
 */
export interface DirectionConfig {
  /** 买入按钮定位 */
  buyLocator?: ElementLocator;
  /** 卖出按钮定位 */
  sellLocator?: ElementLocator;
  /** 默认方向 */
  defaultDirection: 'buy' | 'sell';
}

/**
 * 查看持仓配置
 */
export interface ViewPositionConfig {
  /** 进入持仓页面的导航步骤 */
  navigation: NavigationStep[];
  /** 持仓列表定位 */
  positionListLocator: ElementLocator;
  /** 单条持仓项定位 */
  positionItemLocator?: ElementLocator;
  /** 持仓品种字段定位 */
  instrumentFieldLocator?: ElementLocator;
  /** 持仓数量字段定位 */
  quantityFieldLocator?: ElementLocator;
  /** 持仓价格字段定位 */
  priceFieldLocator?: ElementLocator;
}

/**
 * 历史记录配置
 */
export interface HistoryConfig {
  /** 进入历史页面的导航步骤 */
  navigation: NavigationStep[];
  /** 历史列表定位 */
  historyListLocator: ElementLocator;
  /** 历史项定位 */
  historyItemLocator?: ElementLocator;
  /** 时间范围选择 */
  timeRangeSelector?: ElementLocator;
}

/**
 * 余额检查配置
 */
export interface BalanceConfig {
  /** 余额字段定位 */
  balanceLocator: ElementLocator;
  /** 净值字段定位（可选） */
  equityLocator?: ElementLocator;
  /** 可用余额字段定位（可选） */
  availableLocator?: ElementLocator;
  /** 检查规则 */
  checkRules: BalanceCheckRule[];
}

/**
 * 余额检查规则
 */
export interface BalanceCheckRule {
  /** 规则类型 */
  type: 'change-exists' | 'threshold-range' | 'positive' | 'format-valid';
  /** 规则描述 */
  description: string;
  /** 变化阈值（用于 threshold-range） */
  threshold?: {
    min?: number;
    max?: number;
    percentage?: boolean;
  };
  /** 是否必须 */
  required: boolean;
}

/**
 * 语言配置
 */
export interface LanguageConfig {
  /** 支持的语言列表 */
  supportedLanguages: SupportedLanguage[];
  /** 语言切换方式 */
  switchMethod: 'app-internal' | 'system' | 'settings-menu';
  /** 语言切换步骤 */
  switchSteps: LanguageSwitchStep[];
  /** 执行完后是否恢复默认语言 */
  restoreDefault: boolean;
  /** 默认语言 */
  defaultLanguage: string;
}

/**
 * 支持的语言
 */
export interface SupportedLanguage {
  /** 语言代码 */
  code: string;
  /** 语言名称 */
  name: string;
  /** 是否执行完整流程 */
  fullFlow: boolean;
  /** 语言特定检查项 */
  specificChecks?: LanguageSpecificCheck[];
}

/**
 * 语言切换步骤
 */
export interface LanguageSwitchStep {
  /** 目标语言代码 */
  targetLanguage: string;
  /** 导航步骤 */
  navigation: NavigationStep[];
  /** 语言选择定位 */
  languageSelector?: ElementLocator;
  /** 等待时间 */
  waitAfter?: number;
}

/**
 * 语言特定检查项
 */
export interface LanguageSpecificCheck {
  /** 检查类型 */
  type: 'text-encoding' | 'date-format' | 'number-format' | 'currency-symbol';
  /** 检查元素定位 */
  locator?: ElementLocator;
  /** 期望格式 */
  expectedFormat?: string;
}

/**
 * 检查配置
 */
export interface InspectionConfig {
  /** 是否自动截图 */
  autoScreenshot: boolean;
  /** 是否保存 page source */
  savePageSource: boolean;
  /** 是否提取文本 */
  extractText: boolean;
  /** 基础规则检测 */
  basicRules: InspectionRule[];
  /** 截图保存路径 */
  screenshotDir?: string;
  /** page source 保存路径 */
  pageSourceDir?: string;
}

/**
 * 检查规则
 */
export interface InspectionRule {
  /** 规则标识 */
  id: string;
  /** 规则名称 */
  name: string;
  /** 规则描述 */
  description: string;
  /** 严重级别 */
  severity: TestCasePriority;
  /** 是否启用 */
  enabled: boolean;
  /** 规则参数 */
  parameters?: Record<string, unknown>;
}

/**
 * 页面特定检查规则
 */
export interface PageInspectionRule extends InspectionRule {
  /** 适用的元素定位 */
  targetElements?: ElementLocator[];
  /** 期望值 */
  expectedValue?: string;
  /** 允许偏差 */
  tolerance?: number;
}

/**
 * 报告配置
 */
export interface ReportConfig {
  /** 报告格式 */
  formats: ('html' | 'json' | 'markdown')[];
  /** 输出目录 */
  outputDir: string;
  /** 报告语言 */
  language: 'zh-CN' | 'en-US';
  /** 是否包含 AI 分析 */
  includeAiAnalysis?: boolean;
  /** 是否包含趋势对比 */
  includeTrend?: boolean;
}

/**
 * 页面巡检结果
 */
export interface PageInspectionResult {
  /** 页面标识 */
  pageId: string;
  /** 页面名称 */
  pageName: string;
  /** 当前语言 */
  language: string;
  /** 检查时间 */
  timestamp: string;
  /** 截图路径 */
  screenshotPath: string;
  /** page source 路径 */
  pageSourcePath?: string;
  /** 第二轮增强：标注截图路径 */
  annotatedScreenshotPath?: string;
  /** 提取的文本 */
  extractedText?: string;
  /** 第二轮增强：OCR 结果 */
  ocrResults?: OcrResult[];
  /** 发现的问题（第二轮增强后可能包含扩展信息） */
  issues: InspectionIssue[] | EnhancedInspectionIssue[];
  /** 检查通过 */
  passed: boolean;
  /** 检查耗时 */
  durationMs: number;
}

/**
 * 检查问题
 */
export interface InspectionIssue {
  /** 问题唯一标识 */
  id: string;
  /** 问题类型 */
  type: InspectionIssueType;
  /** 问题说明 */
  description: string;
  /** 页面名称 */
  pageName: string;
  /** 当前语言 */
  language: string;
  /** 严重级别 */
  severity: TestCasePriority;
  /** 置信度（0-1） */
  confidence: number;
  /** 截图路径 */
  screenshotPath: string;
  /** page source 路径 */
  pageSourcePath?: string;
  /** 相关元素信息 */
  elementInfo?: ElementInfo;
  /** 建议修复方案 */
  suggestion?: string;
}

/**
 * 问题类型
 */
export type InspectionIssueType =
  | 'page-blank'
  | 'content-missing'
  | 'element-not-visible'
  | 'element-overlap'
  | 'button-blocked'
  | 'layout-abnormal'
  | 'untranslated-key'
  | 'mixed-language'
  | 'placeholder-unreplaced'
  | 'garbled-text'
  | 'critical-element-missing'
  | 'text-truncated'
  | 'icon-missing'
  | 'color-abnormal'
  | 'spacing-abnormal';

/**
 * 元素信息
 */
export interface ElementInfo {
  /** 元素类型 */
  type: string;
  /** 元素文本 */
  text?: string;
  /** 元素定位 */
  locator?: string;
  /** 元素属性 */
  attributes?: Record<string, string>;
  /** 坐标位置 */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * 交易执行结果
 */
export interface TradingResult {
  /** 动作类型 */
  actionType: 'open' | 'close' | 'view';
  /** 品种 */
  instrument: string;
  /** 方向 */
  direction?: 'buy' | 'sell';
  /** 数量 */
  quantity?: number;
  /** 执行状态 */
  status: TestStatus;
  /** 执行时间 */
  timestamp: string;
  /** 持仓是否存在 */
  positionExists?: boolean;
  /** 历史记录是否出现 */
  historyAppeared?: boolean;
  /** 余额变化 */
  balanceChange?: {
    before: number;
    after: number;
    change: number;
  };
  /** 错误信息 */
  errorMessage?: string;
  /** 截图证据 */
  screenshotPath?: string;
}

/**
 * 语言执行结果
 */
export interface LanguageExecutionResult {
  /** 语言代码 */
  language: string;
  /** 语言名称 */
  languageName: string;
  /** 主流程结果 */
  flowResult: FinancialFlowResult;
  /** 页面巡检结果 */
  pageResults: PageInspectionResult[];
  /** 交易结果 */
  tradingResults?: TradingResult[];
  /** 执行状态 */
  status: TestStatus;
  /** 开始时间 */
  startTime: string;
  /** 结束时间 */
  endTime: string;
  /** 总耗时 */
  durationMs: number;
}

/**
 * 金融流程执行结果
 */
export interface FinancialFlowResult {
  /** 流程步骤结果 */
  steps: FlowStepResult[];
  /** 整体状态 */
  status: TestStatus;
  /** 失败原因 */
  failureReason?: string;
}

/**
 * 流程步骤结果
 */
export interface FlowStepResult {
  /** 步骤名称 */
  stepName: string;
  /** 步骤标识 */
  stepId: string;
  /** 执行状态 */
  status: TestStatus;
  /** 执行时间 */
  timestamp: string;
  /** 耗时 */
  durationMs: number;
  /** 截图路径 */
  screenshotPath?: string;
  /** 错误信息 */
  errorMessage?: string;
}

/**
 * 金融测试完整结果
 */
export interface FinancialTestResult {
  /** 运行标识 */
  runId: string;
  /** APP 名称 */
  appName: string;
  /** 包名 */
  packageName: string;
  /** 设备信息 */
  device: {
    id: string;
    model?: string;
    osVersion?: string;
  };
  /** 开始时间 */
  startTime: string;
  /** 结束时间 */
  endTime: string;
  /** 总耗时 */
  durationMs: number;
  /** 语言执行结果列表 */
  languageResults: LanguageExecutionResult[];
  /** 所有问题汇总 */
  allIssues: InspectionIssue[];
  /** 交易结果汇总 */
  tradingSummary?: {
    openSuccess: number;
    openFailed: number;
    closeSuccess: number;
    closeFailed: number;
    positionVerified: boolean;
    historyVerified: boolean;
    balanceChangeVerified: boolean;
  };
  /** 整体评估 */
  overallAssessment: {
    status: TestStatus;
    passRate: number;
    criticalIssueCount: number;
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    summary: string;
  };
  /** AI 分析（可选） */
  aiAnalysis?: {
    overallAssessment: string;
    criticalIssues: string[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  /** 产物路径 */
  artifacts: {
    screenshotsDir: string;
    pageSourcesDir: string;
    logsDir: string;
    reportPath: string;
  };
}

/**
 * 环境变量配置键
 */
export interface FinancialEnvKeys {
  /** 用户名 */
  username: string;
  /** 密码 */
  password: string;
  /** API Key（可选） */
  apiKey?: string;
  /** 其他自定义变量 */
  custom?: Record<string, string>;
}

// ==================== 第二轮增强类型定义 ====================

/**
 * OCR 配置
 */
export interface OcrConfig {
  /** 是否启用 OCR */
  enabled: boolean;
  /** OCR 提供者 */
  provider?: 'tesseract' | 'google-vision' | 'aws-textract' | 'ai-vision';
  /** 语言列表 */
  languages?: string[];
  /** 最小置信度阈值 */
  minConfidence?: number;
}

/**
 * OCR 识别结果
 */
export interface OcrResult {
  /** 识别的文本 */
  text: string;
  /** 置信度 (0-1) */
  confidence: number;
  /** 文本边界框 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 语言 */
  language?: string;
}

/**
 * OCR 页面分析结果
 */
export interface OcrPageAnalysis {
  /** 页面标识 */
  pageId: string;
  /** 截图路径 */
  screenshotPath: string;
  /** OCR 识别的所有文本 */
  fullText: string;
  /** 按区域分割的文本 */
  textRegions: OcrResult[];
  /** 与 Page Source 文本的差异 */
  discrepancies: OcrDiscrepancy[];
  /** 分析耗时 */
  durationMs: number;
}

/**
 * OCR 与 Page Source 差异
 */
export interface OcrDiscrepancy {
  /** 差异类型 */
  type: 'text-missing-in-dom' | 'text-missing-in-ocr' | 'text-mismatch' | 'layout-issue';
  /** 描述 */
  description: string;
  /** OCR 文本 */
  ocrText?: string;
  /** DOM 文本 */
  domText?: string;
  /** 位置 */
  bounds?: OcrResult['bounds'];
  /** 置信度 */
  confidence: number;
}

/**
 * 图片标注配置
 */
export interface AnnotationConfig {
  /** 是否启用标注 */
  enabled: boolean;
  /** 标注颜色 */
  colors?: {
    P0?: string;
    P1?: string;
    P2?: string;
    P3?: string;
  };
  /** 标注线条宽度 */
  lineWidth?: number;
  /** 是否显示标签 */
  showLabels?: boolean;
}

/**
 * 图片标注
 */
export interface ImageAnnotation {
  /** 标注类型 */
  type: 'rectangle' | 'circle' | 'arrow' | 'text';
  /** 边界框 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 颜色 */
  color: string;
  /** 标签文本 */
  label?: string;
  /** 关联的问题 ID */
  issueId?: string;
  /** 严重级别 */
  severity?: TestCasePriority;
}

/**
 * 标注截图结果
 */
export interface AnnotatedScreenshot {
  /** 原始截图路径 */
  originalPath: string;
  /** 标注后截图路径 */
  annotatedPath: string;
  /** 标注列表 */
  annotations: ImageAnnotation[];
  /** 标注问题数量 */
  issueCount: number;
}

/**
 * 问题置信度因素
 */
export interface ConfidenceFactors {
  /** 视觉证据 */
  visualEvidence: boolean;
  /** DOM 证据 */
  domEvidence: boolean;
  /** OCR 证据 */
  ocrEvidence: boolean;
  /** AI 确认 */
  aiAgreement?: number;
  /** 规则匹配 */
  ruleMatch: boolean;
  /** 历史频率 */
  historicalFrequency?: number;
}

/**
 * 增强的问题类型
 */
export interface EnhancedInspectionIssue extends InspectionIssue {
  /** 问题来源类型 */
  sourceType: 'rule' | 'ocr' | 'ai' | 'mixed';
  /** 置信度因素详情 */
  confidenceFactors?: ConfidenceFactors;
  /** 置信度原因说明 */
  confidenceReason: string;
  /** 去重键 */
  dedupeKey: string;
  /** 标注截图路径 */
  annotatedScreenshotPath?: string;
  /** OCR 相关信息 */
  ocrInfo?: {
    detectedText?: string;
    ocrConfidence?: number;
    bounds?: OcrResult['bounds'];
  };
  /** AI 分析 */
  aiAnalysis?: {
    confirmed: boolean;
    reasoning?: string;
    suggestedFix?: string;
  };
  /** 关联的重复问题 ID 列表 */
  duplicateIssueIds?: string[];
}

/**
 * 问题聚类（去重后）
 */
export interface IssueCluster {
  /** 代表性问题 */
  representativeIssue: EnhancedInspectionIssue;
  /** 重复问题数量 */
  duplicateCount: number;
  /** 受影响的页面 */
  affectedPages: string[];
  /** 受影响的语言 */
  affectedLanguages: string[];
  /** 所有问题 ID */
  allIssueIds: string[];
}

/**
 * 页面对比结果
 */
export interface PageCompareResult {
  /** 页面标识 */
  pageId: string;
  /** 页面名称 */
  pageName: string;
  /** 各语言的结果 */
  languageResults: {
    language: string;
    languageName: string;
    issueCount: number;
    criticalIssueCount: number;
    issues: EnhancedInspectionIssue[];
  }[];
  /** 语言间差异 */
  differences: PageLanguageDifference[];
}

/**
 * 页面语言差异
 */
export interface PageLanguageDifference {
  /** 差异类型 */
  type: 'translation-missing' | 'layout-shift' | 'text-overflow' | 'element-position';
  /** 基准语言 */
  baseLanguage: string;
  /** 对比语言 */
  compareLanguage: string;
  /** 描述 */
  description: string;
  /** 严重级别 */
  severity: TestCasePriority;
  /** 截图证据 */
  screenshotPaths?: {
    base?: string;
    compare?: string;
  };
}

/**
 * 探测配置
 */
export interface ProbeConfig {
  /** 目标 APP */
  app: AppInfo;
  /** 探测页面列表（可选，不填则自动探测） */
  pages?: string[];
  /** 是否启用 AI 辅助 */
  enableAi?: boolean;
  /** 是否启用 OCR */
  enableOcr?: boolean;
  /** 探测深度 */
  depth?: number;
  /** 超时时间 */
  timeout?: number;
  /** 输出目录 */
  outputDir?: string;
}

/**
 * 探测结果
 */
export interface ProbeResult {
  /** 运行标识 */
  runId: string;
  /** 探测时间 */
  timestamp: string;
  /** 设备信息 */
  device: {
    id: string;
    model?: string;
    osVersion?: string;
    screenSize?: { width: number; height: number };
  };
  /** 探测的页面列表 */
  pages: ProbePageResult[];
  /** 发现的问题 */
  detectedIssues: EnhancedInspectionIssue[];
  /** 建议的定位器 */
  suggestedLocators: SuggestedLocator[];
  /** AI 建议 */
  aiRecommendations?: string[];
  /** 输出目录 */
  outputDir: string;
  /** 总耗时 */
  durationMs: number;
}

/**
 * 探测页面结果
 */
export interface ProbePageResult {
  /** 页面标识 */
  pageId: string;
  /** 页面名称（自动生成或配置） */
  pageName: string;
  /** 页面 Activity */
  activity?: string;
  /** 截图路径 */
  screenshotPath: string;
  /** Page Source 路径 */
  pageSourcePath: string;
  /** 标注截图路径 */
  annotatedScreenshotPath?: string;
  /** OCR 分析结果 */
  ocrAnalysis?: OcrPageAnalysis;
  /** 可交互元素列表 */
  interactiveElements: ProbeElement[];
  /** 可见文本列表 */
  visibleTexts: string[];
  /** 页面层级结构 */
  elementHierarchy?: string;
  /** 发现的问题 */
  issues: EnhancedInspectionIssue[];
}

/**
 * 探测元素
 */
export interface ProbeElement {
  /** 元素类型 */
  type: string;
  /** 元素文本 */
  text?: string;
  /** 元素描述 */
  contentDesc?: string;
  /** Resource ID */
  resourceId?: string;
  /** 类名 */
  className: string;
  /** 边界框 */
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  /** 是否可点击 */
  clickable: boolean;
  /** 是否可滚动 */
  scrollable: boolean;
  /** 是否可编辑 */
  editable: boolean;
  /** 是否可见 */
  visible: boolean;
  /** 建议的定位器 */
  suggestedLocators: SuggestedLocator[];
}

/**
 * 建议的定位器
 */
export interface SuggestedLocator {
  /** 定位策略 */
  strategy: ElementLocator['strategy'];
  /** 定位值 */
  value: string;
  /** 置信度 */
  confidence: number;
  /** 推荐原因 */
  reason: string;
  /** 是否推荐 */
  recommended: boolean;
}

/**
 * 忽略规则配置
 */
export interface IgnoreRule {
  /** 规则标识 */
  id: string;
  /** 匹配类型 */
  matchType: 'page' | 'element' | 'text' | 'issue-type';
  /** 匹配模式 */
  pattern: string;
  /** 匹配的语言（可选） */
  languages?: string[];
  /** 忽略原因 */
  reason: string;
  /** 过期时间（可选） */
  expiresAt?: string;
}

/**
 * AI 分析配置
 */
export interface AiAnalysisConfig {
  /** 是否启用 AI 分析 */
  enabled: boolean;
  /** AI 提供者 */
  provider?: 'anthropic' | 'openai' | 'local';
  /** 模型 */
  model?: string;
  /** 分析类型 */
  analysisTypes?: ('page-inspection' | 'issue-confirmation' | 'suggestion' | 'summary')[];
  /** 最大 token 数 */
  maxTokens?: number;
}

/**
 * 增强的检查配置
 */
export interface EnhancedInspectionConfig extends InspectionConfig {
  /** OCR 配置 */
  ocr?: OcrConfig;
  /** 标注配置 */
  annotation?: AnnotationConfig;
  /** AI 分析配置 */
  aiAnalysis?: AiAnalysisConfig;
  /** 忽略规则 */
  ignoreRules?: IgnoreRule[];
  /** 严重级别阈值（只报告 >= 此级别的问题） */
  severityThreshold?: TestCasePriority;
  /** 置信度阈值（只报告 >= 此置信度的问题） */
  confidenceThreshold?: number;
  /** 是否启用去重 */
  enableDeduplication?: boolean;
  /** 是否启用语言对比 */
  enableLanguageCompare?: boolean;
}

/**
 * 增强的报告结果
 */
export interface EnhancedFinancialTestResult extends FinancialTestResult {
  /** OCR 分析结果 */
  ocrResults?: OcrPageAnalysis[];
  /** 标注截图 */
  annotatedScreenshots?: AnnotatedScreenshot[];
  /** 问题聚类（去重后） */
  issueClusters?: IssueCluster[];
  /** 页面对比结果 */
  pageCompareResults?: PageCompareResult[];
  /** 探测结果（如果有） */
  probeResult?: ProbeResult;
  /** 增强的问题列表 */
  enhancedIssues?: EnhancedInspectionIssue[];
  /** 能力标识 */
  capabilities: {
    ocrEnabled: boolean;
    aiEnabled: boolean;
    annotationEnabled: boolean;
    deduplicationEnabled: boolean;
  };
}
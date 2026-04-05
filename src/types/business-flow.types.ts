/**
 * 业务流分析相关类型定义
 *
 * 注意：本文件定义的是数据库持久化格式（BusinessFlowRecord）
 * 与 src/ai/prompts/business-flow.prompt.ts 中的 AI Prompt 格式（BusinessFlowPrompt）不同
 *
 * 主要差异：
 * - Record版本：id, projectId, platform, entryUrl, createdAt 等数据库字段
 * - Prompt版本：flowId, entryPoint, testData 等AI输出字段
 */

import type { Platform } from './test-case.types.js';

/**
 * 业务流记录（数据库持久化格式）
 */
export interface BusinessFlowRecord {
  /** 流 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 流名称 */
  flowName: string;
  /** 流描述 */
  flowDescription: string;
  /** 入口 URL（Web） */
  entryUrl: string | null;
  /** 入口 Activity（APP） */
  entryActivity: string | null;
  /** 步骤序列 */
  steps: BusinessFlowStep[];
  /** 页面依赖 */
  pageDependencies: PageDependency[];
  /** 是否关键路径 */
  criticalPath: boolean;
  /** 置信度 */
  confidence: number;
  /** 使用次数 */
  usageCount: number;
  /** 最后使用时间 */
  lastUsed: string | null;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 业务流步骤
 */
export interface BusinessFlowStep {
  /** 步骤序号 */
  order: number;
  /** 步骤名称 */
  stepName: string;
  /** 步骤描述 */
  description: string;
  /** 页面 URL/Activity */
  page: string;
  /** 动作 */
  action: BusinessFlowAction;
  /** 预期结果 */
  expectedResult: string;
  /** 数据输入 */
  dataInputs: DataInput[];
  /** 验证点 */
  validations: ValidationPoint[];
  /** 是否可选 */
  optional: boolean;
  /** 是否分支点 */
  isBranchPoint: boolean;
  /** 分支条件 */
  branchCondition?: string;
}

/**
 * 业务流动作
 */
export interface BusinessFlowAction {
  /** 动作类型 */
  type: 'navigate' | 'click' | 'fill' | 'select' | 'wait' | 'verify' | 'api-call' | 'custom';
  /** 目标 */
  target: string | null;
  /** 值 */
  value: string | null;
  /** 描述 */
  description: string;
}

/**
 * 数据输入
 */
export interface DataInput {
  /** 字段名称 */
  fieldName: string;
  /** 字段类型 */
  fieldType: 'text' | 'email' | 'password' | 'number' | 'select' | 'checkbox' | 'radio' | 'file';
  /** 是否必填 */
  required: boolean;
  /** 测试数据 */
  testValue: string;
  /** 数据来源 */
  dataSource: 'static' | 'dynamic' | 'user-input';
}

/**
 * 验证点
 */
export interface ValidationPoint {
  /** 验证类型 */
  type: 'element-visible' | 'text-contains' | 'url-matches' | 'api-response' | 'custom';
  /** 目标 */
  target: string;
  /** 预期值 */
  expectedValue: string;
  /** 描述 */
  description: string;
}

/**
 * 页面依赖
 */
export interface PageDependency {
  /** 源页面 */
  sourcePage: string;
  /** 目标页面 */
  targetPage: string;
  /** 触发动作 */
  triggerAction: string;
  /** 依赖类型 */
  dependencyType: 'navigation' | 'data-flow' | 'state-change';
}

/**
 * 业务流分析结果
 */
export interface BusinessFlowAnalysisResult {
  /** 分析 ID */
  id: string;
  /** 页面 URL */
  pageUrl: string;
  /** 平台 */
  platform: Platform;
  /** 识别的业务流 */
  businessFlows: IdentifiedBusinessFlow[];
  /** 页面功能 */
  pageFunctions: PageFunction[];
  /** 用户场景 */
  userScenarios: UserScenario[];
  /** 置信度 */
  confidence: number;
  /** 分析时间 */
  analyzedAt: string;
}

/**
 * 识别的业务流
 */
export interface IdentifiedBusinessFlow {
  /** 流名称 */
  flowName: string;
  /** 流类型 */
  flowType: BusinessFlowType;
  /** 描述 */
  description: string;
  /** 步骤 */
  steps: string[];
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  /** 置信度 */
  confidence: number;
}

/**
 * 业务流类型
 */
export type BusinessFlowType =
  | 'registration'     // 注册
  | 'login'            // 登录
  | 'logout'           // 登出
  | 'search'           // 搜索
  | 'purchase'         // 购买
  | 'payment'          // 支付
  | 'form-submission'  // 表单提交
  | 'data-entry'       // 数据录入
  | 'navigation'       // 导航
  | 'filtering'        // 筛选
  | 'sorting'          // 排序
  | 'pagination'       // 分页
  | 'crud'             // 增删改查
  | 'workflow'         // 工作流
  | 'custom';          // 自定义

/**
 * 页面功能
 */
export interface PageFunction {
  /** 功能名称 */
  name: string;
  /** 功能类型 */
  type: 'primary' | 'secondary' | 'auxiliary';
  /** 描述 */
  description: string;
  /** 关联元素 */
  relatedElements: string[];
  /** 用户价值 */
  userValue: string;
}

/**
 * 用户场景
 */
export interface UserScenario {
  /** 场景名称 */
  name: string;
  /** 用户角色 */
  userRole: string;
  /** 目标 */
  goal: string;
  /** 前置条件 */
  preconditions: string[];
  /** 步骤 */
  steps: string[];
  /** 后置条件 */
  postconditions: string[];
  /** 异常流程 */
  alternativeFlows: string[];
}

/**
 * 业务流测试用例
 */
export interface BusinessFlowTestCase {
  /** 用例 ID */
  caseId: string;
  /** 用例名称 */
  caseName: string;
  /** 业务流 ID */
  flowId: string;
  /** 测试类型 */
  testType: 'happy-path' | 'alternative' | 'error-handling' | 'edge-case';
  /** 测试数据 */
  testData: Record<string, string>;
  /** 步骤 */
  steps: BusinessFlowStep[];
  /** 预期结果 */
  expectedResults: string[];
  /** 优先级 */
  priority: 'P0' | 'P1' | 'P2' | 'P3';
}

/**
 * 业务流分析配置
 */
export interface BusinessFlowAnalysisConfig {
  /** 是否使用 AI */
  useAi: boolean;
  /** 最大流深度 */
  maxFlowDepth: number;
  /** 最小置信度阈值 */
  minConfidence: number;
  /** 是否包含次要功能 */
  includeSecondaryFunctions: boolean;
  /** 是否生成测试用例 */
  generateTestCases: boolean;
  /** 是否持久化 */
  persistResults: boolean;
}

/**
 * 默认业务流分析配置
 */
export const DEFAULT_BUSINESS_FLOW_ANALYSIS_CONFIG: BusinessFlowAnalysisConfig = {
  useAi: true,
  maxFlowDepth: 10,
  minConfidence: 0.7,
  includeSecondaryFunctions: true,
  generateTestCases: true,
  persistResults: true,
};

/**
 * 向后兼容别名
 * @deprecated 请使用 BusinessFlowRecord，此别名将在未来版本移除
 */
export type BusinessFlow = BusinessFlowRecord;
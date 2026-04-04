/**
 * 状态图谱相关类型定义
 */

import type { Platform, TestActionType } from './test-case.types.js';

/**
 * 状态节点
 */
export interface StateNode {
  /** 节点 ID */
  id: string;
  /** 状态哈希 */
  stateHash: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 状态名称 */
  stateName: string;
  /** 状态类型 */
  stateType: StateType;
  /** URL 模式（Web） */
  urlPattern: string | null;
  /** Activity 名称（APP） */
  activityName: string | null;
  /** 视图层级哈希 */
  viewHierarchyHash: string | null;
  /** 关键元素 */
  keyElements: KeyElement[];
  /** 截图路径 */
  screenshotPath: string | null;
  /** 访问次数 */
  visitCount: number;
  /** 最后访问时间 */
  lastVisit: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 状态类型
 */
export type StateType =
  | 'page'          // 普通页面
  | 'dialog'        // 对话框
  | 'modal'         // 模态框
  | 'drawer'        // 抽屉
  | 'tab'           // 标签页
  | 'activity'      // Activity（APP）
  | 'fragment'      // Fragment（APP）
  | 'popup';        // 弹窗

/**
 * 关键元素
 */
export interface KeyElement {
  /** 选择器 */
  selector: string;
  /** 元素类型 */
  elementType: 'button' | 'input' | 'link' | 'text' | 'image' | 'icon' | 'other';
  /** 元素文本 */
  text: string | null;
  /** 元素描述 */
  description: string | null;
  /** 是否可交互 */
  interactive: boolean;
}

/**
 * 状态转移边
 */
export interface StateEdge {
  /** 边 ID */
  id: string;
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 源状态哈希 */
  sourceStateHash: string;
  /** 目标状态哈希 */
  targetStateHash: string;
  /** 动作类型 */
  actionType: TestActionType;
  /** 动作目标 */
  actionTarget: string | null;
  /** 动作值 */
  actionValue: string | null;
  /** 转移次数 */
  transitionCount: number;
  /** 成功次数 */
  successCount: number;
  /** 失败次数 */
  failureCount: number;
  /** 最后转移时间 */
  lastTransition: string;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 状态图谱
 */
export interface StateGraph {
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 节点列表 */
  nodes: StateNode[];
  /** 边列表 */
  edges: StateEdge[];
  /** 入口节点哈希 */
  entryNodeHash: string | null;
  /** 统计信息 */
  stats: StateGraphStats;
  /** 最后更新时间 */
  updatedAt: string;
}

/**
 * 状态图谱统计
 */
export interface StateGraphStats {
  /** 总节点数 */
  totalNodes: number;
  /** 总边数 */
  totalEdges: number;
  /** 平均出度 */
  avgOutDegree: number;
  /** 平均入度 */
  avgInDegree: number;
  /** 最长路径 */
  longestPath: number;
  /** 强连通分量数 */
  stronglyConnectedComponents: number;
}

/**
 * 路径查找结果
 */
export interface PathFindResult {
  /** 是否找到路径 */
  found: boolean;
  /** 路径节点哈希列表 */
  path: string[];
  /** 路径边列表 */
  edges: StateEdge[];
  /** 路径长度 */
  length: number;
  /** 路径置信度 */
  confidence: number;
  /** 查找耗时（ms） */
  durationMs: number;
}

/**
 * 状态哈希计算选项
 */
export interface StateHashOptions {
  /** 是否包含 URL */
  includeUrl: boolean;
  /** 是否包含标题 */
  includeTitle: boolean;
  /** 是否包含关键元素 */
  includeKeyElements: boolean;
  /** 是否包含视图层级 */
  includeViewHierarchy: boolean;
  /** 动态内容过滤规则 */
  dynamicContentFilters: string[];
}

/**
 * 默认状态哈希选项
 */
export const DEFAULT_STATE_HASH_OPTIONS: StateHashOptions = {
  includeUrl: true,
  includeTitle: true,
  includeKeyElements: true,
  includeViewHierarchy: false,
  dynamicContentFilters: [
    'timestamp',
    'random-\\w+',
    'session-\\w+',
    'token',
    'csrf',
    'nonce',
  ],
};

/**
 * 状态图谱构建选项
 */
export interface StateGraphBuildOptions {
  /** 是否持久化 */
  persist: boolean;
  /** 是否合并相似状态 */
  mergeSimilarStates: boolean;
  /** 相似度阈值 */
  similarityThreshold: number;
  /** 最大节点数 */
  maxNodes: number;
  /** 是否记录截图 */
  recordScreenshots: boolean;
}

/**
 * 状态图谱查询选项
 */
export interface StateGraphQueryOptions {
  /** 项目 ID */
  projectId: string;
  /** 平台 */
  platform: Platform;
  /** 状态哈希 */
  stateHash?: string;
  /** URL 模式 */
  urlPattern?: string;
  /** 最小访问次数 */
  minVisitCount?: number;
  /** 限制返回数量 */
  limit?: number;
}

/**
 * 替代路径
 */
export interface AlternativePath {
  /** 路径 */
  path: StateNode[];
  /** 边 */
  edges: StateEdge[];
  /** 置信度 */
  confidence: number;
  /** 预计步骤数 */
  estimatedSteps: number;
  /** 是否需要额外操作 */
  requiresAdditionalActions: boolean;
  /** 额外操作描述 */
  additionalActionDescription?: string;
}
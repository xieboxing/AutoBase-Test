import type { TestStatus, Platform } from './test-case.types.js';

/**
 * 单个测试步骤结果
 */
export interface TestStepResult {
  order: number;
  action: string;
  target?: string;
  status: TestStatus;
  durationMs: number;
  errorMessage?: string;
  errorStack?: string;
  screenshot?: string;
}

/**
 * 单个测试用例结果
 */
export interface TestCaseResult {
  caseId: string;
  caseName: string;
  status: TestStatus;
  startTime: string;
  endTime: string;
  durationMs: number;
  platform: Platform;
  environment: TestEnvironment;
  steps: TestStepResult[];
  retryCount: number;
  selfHealed: boolean;
  selfHealSelector?: string;
  aiAnalysis?: string;
  artifacts: {
    screenshots: string[];
    video?: string;
    logs: string[];
  };
}

/**
 * 测试环境信息
 */
export interface TestEnvironment {
  browser?: string;
  browserVersion?: string;
  device?: string;
  os?: string;
  osVersion?: string;
  viewport?: {
    width: number;
    height: number;
  };
  network?: {
    online: boolean;
    type?: 'wifi' | '3g' | '4g' | 'offline';
  };
}

/**
 * 分类测试结果摘要
 */
export interface CategoryResult {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  blocked: number;
  passRate: number;
  avgDurationMs: number;
}

/**
 * 性能测试结果
 */
export interface PerformanceResult extends CategoryResult {
  metrics: {
    performanceScore?: number;
    lcp?: number;
    fid?: number;
    inp?: number;
    cls?: number;
    fcp?: number;
    tti?: number;
    tbt?: number;
    speedIndex?: number;
  };
}

/**
 * 安全测试结果
 */
export interface SecurityResult extends CategoryResult {
  issues: SecurityIssue[];
}

/**
 * 安全问题
 */
export interface SecurityIssue {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  recommendation?: string;
}

/**
 * 无障碍测试结果
 */
export interface AccessibilityResult extends CategoryResult {
  violations: AccessibilityViolation[];
}

/**
 * 无障碍违规项
 */
export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: string[];
}

/**
 * 测试运行结果
 */
export interface TestRunResult {
  runId: string;
  project: string;
  startTime: string;
  endTime: string;
  duration: number;
  platform: Platform;
  environment: TestEnvironment;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;
  };
  categories: {
    functional: CategoryResult;
    visual: CategoryResult;
    performance: PerformanceResult;
    security: SecurityResult;
    accessibility: AccessibilityResult;
    compatibility: CategoryResult;
    stability: CategoryResult;
  };
  cases: TestCaseResult[];
  aiAnalysis: {
    overallAssessment: string;
    criticalIssues: string[];
    recommendations: string[];
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
  };
  artifacts: {
    screenshots: string[];
    videos: string[];
    logs: string[];
  };
}
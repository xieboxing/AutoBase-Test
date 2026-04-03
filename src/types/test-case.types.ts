/**
 * 测试用例优先级
 */
export type TestCasePriority = 'P0' | 'P1' | 'P2' | 'P3';

/**
 * 测试用例类型
 */
export type TestCaseType =
  | 'functional'
  | 'visual'
  | 'performance'
  | 'security'
  | 'accessibility'
  | 'compatibility'
  | 'stability';

/**
 * 测试类型
 */
export type TestType =
  | 'smoke'
  | 'full'
  | 'regression'
  | 'performance'
  | 'security'
  | 'accessibility'
  | 'visual'
  | 'monkey';

/**
 * 测试平台
 */
export type Platform = 'pc-web' | 'h5-web' | 'android-app' | 'api';

/**
 * 测试状态
 */
export type TestStatus = 'passed' | 'failed' | 'skipped' | 'blocked' | 'pending';

/**
 * 测试步骤动作类型
 */
export type TestActionType =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'select'
  | 'hover'
  | 'scroll'
  | 'wait'
  | 'screenshot'
  | 'assert'
  | 'tap'
  | 'swipe'
  | 'long-press'
  | 'back'
  | 'home';

/**
 * 断言类型
 */
export type AssertType =
  | 'element-visible'
  | 'element-hidden'
  | 'text-contains'
  | 'text-equals'
  | 'url-contains'
  | 'url-equals'
  | 'title-contains'
  | 'title-equals'
  | 'element-count'
  | 'attribute-equals'
  | 'value-equals'
  | 'checked'
  | 'disabled'
  | 'enabled';

/**
 * 测试步骤
 */
export interface TestStep {
  order: number;
  action: TestActionType;
  target?: string;
  value?: string;
  type?: AssertType;
  description: string;
  timeout?: number;
  waitBefore?: number;
  waitAfter?: number;
}

/**
 * 测试用例
 */
export interface TestCase {
  id: string;
  name: string;
  description: string;
  priority: TestCasePriority;
  type: TestCaseType;
  platform: Platform[];
  tags: string[];
  preconditions?: string[];
  steps: TestStep[];
  cleanup?: TestStep[];
  metadata?: TestCaseMetadata;
}

/**
 * 测试用例元数据
 */
export interface TestCaseMetadata {
  author?: string;
  created?: string;
  updated?: string;
  ai_confidence?: number;
  run_count?: number;
  pass_rate?: number;
  avg_duration_ms?: number;
  last_result?: TestStatus;
  optimization_notes?: string;
  retryCount?: number;
  skip?: boolean;
  skipReason?: string;
  executionFrequency?: string;
}


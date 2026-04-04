/**
 * 测试夹具 - 测试用例
 * 提供模拟的测试用例用于测试
 */

import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { TestCaseResult } from '@/types/test-result.types.js';

/**
 * 创建 Mock 测试用例
 */
export function createMockTestCase(options: {
  id?: string;
  name?: string;
  priority?: 'P0' | 'P1' | 'P2' | 'P3';
  steps?: TestStep[];
} = {}): TestCase {
  const defaultSteps: TestStep[] = [
    { order: 1, action: 'navigate', value: 'https://example.com', description: '打开页面' },
    { order: 2, action: 'click', target: '#button', description: '点击按钮' },
    { order: 3, action: 'assert', type: 'element-visible', target: '.result', description: '验证结果' },
  ];

  return {
    id: options.id ?? 'tc-mock-001',
    name: options.name ?? 'Mock 测试用例',
    description: '用于测试的 Mock 测试用例',
    priority: options.priority ?? 'P2',
    type: 'functional',
    platform: ['pc-web'],
    tags: ['mock', 'test'],
    steps: options.steps ?? defaultSteps,
  };
}

/**
 * 创建登录测试用例
 */
export function createLoginTestCase(): TestCase {
  return createMockTestCase({
    id: 'tc-login-001',
    name: '用户登录测试',
    priority: 'P0',
    steps: [
      { order: 1, action: 'navigate', value: 'https://example.com/login', description: '打开登录页面' },
      { order: 2, action: 'fill', target: '#username', value: 'testuser', description: '输入用户名' },
      { order: 3, action: 'fill', target: '#password', value: 'password123', description: '输入密码' },
      { order: 4, action: 'click', target: 'button[type="submit"]', description: '点击登录' },
      { order: 5, action: 'assert', type: 'url-contains', value: '/dashboard', description: '验证跳转' },
    ],
  });
}

/**
 * 创建搜索测试用例
 */
export function createSearchTestCase(): TestCase {
  return createMockTestCase({
    id: 'tc-search-001',
    name: '商品搜索测试',
    priority: 'P1',
    steps: [
      { order: 1, action: 'navigate', value: 'https://example.com/products', description: '打开商品页' },
      { order: 2, action: 'fill', target: '#search-input', value: '手机', description: '输入搜索词' },
      { order: 3, action: 'click', target: '.search-btn', description: '点击搜索' },
      { order: 4, action: 'assert', type: 'element-visible', target: '.product-item', description: '验证结果' },
    ],
  });
}

/**
 * 创建 Mock 测试用例结果
 */
export function createMockTestCaseResult(options: {
  caseId?: string;
  caseName?: string;
  status?: 'passed' | 'failed' | 'skipped';
  durationMs?: number;
} = {}): TestCaseResult {
  const startTime = new Date().toISOString();
  const endTime = new Date(Date.now() + (options.durationMs ?? 1000)).toISOString();

  return {
    caseId: options.caseId ?? 'tc-mock-001',
    caseName: options.caseName ?? 'Mock 测试用例',
    status: options.status ?? 'passed',
    startTime,
    endTime,
    durationMs: options.durationMs ?? 1000,
    platform: 'pc-web',
    environment: {
      browser: 'chromium',
      os: 'test',
      viewport: { width: 1920, height: 1080 },
    },
    steps: [],
    retryCount: 0,
    selfHealed: false,
    artifacts: {
      screenshots: [],
      logs: [],
    },
  };
}

/**
 * 创建失败的测试用例结果
 */
export function createFailedTestCaseResult(options: {
  caseId?: string;
  errorMessage?: string;
} = {}): TestCaseResult {
  const result = createMockTestCaseResult({
    caseId: options.caseId,
    status: 'failed',
  });

  return {
    ...result,
    steps: [
      {
        order: 1,
        action: 'click',
        target: '#button',
        status: 'failed',
        durationMs: 500,
        errorMessage: options.errorMessage ?? '元素未找到',
      },
    ],
    artifacts: {
      ...result.artifacts,
      logs: [options.errorMessage ?? '元素未找到'],
    },
  };
}

/**
 * 批量创建测试用例
 */
export function createMockTestCases(count: number, prefix: string = 'tc'): TestCase[] {
  return Array.from({ length: count }, (_, i) =>
    createMockTestCase({
      id: `${prefix}-${String(i + 1).padStart(3, '0')}`,
      name: `Mock 测试用例 ${i + 1}`,
      priority: i < 2 ? 'P0' : i < 5 ? 'P1' : 'P2',
    })
  );
}
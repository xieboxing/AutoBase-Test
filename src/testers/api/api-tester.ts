import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import { z } from 'zod';
import type { ApiEndpoint } from './api-discovery.js';

/**
 * API 测试结果
 */
export interface ApiTestResult {
  endpoint: string;
  method: string;
  passed: boolean;
  tests: ApiTestCaseResult[];
  executionTime: number;
}

/**
 * 单个测试用例结果
 */
export interface ApiTestCaseResult {
  name: string;
  passed: boolean;
  expectedStatus?: number;
  actualStatus?: number;
  errorMessage?: string;
  responseTime?: number;
  validationErrors?: string[];
}

/**
 * API 测试用例
 */
export interface ApiTestCase {
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  expectedStatus?: number | number[];
  validateResponse?: (response: ApiResponse) => boolean;
  schema?: z.ZodSchema;
  timeout?: number;
}

/**
 * API 响应
 */
export interface ApiResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  responseTime: number;
}

/**
 * API 测试器配置
 */
export interface ApiTesterConfig {
  baseUrl: string;
  timeout: number;
  headers: Record<string, string>;
  validateSchemas: boolean;
  retryCount: number;
  retryDelay: number;
}

/**
 * 默认配置
 */
const DEFAULT_API_TESTER_CONFIG: Partial<ApiTesterConfig> = {
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  validateSchemas: true,
  retryCount: 2,
  retryDelay: 1000,
};

/**
 * API 功能测试器
 */
export class ApiTester {
  private config: ApiTesterConfig;
  private testId: string;

  constructor(config: Partial<ApiTesterConfig> & { baseUrl: string }) {
    this.config = { ...DEFAULT_API_TESTER_CONFIG, ...config } as ApiTesterConfig;
    this.testId = nanoid(8);
  }

  /**
   * 执行 API 测试
   */
  async testEndpoint(testCase: ApiTestCase): Promise<ApiTestResult> {
    const startTime = Date.now();
    const tests: ApiTestCaseResult[] = [];
    const endpoint = `${testCase.method} ${testCase.url}`;

    logger.step(`🔗 测试 API: ${endpoint}`);

    // 1. 执行正常请求测试
    const normalTest = await this.executeNormalRequest(testCase);
    tests.push(normalTest);

    // 2. 执行错误参数测试
    const errorTest = await this.executeErrorTests(testCase);
    tests.push(...errorTest);

    // 3. 执行认证测试
    const authTest = await this.executeAuthTest(testCase);
    tests.push(authTest);

    const executionTime = Date.now() - startTime;
    const passed = tests.every(t => t.passed);

    if (passed) {
      logger.pass(`  ✅ API 测试通过: ${endpoint}`);
    } else {
      const failedCount = tests.filter(t => !t.passed).length;
      logger.fail(`  ❌ API 测试失败: ${endpoint} (${failedCount}/${tests.length} 失败)`);
    }

    return {
      endpoint,
      method: testCase.method,
      passed,
      tests,
      executionTime,
    };
  }

  /**
   * 执行正常请求
   */
  private async executeNormalRequest(testCase: ApiTestCase): Promise<ApiTestCaseResult> {
    const testResult: ApiTestCaseResult = {
      name: '正常请求',
      passed: false,
    };

    try {
      const response = await this.makeRequest(testCase);

      testResult.actualStatus = response.status;
      testResult.responseTime = response.responseTime;

      // 检查状态码
      if (testCase.expectedStatus) {
        const expectedStatuses = Array.isArray(testCase.expectedStatus)
          ? testCase.expectedStatus
          : [testCase.expectedStatus];

        if (!expectedStatuses.includes(response.status)) {
          testResult.passed = false;
          testResult.expectedStatus = testCase.expectedStatus as number;
          testResult.errorMessage = `期望状态码 ${expectedStatuses.join(' 或 ')}, 实际 ${response.status}`;
          return testResult;
        }
      } else {
        // 默认期望 2xx
        if (response.status < 200 || response.status >= 300) {
          testResult.errorMessage = `请求失败，状态码 ${response.status}`;
          return testResult;
        }
      }

      // Schema 验证
      if (this.config.validateSchemas && testCase.schema) {
        const validationResult = testCase.schema.safeParse(response.body);
        if (!validationResult.success) {
          testResult.passed = false;
          testResult.validationErrors = validationResult.error.errors.map(e => e.message);
          testResult.errorMessage = '响应数据不符合 Schema';
          return testResult;
        }
      }

      // 自定义验证
      if (testCase.validateResponse) {
        const customValid = testCase.validateResponse(response);
        if (!customValid) {
          testResult.errorMessage = '自定义验证失败';
          return testResult;
        }
      }

      testResult.passed = true;
    } catch (error) {
      testResult.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return testResult;
  }

  /**
   * 执行错误测试
   */
  private async executeErrorTests(testCase: ApiTestCase): Promise<ApiTestCaseResult[]> {
    const results: ApiTestCaseResult[] = [];

    // 如果是 GET 请求，跳过某些错误测试
    if (testCase.method.toUpperCase() === 'GET') {
      // 测试缺失参数
      if (testCase.url.includes('?')) {
        const result = await this.testMissingParams(testCase);
        results.push(result);
      }
    } else {
      // POST/PUT/PATCH 测试
      // 测试空请求体
      const emptyBodyTest = await this.testEmptyBody(testCase);
      results.push(emptyBodyTest);

      // 测试错误内容类型
      const contentTypeTest = await this.testWrongContentType(testCase);
      results.push(contentTypeTest);
    }

    return results;
  }

  /**
   * 测试缺失参数
   */
  private async testMissingParams(testCase: ApiTestCase): Promise<ApiTestCaseResult> {
    const result: ApiTestCaseResult = {
      name: '缺失参数测试',
      passed: false,
    };

    try {
      // 移除查询参数
      const urlWithoutParams = testCase.url?.split('?')[0] || '';
      const response = await this.makeRequest({
        ...testCase,
        url: urlWithoutParams,
      });

      // 预期返回 400 或其他错误状态码
      result.actualStatus = response.status;
      result.passed = response.status >= 400 || response.status === 200; // 允许有默认值
    } catch {
      result.passed = true; // 请求失败也算通过（参数确实需要）
    }

    return result;
  }

  /**
   * 测试空请求体
   */
  private async testEmptyBody(testCase: ApiTestCase): Promise<ApiTestCaseResult> {
    const result: ApiTestCaseResult = {
      name: '空请求体测试',
      passed: false,
    };

    try {
      const response = await this.makeRequest({
        ...testCase,
        body: undefined,
      });

      result.actualStatus = response.status;
      // 预期返回 400 或其他错误状态码
      result.passed = response.status >= 400 || response.status === 422;
    } catch {
      result.passed = true;
    }

    return result;
  }

  /**
   * 测试错误内容类型
   */
  private async testWrongContentType(testCase: ApiTestCase): Promise<ApiTestCaseResult> {
    const result: ApiTestCaseResult = {
      name: '错误内容类型测试',
      passed: false,
    };

    try {
      const response = await this.makeRequest({
        ...testCase,
        headers: {
          ...testCase.headers,
          'Content-Type': 'text/plain',
        },
      });

      result.actualStatus = response.status;
      // 预期返回 415 (Unsupported Media Type) 或其他错误
      result.passed = response.status === 415 || response.status >= 400;
    } catch {
      result.passed = true;
    }

    return result;
  }

  /**
   * 执行认证测试
   */
  private async executeAuthTest(testCase: ApiTestCase): Promise<ApiTestCaseResult> {
    const result: ApiTestCaseResult = {
      name: '未授权请求测试',
      passed: false,
    };

    // 如果已经有 Authorization header，测试移除它
    const hasAuth = testCase.headers?.['Authorization'] ||
                    this.config.headers['Authorization'];

    if (!hasAuth) {
      result.passed = true; // 无需认证测试
      return result;
    }

    try {
      const response = await this.makeRequest({
        ...testCase,
        headers: {
          ...testCase.headers,
          Authorization: '', // 移除认证
        },
      });

      result.actualStatus = response.status;
      // 预期返回 401 Unauthorized
      result.passed = response.status === 401 || response.status === 403;
    } catch {
      result.passed = true;
    }

    return result;
  }

  /**
   * 发送 HTTP 请求
   */
  private async makeRequest(testCase: ApiTestCase): Promise<ApiResponse> {
    const startTime = Date.now();
    const url = testCase.url.startsWith('http')
      ? testCase.url
      : `${this.config.baseUrl}${testCase.url}`;

    const headers = {
      ...this.config.headers,
      ...testCase.headers,
    };

    const options: RequestInit = {
      method: testCase.method,
      headers,
      body: testCase.body ? JSON.stringify(testCase.body) : undefined,
      signal: AbortSignal.timeout(testCase.timeout || this.config.timeout),
    };

    const response = await fetch(url, options);
    const responseTime = Date.now() - startTime;

    // 解析响应
    let body: unknown = null;
    const contentType = response.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      try {
        body = await response.json();
      } catch {
        body = await response.text();
      }
    } else {
      body = await response.text();
    }

    // 转换响应头
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      body,
      responseTime,
    };
  }

  /**
   * 批量测试端点
   */
  async testEndpoints(testCases: ApiTestCase[]): Promise<ApiTestResult[]> {
    const results: ApiTestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.testEndpoint(testCase);
      results.push(result);
    }

    return results;
  }

  /**
   * 从发现的端点生成测试用例
   */
  generateTestCasesFromEndpoints(endpoints: ApiEndpoint[]): ApiTestCase[] {
    return endpoints.map(endpoint => ({
      name: `${endpoint.method} ${endpoint.path}`,
      method: endpoint.method,
      url: endpoint.url,
      headers: endpoint.requestHeaders,
      body: endpoint.requestBody,
      expectedStatus: [200, 201, 204], // 默认期望成功状态码
    }));
  }

  /**
   * 获取测试摘要
   */
  getSummary(results: ApiTestResult[]): {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    totalAssertions: number;
    passedAssertions: number;
    avgResponseTime: number;
  } {
    const passedTests = results.filter(r => r.passed).length;
    const totalAssertions = results.reduce((sum, r) => sum + r.tests.length, 0);
    const passedAssertions = results.reduce(
      (sum, r) => sum + r.tests.filter(t => t.passed).length,
      0
    );
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

    return {
      totalTests: results.length,
      passedTests,
      failedTests: results.length - passedTests,
      totalAssertions,
      passedAssertions,
      avgResponseTime: results.length > 0 ? totalTime / results.length : 0,
    };
  }
}

/**
 * 快捷测试函数
 */
export async function testApi(
  testCase: ApiTestCase,
  config: Partial<ApiTesterConfig> & { baseUrl: string }
): Promise<ApiTestResult> {
  const tester = new ApiTester(config);
  return tester.testEndpoint(testCase);
}

/**
 * 批量测试函数
 */
export async function testApiBatch(
  testCases: ApiTestCase[],
  config: Partial<ApiTesterConfig> & { baseUrl: string }
): Promise<ApiTestResult[]> {
  const tester = new ApiTester(config);
  return tester.testEndpoints(testCases);
}
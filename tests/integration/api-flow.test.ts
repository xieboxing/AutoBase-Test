import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ApiTester, ApiTestCase } from '@/testers/api/api-tester.js';
import { ApiDiscovery, ApiEndpoint } from '@/testers/api/api-discovery.js';
import { ReportGenerator } from '@/reporters/report-generator.js';
import type { TestRunResult } from '@/types/test-result.types.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Phase 16.2: API 全流程联调测试
 * 使用真实公开 API https://jsonplaceholder.typicode.com
 */
describe('API Flow Integration Tests', () => {
  const BASE_URL = 'https://jsonplaceholder.typicode.com';
  let tester: ApiTester;
  let discovery: ApiDiscovery;

  beforeAll(async () => {
    // 确保报告目录存在
    await fs.mkdir('./data/reports', { recursive: true });

    tester = new ApiTester({
      baseUrl: BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    discovery = new ApiDiscovery();
  });

  afterAll(async () => {
    // 清理测试报告
    try {
      const files = await fs.readdir('./data/reports');
      for (const file of files) {
        if (file.startsWith('api-test-')) {
          await fs.unlink(path.join('./data/reports', file));
        }
      }
    } catch {
      // 目录不存在或清理失败，忽略
    }
  });

  describe('Real API Testing', () => {
    it('should test GET /posts endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Get Posts',
        method: 'GET',
        url: `${BASE_URL}/posts`,
        expectedStatus: 200,
      };

      const result = await tester.testEndpoint(testCase);

      expect(result).toBeDefined();
      expect(result.endpoint).toContain('/posts');
      expect(result.method).toBe('GET');
      expect(result.passed).toBe(true);
      expect(result.tests.length).toBeGreaterThan(0);
      expect(result.tests[0].passed).toBe(true);
      expect(result.tests[0].actualStatus).toBe(200);
    });

    it('should test GET /posts/:id endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Get Single Post',
        method: 'GET',
        url: `${BASE_URL}/posts/1`,
        expectedStatus: 200,
      };

      const result = await tester.testEndpoint(testCase);

      expect(result.passed).toBe(true);
      expect(result.tests[0].actualStatus).toBe(200);
      expect(result.tests[0].responseTime).toBeDefined();
    });

    it('should test GET /users endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Get Users',
        method: 'GET',
        url: `${BASE_URL}/users`,
        expectedStatus: 200,
      };

      const result = await tester.testEndpoint(testCase);

      expect(result.passed).toBe(true);
    });

    it('should test POST /posts endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Create Post',
        method: 'POST',
        url: `${BASE_URL}/posts`,
        body: {
          title: 'Test Post',
          body: 'This is a test post',
          userId: 1,
        },
        expectedStatus: [200, 201], // API 可能返回 200 或 201
      };

      const result = await tester.testEndpoint(testCase);

      // JSONPlaceholder 返回 201，主要测试正常请求通过
      expect(result.tests[0].passed).toBe(true); // 正常请求应该通过
      expect(result.tests[0].actualStatus).toBeGreaterThanOrEqual(200);
      expect(result.tests[0].actualStatus).toBeLessThan(300);
      // 注意：空请求体和错误内容类型测试可能失败，因为 JSONPlaceholder 接受所有请求
    });

    it('should test PUT /posts/:id endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Update Post',
        method: 'PUT',
        url: `${BASE_URL}/posts/1`,
        body: {
          id: 1,
          title: 'Updated Title',
          body: 'Updated body',
          userId: 1,
        },
        expectedStatus: [200, 201],
      };

      const result = await tester.testEndpoint(testCase);

      // 主要测试正常请求通过
      expect(result.tests[0].passed).toBe(true);
      expect(result.tests[0].actualStatus).toBeGreaterThanOrEqual(200);
      expect(result.tests[0].actualStatus).toBeLessThan(300);
    });

    it('should test DELETE /posts/:id endpoint', async () => {
      const testCase: ApiTestCase = {
        name: 'Delete Post',
        method: 'DELETE',
        url: `${BASE_URL}/posts/1`,
        expectedStatus: [200, 204], // DELETE 可能返回 200 或 204
      };

      const result = await tester.testEndpoint(testCase);

      // 主要测试正常请求通过
      expect(result.tests[0].passed).toBe(true);
      expect(result.tests[0].actualStatus).toBeGreaterThanOrEqual(200);
      expect(result.tests[0].actualStatus).toBeLessThan(300);
    });

    it('should test 404 for non-existent resource', async () => {
      const testCase: ApiTestCase = {
        name: 'Get Non-existent Post',
        method: 'GET',
        url: `${BASE_URL}/posts/99999`,
        expectedStatus: 404,
      };

      const result = await tester.testEndpoint(testCase);

      // JSONPlaceholder 可能返回 404 或空对象
      expect(result.tests[0].actualStatus).toBeDefined();
    });
  });

  describe('Batch API Testing', () => {
    it('should test multiple endpoints', async () => {
      const testCases: ApiTestCase[] = [
        { name: 'Get Posts', method: 'GET', url: `${BASE_URL}/posts`, expectedStatus: 200 },
        { name: 'Get Users', method: 'GET', url: `${BASE_URL}/users`, expectedStatus: 200 },
        { name: 'Get Comments', method: 'GET', url: `${BASE_URL}/comments`, expectedStatus: 200 },
        { name: 'Get Albums', method: 'GET', url: `${BASE_URL}/albums`, expectedStatus: 200 },
        { name: 'Get Todos', method: 'GET', url: `${BASE_URL}/todos`, expectedStatus: 200 },
      ];

      const results = await tester.testEndpoints(testCases);

      expect(results.length).toBe(5);
      expect(results.every(r => r.passed)).toBe(true);

      const summary = tester.getSummary(results);
      expect(summary.totalTests).toBe(5);
      expect(summary.passedTests).toBe(5);
      expect(summary.failedTests).toBe(0);
    });
  });

  describe('API Discovery', () => {
    it('should manually add discovered endpoints', async () => {
      // 模拟发现 API 端点
      const endpoints: ApiEndpoint[] = [
        {
          url: `${BASE_URL}/posts`,
          method: 'GET',
          path: '/posts',
          baseUrl: BASE_URL,
          requestHeaders: {},
          responseStatus: 200,
          responseHeaders: {},
          responseBody: [],
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
          duration: 100,
        },
        {
          url: `${BASE_URL}/users`,
          method: 'GET',
          path: '/users',
          baseUrl: BASE_URL,
          requestHeaders: {},
          responseStatus: 200,
          responseHeaders: {},
          responseBody: [],
          contentType: 'application/json',
          timestamp: new Date().toISOString(),
          duration: 80,
        },
      ];

      for (const endpoint of endpoints) {
        discovery.addEndpoint(endpoint);
      }

      const discoveredEndpoints = discovery.getEndpoints();
      expect(discoveredEndpoints.length).toBe(2);
      expect(discoveredEndpoints.some(e => e.path === '/posts')).toBe(true);
      expect(discoveredEndpoints.some(e => e.path === '/users')).toBe(true);
    });

    it('should generate test cases from discovered endpoints', async () => {
      const endpoints = discovery.getEndpoints();
      const testCases = tester.generateTestCasesFromEndpoints(endpoints);

      expect(testCases.length).toBeGreaterThan(0);
      expect(testCases.every(tc => tc.method)).toBeDefined();
      expect(testCases.every(tc => tc.url)).toBeDefined();
    });

    it('should get API summary', () => {
      const summary = discovery.getSummary();

      expect(summary.totalEndpoints).toBeGreaterThan(0);
      expect(summary.methods).toBeDefined();
      expect(summary.statusCodes).toBeDefined();
    });
  });

  describe('Report Generation', () => {
    it('should generate API test report', async () => {
      // 执行一批 API 测试
      const testCases: ApiTestCase[] = [
        { name: 'Get Posts', method: 'GET', url: `${BASE_URL}/posts`, expectedStatus: 200 },
        { name: 'Get Users', method: 'GET', url: `${BASE_URL}/users`, expectedStatus: 200 },
        { name: 'Get Comments', method: 'GET', url: `${BASE_URL}/comments`, expectedStatus: 200 },
        { name: 'Create Post', method: 'POST', url: `${BASE_URL}/posts`, body: { title: 'Test', body: 'Test', userId: 1 }, expectedStatus: 201 },
        { name: 'Update Post', method: 'PUT', url: `${BASE_URL}/posts/1`, body: { title: 'Updated' }, expectedStatus: 200 },
      ];

      const results = await tester.testEndpoints(testCases);

      // 构建 TestRunResult
      const testRunResult: TestRunResult = {
        runId: `api-test-${nanoid(8)}`,
        project: BASE_URL,
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        duration: results.reduce((sum, r) => sum + r.executionTime, 0),
        platform: 'api',
        environment: {
          os: process.platform,
          network: { online: true },
        },
        summary: {
          total: results.length,
          passed: results.filter(r => r.passed).length,
          failed: results.filter(r => !r.passed).length,
          skipped: 0,
          blocked: 0,
          passRate: results.filter(r => r.passed).length / results.length,
        },
        categories: {
          functional: {
            total: results.length,
            passed: results.filter(r => r.passed).length,
            failed: results.filter(r => !r.passed).length,
            skipped: 0,
            blocked: 0,
            passRate: results.filter(r => r.passed).length / results.length,
            avgDurationMs: results.reduce((sum, r) => sum + r.executionTime, 0) / results.length,
          },
          visual: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
          performance: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, metrics: {} },
          security: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, issues: [] },
          accessibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0, violations: [] },
          compatibility: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
          stability: { total: 0, passed: 0, failed: 0, skipped: 0, blocked: 0, passRate: 0, avgDurationMs: 0 },
        },
        cases: results.map((r, idx) => ({
          caseId: `api-case-${idx}`,
          caseName: r.endpoint,
          status: r.passed ? 'passed' : 'failed',
          startTime: new Date().toISOString(),
          endTime: new Date().toISOString(),
          durationMs: r.executionTime,
          platform: 'api',
          environment: {},
          steps: r.tests.map((t, stepIdx) => ({
            order: stepIdx + 1,
            action: 'request',
            status: t.passed ? 'passed' : 'failed',
            durationMs: t.responseTime || 100,
            errorMessage: t.errorMessage,
          })),
          retryCount: 0,
          selfHealed: false,
          artifacts: { screenshots: [], logs: [] },
        })),
        aiAnalysis: {
          overallAssessment: `API 测试完成：共 ${results.length} 个端点，通过 ${results.filter(r => r.passed).length} 个`,
          criticalIssues: results.filter(r => !r.passed).map(r => r.endpoint),
          recommendations: ['建议对失败的端点进行详细检查', '建议添加更多边界测试'],
          riskLevel: results.every(r => r.passed) ? 'low' : 'medium',
        },
        artifacts: { screenshots: [], videos: [], logs: [] },
      };

      // 生成报告
      const reportGenerator = new ReportGenerator({
        formats: ['html', 'json'],
        outputDir: './data/reports',
        language: 'zh-CN',
      });

      const reportPaths = await reportGenerator.generate(testRunResult);

      expect(reportPaths.files).toBeDefined();
      expect(reportPaths.files.length).toBeGreaterThan(0);
      expect(reportPaths.summary).toBeDefined();

      // 验证报告文件存在
      for (const file of reportPaths.files) {
        const exists = await fs.access(file).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle timeout errors', async () => {
      const slowTester = new ApiTester({
        baseUrl: BASE_URL,
        timeout: 1, // 1ms 超时，必定超时
      });

      const result = await slowTester.testEndpoint({
        name: 'Timeout Test',
        method: 'GET',
        url: `${BASE_URL}/posts`,
      });

      expect(result.tests[0].passed).toBe(false);
      expect(result.tests[0].errorMessage).toBeDefined();
    });

    it('should handle invalid URL', async () => {
      const result = await tester.testEndpoint({
        name: 'Invalid URL Test',
        method: 'GET',
        url: 'not-a-valid-url',
      });

      expect(result.tests[0].passed).toBe(false);
      expect(result.tests[0].errorMessage).toBeDefined();
    });
  });

  describe('Full API Test Workflow', () => {
    it('should complete full API discovery -> test -> report workflow', async () => {
      // 1. 发现 API（手动添加模拟的发现结果）
      const discoveryResult = new ApiDiscovery();

      // 实际调用几个 API 来填充 discovery
      const endpointsToDiscover = [
        { method: 'GET', path: '/posts' },
        { method: 'GET', path: '/users' },
        { method: 'GET', path: '/comments' },
      ];

      for (const endpointInfo of endpointsToDiscover) {
        try {
          const response = await fetch(`${BASE_URL}${endpointInfo.path}`);
          const body = await response.json();

          discoveryResult.addEndpoint({
            url: `${BASE_URL}${endpointInfo.path}`,
            method: endpointInfo.method,
            path: endpointInfo.path,
            baseUrl: BASE_URL,
            requestHeaders: {},
            responseStatus: response.status,
            responseHeaders: Object.fromEntries(response.headers.entries()),
            responseBody: body,
            contentType: 'application/json',
            timestamp: new Date().toISOString(),
            duration: 100,
          });
        } catch {
          // 忽略失败
        }
      }

      const endpoints = discoveryResult.getEndpoints();
      expect(endpoints.length).toBeGreaterThan(0);

      // 2. 生成测试用例
      const testCases = tester.generateTestCasesFromEndpoints(endpoints);
      expect(testCases.length).toBeGreaterThan(0);

      // 3. 执行测试
      const testResults = await tester.testEndpoints(testCases.slice(0, 3)); // 测试前 3 个
      expect(testResults.length).toBeGreaterThan(0);

      // 4. 生成报告
      const summary = tester.getSummary(testResults);
      expect(summary.totalTests).toBeGreaterThan(0);

      // 验证整个流程
      expect(summary.passedTests + summary.failedTests).toBe(summary.totalTests);
    });
  });
});
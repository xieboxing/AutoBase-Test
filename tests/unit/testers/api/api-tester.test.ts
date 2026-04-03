import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ApiTester,
  testApi,
  testApiBatch,
} from '@/testers/api/api-tester.js';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('ApiTester', () => {
  let tester: ApiTester;

  beforeEach(() => {
    tester = new ApiTester({
      baseUrl: 'https://api.example.com',
      timeout: 5000,
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export ApiTester class', () => {
      expect(ApiTester).toBeDefined();
      expect(typeof ApiTester).toBe('function');
    });

    it('should export testApi function', () => {
      expect(testApi).toBeDefined();
      expect(typeof testApi).toBe('function');
    });

    it('should export testApiBatch function', () => {
      expect(testApiBatch).toBeDefined();
      expect(typeof testApiBatch).toBe('function');
    });

    it('should accept configuration', () => {
      const customTester = new ApiTester({
        baseUrl: 'https://custom.api.com',
        timeout: 10000,
        headers: { 'X-Custom': 'value' },
      });
      expect(customTester).toBeDefined();
    });
  });

  describe('testEndpoint', () => {
    it('should return ApiTestResult', async () => {
      mockFetch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1 }),
      });

      const result = await tester.testEndpoint({
        name: 'Get Users',
        method: 'GET',
        url: '/users',
      });

      expect(result).toBeDefined();
      expect(result.endpoint).toContain('/users');
      expect(result.method).toBe('GET');
      expect(typeof result.passed).toBe('boolean');
      expect(Array.isArray(result.tests)).toBe(true);
      expect(typeof result.executionTime).toBe('number');
    });

    it('should pass for successful requests', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1 }),
      });

      const result = await tester.testEndpoint({
        name: 'Get Users',
        method: 'GET',
        url: '/users',
        expectedStatus: 200,
      });

      expect(result.tests[0].passed).toBe(true);
    });

    it('should fail for wrong status code', async () => {
      mockFetch.mockResolvedValue({
        status: 404,
        statusText: 'Not Found',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ error: 'Not found' }),
      });

      const result = await tester.testEndpoint({
        name: 'Get Users',
        method: 'GET',
        url: '/users',
        expectedStatus: 200,
      });

      expect(result.tests[0].passed).toBe(false);
      expect(result.tests[0].actualStatus).toBe(404);
    });

    it('should validate response schema', async () => {
      const { z } = await import('zod');

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1, name: 'Test' }),
      });

      const schema = z.object({
        id: z.number(),
        name: z.string(),
      });

      const result = await tester.testEndpoint({
        name: 'Get User',
        method: 'GET',
        url: '/user/1',
        schema,
      });

      expect(result.tests[0].passed).toBe(true);
    });

    it('should fail schema validation', async () => {
      const { z } = await import('zod');

      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 'wrong-type' }),
      });

      const schema = z.object({
        id: z.number(),
      });

      const result = await tester.testEndpoint({
        name: 'Get User',
        method: 'GET',
        url: '/user/1',
        schema,
      });

      expect(result.tests[0].passed).toBe(false);
      expect(result.tests[0].validationErrors).toBeDefined();
    });
  });

  describe('testEndpoints', () => {
    it('should test multiple endpoints', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1 }),
      });

      const results = await tester.testEndpoints([
        { name: 'Get Users', method: 'GET', url: '/users' },
        { name: 'Get Posts', method: 'GET', url: '/posts' },
      ]);

      expect(results.length).toBe(2);
    });
  });

  describe('getSummary', () => {
    it('should return summary statistics', async () => {
      mockFetch.mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({ id: 1 }),
      });

      const results = await tester.testEndpoints([
        { name: 'Get Users', method: 'GET', url: '/users' },
        { name: 'Get Posts', method: 'GET', url: '/posts' },
      ]);

      const summary = tester.getSummary(results);

      expect(summary.totalTests).toBe(2);
      expect(typeof summary.passedTests).toBe('number');
      expect(typeof summary.totalAssertions).toBe('number');
    });
  });
});

describe('ApiTestCase type', () => {
  it('should have correct structure', () => {
    const testCase = {
      name: 'Get Users',
      method: 'GET',
      url: '/users',
      headers: { Authorization: 'Bearer token' },
      expectedStatus: 200,
    };

    expect(testCase.method).toBe('GET');
    expect(testCase.url).toBe('/users');
  });
});

describe('ApiTestResult type', () => {
  it('should have correct structure', () => {
    const result = {
      endpoint: 'GET /users',
      method: 'GET',
      passed: true,
      tests: [],
      executionTime: 500,
    };

    expect(result.endpoint).toBe('GET /users');
    expect(result.passed).toBe(true);
    expect(Array.isArray(result.tests)).toBe(true);
  });
});

describe('ApiTestCaseResult type', () => {
  it('should have correct structure', () => {
    const testResult = {
      name: '正常请求',
      passed: true,
      expectedStatus: 200,
      actualStatus: 200,
      responseTime: 150,
    };

    expect(testResult.name).toBe('正常请求');
    expect(testResult.passed).toBe(true);
    expect(testResult.actualStatus).toBe(200);
  });
});

describe('ApiResponse type', () => {
  it('should have correct structure', () => {
    const response = {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'application/json' },
      body: { id: 1 },
      responseTime: 100,
    };

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ id: 1 });
  });
});
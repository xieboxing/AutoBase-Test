import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ApiDiscovery,
  createApiDiscovery,
} from '@/testers/api/api-discovery.js';

describe('ApiDiscovery', () => {
  let discovery: ApiDiscovery;

  beforeEach(() => {
    discovery = new ApiDiscovery();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('module exports', () => {
    it('should export ApiDiscovery class', () => {
      expect(ApiDiscovery).toBeDefined();
      expect(typeof ApiDiscovery).toBe('function');
    });

    it('should export createApiDiscovery function', () => {
      expect(createApiDiscovery).toBeDefined();
      expect(typeof createApiDiscovery).toBe('function');
    });

    it('should create instance via factory function', () => {
      const instance = createApiDiscovery();
      expect(instance).toBeInstanceOf(ApiDiscovery);
    });

    it('should accept configuration', () => {
      const customDiscovery = new ApiDiscovery({
        timeout: 10000,
        captureRequestBody: false,
      });
      expect(customDiscovery).toBeDefined();
    });
  });

  describe('analyzeRequest', () => {
    it('should identify API requests', () => {
      const request = {
        url: 'https://api.example.com/v1/users',
        method: 'GET',
        headers: {},
      };

      const result = discovery.analyzeRequest(request);
      expect(result).toBe(true);
    });

    it('should identify JSON requests', () => {
      const request = {
        url: 'https://example.com/data',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
      };

      const result = discovery.analyzeRequest(request);
      expect(result).toBe(true);
    });

    it('should exclude static resources', () => {
      const request = {
        url: 'https://example.com/script.js',
        method: 'GET',
        headers: {},
      };

      const result = discovery.analyzeRequest(request);
      expect(result).toBe(false);
    });

    it('should exclude CSS files', () => {
      const request = {
        url: 'https://example.com/style.css',
        method: 'GET',
        headers: {},
      };

      const result = discovery.analyzeRequest(request);
      expect(result).toBe(false);
    });

    it('should exclude image files', () => {
      const request = {
        url: 'https://example.com/image.png',
        method: 'GET',
        headers: {},
      };

      const result = discovery.analyzeRequest(request);
      expect(result).toBe(false);
    });
  });

  describe('addEndpoint', () => {
    it('should add endpoint', () => {
      const endpoint = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      discovery.addEndpoint(endpoint);
      const endpoints = discovery.getEndpoints();

      expect(endpoints.length).toBe(1);
      expect(endpoints[0].url).toBe('https://api.example.com/users');
    });

    it('should overwrite duplicate endpoints', () => {
      const endpoint1 = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      const endpoint2 = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 201,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 150,
      };

      discovery.addEndpoint(endpoint1);
      discovery.addEndpoint(endpoint2);
      const endpoints = discovery.getEndpoints();

      expect(endpoints.length).toBe(1);
      expect(endpoints[0].responseStatus).toBe(201);
    });
  });

  describe('createEndpointFromRequest', () => {
    it('should create endpoint from request and response', () => {
      const request = {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer token',
        },
        postData: JSON.stringify({ name: 'John' }),
      };

      const response = {
        status: 201,
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({ id: 1, name: 'John' }),
      };

      const endpoint = discovery.createEndpointFromRequest(request, response, 150);

      expect(endpoint.url).toBe('https://api.example.com/users');
      expect(endpoint.method).toBe('POST');
      expect(endpoint.path).toBe('/users');
      expect(endpoint.responseStatus).toBe(201);
      expect(endpoint.duration).toBe(150);
    });

    it('should parse JSON request body', () => {
      const request = {
        url: 'https://api.example.com/users',
        method: 'POST',
        headers: {},
        postData: JSON.stringify({ name: 'John' }),
      };

      const response = {
        status: 201,
        headers: {},
        body: '',
      };

      const endpoint = discovery.createEndpointFromRequest(request, response, 100);

      expect(endpoint.requestBody).toEqual({ name: 'John' });
    });

    it('should parse JSON response body', () => {
      const request = {
        url: 'https://api.example.com/users',
        method: 'GET',
        headers: {},
      };

      const response = {
        status: 200,
        headers: {},
        body: JSON.stringify({ id: 1, name: 'John' }),
      };

      const endpoint = discovery.createEndpointFromRequest(request, response, 100);

      expect(endpoint.responseBody).toEqual({ id: 1, name: 'John' });
    });
  });

  describe('getEndpointsByMethod', () => {
    it('should group endpoints by method', () => {
      const endpoint1 = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      const endpoint2 = {
        url: 'https://api.example.com/users',
        method: 'POST',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 201,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 150,
      };

      discovery.addEndpoint(endpoint1);
      discovery.addEndpoint(endpoint2);

      const grouped = discovery.getEndpointsByMethod();

      expect(grouped['GET'].length).toBe(1);
      expect(grouped['POST'].length).toBe(1);
    });
  });

  describe('getEndpointsByStatus', () => {
    it('should group endpoints by status code', () => {
      const endpoint1 = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      const endpoint2 = {
        url: 'https://api.example.com/error',
        method: 'GET',
        path: '/error',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 404,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 50,
      };

      discovery.addEndpoint(endpoint1);
      discovery.addEndpoint(endpoint2);

      const grouped = discovery.getEndpointsByStatus();

      expect(grouped['2xx'].length).toBe(1);
      expect(grouped['4xx'].length).toBe(1);
    });
  });

  describe('getSummary', () => {
    it('should return summary statistics', () => {
      const endpoint = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      discovery.addEndpoint(endpoint);
      const summary = discovery.getSummary();

      expect(summary.totalEndpoints).toBe(1);
      expect(summary.methods['GET']).toBe(1);
      expect(summary.statusCodes[200]).toBe(1);
      expect(summary.avgResponseTime).toBe(100);
    });
  });

  describe('searchByPath', () => {
    it('should find endpoints by path pattern', () => {
      const endpoint1 = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      const endpoint2 = {
        url: 'https://api.example.com/products',
        method: 'GET',
        path: '/products',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      discovery.addEndpoint(endpoint1);
      discovery.addEndpoint(endpoint2);

      const found = discovery.searchByPath(/users/);

      expect(found.length).toBe(1);
      expect(found[0].path).toBe('/users');
    });
  });

  describe('findSensitiveEndpoints', () => {
    it('should find potentially sensitive endpoints', () => {
      const endpoint1 = {
        url: 'https://api.example.com/auth/login',
        method: 'POST',
        path: '/auth/login',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      const endpoint2 = {
        url: 'https://api.example.com/public/info',
        method: 'GET',
        path: '/public/info',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 50,
      };

      discovery.addEndpoint(endpoint1);
      discovery.addEndpoint(endpoint2);

      const sensitive = discovery.findSensitiveEndpoints();

      expect(sensitive.length).toBe(1);
      expect(sensitive[0].path).toBe('/auth/login');
    });
  });

  describe('toOpenApiSpec', () => {
    it('should generate OpenAPI spec', () => {
      const endpoint = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: { 'content-type': 'application/json' },
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      discovery.addEndpoint(endpoint);

      const spec = discovery.toOpenApiSpec({
        title: 'Test API',
        version: '1.0.0',
      });

      expect(spec).toHaveProperty('openapi', '3.0.0');
      expect(spec).toHaveProperty('info');
      expect(spec).toHaveProperty('paths');
    });
  });

  describe('clear', () => {
    it('should clear all endpoints', () => {
      const endpoint = {
        url: 'https://api.example.com/users',
        method: 'GET',
        path: '/users',
        baseUrl: 'https://api.example.com',
        requestHeaders: {},
        responseStatus: 200,
        responseHeaders: {},
        contentType: 'application/json',
        timestamp: new Date().toISOString(),
        duration: 100,
      };

      discovery.addEndpoint(endpoint);
      discovery.clear();

      expect(discovery.getEndpoints().length).toBe(0);
    });
  });
});

describe('ApiEndpoint type', () => {
  it('should have correct structure', () => {
    const endpoint = {
      url: 'https://api.example.com/users',
      method: 'GET',
      path: '/users',
      baseUrl: 'https://api.example.com',
      requestHeaders: {},
      responseStatus: 200,
      responseHeaders: {},
      contentType: 'application/json',
      timestamp: new Date().toISOString(),
      duration: 100,
    };

    expect(endpoint.method).toBe('GET');
    expect(endpoint.path).toBe('/users');
    expect(endpoint.responseStatus).toBe(200);
  });
});
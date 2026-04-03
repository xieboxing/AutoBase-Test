import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type { SecurityIssue } from '@/types/test-result.types.js';

/**
 * API 端点信息
 */
export interface ApiEndpoint {
  url: string;
  method: string;
  path: string;
  baseUrl: string;
  requestHeaders: Record<string, string>;
  requestBody?: unknown;
  responseStatus: number;
  responseHeaders: Record<string, string>;
  responseBody?: unknown;
  contentType: string;
  timestamp: string;
  duration: number;
}

/**
 * API 发现结果
 */
export interface ApiDiscoveryResult {
  baseUrl: string;
  endpoints: ApiEndpoint[];
  totalFound: number;
  executionTime: number;
}

/**
 * API 发现器配置
 */
export interface ApiDiscoveryConfig {
  timeout: number;
  captureRequestBody: boolean;
  captureResponseBody: boolean;
  maxBodySize: number;
  excludePatterns: RegExp[];
  includeOnlyApiPatterns: RegExp[];
}

/**
 * 默认配置
 */
const DEFAULT_API_DISCOVERY_CONFIG: ApiDiscoveryConfig = {
  timeout: 30000,
  captureRequestBody: true,
  captureResponseBody: true,
  maxBodySize: 1024 * 1024, // 1MB
  excludePatterns: [
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/i,
    /\.(html|htm)$/i,
  ],
  includeOnlyApiPatterns: [
    /\/api\//i,
    /\/v\d+\//i,
    /\/rest\//i,
    /\/graphql$/i,
    /\.json$/i,
  ],
};

/**
 * API 自动发现器
 * 通过监听网络请求自动发现 API 端点
 */
export class ApiDiscovery {
  private config: ApiDiscoveryConfig;
  private endpoints: Map<string, ApiEndpoint>;
  private testId: string;

  constructor(config: Partial<ApiDiscoveryConfig> = {}) {
    this.config = { ...DEFAULT_API_DISCOVERY_CONFIG, ...config };
    this.endpoints = new Map();
    this.testId = nanoid(8);
  }

  /**
   * 分析网络请求
   */
  analyzeRequest(request: {
    url: string;
    method: string;
    headers: Record<string, string>;
    postData?: string;
  }): boolean {
    // 检查排除模式
    for (const pattern of this.config.excludePatterns) {
      if (pattern.test(request.url)) {
        return false;
      }
    }

    // 检查是否是 API 请求
    const isApiRequest = this.config.includeOnlyApiPatterns.some(
      pattern => pattern.test(request.url)
    );

    // 如果没有匹配 API 模式，检查 Content-Type
    const contentType = request.headers['content-type'] || '';
    const isJsonRequest = contentType.includes('application/json');

    // 或者检查是否有常见的 API 标识
    const isXhrOrFetch =
      request.headers['x-requested-with'] === 'XMLHttpRequest' ||
      contentType.includes('application/json') ||
      contentType.includes('application/xml');

    return isApiRequest || isJsonRequest || isXhrOrFetch;
  }

  /**
   * 添加发现的端点
   */
  addEndpoint(endpoint: ApiEndpoint): void {
    const key = `${endpoint.method}:${endpoint.url}`;
    this.endpoints.set(key, endpoint);
  }

  /**
   * 从网络请求创建端点
   */
  createEndpointFromRequest(
    request: {
      url: string;
      method: string;
      headers: Record<string, string>;
      postData?: string;
    },
    response: {
      status: number;
      headers: Record<string, string>;
      body?: string;
    },
    duration: number
  ): ApiEndpoint {
    const urlObj = new URL(request.url);

    // 解析请求体
    let requestBody: unknown = undefined;
    if (this.config.captureRequestBody && request.postData) {
      try {
        requestBody = JSON.parse(request.postData);
      } catch {
        requestBody = request.postData.substring(0, 1000);
      }
    }

    // 解析响应体
    let responseBody: unknown = undefined;
    if (this.config.captureResponseBody && response.body) {
      try {
        responseBody = JSON.parse(response.body);
      } catch {
        responseBody = response.body.substring(0, 1000);
      }
    }

    return {
      url: request.url,
      method: request.method,
      path: urlObj.pathname,
      baseUrl: urlObj.origin,
      requestHeaders: request.headers,
      requestBody,
      responseStatus: response.status,
      responseHeaders: response.headers,
      responseBody,
      contentType: response.headers['content-type'] || '',
      timestamp: new Date().toISOString(),
      duration,
    };
  }

  /**
   * 获取所有端点
   */
  getEndpoints(): ApiEndpoint[] {
    return Array.from(this.endpoints.values());
  }

  /**
   * 按方法分组获取端点
   */
  getEndpointsByMethod(): Record<string, ApiEndpoint[]> {
    const grouped: Record<string, ApiEndpoint[]> = {};

    for (const endpoint of this.endpoints.values()) {
      const method = endpoint.method.toUpperCase();
      if (!grouped[method]) {
        grouped[method] = [];
      }
      grouped[method].push(endpoint);
    }

    return grouped;
  }

  /**
   * 获取所有唯一的路径
   */
  getUniquePaths(): string[] {
    const paths = new Set<string>();
    for (const endpoint of this.endpoints.values()) {
      paths.add(endpoint.path);
    }
    return Array.from(paths);
  }

  /**
   * 按状态码分组
   */
  getEndpointsByStatus(): Record<string, ApiEndpoint[]> {
    const grouped: Record<string, ApiEndpoint[]> = {};

    for (const endpoint of this.endpoints.values()) {
      const statusGroup = `${Math.floor(endpoint.responseStatus / 100)}xx`;
      if (!grouped[statusGroup]) {
        grouped[statusGroup] = [];
      }
      grouped[statusGroup].push(endpoint);
    }

    return grouped;
  }

  /**
   * 获取 API 摘要
   */
  getSummary(): {
    totalEndpoints: number;
    methods: Record<string, number>;
    statusCodes: Record<number, number>;
    avgResponseTime: number;
    errorCount: number;
  } {
    const methods: Record<string, number> = {};
    const statusCodes: Record<number, number> = {};
    let totalDuration = 0;
    let errorCount = 0;

    for (const endpoint of this.endpoints.values()) {
      // 统计方法
      const method = endpoint.method.toUpperCase();
      methods[method] = (methods[method] || 0) + 1;

      // 统计状态码
      statusCodes[endpoint.responseStatus] = (statusCodes[endpoint.responseStatus] || 0) + 1;

      // 计算总时间
      totalDuration += endpoint.duration;

      // 统计错误
      if (endpoint.responseStatus >= 400) {
        errorCount++;
      }
    }

    return {
      totalEndpoints: this.endpoints.size,
      methods,
      statusCodes,
      avgResponseTime: this.endpoints.size > 0 ? totalDuration / this.endpoints.size : 0,
      errorCount,
    };
  }

  /**
   * 过滤端点
   */
  filterEndpoints(predicate: (endpoint: ApiEndpoint) => boolean): ApiEndpoint[] {
    return this.getEndpoints().filter(predicate);
  }

  /**
   * 按路径模式搜索
   */
  searchByPath(pattern: string | RegExp): ApiEndpoint[] {
    const regex = typeof pattern === 'string' ? new RegExp(pattern, 'i') : pattern;
    return this.filterEndpoints(endpoint => regex.test(endpoint.path));
  }

  /**
   * 获取潜在的敏感端点
   */
  findSensitiveEndpoints(): ApiEndpoint[] {
    const sensitivePatterns = [
      /user/i,
      /account/i,
      /auth/i,
      /login/i,
      /password/i,
      /token/i,
      /secret/i,
      /admin/i,
      /config/i,
      /settings/i,
      /private/i,
    ];

    return this.filterEndpoints(endpoint =>
      sensitivePatterns.some(pattern => pattern.test(endpoint.path))
    );
  }

  /**
   * 导出为 OpenAPI 格式（基础版）
   */
  toOpenApiSpec(info: { title: string; version: string }): object {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const endpoint of this.endpoints.values()) {
      if (!paths[endpoint.path]) {
        paths[endpoint.path] = {};
      }

      const methodKey = endpoint.method.toLowerCase();
      (paths[endpoint.path] as any)[methodKey] = {
        summary: `${endpoint.method} ${endpoint.path}`,
        responses: {
          [endpoint.responseStatus]: {
            description: `Response with status ${endpoint.responseStatus}`,
            content: endpoint.contentType
              ? {
                  [endpoint.contentType]: {
                    schema: {
                      type: 'object',
                    },
                  },
                }
              : undefined,
          },
        },
      };
    }

    return {
      openapi: '3.0.0',
      info: {
        title: info.title,
        version: info.version,
      },
      paths,
    };
  }

  /**
   * 清空发现的端点
   */
  clear(): void {
    this.endpoints.clear();
  }
}

/**
 * 创建 API 发现器实例
 */
export function createApiDiscovery(config?: Partial<ApiDiscoveryConfig>): ApiDiscovery {
  return new ApiDiscovery(config);
}
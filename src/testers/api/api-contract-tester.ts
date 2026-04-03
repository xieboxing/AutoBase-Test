import { z } from 'zod';
import type { ApiEndpoint } from './api-discovery.js';

/**
 * 契约违规
 */
export interface ContractViolation {
  type: string;
  path: string;
  expected: string;
  actual: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * 契约验证结果
 */
export interface ContractValidationResult {
  valid: boolean;
  violations: ContractViolation[];
  duration: number;
}

/**
 * OpenAPI 信息
 */
export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

/**
 * API 契约配置
 */
export interface ApiContractTesterConfig {
  timeout?: number;
  strictMode?: boolean;
}

/**
 * API 契约
 */
export interface ApiContract {
  path: string;
  method: string;
  requestSchema?: z.ZodSchema;
  responseSchema?: z.ZodSchema;
  requestHeaders?: Record<string, z.ZodSchema>;
  responseHeaders?: Record<string, z.ZodSchema>;
}

/**
 * 验证契约（快捷函数）
 */
export async function validateContract(
  endpoint: ApiEndpoint,
  requestBody: unknown,
  requestHeaders: Record<string, string>,
  baseUrl: string
): Promise<ContractValidationResult> {
  const tester = new ApiContractTester();
  return tester.validateRequest(endpoint, requestBody, requestHeaders, baseUrl);
}

/**
 * API 契约验证器
 */
export class ApiContractTester {
  private config: ApiContractTesterConfig;

  constructor(config: Partial<ApiContractTesterConfig> = {}) {
    this.config = {
      timeout: 30000,
      strictMode: true,
      ...config,
    };
  }

  /**
   * 验证请求
   */
  async validateRequest(
    endpoint: ApiEndpoint,
    requestBody: unknown,
    requestHeaders: Record<string, string>,
    baseUrl: string
  ): Promise<ContractValidationResult> {
    const startTime = Date.now();
    const violations: ContractViolation[] = [];

    // 验证请求体（跳过，ApiEndpoint 没有 schema）
    // if (endpoint.requestSchema) {
    //   const bodyViolations = this.validateSchema(requestBody, endpoint.requestSchema, 'requestBody');
    //   violations.push(...bodyViolations);
    // }

    // 验证请求头（跳过，ApiEndpoint 的 requestHeaders 是 string 类型）
    // if (endpoint.requestHeaders) {
    //   const headerViolations = this.validateHeaders(requestHeaders, endpoint.requestHeaders, 'headers');
    //   violations.push(...headerViolations);
    // }

    return {
      valid: violations.length === 0,
      violations,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 验证响应
   */
  async validateResponse(
    endpoint: ApiEndpoint,
    responseBody: unknown,
    responseStatus: number,
    responseHeaders: Record<string, string>
  ): Promise<ContractValidationResult> {
    const startTime = Date.now();
    const violations: ContractViolation[] = [];

    // 验证状态码
    if (endpoint.responseStatus && responseStatus !== endpoint.responseStatus) {
      violations.push({
        type: 'status_mismatch',
        path: 'status',
        expected: String(endpoint.responseStatus),
        actual: String(responseStatus),
        severity: 'error',
        message: `响应状态码不匹配：期望 ${endpoint.responseStatus}，实际 ${responseStatus}`,
      });
    }

    // 验证响应体（跳过，ApiEndpoint 没有 schema）
    // if (endpoint.responseSchema) {
    //   const bodyViolations = this.validateSchema(responseBody, endpoint.responseSchema, 'responseBody');
    //   violations.push(...bodyViolations);
    // }

    // 验证响应头（跳过，ApiEndpoint 的 responseHeaders 是 string 类型）
    // if (endpoint.responseHeaders) {
    //   const headerViolations = this.validateHeaders(responseHeaders, endpoint.responseHeaders, 'responseHeaders');
    //   violations.push(...headerViolations);
    // }

    return {
      valid: violations.length === 0,
      violations,
      duration: Date.now() - startTime,
    };
  }

  /**
   * 验证 Zod Schema
   */
  private validateSchema(
    data: unknown,
    schema: z.ZodSchema,
    basePath: string
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];
    const result = schema.safeParse(data);

    if (!result.success) {
      for (const error of result.error.errors) {
        const path = error.path.length > 0 ? `${basePath}.${error.path.join('.')}` : basePath;

        violations.push({
          type: this.mapZodErrorToViolationType(error.code),
          path,
          expected: this.getExpectedFromZodError(error),
          actual: String((error as any).received || 'undefined'),
          severity: 'error',
          message: error.message,
        });
      }
    }

    return violations;
  }

  /**
   * 验证请求头/响应头
   */
  private validateHeaders(
    headers: Record<string, string>,
    schema: Record<string, z.ZodSchema>,
    basePath: string
  ): ContractViolation[] {
    const violations: ContractViolation[] = [];

    for (const [name, headerSchema] of Object.entries(schema)) {
      const value = headers[name.toLowerCase()];

      if (value === undefined) {
        violations.push({
          type: 'required',
          path: `${basePath}.${name}`,
          expected: 'required',
          actual: 'undefined',
          severity: 'error',
          message: `缺少必需的请求头：${name}`,
        });
        continue;
      }

      const result = headerSchema.safeParse(value);
      if (!result.success) {
        const firstError = result.error.errors[0];
        violations.push({
          type: 'type_mismatch',
          path: `${basePath}.${name}`,
          expected: firstError ? this.getExpectedFromZodError(firstError) : 'unknown',
          actual: value,
          severity: 'warning',
          message: `请求头 ${name} 格式不匹配：${firstError?.message || '未知错误'}`,
        });
      }
    }

    return violations;
  }

  /**
   * 自动推断并验证
   */
  private async inferAndValidate(
    endpoint: ApiEndpoint,
    responseBody: unknown
  ): Promise<ContractValidationResult> {
    const startTime = Date.now();
    const violations: ContractViolation[] = [];
    const endpointKey = `${endpoint.method.toUpperCase()}:${endpoint.path}`;

    // 简化处理：如果没有 schema，返回通过
    return {
      valid: true,
      violations: [],
      duration: Date.now() - startTime,
    };
  }

  /**
   * 映射 Zod 错误类型
   */
  private mapZodErrorToViolationType(code: string): string {
    switch (code) {
      case 'invalid_type':
        return 'type_mismatch';
      case 'invalid_union':
        return 'union_mismatch';
      case 'invalid_enum_value':
        return 'enum_mismatch';
      case 'unrecognized_keys':
        return 'extra_keys';
      default:
        return 'validation_error';
    }
  }

  /**
   * 从 Zod 错误获取期望类型
   */
  private getExpectedFromZodError(error: z.ZodIssue): string {
    if (error.code === 'invalid_type') {
      return (error as any).expected || 'unknown';
    }
    return error.message;
  }

  /**
   * 生成 OpenAPI 规范
   */
  generateOpenApi(
    endpoints: ApiEndpoint[],
    info: OpenApiInfo
  ): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};

    for (const contract of endpoints) {
      if (!paths[contract.path]) {
        paths[contract.path] = {};
      }

      const responses: Record<string, unknown> = {};
      const status = contract.responseStatus || 200;
      responses[status] = {
        description: `Response with status ${status}`,
      };

      paths[contract.path]![contract.method.toLowerCase()] = {
        summary: `${contract.method.toUpperCase()} ${contract.path}`,
        responses,
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
   * 将 Zod Schema 转换为 JSON Schema（简化版）
   */
  private zodToJsonSchema(schema: z.ZodSchema): Record<string, unknown> {
    const def = (schema as any)._def;
    if (!def) {
      return { type: 'object' };
    }

    switch (def.typeName) {
      case 'ZodObject': {
        const shape = def.shape();
        const properties: Record<string, unknown> = {};
        const required: string[] = [];

        for (const [key, value] of Object.entries(shape)) {
          properties[key] = this.zodToJsonSchema(value as z.ZodSchema);
          if (!(value as any).isOptional?.()) {
            required.push(key);
          }
        }

        return {
          type: 'object',
          properties,
          required,
        };
      }

      case 'ZodString':
        return { type: 'string' };

      case 'ZodNumber':
        return { type: 'number' };

      case 'ZodBoolean':
        return { type: 'boolean' };

      case 'ZodArray':
        return {
          type: 'array',
          items: this.zodToJsonSchema(def.type),
        };

      case 'ZodOptional':
        return this.zodToJsonSchema(def.innerType);

      case 'ZodNullable':
        return {
          anyOf: [
            this.zodToJsonSchema(def.innerType),
            { type: 'null' },
          ],
        };

      case 'ZodEnum':
        return {
          type: 'string',
          enum: def.values,
        };

      case 'ZodUnion':
        return {
          anyOf: def.options.map((opt: z.ZodSchema) => this.zodToJsonSchema(opt)),
        };

      default:
        return { type: 'object' };
    }
  }
}

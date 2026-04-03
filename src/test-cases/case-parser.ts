import { z } from 'zod';
import type { TestCase, TestStep, TestActionType, AssertType } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';

/**
 * 解析后的可执行步骤
 */
export interface ExecutableStep {
  order: number;
  action: TestActionType;
  target?: string;
  value?: string;
  assertType?: AssertType;
  description: string;
  timeout: number;
  waitBefore: number;
  waitAfter: number;
}

/**
 * 解析后的可执行测试用例
 */
export interface ExecutableTestCase {
  id: string;
  name: string;
  description: string;
  steps: ExecutableStep[];
  cleanup: ExecutableStep[];
  raw: TestCase;
}

/**
 * 解析错误
 */
export interface ParseError {
  step?: number;
  field: string;
  message: string;
}

/**
 * 用例解析器配置
 */
export interface CaseParserConfig {
  defaultTimeout: number;
  defaultWaitBefore: number;
  defaultWaitAfter: number;
}

/**
 * 默认配置
 */
const DEFAULT_CASE_PARSER_CONFIG: CaseParserConfig = {
  defaultTimeout: 30000,
  defaultWaitBefore: 0,
  defaultWaitAfter: 500,
};

/**
 * 测试步骤 Schema
 */
const TestStepSchema = z.object({
  order: z.number().int().positive(),
  action: z.enum([
    'navigate', 'click', 'fill', 'select', 'hover', 'scroll',
    'wait', 'screenshot', 'assert', 'tap', 'swipe', 'long-press',
    'back', 'home',
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
  type: z.enum([
    'element-visible', 'element-hidden', 'text-contains', 'text-equals',
    'url-contains', 'url-equals', 'title-contains', 'title-equals',
    'element-count', 'attribute-equals', 'value-equals', 'checked',
    'disabled', 'enabled',
  ]).optional(),
  description: z.string().min(1),
  timeout: z.number().positive().optional(),
  waitBefore: z.number().nonnegative().optional(),
  waitAfter: z.number().nonnegative().optional(),
});

/**
 * 测试用例 Schema
 */
const TestCaseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  priority: z.enum(['P0', 'P1', 'P2', 'P3']),
  type: z.enum(['functional', 'visual', 'performance', 'security', 'accessibility', 'compatibility', 'stability']),
  platform: z.array(z.enum(['pc-web', 'h5-web', 'android-app', 'api'])).nonempty(),
  tags: z.array(z.string()),
  preconditions: z.array(z.string()).optional(),
  steps: z.array(TestStepSchema).nonempty(),
  cleanup: z.array(TestStepSchema).optional(),
  metadata: z.any().optional(),
});

/**
 * 测试用例解析器
 * 将 JSON 格式的测试用例解析为可执行的步骤
 */
export class CaseParser {
  private config: CaseParserConfig;

  constructor(config: Partial<CaseParserConfig> = {}) {
    this.config = { ...DEFAULT_CASE_PARSER_CONFIG, ...config };
  }

  /**
   * 解析测试用例
   */
  parse(testCase: unknown): ExecutableTestCase | null {
    const errors = this.validate(testCase);
    if (errors.length > 0) {
      logger.fail('❌ 用例解析失败', { errors });
      return null;
    }

    const raw = testCase as TestCase;

    return {
      id: raw.id,
      name: raw.name,
      description: raw.description,
      steps: raw.steps.map(step => this.parseStep(step)),
      cleanup: raw.cleanup?.map(step => this.parseStep(step)) ?? [],
      raw,
    };
  }

  /**
   * 解析单个步骤
   */
  private parseStep(step: TestStep): ExecutableStep {
    return {
      order: step.order,
      action: step.action,
      target: step.target,
      value: step.value,
      assertType: step.type,
      description: step.description,
      timeout: step.timeout ?? this.config.defaultTimeout,
      waitBefore: step.waitBefore ?? this.config.defaultWaitBefore,
      waitAfter: step.waitAfter ?? this.config.defaultWaitAfter,
    };
  }

  /**
   * 验证测试用例格式
   */
  validate(testCase: unknown): ParseError[] {
    const errors: ParseError[] = [];

    try {
      TestCaseSchema.parse(testCase);
    } catch (error) {
      if (error instanceof z.ZodError) {
        for (const zodError of error.errors) {
          const path = zodError.path.join('.');
          const stepMatch = path.match(/steps\.(\d+)/);
          errors.push({
            step: stepMatch ? parseInt(stepMatch[1]!) + 1 : undefined,
            field: path,
            message: zodError.message,
          });
        }
      }
    }

    // 额外的语义验证
    if (testCase && typeof testCase === 'object') {
      const tc = testCase as TestCase;
      errors.push(...this.validateSemantics(tc));
    }

    return errors;
  }

  /**
   * 语义验证
   */
  private validateSemantics(testCase: TestCase): ParseError[] {
    const errors: ParseError[] = [];

    // 检查步骤是否存在
    if (!testCase.steps || !Array.isArray(testCase.steps)) {
      return errors;
    }

    // 检查步骤顺序
    const orders = testCase.steps.map(s => s.order);
    const sortedOrders = [...orders].sort((a, b) => a - b);
    if (JSON.stringify(orders) !== JSON.stringify(sortedOrders)) {
      errors.push({
        field: 'steps.order',
        message: '步骤顺序必须是递增的',
      });
    }

    // 检查步骤是否有重复顺序
    const uniqueOrders = new Set(orders);
    if (uniqueOrders.size !== orders.length) {
      errors.push({
        field: 'steps.order',
        message: '步骤顺序不能重复',
      });
    }

    // 检查每个步骤的必要字段
    testCase.steps.forEach((step, index) => {
      // navigate 需要 value (URL)
      if (step.action === 'navigate' && !step.value) {
        errors.push({
          step: index + 1,
          field: 'steps.value',
          message: 'navigate 操作需要 value (URL)',
        });
      }

      // click/fill/select/hover 需要 target
      if (['click', 'fill', 'select', 'hover'].includes(step.action) && !step.target) {
        errors.push({
          step: index + 1,
          field: 'steps.target',
          message: `${step.action} 操作需要 target (选择器)`,
        });
      }

      // assert 需要 type
      if (step.action === 'assert' && !step.type) {
        errors.push({
          step: index + 1,
          field: 'steps.type',
          message: 'assert 操作需要 type (断言类型)',
        });
      }
    });

    return errors;
  }

  /**
   * 从 JSON 字符串解析
   */
  parseFromJson(jsonString: string): ExecutableTestCase | null {
    try {
      const testCase = JSON.parse(jsonString);
      return this.parse(testCase);
    } catch (error) {
      logger.fail('❌ JSON 解析失败', { error: error instanceof Error ? error.message : String(error) });
      return null;
    }
  }

  /**
   * 从文件解析
   */
  async parseFromFile(filePath: string): Promise<ExecutableTestCase | null> {
    try {
      const fs = await import('node:fs/promises');
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseFromJson(content);
    } catch (error) {
      logger.fail('❌ 文件读取失败', { path: filePath, error });
      return null;
    }
  }

  /**
   * 批量解析
   */
  parseMany(testCases: unknown[]): {
    parsed: ExecutableTestCase[];
    failed: Array<{ index: number; errors: ParseError[] }>;
  } {
    const parsed: ExecutableTestCase[] = [];
    const failed: Array<{ index: number; errors: ParseError[] }> = [];

    testCases.forEach((testCase, index) => {
      const result = this.parse(testCase);
      if (result) {
        parsed.push(result);
      } else {
        failed.push({
          index,
          errors: this.validate(testCase),
        });
      }
    });

    return { parsed, failed };
  }

  /**
   * 获取步骤说明
   */
  getStepDescription(step: ExecutableStep): string {
    switch (step.action) {
      case 'navigate':
        return `导航到 ${step.value}`;
      case 'click':
        return `点击 ${step.target}`;
      case 'fill':
        return `在 ${step.target} 输入 "${step.value}"`;
      case 'select':
        return `在 ${step.target} 选择 "${step.value}"`;
      case 'hover':
        return `悬停在 ${step.target}`;
      case 'scroll':
        return `滚动${step.value === 'up' ? '向上' : step.value === 'down' ? '向下' : ''}`;
      case 'wait':
        return `等待 ${(step.value ? parseInt(step.value) : step.waitAfter) / 1000} 秒`;
      case 'screenshot':
        return `截图 ${step.target ?? '全页'}`;
      case 'assert':
        return this.getAssertDescription(step);
      case 'tap':
        return `点击 ${step.target} (移动端)`;
      case 'swipe':
        return `滑动 ${step.value}`;
      case 'long-press':
        return `长按 ${step.target}`;
      case 'back':
        return '返回上一页';
      case 'home':
        return '回到首页';
      default:
        return step.description;
    }
  }

  /**
   * 获取断言步骤说明
   */
  private getAssertDescription(step: ExecutableStep): string {
    switch (step.assertType) {
      case 'element-visible':
        return `验证元素 ${step.target} 可见`;
      case 'element-hidden':
        return `验证元素 ${step.target} 不可见`;
      case 'text-contains':
        return `验证包含文本 "${step.value}"`;
      case 'text-equals':
        return `验证文本等于 "${step.value}"`;
      case 'url-contains':
        return `验证 URL 包含 "${step.value}"`;
      case 'url-equals':
        return `验证 URL 等于 "${step.value}"`;
      case 'title-contains':
        return `验证标题包含 "${step.value}"`;
      case 'title-equals':
        return `验证标题等于 "${step.value}"`;
      case 'element-count':
        return `验证元素数量为 ${step.value}`;
      case 'attribute-equals':
        return `验证属性 ${step.target} = "${step.value}"`;
      default:
        return step.description;
    }
  }
}

/**
 * 快捷函数：创建解析器
 */
export function createCaseParser(config?: Partial<CaseParserConfig>): CaseParser {
  return new CaseParser(config);
}

/**
 * 快捷函数：解析用例
 */
export function parseCase(testCase: unknown, config?: Partial<CaseParserConfig>): ExecutableTestCase | null {
  const parser = new CaseParser(config);
  return parser.parse(testCase);
}
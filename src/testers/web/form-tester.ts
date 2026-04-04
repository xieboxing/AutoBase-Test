import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { logger } from '@/core/logger.js';
import fs from 'node:fs/promises';

/**
 * 表单字段信息
 */
export interface FormField {
  selector: string;
  type: string;
  name?: string;
  label?: string;
  placeholder?: string;
  required: boolean;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
}

/**
 * 表单信息
 */
export interface FormInfo {
  selector: string;
  action?: string;
  method: string;
  fields: FormField[];
  submitButton?: string;
}

/**
 * 表单测试结果
 */
export interface FormTestResult {
  formSelector: string;
  passed: boolean;
  fieldResults: FieldTestResult[];
  errorMessage?: string;
  screenshot?: string;
}

/**
 * 字段测试结果
 */
export interface FieldTestResult {
  selector: string;
  type: string;
  tests: {
    empty?: { passed: boolean; errorMessage?: string };
    valid?: { passed: boolean; errorMessage?: string };
    invalid?: { passed: boolean; errorMessage?: string };
    boundary?: { passed: boolean; errorMessage?: string };
  };
}

/**
 * 表单测试器配置
 */
export interface FormTesterConfig {
  headless: boolean;
  timeout: number;
  viewport: { width: number; height: number };
  testEmptySubmit: boolean;
  testValidation: boolean;
  testBoundary: boolean;
  artifactsDir: string;
}

/**
 * 默认配置
 */
const DEFAULT_FORM_TESTER_CONFIG: FormTesterConfig = {
  headless: true,
  timeout: 30000,
  viewport: { width: 1920, height: 1080 },
  testEmptySubmit: true,
  testValidation: true,
  testBoundary: true,
  artifactsDir: './data/screenshots',
};

/**
 * 测试数据生成器
 */
const TEST_DATA: Record<string, { valid: string[]; invalid: string[] }> = {
  email: {
    valid: ['test@example.com', 'user.name@domain.co'],
    invalid: ['invalid', 'no-at-sign', '@no-local', 'spaces in@email.com'],
  },
  password: {
    valid: ['Password123!', 'SecurePass1'],
    invalid: ['short', 'no-numbers', 'NO-LOWERCASE1'],
  },
  tel: {
    valid: ['13800138000', '18612345678'],
    invalid: ['123', 'not-a-number', '00000000000'],
  },
  url: {
    valid: ['https://example.com', 'http://test.org'],
    invalid: ['not-a-url', 'htp://invalid'],
  },
  number: {
    valid: ['100', '0', '9999'],
    invalid: ['abc', '1.1.1'],
  },
  text: {
    valid: ['测试文本', 'Normal Text'],
    invalid: ['', '   '],
  },
};

/**
 * 表单自动测试器
 */
export class FormTester {
  private config: FormTesterConfig;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  constructor(config: Partial<FormTesterConfig> = {}) {
    this.config = { ...DEFAULT_FORM_TESTER_CONFIG, ...config };
  }

  /**
   * 初始化浏览器
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.config.artifactsDir, { recursive: true });
    this.browser = await chromium.launch({ headless: this.config.headless });
    this.context = await this.browser.newContext({ viewport: this.config.viewport });
    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.config.timeout);
    logger.pass('✅ 表单测试器初始化完成');
  }

  /**
   * 测试页面上的所有表单
   */
  async testForms(url: string): Promise<FormTestResult[]> {
    if (!this.page) {
      await this.initialize();
    }

    logger.step(`📝 开始测试表单: ${url}`);

    await this.page!.goto(url, { waitUntil: 'domcontentloaded' });
    await this.page!.waitForLoadState('networkidle').catch(() => {});

    // 发现所有表单
    const forms = await this.discoverForms();
    logger.step(`  📊 发现 ${forms.length} 个表单`);

    const results: FormTestResult[] = [];

    for (const form of forms) {
      const result = await this.testForm(form);
      results.push(result);

      if (result.passed) {
        logger.pass(`    ✅ 表单 ${form.selector}: 通过`);
      } else {
        logger.fail(`    ❌ 表单 ${form.selector}: ${result.errorMessage}`);
      }

      // 刷新页面准备测试下一个表单
      await this.page!.reload().catch(() => {});
    }

    return results;
  }

  /**
   * 发现页面上所有表单
   */
  private async discoverForms(): Promise<FormInfo[]> {
    if (!this.page) return [];

    return await this.page.evaluate(() => {
      const forms: FormInfo[] = [];

      document.querySelectorAll('form').forEach(form => {
        const fields: FormField[] = [];

        form.querySelectorAll('input, select, textarea').forEach(field => {
          const el = field as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

          // Only input and textarea elements have these properties
          const isInputOrTextarea = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA';
          const inputEl = el as HTMLInputElement;

          fields.push({
            selector: el.id ? `#${el.id}` : el.name ? `[name="${el.name}"]` : el.tagName.toLowerCase(),
            type: el.type || el.tagName.toLowerCase(),
            name: el.name || undefined,
            label: el.labels?.[0]?.textContent?.trim() || undefined,
            placeholder: isInputOrTextarea ? (inputEl.placeholder || undefined) : undefined,
            required: el.required,
            pattern: isInputOrTextarea ? (inputEl.pattern || undefined) : undefined,
            minLength: isInputOrTextarea && inputEl.minLength > 0 ? inputEl.minLength : undefined,
            maxLength: isInputOrTextarea && inputEl.maxLength > 0 ? inputEl.maxLength : undefined,
          });
        });

        const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
        forms.push({
          selector: form.id ? `#${form.id}` : 'form',
          action: form.action || undefined,
          method: form.method || 'get',
          fields,
          submitButton: submitBtn
            ? (submitBtn.id ? `#${submitBtn.id}` : 'button[type="submit"]')
            : undefined,
        });
      });

      return forms;
    });
  }

  /**
   * 测试单个表单
   */
  private async testForm(form: FormInfo): Promise<FormTestResult> {
    const result: FormTestResult = {
      formSelector: form.selector,
      passed: true,
      fieldResults: [],
    };

    try {
      // 1. 测试空提交（必填字段验证）
      if (this.config.testEmptySubmit && form.fields.some(f => f.required)) {
        const emptyResult = await this.testEmptySubmit(form);
        if (!emptyResult.passed) {
          result.passed = false;
          result.errorMessage = 'Empty submission validation failed';
        }
      }

      // 2. 测试每个字段
      for (const field of form.fields) {
        const fieldResult = await this.testField(field);
        result.fieldResults.push(fieldResult);

        // 检查是否有测试失败
        for (const test of Object.values(fieldResult.tests)) {
          if (test && !test.passed) {
            result.passed = false;
          }
        }
      }

      // 3. 测试正常提交
      const validData = this.generateValidData(form.fields);
      await this.fillForm(form, validData);
      // 注意：不实际提交，避免副作用

    } catch (error) {
      result.passed = false;
      result.errorMessage = error instanceof Error ? error.message : String(error);
    }

    return result;
  }

  /**
   * 测试空提交
   */
  private async testEmptySubmit(form: FormInfo): Promise<{ passed: boolean; errorMessage?: string }> {
    if (!this.page) return { passed: false, errorMessage: 'Page not initialized' };

    try {
      // 清空所有字段
      for (const field of form.fields) {
        try {
          await this.page.locator(field.selector).fill('');
        } catch (error) {
          logger.debug(`清空字段 ${field.selector} 失败: ${error}`);
        }
      }

      // 点击提交
      if (form.submitButton) {
        try {
          await this.page.locator(form.submitButton).click();
        } catch (error) {
          logger.debug(`点击提交按钮失败: ${error}`);
        }
      }

      // 等待页面稳定（等待验证信息出现或页面跳转）
      await this.page.waitForLoadState('domcontentloaded').catch(() => {});

      // 智能等待验证错误出现（替代固定等待500ms）
      await this.page.waitForTimeout(300); // 给浏览器一点时间处理HTML5验证

      // 检查是否有验证错误信息
      const hasError = await this.page.evaluate(() => {
        // 检查 HTML5 验证
        const invalidInputs = document.querySelectorAll('input:invalid, select:invalid, textarea:invalid');
        if (invalidInputs.length > 0) return true;

        // 检查常见错误信息元素
        const errorElements = document.querySelectorAll('.error, .error-message, [role="alert"], .invalid-feedback');
        return errorElements.length > 0;
      });

      return { passed: hasError };
    } catch (error) {
      return {
        passed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 测试单个字段
   */
  private async testField(field: FormField): Promise<FieldTestResult> {
    const result: FieldTestResult = {
      selector: field.selector,
      type: field.type,
      tests: {},
    };

    // 根据字段类型获取测试数据
    const dataType = this.mapFieldTypeToDataType(field.type);
    const testData: { valid: string[]; invalid: string[] } = TEST_DATA[dataType]! ?? TEST_DATA.text;

    // 测试有效值
    if (this.config.testValidation && testData.valid.length > 0) {
      result.tests.valid = await this.testFieldValue(field, testData.valid[0]!);
    }

    // 测试无效值
    if (this.config.testValidation && testData.invalid.length > 0) {
      result.tests.invalid = await this.testFieldValue(field, testData.invalid[0]!, true);
    }

    // 测试边界值
    if (this.config.testBoundary) {
      result.tests.boundary = await this.testBoundaryValue(field);
    }

    return result;
  }

  /**
   * 测试字段值
   */
  private async testFieldValue(
    field: FormField,
    value: string,
    expectError: boolean = false,
  ): Promise<{ passed: boolean; errorMessage?: string }> {
    if (!this.page) return { passed: false, errorMessage: 'Page not initialized' };

    try {
      await this.page.locator(field.selector).fill(value);

      // 触发验证
      await this.page.locator(field.selector).blur();
      await this.page.waitForTimeout(200);

      // 检查验证状态
      const isValid = await this.page.locator(field.selector).evaluate((el) => {
        const input = el as HTMLInputElement;
        return input.checkValidity();
      });

      if (expectError && isValid) {
        return { passed: false, errorMessage: `Expected validation error for "${value}"` };
      }
      if (!expectError && !isValid && field.required && value) {
        return { passed: false, errorMessage: `Unexpected validation error for "${value}"` };
      }

      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 测试边界值
   */
  private async testBoundaryValue(field: FormField): Promise<{ passed: boolean; errorMessage?: string }> {
    if (!this.page) return { passed: false, errorMessage: 'Page not initialized' };

    try {
      // 测试最大长度
      if (field.maxLength && field.maxLength < 1000) {
        const longValue = 'a'.repeat(field.maxLength + 1);
        await this.page.locator(field.selector).fill(longValue);

        const actualValue = await this.page.locator(field.selector).inputValue();

        if (actualValue.length > field.maxLength) {
          return { passed: false, errorMessage: `Max length not enforced: ${actualValue.length} > ${field.maxLength}` };
        }
      }

      // 测试最小长度
      if (field.minLength && field.minLength > 0) {
        const shortValue = 'a'.repeat(field.minLength - 1);
        await this.page.locator(field.selector).fill(shortValue);
        await this.page.locator(field.selector).blur();

        const isValid = await this.page.locator(field.selector).evaluate((el) => {
          return (el as HTMLInputElement).checkValidity();
        });

        if (isValid) {
          return { passed: false, errorMessage: `Min length not enforced: ${shortValue.length} < ${field.minLength}` };
        }
      }

      return { passed: true };
    } catch (error) {
      return {
        passed: false,
        errorMessage: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * 映射字段类型到数据类型
   */
  private mapFieldTypeToDataType(type: string): string {
    const mapping: Record<string, string> = {
      email: 'email',
      password: 'password',
      tel: 'tel',
      phone: 'tel',
      url: 'url',
      number: 'number',
      text: 'text',
      search: 'text',
      textarea: 'text',
    };
    return mapping[type] || 'text';
  }

  /**
   * 生成有效数据
   */
  private generateValidData(fields: FormField[]): Record<string, string> {
    const data: Record<string, string> = {};

    for (const field of fields) {
      const dataType = this.mapFieldTypeToDataType(field.type);
      const testData: { valid: string[]; invalid: string[] } = TEST_DATA[dataType]! ?? TEST_DATA.text;
      data[field.selector] = testData.valid[0] ?? 'test';
    }

    return data;
  }

  /**
   * 填充表单
   */
  private async fillForm(form: FormInfo, data: Record<string, string>): Promise<void> {
    if (!this.page) return;

    for (const field of form.fields) {
      const value = data[field.selector];
      if (value) {
        await this.page.locator(field.selector).fill(value);
      }
    }
  }

  /**
   * 关闭浏览器
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    logger.info('🔚 表单测试器已关闭');
  }
}

/**
 * 快捷测试函数
 */
export async function testForms(
  url: string,
  config?: Partial<FormTesterConfig>,
): Promise<FormTestResult[]> {
  const tester = new FormTester(config);
  try {
    return await tester.testForms(url);
  } finally {
    await tester.close();
  }
}
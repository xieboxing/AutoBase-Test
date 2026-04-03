import type { PageSnapshot } from '@/types/crawler.types.js';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { PageAnalysisResult } from '@/types/ai.types.js';
import { AiClient, getAiClient } from './client.js';
import { PageAnalyzer } from './analyzer.js';
import {
  buildGenerateCasesPrompt,
  parseGenerateCasesResult,
} from './prompts/generate-cases.prompt.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';

/**
 * 测试用例生成器配置
 */
export interface CaseGeneratorConfig {
  useAi: boolean;
  platform: 'pc-web' | 'h5-web' | 'android-app';
  defaultPriority: 'P0' | 'P1' | 'P2' | 'P3';
  generateSmokeTests: boolean;
  generateFormTests: boolean;
  generateNavigationTests: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_GENERATOR_CONFIG: CaseGeneratorConfig = {
  useAi: true,
  platform: 'pc-web',
  defaultPriority: 'P2',
  generateSmokeTests: true,
  generateFormTests: true,
  generateNavigationTests: true,
};

/**
 * 测试用例生成器类
 */
export class CaseGenerator {
  private config: CaseGeneratorConfig;
  private aiClient: AiClient;
  private analyzer: PageAnalyzer;

  constructor(config: Partial<CaseGeneratorConfig> = {}, aiClient?: AiClient) {
    this.config = { ...DEFAULT_GENERATOR_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
    this.analyzer = new PageAnalyzer({ useAi: this.config.useAi }, this.aiClient);
  }

  /**
   * 为页面生成测试用例
   */
  async generateFromSnapshot(snapshot: PageSnapshot): Promise<TestCase[]> {
    logger.ai('🤖 开始生成测试用例', { url: snapshot.url });

    // 分析页面
    const analysis = await this.analyzer.analyze(snapshot);

    // 检查是否使用 AI
    if (!this.config.useAi || !this.aiClient.isEnabled() || !this.aiClient.isConfigured()) {
      logger.info('📍 使用规则引擎生成测试用例（AI 降级模式）');
      return this.generateFromRules(snapshot, analysis);
    }

    try {
      // 使用 AI 生成
      return await this.generateFromAi(snapshot, analysis);
    } catch (error) {
      logger.warn('⚠️ AI 生成失败，降级到规则引擎', { error: String(error) });
      return this.generateFromRules(snapshot, analysis);
    }
  }

  /**
   * 使用 AI 生成测试用例
   */
  private async generateFromAi(
    snapshot: PageSnapshot,
    analysis: PageAnalysisResult,
  ): Promise<TestCase[]> {
    const prompt = buildGenerateCasesPrompt({
      pageUrl: snapshot.url,
      pageTitle: snapshot.title,
      platform: this.config.platform,
      pageAnalysis: analysis,
      interactiveElements: snapshot.interactiveElements,
      forms: snapshot.forms,
    });

    const response = await this.aiClient.chatWithRetry(
      [{ role: 'user', content: prompt }],
      { responseFormat: 'json' },
    );

    const result = parseGenerateCasesResult(response.content);

    // 转换为 TestCase 格式
    const cases: TestCase[] = result.cases.map(tc => this.normalizeTestCase(tc));

    logger.ai('✅ AI 生成测试用例完成', { count: cases.length });

    return cases;
  }

  /**
   * 使用规则引擎生成测试用例
   */
  private generateFromRules(
    snapshot: PageSnapshot,
    analysis: PageAnalysisResult,
  ): TestCase[] {
    const cases: TestCase[] = [];
    let caseNumber = 1;

    // 生成冒烟测试
    if (this.config.generateSmokeTests) {
      cases.push(this.createSmokeTestCase(snapshot, caseNumber++));
    }

    // 为每个功能点生成测试用例
    for (const feature of analysis.testableFeatures) {
      const tc = this.createFeatureTestCase(snapshot, feature, caseNumber++);
      cases.push(tc);
    }

    // 生成表单测试
    if (this.config.generateFormTests) {
      for (const form of snapshot.forms) {
        const formCases = this.createFormTestCases(snapshot, form, caseNumber);
        cases.push(...formCases);
        caseNumber += formCases.length;
      }
    }

    // 生成导航测试
    if (this.config.generateNavigationTests) {
      const links = snapshot.interactiveElements.filter(el => el.tag === 'a');
      if (links.length > 0) {
        cases.push(this.createNavigationTestCase(snapshot, links, caseNumber++));
      }
    }

    return cases;
  }

  /**
   * 创建冒烟测试用例
   */
  private createSmokeTestCase(snapshot: PageSnapshot, number: number): TestCase {
    return {
      id: `tc-smoke-${String(number).padStart(3, '0')}`,
      name: `${snapshot.title} - 冒烟测试`,
      description: '验证页面能正常打开，关键元素存在',
      priority: 'P0',
      type: 'functional',
      platform: [this.config.platform],
      tags: ['smoke', 'auto-generated'],
      steps: [
        {
          order: 1,
          action: 'navigate',
          value: snapshot.url,
          description: `打开页面 ${snapshot.url}`,
        },
        {
          order: 2,
          action: 'assert',
          target: 'title',
          type: 'title-equals',
          value: snapshot.title,
          description: `验证页面标题为 "${snapshot.title}"`,
        },
        {
          order: 3,
          action: 'screenshot',
          description: '截图记录',
        },
      ],
    };
  }

  /**
   * 创建功能测试用例
   */
  private createFeatureTestCase(
    snapshot: PageSnapshot,
    feature: PageAnalysisResult['testableFeatures'][0],
    number: number,
  ): TestCase {
    const steps: TestStep[] = [
      {
        order: 1,
        action: 'navigate',
        value: snapshot.url,
        description: `打开页面 ${snapshot.url}`,
      },
    ];

    // 将建议步骤转换为测试步骤
    let stepOrder = 2;
    for (const suggestedStep of feature.suggestedSteps.slice(0, 10)) {
      const step = this.parseSuggestedStep(suggestedStep, stepOrder);
      if (step) {
        steps.push(step);
        stepOrder++;
      }
    }

    return {
      id: `tc-${feature.type}-${String(number).padStart(3, '0')}`,
      name: feature.name,
      description: feature.description,
      priority: feature.priority,
      type: feature.type === 'visual' ? 'visual' : 'functional',
      platform: [this.config.platform],
      tags: [feature.type, 'auto-generated'],
      steps,
    };
  }

  /**
   * 创建表单测试用例
   */
  private createFormTestCases(
    snapshot: PageSnapshot,
    form: { selector: string; fields: any[] },
    startNumber: number,
  ): TestCase[] {
    const cases: TestCase[] = [];

    // 表单正常提交测试
    const normalSteps: TestStep[] = [
      {
        order: 1,
        action: 'navigate',
        value: snapshot.url,
        description: `打开页面 ${snapshot.url}`,
      },
    ];

    let stepOrder = 2;
    for (const field of form.fields) {
      if (field.selector && field.type !== 'submit') {
        normalSteps.push({
          order: stepOrder++,
          action: 'fill',
          target: field.selector,
          value: this.getDefaultValueForType(field.type),
          description: `填写 ${field.label || field.name || field.selector}`,
        });
      }
    }

    // 添加提交步骤
    normalSteps.push({
      order: stepOrder,
      action: 'click',
      target: `${form.selector} button[type="submit"], ${form.selector} input[type="submit"]`,
      description: '提交表单',
    });

    cases.push({
      id: `tc-form-${String(startNumber).padStart(3, '0')}`,
      name: `表单提交测试 - ${form.selector}`,
      description: `验证表单 ${form.selector} 可以正常提交`,
      priority: 'P1',
      type: 'functional',
      platform: [this.config.platform],
      tags: ['form', 'auto-generated'],
      steps: normalSteps,
    });

    // 必填字段验证测试
    const requiredFields = form.fields.filter((f: any) => f.required);
    if (requiredFields.length > 0) {
      const validationSteps: TestStep[] = [
        {
          order: 1,
          action: 'navigate',
          value: snapshot.url,
          description: `打开页面 ${snapshot.url}`,
        },
        {
          order: 2,
          action: 'click',
          target: `${form.selector} button[type="submit"]`,
          description: '不填写任何字段，直接提交',
        },
        {
          order: 3,
          action: 'assert',
          type: 'element-visible',
          target: '.error-message, [role="alert"]',
          description: '验证显示错误提示',
        },
      ];

      cases.push({
        id: `tc-form-${String(startNumber + 1).padStart(3, '0')}`,
        name: `必填字段验证 - ${form.selector}`,
        description: `验证 ${requiredFields.length} 个必填字段的验证`,
        priority: 'P1',
        type: 'functional',
        platform: [this.config.platform],
        tags: ['form', 'validation', 'auto-generated'],
        steps: validationSteps,
      });
    }

    return cases;
  }

  /**
   * 创建导航测试用例
   */
  private createNavigationTestCase(
    snapshot: PageSnapshot,
    links: any[],
    number: number,
  ): TestCase {
    const steps: TestStep[] = [
      {
        order: 1,
        action: 'navigate',
        value: snapshot.url,
        description: `打开页面 ${snapshot.url}`,
      },
    ];

    // 只测试前几个链接
    let stepOrder = 2;
    for (const link of links.slice(0, 5)) {
      steps.push({
        order: stepOrder++,
        action: 'assert',
        target: link.selector,
        type: 'element-visible',
        description: `验证链接 ${link.text || link.selector} 存在`,
      });
    }

    return {
      id: `tc-nav-${String(number).padStart(3, '0')}`,
      name: '链接导航测试',
      description: `验证页面上的 ${links.length} 个链接`,
      priority: 'P2',
      type: 'functional',
      platform: [this.config.platform],
      tags: ['navigation', 'auto-generated'],
      steps,
    };
  }

  /**
   * 解析建议的步骤
   */
  private parseSuggestedStep(suggestedStep: string, order: number): TestStep | null {
    const lowerStep = suggestedStep.toLowerCase();

    // 导航
    if (lowerStep.includes('打开') || lowerStep.includes('导航') || lowerStep.includes('访问')) {
      return {
        order,
        action: 'navigate',
        description: suggestedStep,
      };
    }

    // 点击
    if (lowerStep.includes('点击') || lowerStep.includes('按下')) {
      return {
        order,
        action: 'click',
        description: suggestedStep,
      };
    }

    // 填写
    if (lowerStep.includes('填写') || lowerStep.includes('输入')) {
      return {
        order,
        action: 'fill',
        description: suggestedStep,
      };
    }

    // 验证
    if (lowerStep.includes('验证') || lowerStep.includes('检查') || lowerStep.includes('确认')) {
      return {
        order,
        action: 'assert',
        description: suggestedStep,
      };
    }

    // 等待
    if (lowerStep.includes('等待')) {
      return {
        order,
        action: 'wait',
        description: suggestedStep,
      };
    }

    // 默认返回一个通用步骤
    return {
      order,
      action: 'assert',
      description: suggestedStep,
    };
  }

  /**
   * 获取类型默认值
   */
  private getDefaultValueForType(type: string): string {
    switch (type) {
      case 'email':
        return 'test@example.com';
      case 'password':
        return 'Test123456!';
      case 'tel':
      case 'phone':
        return '13800138000';
      case 'number':
        return '100';
      case 'url':
        return 'https://example.com';
      case 'date':
        return '2024-01-01';
      default:
        return '测试文本';
    }
  }

  /**
   * 规范化测试用例
   */
  private normalizeTestCase(tc: any): TestCase {
    return {
      id: tc.id || `tc-${nanoid(8)}`,
      name: tc.name || '未命名测试用例',
      description: tc.description || '',
      priority: tc.priority || this.config.defaultPriority,
      type: tc.type || 'functional',
      platform: Array.isArray(tc.platform) ? tc.platform : [this.config.platform],
      tags: tc.tags || ['auto-generated'],
      preconditions: tc.preconditions,
      steps: (tc.steps || []).map((s: any, i: number) => ({
        order: s.order || i + 1,
        action: s.action,
        target: s.target,
        value: s.value,
        description: s.description,
        assertType: s.assertType,
      })),
      cleanup: tc.cleanup?.map((s: any, i: number) => ({
        order: s.order || i + 1,
        action: s.action,
        target: s.target,
        value: s.value,
        description: s.description,
      })),
    };
  }

  /**
   * 为多个页面批量生成测试用例
   */
  async generateBatch(snapshots: PageSnapshot[]): Promise<TestCase[]> {
    const allCases: TestCase[] = [];

    for (const snapshot of snapshots) {
      try {
        const cases = await this.generateFromSnapshot(snapshot);
        allCases.push(...cases);
      } catch (error) {
        logger.fail('❌ 测试用例生成失败', { url: snapshot.url, error: String(error) });
      }
    }

    return allCases;
  }
}

/**
 * 快捷生成函数
 */
export async function generateTestCases(
  snapshot: PageSnapshot,
  options?: Partial<CaseGeneratorConfig>,
): Promise<TestCase[]> {
  const generator = new CaseGenerator(options);
  return generator.generateFromSnapshot(snapshot);
}
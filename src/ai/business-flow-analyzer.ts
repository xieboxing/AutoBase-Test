/**
 * 业务流分析器
 * 基于页面截图和结构分析业务流程，生成端到端测试用例
 */

import { z } from 'zod';
import type { Page } from 'playwright';
import { logger } from '@/core/logger.js';
import { AiClient, type ChatMessage } from '@/ai/client.js';
import {
  buildBusinessFlowPrompt,
  buildBusinessFlowWithScreenshotPrompt,
  buildCrossPageFlowPrompt,
  parseBusinessFlowAnalysis,
  businessFlowSchema,
  pageBusinessAnalysisSchema,
  type BusinessFlow,
  type BusinessStep,
  type PageBusinessAnalysis,
} from '@/ai/prompts/business-flow.prompt.js';
import type { PageSnapshot, InteractiveElement, FormInfo } from '@/types/crawler.types.js';
import type { TestCase, TestStep } from '@/types/test-case.types.js';
import type { KnowledgeDatabase } from '@/knowledge/db/index.js';
import { nanoid } from 'nanoid';

/**
 * 业务流分析器配置
 */
export interface BusinessFlowAnalyzerConfig {
  /** 是否使用截图 */
  useScreenshot: boolean;
  /** 是否保存分析结果到知识库 */
  persistToKnowledgeBase: boolean;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** AI 客户端 */
  aiClient?: AiClient;
  /** 是否使用 AI（false 时降级到规则引擎） */
  useAi: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BusinessFlowAnalyzerConfig = {
  useScreenshot: true,
  persistToKnowledgeBase: true,
  confidenceThreshold: 0.7,
  useAi: true,
};

/**
 * 业务流分析器
 */
export class BusinessFlowAnalyzer {
  private config: BusinessFlowAnalyzerConfig;
  private aiClient: AiClient;
  private db: KnowledgeDatabase | null = null;

  constructor(
    config: Partial<BusinessFlowAnalyzerConfig> = {},
    aiClient?: AiClient,
    db?: KnowledgeDatabase,
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.aiClient = aiClient || new AiClient();
    this.db = db || null;
  }

  /**
   * 设置数据库实例
   */
  setDatabase(db: KnowledgeDatabase): void {
    this.db = db;
  }

  /**
   * 分析单个页面的业务流程
   */
  async analyzePage(
    snapshot: PageSnapshot,
    options?: {
      projectId?: string;
      platform?: 'pc-web' | 'h5-web';
      previousPages?: Array<{ url: string; title: string }>;
    },
  ): Promise<PageBusinessAnalysis> {
    logger.step(`🔍 分析页面业务流程: ${snapshot.title}`);

    try {
      // 如果禁用 AI，使用规则引擎降级
      if (!this.config.useAi) {
        return this.analyzePageWithRules(snapshot, options);
      }

      let response: string;

      if (this.config.useScreenshot && snapshot.screenshot.viewport) {
        // 使用截图进行分析（多模态）
        const promptParts = buildBusinessFlowWithScreenshotPrompt({
          url: snapshot.url,
          title: snapshot.title,
          platform: options?.platform || 'pc-web',
          interactiveElements: snapshot.interactiveElements,
          forms: snapshot.forms,
          screenshotBase64: snapshot.screenshot.viewport,
          previousPages: options?.previousPages,
        });

        // 构建多模态消息
        const messages: ChatMessage[] = [
          {
            role: 'user',
            content: promptParts.map(part => {
              if (part.type === 'text') {
                return { type: 'text', text: part.text! };
              } else {
                return {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: part.source!.media_type,
                    data: part.source!.data,
                  },
                };
              }
            }),
          },
        ];

        const chatResponse = await this.aiClient.chatWithRetry(messages, {
          responseFormat: 'json',
        });
        response = chatResponse.content;
      } else {
        // 仅使用文本分析
        const prompt = buildBusinessFlowPrompt({
          url: snapshot.url,
          title: snapshot.title,
          platform: options?.platform || 'pc-web',
          interactiveElements: snapshot.interactiveElements,
          forms: snapshot.forms,
          previousPages: options?.previousPages,
        });

        const messages: ChatMessage[] = [
          { role: 'user', content: prompt },
        ];

        const chatResponse = await this.aiClient.chatWithRetry(messages, {
          responseFormat: 'json',
        });
        response = chatResponse.content;
      }

      const result = parseBusinessFlowAnalysis(response);

      logger.pass(`✅ 页面业务分析完成: 发现 ${result.potentialFlows.length} 个潜在业务流`);

      // 持久化到知识库
      if (this.config.persistToKnowledgeBase && this.db) {
        await this.persistAnalysis(snapshot.url, result, {
          project: options?.projectId || 'default',
          platform: options?.platform || 'pc-web',
        });
      }

      return result;
    } catch (error) {
      logger.warn(`AI 页面业务分析失败，降级到规则引擎: ${error instanceof Error ? error.message : String(error)}`);
      // 降级到规则引擎
      return this.analyzePageWithRules(snapshot, options);
    }
  }

  /**
   * 使用规则引擎分析页面业务流程（降级方案）
   */
  private analyzePageWithRules(
    snapshot: PageSnapshot,
    options?: {
      projectId?: string;
      platform?: 'pc-web' | 'h5-web';
      previousPages?: Array<{ url: string; title: string }>;
    },
  ): PageBusinessAnalysis {
    logger.info('📋 使用规则引擎分析页面业务流程');

    const flows: BusinessFlow[] = [];
    const scenarios: PageBusinessAnalysis['businessScenarios'] = [];

    // 规则 1：检测登录表单
    const loginForm = this.detectLoginForm(snapshot);
    if (loginForm) {
      flows.push(loginForm.flow);
      scenarios.push(loginForm.scenario);
    }

    // 规则 2：检测搜索功能
    const searchFlow = this.detectSearchFlow(snapshot);
    if (searchFlow) {
      flows.push(searchFlow);
    }

    // 规则 3：检测表单提交
    const formFlows = this.detectFormFlows(snapshot);
    flows.push(...formFlows);

    // 规则 4：检测导航流程
    const navFlows = this.detectNavigationFlows(snapshot);
    flows.push(...navFlows);

    // 生成页面名称
    const pageName = snapshot.title || snapshot.url;

    return {
      pageName,
      pagePurpose: this.classifyPageType(snapshot),
      businessScenarios: scenarios,
      potentialFlows: flows,
      criticalElements: this.extractKeyElements(snapshot).map(selector => ({
        selector,
        elementName: selector,
        businessValue: '自动识别的元素',
      })),
      recommendations: ['建议执行完整测试以验证业务流程'],
    };
  }

  /**
   * 检测登录表单
   */
  private detectLoginForm(snapshot: PageSnapshot): { flow: BusinessFlow; scenario: { name: string; description: string; userGoal: string; involvedElements: string[] } } | null {
    const forms = snapshot.forms || [];

    for (const form of forms) {
      const fields = form.fields || [];
      const hasPassword = fields.some(f => f.type === 'password');
      const hasEmailOrUser = fields.some(f =>
        f.type === 'email' ||
        f.name?.toLowerCase().includes('user') ||
        f.name?.toLowerCase().includes('email') ||
        f.name?.toLowerCase().includes('login')
      );

      if (hasPassword && hasEmailOrUser) {
        const emailField = fields.find(f => f.type === 'email' || f.name?.toLowerCase().includes('user'));
        const passwordField = fields.find(f => f.type === 'password');

        const flow: BusinessFlow = {
          flowId: `login-${nanoid(6)}`,
          flowName: '用户登录',
          flowType: 'authentication',
          description: '用户通过账号密码登录系统',
          priority: 'P0',
          entryPoint: snapshot.url,
          steps: [
            { stepId: 'nav-login', name: '访问登录页面', action: 'navigate', target: snapshot.url, description: '访问登录页面', expectedOutcome: '登录页面加载完成', criticalStep: true },
            { stepId: 'fill-user', name: '输入用户名', action: 'fill', target: emailField?.selector || 'input[type="email"]', value: 'test@example.com', description: '输入用户名/邮箱', expectedOutcome: '输入框填充成功', criticalStep: false },
            { stepId: 'fill-pass', name: '输入密码', action: 'fill', target: passwordField?.selector || 'input[type="password"]', value: '********', description: '输入密码', expectedOutcome: '密码填充成功', criticalStep: false },
            { stepId: 'submit', name: '点击登录', action: 'click', target: form.selector + ' button[type="submit"]', description: '点击登录按钮', expectedOutcome: '登录成功，跳转到主页', criticalStep: true },
          ],
          preconditions: ['用户未登录'],
          postconditions: ['用户已登录'],
          confidence: 0.9,
        };

        return {
          flow,
          scenario: {
            name: '登录场景',
            description: '标准登录流程',
            userGoal: '成功登录系统',
            involvedElements: [form.selector, emailField?.selector || '', passwordField?.selector || ''].filter(Boolean),
          },
        };
      }
    }

    return null;
  }

  /**
   * 检测搜索流程
   */
  private detectSearchFlow(snapshot: PageSnapshot): BusinessFlow | null {
    const elements = snapshot.interactiveElements || [];
    const searchInput = elements.find(e =>
      e.selector.includes('search') ||
      e.selector.includes('[type="search"]') ||
      e.text?.toLowerCase().includes('搜索') ||
      e.attributes?.placeholder?.toLowerCase().includes('搜索')
    );

    if (searchInput) {
      return {
        flowId: `search-${nanoid(6)}`,
        flowName: '搜索功能',
        flowType: 'search',
        description: '用户使用搜索功能查找内容',
        priority: 'P2',
        entryPoint: snapshot.url,
        steps: [
          { stepId: 'focus-search', name: '点击搜索框', action: 'click', target: searchInput.selector, description: '点击搜索框', expectedOutcome: '搜索框获得焦点', criticalStep: false },
          { stepId: 'input-keyword', name: '输入搜索词', action: 'fill', target: searchInput.selector, value: '测试关键词', description: '输入搜索关键词', expectedOutcome: '关键词输入成功', criticalStep: false },
          { stepId: 'submit-search', name: '提交搜索', action: 'click', target: 'button[type="submit"], .search-button', description: '提交搜索', expectedOutcome: '搜索结果展示', criticalStep: true },
        ],
        preconditions: [],
        postconditions: [],
        confidence: 0.7,
      };
    }

    return null;
  }

  /**
   * 检测表单提交流程
   */
  private detectFormFlows(snapshot: PageSnapshot): BusinessFlow[] {
    const flows: BusinessFlow[] = [];
    const forms = snapshot.forms || [];

    for (const [index, form] of forms.entries()) {
      // 跳过登录表单（已单独处理）
      const fields = form.fields || [];
      const hasPassword = fields.some(f => f.type === 'password');
      if (hasPassword) continue;

      const steps: BusinessStep[] = [
        ...fields.slice(0, 5).map((field, i) => ({
          stepId: `fill-${i}`,
          name: `填写: ${field.label || field.name || `字段${i + 1}`}`,
          action: 'fill' as const,
          target: field.selector,
          value: this.getTestValueForInput(field),
          description: `填写: ${field.label || field.name || field.placeholder || `字段${i + 1}`}`,
          expectedOutcome: '输入成功',
          criticalStep: false,
        })),
        {
          stepId: 'submit',
          name: '提交表单',
          action: 'click' as const,
          target: form.selector + ' button[type="submit"]',
          description: '提交表单',
          expectedOutcome: '表单提交成功',
          criticalStep: true,
        },
      ];

      const flow: BusinessFlow = {
        flowId: `form-${index}-${nanoid(6)}`,
        flowName: `表单提交: ${form.selector}`,
        flowType: 'form-submission',
        description: '填写并提交表单',
        priority: 'P2',
        entryPoint: snapshot.url,
        steps,
        preconditions: [],
        postconditions: [],
        confidence: 0.6,
      };

      flows.push(flow);
    }

    return flows;
  }

  /**
   * 检测导航流程
   */
  private detectNavigationFlows(snapshot: PageSnapshot): BusinessFlow[] {
    const flows: BusinessFlow[] = [];
    const elements = snapshot.interactiveElements || [];

    // 查找导航链接
    const navLinks = elements.filter(e =>
      e.tag === 'A' &&
      (e.selector.includes('nav') ||
       e.selector.includes('menu') ||
       e.selector.includes('header'))
    ).slice(0, 3);

    for (const link of navLinks) {
      const href = link.attributes?.href;
      if (href && !href.startsWith('#')) {
        flows.push({
          flowId: `nav-${nanoid(6)}`,
          flowName: `导航: ${link.text || href}`,
          flowType: 'navigation',
          description: `点击导航链接: ${link.text || href}`,
          priority: 'P3',
          entryPoint: snapshot.url,
          exitPoint: href,
          steps: [
            { stepId: 'click-nav', name: '点击导航', action: 'click', target: link.selector, description: `点击: ${link.text || '导航链接'}`, expectedOutcome: '跳转到目标页面', criticalStep: false },
          ],
          preconditions: [],
          postconditions: [],
          confidence: 0.5,
        });
      }
    }

    return flows;
  }

  /**
   * 根据输入类型获取测试值
   */
  private getTestValueForInput(field: { type?: string; name?: string }): string {
    switch (field.type) {
      case 'email': return 'test@example.com';
      case 'tel': return '13800138000';
      case 'number': return '100';
      case 'url': return 'https://example.com';
      default: return '测试内容';
    }
  }

  /**
   * 分类页面类型
   */
  private classifyPageType(snapshot: PageSnapshot): string {
    const url = snapshot.url.toLowerCase();
    const title = (snapshot.title || '').toLowerCase();

    if (url.includes('login') || title.includes('登录')) return 'login';
    if (url.includes('register') || title.includes('注册')) return 'register';
    if (url.includes('cart') || title.includes('购物车')) return 'cart';
    if (url.includes('checkout') || title.includes('结算')) return 'checkout';
    if (url.includes('profile') || title.includes('个人')) return 'profile';
    if (url.includes('search') || title.includes('搜索')) return 'search';
    if (url.includes('home') || url === '/' || title.includes('首页')) return 'home';

    return 'content';
  }

  /**
   * 提取关键元素
   */
  private extractKeyElements(snapshot: PageSnapshot): string[] {
    const elements = snapshot.interactiveElements || [];
    return elements
      .filter(e => e.tag === 'BUTTON' || e.tag === 'A' || e.tag === 'INPUT')
      .slice(0, 10)
      .map(e => e.selector);
  }

  /**
   * 分析跨页面业务流
   */
  async analyzeFlow(
    pages: Array<{
      url: string;
      title: string;
      snapshot?: PageSnapshot;
      keyElements?: string[];
    }>,
    options?: {
      projectId?: string;
      platform?: 'pc-web' | 'h5-web';
    },
  ): Promise<BusinessFlow[]> {
    logger.step(`🔗 分析跨页面业务流: ${pages.length} 个页面`);

    try {
      const prompt = buildCrossPageFlowPrompt({
        pages: pages.map(p => ({
          url: p.url,
          title: p.title,
          keyElements: p.keyElements || p.snapshot?.interactiveElements.map(e => e.selector) || [],
        })),
        platform: options?.platform || 'pc-web',
      });

      const messages: ChatMessage[] = [
        { role: 'user', content: prompt },
      ];

      const chatResponse = await this.aiClient.chatWithRetry(messages, {
        responseFormat: 'json',
      });
      const response = chatResponse.content;

      // 解析结果
      const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
      let flows: BusinessFlow[] = [];

      if (jsonMatch && jsonMatch[1]) {
        const parsed = JSON.parse(jsonMatch[1]);
        if (parsed.flows && Array.isArray(parsed.flows)) {
          flows = parsed.flows.map((f: unknown) => businessFlowSchema.parse(f));
        } else if (Array.isArray(parsed)) {
          flows = parsed.map((f: unknown) => businessFlowSchema.parse(f));
        }
      }

      // 过滤低置信度结果
      flows = flows.filter(f => f.confidence >= this.config.confidenceThreshold);

      logger.pass(`✅ 跨页面业务流分析完成: 发现 ${flows.length} 个业务流`);

      // 持久化
      if (this.config.persistToKnowledgeBase && this.db) {
        for (const flow of flows) {
          await this.persistFlow(flow, {
            project: options?.projectId,
            platform: options?.platform,
          });
        }
      }

      return flows;
    } catch (error) {
      logger.error(`跨页面业务流分析失败: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * 从业务流生成端到端测试用例
   */
  generateE2ETestCases(
    flows: BusinessFlow[],
    options?: {
      projectId?: string;
      platform?: 'pc-web' | 'h5-web';
    },
  ): TestCase[] {
    const testCases: TestCase[] = [];

    for (const flow of flows) {
      const testCase = this.flowToTestCase(flow, options);
      if (testCase) {
        testCases.push(testCase);
      }
    }

    logger.info(`📝 生成 ${testCases.length} 个端到端测试用例`);
    return testCases;
  }

  /**
   * 将业务流转换为测试用例
   */
  private flowToTestCase(
    flow: BusinessFlow,
    options?: {
      projectId?: string;
      platform?: 'pc-web' | 'h5-web';
    },
  ): TestCase | null {
    try {
      const steps: TestStep[] = flow.steps.map((step, index) => ({
        order: index + 1,
        action: this.mapAction(step.action),
        target: step.target,
        value: step.value,
        description: step.description,
        timeout: step.criticalStep ? 30000 : 15000,
      }));

      // 添加最终断言
      if (flow.exitPoint) {
        steps.push({
          order: steps.length + 1,
          action: 'assert',
          type: 'url-contains',
          target: flow.exitPoint,
          description: `验证到达预期页面: ${flow.exitPoint}`,
        });
      }

      return {
        id: `e2e-${flow.flowId}-${nanoid(6)}`,
        name: `【业务流】${flow.flowName}`,
        description: flow.description,
        priority: flow.priority,
        type: 'functional',
        platform: [options?.platform || 'pc-web'],
        tags: ['e2e', 'business-flow', flow.flowType],
        preconditions: flow.preconditions,
        steps,
        cleanup: flow.postconditions.length > 0 ? [{
          order: 1,
          action: 'navigate',
          target: '/',
          description: '返回首页',
        }] : undefined,
        metadata: {
          flowId: flow.flowId,
          flowType: flow.flowType,
          ai_confidence: flow.confidence,
          criticalSteps: flow.steps.filter(s => s.criticalStep).map(s => s.stepId),
          businessFlow: true,
        },
      };
    } catch (error) {
      logger.warn(`业务流转换失败: ${flow.flowId} - ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * 识别关键路径
   */
  identifyCriticalPath(flows: BusinessFlow[]): BusinessStep[] {
    const criticalSteps: BusinessStep[] = [];

    for (const flow of flows) {
      for (const step of flow.steps) {
        if (step.criticalStep) {
          criticalSteps.push(step);
        }
      }
    }

    // 按业务流优先级排序（需要从flows中获取）
    // 由于步骤本身没有优先级，保持原始顺序
    return criticalSteps;
  }

  /**
   * 映射动作类型
   */
  private mapAction(action: BusinessStep['action']): TestStep['action'] {
    const actionMap: Record<BusinessStep['action'], TestStep['action']> = {
      navigate: 'navigate',
      click: 'click',
      fill: 'fill',
      select: 'select',
      wait: 'wait',
      assert: 'assert',
      scroll: 'scroll',
      hover: 'hover',
    };
    return actionMap[action] || 'click';
  }

  /**
   * 持久化分析结果
   */
  private async persistAnalysis(
    url: string,
    analysis: PageBusinessAnalysis,
    options?: { project?: string; platform?: 'pc-web' | 'h5-web' }
  ): Promise<void> {
    if (!this.db) return;

    try {
      for (const flow of analysis.potentialFlows) {
        await this.persistFlow(flow, options);
      }
    } catch (error) {
      logger.warn(`持久化业务分析失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 持久化业务流
   */
  private async persistFlow(
    flow: BusinessFlow,
    options?: { project?: string; platform?: 'pc-web' | 'h5-web' }
  ): Promise<void> {
    if (!this.db) return;

    try {
      this.db.execute(
        `INSERT OR REPLACE INTO business_flows
         (id, project, platform, flow_name, flow_type, steps, entry_points, exit_points, critical_path, confidence, created, updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          flow.flowId,
          options?.project || 'default',
          options?.platform || 'pc-web',
          flow.flowName,
          flow.flowType,
          JSON.stringify(flow.steps),
          JSON.stringify([flow.entryPoint]),
          JSON.stringify(flow.exitPoint ? [flow.exitPoint] : []),
          flow.steps.filter(s => s.criticalStep).map(s => s.stepId).join(','),
          flow.confidence,
          new Date().toISOString(),
          new Date().toISOString(),
        ],
      );
    } catch (error) {
      logger.warn(`持久化业务流失败: ${flow.flowId}`);
    }
  }

  /**
   * 从知识库加载业务流
   */
  async loadFlows(options?: {
    projectId?: string;
    flowType?: BusinessFlow['flowType'];
  }): Promise<BusinessFlow[]> {
    if (!this.db) return [];

    try {
      let sql = 'SELECT * FROM business_flows WHERE 1=1';
      const params: unknown[] = [];

      if (options?.projectId) {
        sql += ' AND project = ?';
        params.push(options.projectId);
      }
      if (options?.flowType) {
        sql += ' AND flow_type = ?';
        params.push(options.flowType);
      }

      const rows = this.db.query<{
        id: string;
        flow_name: string;
        flow_type: string;
        steps: string;
        entry_points: string;
        exit_points: string;
        confidence: number;
      }>(sql, params);

      return rows.map(row => ({
        flowId: row.id,
        flowName: row.flow_name,
        flowType: row.flow_type as BusinessFlow['flowType'],
        description: '',
        priority: 'P2' as const,
        entryPoint: JSON.parse(row.entry_points)[0] || '',
        exitPoint: JSON.parse(row.exit_points)[0],
        steps: JSON.parse(row.steps),
        preconditions: [],
        postconditions: [],
        confidence: row.confidence,
      }));
    } catch (error) {
      logger.warn(`加载业务流失败: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}

/**
 * 快捷创建业务流分析器
 */
export function createBusinessFlowAnalyzer(
  config?: Partial<BusinessFlowAnalyzerConfig>,
  aiClient?: AiClient,
  db?: KnowledgeDatabase,
): BusinessFlowAnalyzer {
  return new BusinessFlowAnalyzer(config, aiClient, db);
}
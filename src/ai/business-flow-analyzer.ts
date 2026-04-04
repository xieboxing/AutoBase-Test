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
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: BusinessFlowAnalyzerConfig = {
  useScreenshot: true,
  persistToKnowledgeBase: true,
  confidenceThreshold: 0.7,
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
      logger.error(`页面业务分析失败: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
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
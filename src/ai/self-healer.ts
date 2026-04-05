import type { PageSnapshot, InteractiveElement } from '@/types/crawler.types.js';
import { AiClient, getAiClient } from './client.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import { getDatabase, isDatabaseInitialized, type KnowledgeDatabase } from '@/knowledge/db/index.js';
import { createRagMemoryEngine } from '@/knowledge/rag-memory.js';
import type { RagMemoryEngine } from '@/knowledge/rag-memory.js';
import type { RagRetrievalResult } from '@/types/rag.types.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';

/**
 * 自愈引擎配置
 */
export interface SelfHealerConfig {
  useAi: boolean;
  maxCandidates: number;
  minSimilarityScore: number;
  historyEnabled: boolean;
  /** 是否启用数据库持久化 */
  persistenceEnabled: boolean;
  /** 项目标识（用于持久化隔离） */
  project?: string;
  /** 平台标识（用于持久化隔离） */
  platform?: string;
  /** 是否启用 RAG 记忆检索 */
  useRagMemory: boolean;
  /** RAG 检索数量限制 */
  ragMemoryLimit: number;
}

/**
 * 默认配置
 */
const DEFAULT_SELF_HEALER_CONFIG: SelfHealerConfig = {
  useAi: true,
  maxCandidates: 5,
  minSimilarityScore: 0.5,
  historyEnabled: true,
  persistenceEnabled: true,
  useRagMemory: true,
  ragMemoryLimit: 3,
};

/**
 * 元素映射记录
 */
export interface ElementMapping {
  id: string;
  originalSelector: string;
  alternativeSelectors: string[];
  lastWorkingSelector: string;
  lastUpdated: string;
  aiSuggested: boolean;
  successCount: number;
  failureCount: number;
  elementDescription: string;
  pageUrlPattern: string;
}

/**
 * 自愈结果
 */
export interface SelfHealResult {
  success: boolean;
  originalSelector: string;
  newSelector?: string;
  confidence: number;
  method: 'history' | 'similarity' | 'ai' | 'fallback';
  candidatesTested: number;
  screenshotPath?: string;
  error?: string;
}

/**
 * 元素候选
 */
export interface ElementCandidate {
  selector: string;
  score: number;
  matchType: 'text' | 'attribute' | 'structure' | 'ai' | 'similarity';
  description: string;
}

/**
 * 自愈引擎类
 */
export class SelfHealer {
  private config: SelfHealerConfig;
  private aiClient: AiClient;
  private elementMappings: Map<string, ElementMapping> = new Map();
  private db: KnowledgeDatabase | null = null;
  private ragMemory: RagMemoryEngine | null = null;
  private initialized: boolean = false;

  constructor(config: Partial<SelfHealerConfig> = {}, aiClient?: AiClient) {
    this.config = { ...DEFAULT_SELF_HEALER_CONFIG, ...config };
    this.aiClient = aiClient ?? getAiClient();
  }

  /**
   * 初始化自愈引擎（加载历史映射）
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (this.config.persistenceEnabled && this.config.project && this.config.platform) {
      try {
        this.db = getDatabase();
        // 仅在数据库未初始化时才初始化
        if (!isDatabaseInitialized()) {
          await this.db.initialize();
        }
        await this.loadFromDatabase();

        // 初始化 RAG 记忆引擎
        if (this.config.useRagMemory) {
          this.ragMemory = createRagMemoryEngine(this.db);
        }

        logger.info('✅ 自愈引擎初始化完成，已加载历史元素映射', {
          count: this.elementMappings.size,
        });
      } catch (error) {
        logger.warn('⚠️ 自愈引擎初始化失败，将仅使用内存映射', { error: String(error) });
      }
    }

    this.initialized = true;
  }

  /**
   * 尝试自愈元素定位
   */
  async heal(
    originalSelector: string,
    snapshot: PageSnapshot,
    action: string,
  ): Promise<SelfHealResult> {
    // 确保已初始化
    await this.initialize();

    logger.ai('🤖 开始自愈元素定位', { selector: originalSelector, action });

    // 1. 先尝试历史映射
    if (this.config.historyEnabled) {
      const historyResult = await this.tryHistoryHeal(originalSelector, snapshot);
      if (historyResult.success) {
        logger.pass('✅ 使用历史映射自愈成功', { newSelector: historyResult.newSelector });
        return historyResult;
      }
    }

    // 2. 尝试相似度匹配
    const similarityResult = await this.trySimilarityHeal(originalSelector, snapshot, action);
    if (similarityResult.success && similarityResult.confidence >= this.config.minSimilarityScore) {
      logger.pass('✅ 使用相似度匹配自愈成功', { newSelector: similarityResult.newSelector });
      this.updateMapping(originalSelector, similarityResult.newSelector!, snapshot, 'similarity');
      return similarityResult;
    }

    // 3. 尝试 AI 分析
    if (this.config.useAi && this.aiClient.isConfigured()) {
      const aiResult = await this.tryAiHeal(originalSelector, snapshot, action);
      if (aiResult.success) {
        logger.pass('✅ 使用 AI 分析自愈成功', { newSelector: aiResult.newSelector });
        this.updateMapping(originalSelector, aiResult.newSelector!, snapshot, 'ai');
        return aiResult;
      }
    }

    // 4. 返回失败结果
    logger.fail('❌ 自愈失败，需要人工介入', { selector: originalSelector });
    return {
      success: false,
      originalSelector,
      confidence: 0,
      method: 'fallback',
      candidatesTested: 0,
      error: '无法找到合适的替代选择器',
    };
  }

  /**
   * 使用历史映射自愈
   */
  private async tryHistoryHeal(
    originalSelector: string,
    snapshot: PageSnapshot,
  ): Promise<SelfHealResult> {
    const mapping = this.elementMappings.get(originalSelector);

    if (!mapping) {
      return {
        success: false,
        originalSelector,
        confidence: 0,
        method: 'history',
        candidatesTested: 0,
      };
    }

    // 检查页面 URL 是否匹配
    if (!this.matchesUrlPattern(snapshot.url, mapping.pageUrlPattern)) {
      return {
        success: false,
        originalSelector,
        confidence: 0,
        method: 'history',
        candidatesTested: 0,
      };
    }

    // 尝试上次成功的选择器
    const candidates = [mapping.lastWorkingSelector, ...mapping.alternativeSelectors];
    let candidatesTested = 0;

    for (const candidate of candidates) {
      candidatesTested++;
      const found = this.findElementBySelector(candidate, snapshot.interactiveElements);

      if (found) {
        return {
          success: true,
          originalSelector,
          newSelector: candidate,
          confidence: 0.9,
          method: 'history',
          candidatesTested,
        };
      }
    }

    return {
      success: false,
      originalSelector,
      confidence: 0,
      method: 'history',
      candidatesTested,
    };
  }

  /**
   * 使用相似度匹配自愈
   */
  private async trySimilarityHeal(
    originalSelector: string,
    snapshot: PageSnapshot,
    action: string,
  ): Promise<SelfHealResult> {
    // 从选择器中提取特征
    const features = this.extractSelectorFeatures(originalSelector);

    // 在页面元素中寻找相似元素
    const candidates: ElementCandidate[] = [];

    for (const element of snapshot.interactiveElements) {
      const score = this.calculateSimilarityScore(features, element, action);

      if (score > 0) {
        candidates.push({
          selector: element.selector,
          score,
          matchType: 'similarity',
          description: element.text || element.tag,
        });
      }
    }

    // 按分数排序
    candidates.sort((a, b) => b.score - a.score);

    // 测试前几个候选
    const topCandidates = candidates.slice(0, this.config.maxCandidates);
    let candidatesTested = 0;

    for (const candidate of topCandidates) {
      candidatesTested++;

      // 模拟验证（实际应该在真实页面验证）
      const element = this.findElementBySelector(candidate.selector, snapshot.interactiveElements);

      if (element && element.visible && element.clickable) {
        return {
          success: true,
          originalSelector,
          newSelector: candidate.selector,
          confidence: candidate.score,
          method: 'similarity',
          candidatesTested,
        };
      }
    }

    return {
      success: false,
      originalSelector,
      confidence: topCandidates[0]?.score || 0,
      method: 'similarity',
      candidatesTested,
    };
  }

  /**
   * 使用 AI 分析自愈
   */
  private async tryAiHeal(
    originalSelector: string,
    snapshot: PageSnapshot,
    action: string,
  ): Promise<SelfHealResult> {
    // 检索相似历史记忆
    let similarMemories: RagRetrievalResult[] = [];
    if (this.config.useRagMemory && this.ragMemory) {
      similarMemories = this.retrieveSimilarHealMemories(originalSelector, snapshot, action);
      if (similarMemories.length > 0) {
        logger.info('📚 检索到相似自愈历史', {
          count: similarMemories.length,
          topSimilarity: similarMemories[0]?.similarity.toFixed(2),
        });

        // 发出 RAG 检索事件
        eventBus.emitSafe(TestEventType.RAG_RETRIEVING, {
          queryType: 'self_heal',
          projectId: this.config.project ?? 'unknown',
          limit: this.config.ragMemoryLimit,
        });
      }
    }

    // 构建 AI prompt（注入历史记忆）
    const prompt = this.buildHealPrompt(originalSelector, snapshot, action, similarMemories);

    try {
      const response = await this.aiClient.chatWithRetry(
        [{ role: 'user', content: prompt }],
        { responseFormat: 'json' },
      );

      // 解析 AI 响应
      const aiCandidates = this.parseAiCandidates(response.content);

      // 验证候选选择器
      let candidatesTested = 0;

      for (const candidate of aiCandidates.slice(0, this.config.maxCandidates)) {
        candidatesTested++;
        const element = this.findElementBySelector(candidate.selector, snapshot.interactiveElements);

        if (element) {
          return {
            success: true,
            originalSelector,
            newSelector: candidate.selector,
            confidence: candidate.score,
            method: 'ai',
            candidatesTested,
          };
        }
      }

      return {
        success: false,
        originalSelector,
        confidence: 0,
        method: 'ai',
        candidatesTested,
      };
    } catch (error) {
      logger.warn('⚠️ AI 自愈分析失败', { error: String(error) });
      return {
        success: false,
        originalSelector,
        confidence: 0,
        method: 'ai',
        candidatesTested: 0,
        error: String(error),
      };
    }
  }

  /**
   * 检索相似的自愈历史记忆
   */
  private retrieveSimilarHealMemories(
    originalSelector: string,
    snapshot: PageSnapshot,
    action: string,
  ): RagRetrievalResult[] {
    if (!this.ragMemory) return [];

    const queryText = [
      originalSelector,
      snapshot.url,
      action,
    ].filter(Boolean).join(' ');

    return this.ragMemory.search({
      queryText,
      projectId: this.config.project,
      memoryTypes: ['self_heal', 'auto_fix', 'failure'],
      limit: this.config.ragMemoryLimit,
      minSimilarity: 0.2,
    });
  }

  /**
   * 构建自愈 Prompt
   */
  private buildHealPrompt(
    originalSelector: string,
    snapshot: PageSnapshot,
    action: string,
    similarMemories: RagRetrievalResult[] = [],
  ): string {
    const elementsSummary = snapshot.interactiveElements.slice(0, 30).map(el => ({
      selector: el.selector,
      tag: el.tag,
      text: el.text?.slice(0, 50),
      attributes: Object.entries(el.attributes).slice(0, 5).map(([k, v]) => `${k}="${v}"`).join(' '),
      visible: el.visible,
      clickable: el.clickable,
    }));

    // 构建历史记忆部分
    const memorySection = similarMemories.length > 0
      ? `\n## 历史相似案例（供参考）\n${similarMemories.map((m, i) =>
          `### 案例 ${i + 1}（相似度: ${m.similarity.toFixed(2)}）\n` +
          `- 原选择器: ${m.memory.contextUrl || 'unknown'}\n` +
          `- 执行结果: ${m.memory.executionResult.slice(0, 150)}\n` +
          (m.memory.solutionStrategy ? `- 解决策略: ${m.memory.solutionStrategy}\n` : '') +
          (m.memory.solutionSteps ? `- 解决步骤: ${m.memory.solutionSteps.join(', ')}\n` : '')
        ).join('\n')}\n**注意**: 请优先考虑这些历史案例中成功的解决方案。\n`
      : '';

    return `你是一位自动化测试专家。元素选择器失效，请推荐替代选择器。
${memorySection}
## 原始选择器
${originalSelector}

## 操作类型
${action}

## 页面 URL
${snapshot.url}

## 页面交互元素（前30个）
\`\`\`json
${JSON.stringify(elementsSummary, null, 2)}
\`\`\`

## 任务
1. 分析原始选择器的意图（要找什么元素）
2. 从页面元素中推荐最匹配的替代选择器
3. 给出置信度评分 0-1

## 输出格式
\`\`\`json
{
  "analysis": "原始选择器的意图分析",
  "candidates": [
    {
      "selector": "推荐的替代选择器",
      "score": 0.9,
      "reason": "推荐理由"
    }
  ],
  "bestMatch": "最推荐的选择器",
  "confidence": 0.85
}
\`\`\`

用中文回答，输出严格的JSON格式。`;
  }

  /**
   * 解析 AI 候选
   */
  private parseAiCandidates(content: string): ElementCandidate[] {
    // AI 返回的候选对象结构
    interface AiCandidateResponse {
      selector: string;
      score?: number;
      reason?: string;
    }

    interface AiParsedResponse {
      candidates?: AiCandidateResponse[];
    }

    try {
      const parsed: AiParsedResponse = JSON.parse(content);
      return parsed.candidates?.map((c: AiCandidateResponse) => ({
        selector: c.selector,
        score: c.score || 0.5,
        matchType: 'ai' as const,
        description: c.reason || '',
      })) || [];
    } catch {
      // 尝试提取 JSON
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch && jsonMatch[1]) {
        const parsed: AiParsedResponse = JSON.parse(jsonMatch[1]);
        return parsed.candidates?.map((c: AiCandidateResponse) => ({
          selector: c.selector,
          score: c.score || 0.5,
          matchType: 'ai' as const,
          description: c.reason || '',
        })) || [];
      }

      return [];
    }
  }

  /**
   * 提取选择器特征
   */
  private extractSelectorFeatures(selector: string): {
    tag?: string;
    id?: string;
    classes: string[];
    attributes: Record<string, string>;
    text?: string;
  } {
    const features: ReturnType<typeof this.extractSelectorFeatures> = {
      classes: [],
      attributes: {},
    };

    // ID 选择器
    const idMatch = selector.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      features.id = idMatch[1];
    }

    // Class 选择器
    const classMatches = selector.match(/\.[a-zA-Z0-9_-]+/g);
    if (classMatches) {
      features.classes = classMatches.map(c => c.slice(1));
    }

    // 属性选择器
    const attrMatches = selector.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/g);
    if (attrMatches) {
      for (const attr of attrMatches) {
        const parts = attr.match(/\[([a-zA-Z0-9_-]+)(?:="([^"]*)")?\]/);
        if (parts && parts[1]) {
          features.attributes[parts[1]] = parts[2] || '';
        }
      }
    }

    // Tag 选择器
    const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (tagMatch) {
      features.tag = tagMatch[1];
    }

    return features;
  }

  /**
   * 计算相似度分数
   */
  private calculateSimilarityScore(
    features: ReturnType<typeof this.extractSelectorFeatures>,
    element: InteractiveElement,
    action: string,
  ): number {
    let score = 0;
    const weights = {
      id: 0.4,
      class: 0.2,
      attribute: 0.15,
      tag: 0.1,
      text: 0.1,
      actionCompatible: 0.05,
    };

    // ID 匹配
    if (features.id && element.attributes.id === features.id) {
      score += weights.id;
    }

    // Class 匹配
    const elementClasses = (element.attributes.class || '').split(' ');
    const matchingClasses = features.classes.filter(c => elementClasses.includes(c));
    score += weights.class * (matchingClasses.length / Math.max(features.classes.length, 1));

    // 属性匹配
    for (const [key, value] of Object.entries(features.attributes)) {
      if (element.attributes[key] === value) {
        score += weights.attribute;
      } else if (element.attributes[key]?.includes(value)) {
        score += weights.attribute * 0.5;
      }
    }

    // Tag 匹配
    if (features.tag && element.tag === features.tag) {
      score += weights.tag;
    }

    // 文本匹配
    if (features.text && element.text?.includes(features.text)) {
      score += weights.text;
    }

    // 操作兼容性
    if (action === 'click' && element.clickable) {
      score += weights.actionCompatible;
    } else if (action === 'fill' && ['input', 'textarea', 'select'].includes(element.tag)) {
      score += weights.actionCompatible;
    }

    return Math.min(score, 1);
  }

  /**
   * 在元素列表中查找选择器
   */
  private findElementBySelector(
    selector: string,
    elements: InteractiveElement[],
  ): InteractiveElement | undefined {
    return elements.find(el => el.selector === selector);
  }

  /**
   * 检查 URL 是否匹配模式
   */
  private matchesUrlPattern(url: string, pattern: string): boolean {
    // 简单的模式匹配
    if (pattern === '*') return true;
    if (pattern === url) return true;

    // 正则匹配
    try {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(url);
    } catch {
      return url.includes(pattern);
    }
  }

  /**
   * 更新元素映射
   */
  private updateMapping(
    originalSelector: string,
    newSelector: string,
    snapshot: PageSnapshot,
    method: 'similarity' | 'ai' | 'fallback',
  ): void {
    const existing = this.elementMappings.get(originalSelector);

    if (existing) {
      // 更新现有映射
      existing.lastWorkingSelector = newSelector;
      existing.lastUpdated = new Date().toISOString();
      existing.successCount++;
      existing.aiSuggested = method === 'ai';

      // 添加新的备选选择器（如果不在列表中）
      if (!existing.alternativeSelectors.includes(newSelector)) {
        existing.alternativeSelectors.unshift(newSelector);
        if (existing.alternativeSelectors.length > 10) {
          existing.alternativeSelectors.pop();
        }
      }

      // 持久化到数据库
      this.persistMapping(existing);
    } else {
      // 创建新映射
      const mapping: ElementMapping = {
        id: `map-${nanoid(8)}`,
        originalSelector,
        alternativeSelectors: [newSelector],
        lastWorkingSelector: newSelector,
        lastUpdated: new Date().toISOString(),
        aiSuggested: method === 'ai',
        successCount: 1,
        failureCount: 0,
        elementDescription: '',
        pageUrlPattern: snapshot.url,
      };
      this.elementMappings.set(originalSelector, mapping);

      // 持久化到数据库
      this.persistMapping(mapping);
    }
  }

  /**
   * 从数据库加载历史映射
   */
  private async loadFromDatabase(): Promise<void> {
    if (!this.db || !this.config.project || !this.config.platform) {
      return;
    }

    try {
      const rows = this.db.query<{
        id: string;
        original_selector: string;
        alternative_selectors: string;
        last_working_selector: string;
        last_updated: string;
        ai_suggested: number;
        success_count: number;
        failure_count: number;
        element_description: string;
        page_url_pattern: string;
      }>(`
        SELECT * FROM element_mappings
        WHERE project = ? AND platform = ?
        ORDER BY success_count DESC, last_updated DESC
        LIMIT 100
      `, [this.config.project, this.config.platform]);

      for (const row of rows) {
        const mapping: ElementMapping = {
          id: row.id,
          originalSelector: row.original_selector,
          alternativeSelectors: JSON.parse(row.alternative_selectors || '[]'),
          lastWorkingSelector: row.last_working_selector,
          lastUpdated: row.last_updated,
          aiSuggested: row.ai_suggested === 1,
          successCount: row.success_count,
          failureCount: row.failure_count,
          elementDescription: row.element_description || '',
          pageUrlPattern: row.page_url_pattern,
        };
        this.elementMappings.set(mapping.originalSelector, mapping);
      }

      logger.info('📊 从数据库加载元素映射', { count: rows.length });
    } catch (error) {
      logger.warn('⚠️ 加载历史映射失败', { error: String(error) });
    }
  }

  /**
   * 持久化映射到数据库
   */
  private async persistMapping(mapping: ElementMapping): Promise<void> {
    if (!this.db || !this.config.project || !this.config.platform) {
      return;
    }

    try {
      // 使用 upsert 逻辑
      const existing = this.db.query<{ id: string }>(
        'SELECT id FROM element_mappings WHERE id = ?',
        [mapping.id],
      );

      if (existing.length > 0) {
        // 更新
        this.db.execute(`
          UPDATE element_mappings SET
            alternative_selectors = ?,
            last_working_selector = ?,
            last_updated = ?,
            ai_suggested = ?,
            success_count = ?,
            failure_count = ?,
            element_description = ?,
            page_url_pattern = ?
          WHERE id = ?
        `, [
          JSON.stringify(mapping.alternativeSelectors),
          mapping.lastWorkingSelector,
          mapping.lastUpdated,
          mapping.aiSuggested ? 1 : 0,
          mapping.successCount,
          mapping.failureCount,
          mapping.elementDescription,
          mapping.pageUrlPattern,
          mapping.id,
        ]);
      } else {
        // 插入
        this.db.execute(`
          INSERT INTO element_mappings (
            id, project, platform, page_url, element_name,
            original_selector, alternative_selectors, last_working_selector,
            selector_type, success_count, failure_count, success_rate,
            ai_suggested, element_description, page_url_pattern, last_updated, created
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          mapping.id,
          this.config.project,
          this.config.platform,
          mapping.pageUrlPattern,
          mapping.elementDescription || '',
          mapping.originalSelector,
          JSON.stringify(mapping.alternativeSelectors),
          mapping.lastWorkingSelector,
          'css',
          mapping.successCount,
          mapping.failureCount,
          mapping.successCount / (mapping.successCount + mapping.failureCount || 1),
          mapping.aiSuggested ? 1 : 0,
          mapping.elementDescription,
          mapping.pageUrlPattern,
          mapping.lastUpdated,
          mapping.lastUpdated,
        ]);
      }

      logger.debug('💾 元素映射已持久化', { selector: mapping.originalSelector });
    } catch (error) {
      logger.warn('⚠️ 持久化元素映射失败', { error: String(error) });
    }
  }

  /**
   * 从数据库删除映射
   */
  private async deleteMappingFromDatabase(mappingId: string): Promise<void> {
    if (!this.db) {
      return;
    }

    try {
      this.db.execute('DELETE FROM element_mappings WHERE id = ?', [mappingId]);
      logger.debug('🗑️ 元素映射已从数据库删除', { id: mappingId });
    } catch (error) {
      logger.warn('⚠️ 删除映射失败', { error: String(error) });
    }
  }

  /**
   * 记录失败
   */
  recordFailure(selector: string): void {
    const mapping = this.elementMappings.get(selector);
    if (mapping) {
      mapping.failureCount++;
      mapping.lastUpdated = new Date().toISOString();
      // 持久化更新
      this.persistMapping(mapping);
    }
  }

  /**
   * 记录成功
   */
  recordSuccess(selector: string): void {
    const mapping = this.elementMappings.get(selector);
    if (mapping) {
      mapping.successCount++;
      mapping.lastUpdated = new Date().toISOString();
      // 持久化更新
      this.persistMapping(mapping);
    }
  }

  /**
   * 获取所有映射
   */
  getMappings(): ElementMapping[] {
    return Array.from(this.elementMappings.values());
  }

  /**
   * 加载映射（手动加载，用于测试或恢复）
   */
  loadMappings(mappings: ElementMapping[]): void {
    for (const mapping of mappings) {
      this.elementMappings.set(mapping.originalSelector, mapping);
    }
  }

  /**
   * 清理低效映射
   */
  async cleanupMappings(minSuccessRate: number = 0.3): Promise<void> {
    const toDelete: string[] = [];

    for (const [key, mapping] of this.elementMappings) {
      const successRate = mapping.successCount / (mapping.successCount + mapping.failureCount);
      if (successRate < minSuccessRate && mapping.failureCount > 5) {
        toDelete.push(key);
        // 从数据库删除
        await this.deleteMappingFromDatabase(mapping.id);
      }
    }

    // 从内存删除
    for (const key of toDelete) {
      this.elementMappings.delete(key);
    }

    logger.info('🧹 清理低效元素映射', { deleted: toDelete.length, remaining: this.elementMappings.size });
  }

  /**
   * 关闭自愈引擎（释放资源）
   */
  close(): void {
    if (this.db) {
      // 不关闭 db，因为可能是共享的
      this.db = null;
    }
    this.initialized = false;
  }
}

/**
 * 快捷自愈函数
 */
export async function selfHealElement(
  selector: string,
  snapshot: PageSnapshot,
  action: string,
  options?: Partial<SelfHealerConfig>,
): Promise<SelfHealResult> {
  const healer = new SelfHealer(options);
  return healer.heal(selector, snapshot, action);
}

/**
 * 创建自愈引擎实例（用于长期运行的测试会话）
 */
export function createSelfHealer(options?: Partial<SelfHealerConfig>): SelfHealer {
  return new SelfHealer(options);
}
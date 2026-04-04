/**
 * 状态图谱构建器
 * 负责状态节点的识别、哈希计算、图谱构建和路径查找
 */

import type { PageSnapshot, InteractiveElement } from '@/types/crawler.types.js';
import type {
  StateNode,
  StateEdge,
  StateGraph,
  StateGraphStats,
  StateHashOptions,
  PathFindResult,
  AlternativePath,
  StateGraphBuildOptions,
  StateGraphQueryOptions,
  KeyElement,
  StateType,
} from '@/types/state-graph.types.js';
import { DEFAULT_STATE_HASH_OPTIONS } from '@/types/state-graph.types.js';
import type { Platform, TestActionType } from '@/types/test-case.types.js';
import { logger } from '@/core/logger.js';
import { eventBus, TestEventType } from '@/core/event-bus.js';
import { nanoid } from 'nanoid';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * 默认构建选项
 */
const DEFAULT_BUILD_OPTIONS: StateGraphBuildOptions = {
  persist: true,
  mergeSimilarStates: true,
  similarityThreshold: 0.85,
  maxNodes: 1000,
  recordScreenshots: true,
};

/**
 * 状态图谱构建器类
 */
export class StateGraphBuilder {
  private options: StateGraphBuildOptions;
  private graphs: Map<string, StateGraph> = new Map();
  private persistenceDir: string;

  constructor(
    options: Partial<StateGraphBuildOptions> = {},
    persistenceDir: string = './data/state-graphs'
  ) {
    this.options = { ...DEFAULT_BUILD_OPTIONS, ...options };
    this.persistenceDir = persistenceDir;
  }

  /**
   * 初始化构建器
   */
  async initialize(): Promise<void> {
    if (this.options.persist) {
      await fs.mkdir(this.persistenceDir, { recursive: true });
      await this.loadPersistedGraphs();
    }
    logger.info('✅ 状态图谱构建器初始化完成');
  }

  /**
   * 计算状态哈希
   */
  computeStateHash(
    snapshot: PageSnapshot,
    options: Partial<StateHashOptions> = {}
  ): string {
    const opts = { ...DEFAULT_STATE_HASH_OPTIONS, ...options };
    const hashComponents: string[] = [];

    // URL 处理
    if (opts.includeUrl && snapshot.url) {
      const cleanUrl = this.filterDynamicContent(snapshot.url, opts.dynamicContentFilters);
      hashComponents.push(`url:${cleanUrl}`);
    }

    // 标题处理
    if (opts.includeTitle && snapshot.title) {
      const cleanTitle = this.filterDynamicContent(snapshot.title, opts.dynamicContentFilters);
      hashComponents.push(`title:${cleanTitle}`);
    }

    // 关键元素处理
    if (opts.includeKeyElements && snapshot.interactiveElements) {
      const keyElements = this.extractKeyElements(snapshot.interactiveElements);
      const elementSignatures = keyElements
        .slice(0, 20)
        .map(el => `${el.selector}:${el.elementType}`)
        .sort();
      hashComponents.push(`elements:${elementSignatures.join(',')}`);
    }

    // DOM 结构摘要
    if (snapshot.html) {
      const domSummary = this.extractDomSummary(snapshot.html);
      hashComponents.push(`dom:${domSummary}`);
    }

    // 计算哈希
    const content = hashComponents.join('|');
    return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
  }

  /**
   * 过滤动态内容
   */
  private filterDynamicContent(content: string, filters: string[]): string {
    let filtered = content;
    for (const pattern of filters) {
      try {
        const regex = new RegExp(pattern, 'gi');
        filtered = filtered.replace(regex, '[FILTERED]');
      } catch {
        // 忽略无效正则
      }
    }
    return filtered;
  }

  /**
   * 提取关键元素
   */
  private extractKeyElements(elements: InteractiveElement[]): KeyElement[] {
    return elements
      .filter(el => el.visible && el.clickable)
      .slice(0, 50)
      .map(el => ({
        selector: el.selector,
        elementType: this.classifyElementType(el.tag),
        text: el.text?.slice(0, 100) ?? null,
        description: el.attributes['aria-label'] ?? null,
        interactive: el.clickable || el.tag === 'input' || el.tag === 'a',
      }));
  }

  /**
   * 分类元素类型
   */
  private classifyElementType(tag: string): KeyElement['elementType'] {
    const typeMap: Record<string, KeyElement['elementType']> = {
      button: 'button',
      input: 'input',
      textarea: 'input',
      select: 'input',
      a: 'link',
      img: 'image',
      svg: 'icon',
    };
    return typeMap[tag.toLowerCase()] ?? 'other';
  }

  /**
   * 提取 DOM 摘要
   */
  private extractDomSummary(html: string): string {
    // 移除动态内容和空白
    const summary = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/data-[a-z-]+="[^"]*"/gi, 'data-[removed]')
      .replace(/\s+/g, ' ')
      .slice(0, 5000);

    // 提取主要结构标签
    const structureTags = ['header', 'nav', 'main', 'section', 'article', 'aside', 'footer', 'form'];
    const structureInfo: string[] = [];

    for (const tag of structureTags) {
      const regex = new RegExp(`<${tag}[^>]*>`, 'gi');
      const matches = summary.match(regex);
      if (matches) {
        structureInfo.push(`${tag}:${matches.length}`);
      }
    }

    return structureInfo.join('|');
  }

  /**
   * 判断状态类型
   */
  private determineStateType(snapshot: PageSnapshot): StateType {
    const url = snapshot.url.toLowerCase();
    const title = snapshot.title.toLowerCase();

    // 检查 URL 特征
    if (url.includes('modal') || url.includes('popup')) return 'modal';
    if (url.includes('dialog')) return 'dialog';
    if (url.includes('drawer') || url.includes('sidebar')) return 'drawer';

    // 检查标题特征
    if (title.includes('dialog') || title.includes('对话框')) return 'dialog';
    if (title.includes('modal') || title.includes('模态')) return 'modal';

    // 检查元素特征
    const hasModalElements = snapshot.interactiveElements.some(el =>
      el.selector.includes('modal') ||
      el.selector.includes('dialog') ||
      el.attributes['role'] === 'dialog'
    );

    if (hasModalElements) return 'modal';

    return 'page';
  }

  /**
   * 记录状态节点
   */
  recordState(
    snapshot: PageSnapshot,
    projectId: string,
    platform: Platform,
    screenshotPath?: string
  ): StateNode {
    const stateHash = this.computeStateHash(snapshot);
    const graphKey = this.getGraphKey(projectId, platform);
    const graph = this.getOrCreateGraph(projectId, platform);

    // 检查是否已存在相同状态
    const existingNode = graph.nodes.find(n => n.stateHash === stateHash);
    if (existingNode) {
      // 更新访问计数
      existingNode.visitCount++;
      existingNode.lastVisit = new Date().toISOString();
      logger.debug('📍 状态节点已存在，更新访问计数', {
        stateHash,
        visitCount: existingNode.visitCount,
      });
      return existingNode;
    }

    // 创建新状态节点
    const newNode: StateNode = {
      id: `state-${nanoid(8)}`,
      stateHash,
      projectId,
      platform,
      stateName: this.generateStateName(snapshot),
      stateType: this.determineStateType(snapshot),
      urlPattern: this.extractUrlPattern(snapshot.url),
      activityName: null,
      viewHierarchyHash: null,
      keyElements: this.extractKeyElements(snapshot.interactiveElements),
      screenshotPath: screenshotPath ?? null,
      visitCount: 1,
      lastVisit: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    // 检查节点数量限制
    if (graph.nodes.length >= this.options.maxNodes) {
      // 移除最少访问的节点
      graph.nodes.sort((a, b) => b.visitCount - a.visitCount);
      const removedNodes = graph.nodes.splice(this.options.maxNodes - 1);
      logger.warn(`⚠️ 状态图谱节点数达到上限，移除 ${removedNodes.length} 个低访问节点`);
    }

    graph.nodes.push(newNode);

    // 发出状态发现事件
    eventBus.emitSafe(TestEventType.STATE_DISCOVERED, {
      stateId: newNode.id,
      stateHash: newNode.stateHash,
      projectId,
      platform,
      urlPattern: newNode.urlPattern ?? undefined,
    });

    logger.info('📍 新状态节点已记录', {
      stateHash,
      stateName: newNode.stateName,
      url: snapshot.url.slice(0, 50),
    });

    return newNode;
  }

  /**
   * 生成状态名称
   */
  private generateStateName(snapshot: PageSnapshot): string {
    // 优先使用页面标题
    if (snapshot.title) {
      return snapshot.title.slice(0, 50);
    }

    // 使用 URL 路径
    try {
      const url = new URL(snapshot.url);
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0) {
        return pathParts[pathParts.length - 1] ?? 'Unknown State';
      }
    } catch {
      // 忽略无效 URL
    }

    return 'Unknown State';
  }

  /**
   * 提取 URL 模式
   */
  private extractUrlPattern(url: string): string {
    try {
      const parsed = new URL(url);
      // 移除查询参数和 hash，保留路径模式
      return parsed.pathname.replace(/\/[a-f0-9-]{20,}/gi, '/:id');
    } catch {
      return url;
    }
  }

  /**
   * 记录状态转移
   */
  recordTransition(
    sourceStateHash: string,
    targetStateHash: string,
    action: TestActionType,
    projectId: string,
    platform: Platform,
    actionTarget?: string,
    actionValue?: string,
    success: boolean = true
  ): StateEdge | null {
    const graph = this.getOrCreateGraph(projectId, platform);

    // 查找现有边
    const existingEdge = graph.edges.find(
      e => e.sourceStateHash === sourceStateHash &&
           e.targetStateHash === targetStateHash &&
           e.actionType === action
    );

    if (existingEdge) {
      existingEdge.transitionCount++;
      if (success) {
        existingEdge.successCount++;
      } else {
        existingEdge.failureCount++;
      }
      existingEdge.lastTransition = new Date().toISOString();
      return existingEdge;
    }

    // 创建新边
    const newEdge: StateEdge = {
      id: `edge-${nanoid(8)}`,
      projectId,
      platform,
      sourceStateHash,
      targetStateHash,
      actionType: action,
      actionTarget: actionTarget ?? null,
      actionValue: actionValue ?? null,
      transitionCount: 1,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      lastTransition: new Date().toISOString(),
      createdAt: new Date().toISOString(),
    };

    graph.edges.push(newEdge);

    // 发出状态转移事件
    eventBus.emitSafe(TestEventType.STATE_TRANSITION, {
      edgeId: newEdge.id,
      sourceStateHash,
      targetStateHash,
      action,
      success,
    });

    logger.debug('🔀 状态转移已记录', {
      source: sourceStateHash.slice(0, 8),
      target: targetStateHash.slice(0, 8),
      action,
      success,
    });

    return newEdge;
  }

  /**
   * 查找替代路径
   */
  findAlternativePath(
    sourceStateHash: string,
    targetStateHash: string,
    projectId: string,
    platform: Platform
  ): PathFindResult {
    const startTime = Date.now();
    const graph = this.graphs.get(this.getGraphKey(projectId, platform));

    if (!graph) {
      return {
        found: false,
        path: [],
        edges: [],
        length: 0,
        confidence: 0,
        durationMs: Date.now() - startTime,
      };
    }

    // 使用 BFS 查找最短路径
    const result = this.bfsPathSearch(graph, sourceStateHash, targetStateHash);

    return {
      ...result,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * BFS 路径搜索
   */
  private bfsPathSearch(
    graph: StateGraph,
    sourceHash: string,
    targetHash: string,
    maxDepth: number = 10
  ): PathFindResult {
    if (sourceHash === targetHash) {
      return { found: true, path: [sourceHash], edges: [], length: 0, confidence: 1, durationMs: 0 };
    }

    const visited = new Set<string>();
    const queue: Array<{ hash: string; path: string[]; edges: StateEdge[] }> = [
      { hash: sourceHash, path: [sourceHash], edges: [] },
    ];

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (current.path.length > maxDepth) {
        continue;
      }

      if (visited.has(current.hash)) {
        continue;
      }
      visited.add(current.hash);

      // 查找所有出边
      const outEdges = graph.edges.filter(e => e.sourceStateHash === current.hash);

      for (const edge of outEdges) {
        if (edge.targetStateHash === targetHash) {
          // 找到目标
          const path = [...current.path, targetHash];
          const edges = [...current.edges, edge];
          const avgSuccessRate = edges.reduce((sum, e) => sum + (e.successCount / e.transitionCount), 0) / edges.length;

          return {
            found: true,
            path,
            edges,
            length: path.length - 1,
            confidence: avgSuccessRate,
            durationMs: 0,
          };
        }

        if (!visited.has(edge.targetStateHash)) {
          queue.push({
            hash: edge.targetStateHash,
            path: [...current.path, edge.targetStateHash],
            edges: [...current.edges, edge],
          });
        }
      }
    }

    return { found: false, path: [], edges: [], length: 0, confidence: 0, durationMs: 0 };
  }

  /**
   * 获取所有替代路径
   */
  findAllAlternativePaths(
    sourceStateHash: string,
    targetStateHash: string,
    projectId: string,
    platform: Platform,
    maxPaths: number = 3
  ): AlternativePath[] {
    const graph = this.graphs.get(this.getGraphKey(projectId, platform));
    if (!graph) return [];

    const paths: AlternativePath[] = [];
    const visited = new Set<string>();

    // 使用 DFS 查找所有路径
    this.dfsFindPaths(
      graph,
      sourceStateHash,
      targetStateHash,
      [],
      [],
      visited,
      paths,
      maxPaths,
      8
    );

    // 按置信度排序
    paths.sort((a, b) => b.confidence - a.confidence);

    return paths.slice(0, maxPaths);
  }

  /**
   * DFS 查找所有路径
   */
  private dfsFindPaths(
    graph: StateGraph,
    currentHash: string,
    targetHash: string,
    currentPath: StateNode[],
    currentEdges: StateEdge[],
    visited: Set<string>,
    results: AlternativePath[],
    maxResults: number,
    maxDepth: number
  ): void {
    if (results.length >= maxResults) return;
    if (currentPath.length > maxDepth) return;

    const currentNode = graph.nodes.find(n => n.stateHash === currentHash);
    if (!currentNode) return;

    const newPath = [...currentPath, currentNode];

    if (currentHash === targetHash) {
      const avgSuccessRate = currentEdges.length > 0
        ? currentEdges.reduce((sum, e) => sum + (e.successCount / e.transitionCount), 0) / currentEdges.length
        : 1;

      results.push({
        path: newPath,
        edges: currentEdges,
        confidence: avgSuccessRate,
        estimatedSteps: currentEdges.length,
        requiresAdditionalActions: currentEdges.length > 1,
      });
      return;
    }

    visited.add(currentHash);

    const outEdges = graph.edges.filter(e => e.sourceStateHash === currentHash);
    for (const edge of outEdges) {
      if (!visited.has(edge.targetStateHash)) {
        this.dfsFindPaths(
          graph,
          edge.targetStateHash,
          targetHash,
          newPath,
          [...currentEdges, edge],
          visited,
          results,
          maxResults,
          maxDepth
        );
      }
    }

    visited.delete(currentHash);
  }

  /**
   * 获取状态图谱
   */
  getGraph(projectId: string, platform: Platform): StateGraph | undefined {
    return this.graphs.get(this.getGraphKey(projectId, platform));
  }

  /**
   * 获取或创建图谱
   */
  private getOrCreateGraph(projectId: string, platform: Platform): StateGraph {
    const key = this.getGraphKey(projectId, platform);

    if (!this.graphs.has(key)) {
      this.graphs.set(key, {
        projectId,
        platform,
        nodes: [],
        edges: [],
        entryNodeHash: null,
        stats: this.createEmptyStats(),
        updatedAt: new Date().toISOString(),
      });
    }

    return this.graphs.get(key)!;
  }

  /**
   * 获取图谱键
   */
  private getGraphKey(projectId: string, platform: Platform): string {
    return `${projectId}:${platform}`;
  }

  /**
   * 创建空统计
   */
  private createEmptyStats(): StateGraphStats {
    return {
      totalNodes: 0,
      totalEdges: 0,
      avgOutDegree: 0,
      avgInDegree: 0,
      longestPath: 0,
      stronglyConnectedComponents: 0,
    };
  }

  /**
   * 更新统计信息
   */
  updateStats(projectId: string, platform: Platform): StateGraphStats {
    const graph = this.getGraph(projectId, platform);
    if (!graph) return this.createEmptyStats();

    const stats: StateGraphStats = {
      totalNodes: graph.nodes.length,
      totalEdges: graph.edges.length,
      avgOutDegree: 0,
      avgInDegree: 0,
      longestPath: 0,
      stronglyConnectedComponents: 0,
    };

    if (graph.nodes.length > 0) {
      // 计算平均出度
      const outDegrees = new Map<string, number>();
      const inDegrees = new Map<string, number>();

      for (const edge of graph.edges) {
        outDegrees.set(edge.sourceStateHash, (outDegrees.get(edge.sourceStateHash) ?? 0) + 1);
        inDegrees.set(edge.targetStateHash, (inDegrees.get(edge.targetStateHash) ?? 0) + 1);
      }

      stats.avgOutDegree = graph.edges.length / graph.nodes.length;
      stats.avgInDegree = graph.edges.length / graph.nodes.length;
    }

    graph.stats = stats;
    graph.updatedAt = new Date().toISOString();

    return stats;
  }

  /**
   * 持久化图谱
   */
  async persistGraph(projectId: string, platform: Platform): Promise<void> {
    if (!this.options.persist) return;

    const graph = this.getGraph(projectId, platform);
    if (!graph) return;

    const filePath = path.join(this.persistenceDir, `${this.getGraphKey(projectId, platform)}.json`);

    try {
      await fs.writeFile(filePath, JSON.stringify(graph, null, 2));
      logger.debug('💾 状态图谱已持久化', { file: filePath });
    } catch (error) {
      logger.warn('⚠️ 持久化状态图谱失败', { error: String(error) });
    }
  }

  /**
   * 加载持久化的图谱
   */
  private async loadPersistedGraphs(): Promise<void> {
    try {
      const files = await fs.readdir(this.persistenceDir);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;

        try {
          const content = await fs.readFile(path.join(this.persistenceDir, file), 'utf-8');
          const graph: StateGraph = JSON.parse(content);
          this.graphs.set(this.getGraphKey(graph.projectId, graph.platform), graph);
          logger.debug('📂 加载状态图谱', { file, nodes: graph.nodes.length });
        } catch (error) {
          logger.warn('⚠️ 加载状态图谱失败', { file, error: String(error) });
        }
      }

      logger.info(`📊 已加载 ${this.graphs.size} 个状态图谱`);
    } catch (error) {
      // 目录不存在，忽略
    }
  }

  /**
   * 查询状态节点
   */
  queryStates(options: StateGraphQueryOptions): StateNode[] {
    const graph = this.getGraph(options.projectId, options.platform);
    if (!graph) return [];

    let nodes = [...graph.nodes];

    if (options.stateHash) {
      nodes = nodes.filter(n => n.stateHash === options.stateHash);
    }

    if (options.urlPattern) {
      nodes = nodes.filter(n => n.urlPattern?.includes(options.urlPattern!));
    }

    if (options.minVisitCount !== undefined) {
      nodes = nodes.filter(n => n.visitCount >= options.minVisitCount!);
    }

    // 按访问次数排序
    nodes.sort((a, b) => b.visitCount - a.visitCount);

    if (options.limit) {
      nodes = nodes.slice(0, options.limit);
    }

    return nodes;
  }

  /**
   * 导出图谱为 DOT 格式（用于可视化）
   */
  exportToDot(projectId: string, platform: Platform): string {
    const graph = this.getGraph(projectId, platform);
    if (!graph) return '';

    const lines: string[] = [
      `digraph "${projectId}_${platform}" {`,
      '  rankdir=LR;',
      '  node [shape=box];',
      '',
    ];

    // 添加节点
    for (const node of graph.nodes) {
      const label = node.stateName.replace(/"/g, '\\"').slice(0, 30);
      lines.push(`  "${node.stateHash}" [label="${label}"];`);
    }

    lines.push('');

    // 添加边
    for (const edge of graph.edges) {
      const label = `${edge.actionType}`;
      lines.push(`  "${edge.sourceStateHash}" -> "${edge.targetStateHash}" [label="${label}"];`);
    }

    lines.push('}');

    return lines.join('\n');
  }

  /**
   * 清理图谱
   */
  cleanup(projectId: string, platform: Platform, minVisitCount: number = 1): number {
    const graph = this.getGraph(projectId, platform);
    if (!graph) return 0;

    const before = graph.nodes.length;

    // 移除低访问节点
    graph.nodes = graph.nodes.filter(n => n.visitCount >= minVisitCount);

    // 移除孤立边
    const validHashes = new Set(graph.nodes.map(n => n.stateHash));
    graph.edges = graph.edges.filter(
      e => validHashes.has(e.sourceStateHash) && validHashes.has(e.targetStateHash)
    );

    const removed = before - graph.nodes.length;

    if (removed > 0) {
      logger.info(`🧹 清理状态图谱，移除 ${removed} 个低访问节点`);
    }

    return removed;
  }
}

/**
 * 创建状态图谱构建器实例
 */
export function createStateGraphBuilder(
  options?: Partial<StateGraphBuildOptions>,
  persistenceDir?: string
): StateGraphBuilder {
  return new StateGraphBuilder(options, persistenceDir);
}
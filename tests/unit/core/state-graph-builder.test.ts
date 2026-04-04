/**
 * 状态图谱构建器测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateGraphBuilder, createStateGraphBuilder } from '@/core/state-graph-builder.js';
import type { PageSnapshot } from '@/types/crawler.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('StateGraphBuilder', () => {
  let builder: StateGraphBuilder;
  const testPersistenceDir = './data/test-state-graphs';

  const createMockSnapshot = (url: string, title: string, elements: any[] = []): PageSnapshot => ({
    url,
    title,
    timestamp: new Date().toISOString(),
    screenshot: { fullPage: '', viewport: '' },
    html: `<html><head><title>${title}</title></head><body></body></html>`,
    interactiveElements: elements.map((el, i) => ({
      tag: el.tag || 'div',
      text: el.text || null,
      selector: el.selector || `#element-${i}`,
      alternativeSelectors: [],
      position: { x: 0, y: 0, width: 100, height: 50 },
      visible: true,
      clickable: el.clickable ?? true,
      disabled: false,
      attributes: el.attributes || {},
      type: el.type || 'unknown',
    })),
    forms: [],
    networkRequests: [],
    metadata: {
      loadTime: 1000,
      domNodes: 100,
      scripts: 5,
      stylesheets: 3,
    },
  });

  beforeEach(async () => {
    // 确保测试目录存在
    await fs.mkdir(testPersistenceDir, { recursive: true });
    builder = createStateGraphBuilder({ persist: true }, testPersistenceDir);
    await builder.initialize();
  });

  afterEach(async () => {
    // 清理测试数据
    try {
      await fs.rm(testPersistenceDir, { recursive: true, force: true });
    } catch {
      // 忽略错误
    }
  });

  describe('computeStateHash', () => {
    it('应该为相同内容生成相同的哈希', () => {
      const snapshot = createMockSnapshot(
        'https://example.com/page1',
        'Test Page',
        [{ tag: 'button', text: 'Click Me' }]
      );

      const hash1 = builder.computeStateHash(snapshot);
      const hash2 = builder.computeStateHash(snapshot);

      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(16);
    });

    it('应该为不同 URL 生成不同的哈希', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      const hash1 = builder.computeStateHash(snapshot1);
      const hash2 = builder.computeStateHash(snapshot2);

      expect(hash1).not.toBe(hash2);
    });

    it('应该为相同页面结构和内容生成稳定的哈希', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Test Page', []);
      const snapshot2 = createMockSnapshot('https://example.com/page1', 'Test Page', []);

      const hash1 = builder.computeStateHash(snapshot1);
      const hash2 = builder.computeStateHash(snapshot2);

      expect(hash1).toBe(hash2);
    });
  });

  describe('recordState', () => {
    it('应该记录新状态节点', () => {
      const snapshot = createMockSnapshot('https://example.com/page1', 'Page 1', []);

      const node = builder.recordState(snapshot, 'test-project', 'pc-web');

      expect(node.id).toBeDefined();
      expect(node.stateHash).toBeDefined();
      expect(node.stateName).toBe('Page 1');
      expect(node.urlPattern).toContain('/page1');
      expect(node.visitCount).toBe(1);
    });

    it('应该更新已存在状态的访问计数', () => {
      const snapshot = createMockSnapshot('https://example.com/page1', 'Page 1', []);

      const node1 = builder.recordState(snapshot, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot, 'test-project', 'pc-web');

      expect(node1.stateHash).toBe(node2.stateHash);
      expect(node2.visitCount).toBe(2);
    });

    it('应该为不同项目创建不同的图谱', () => {
      const snapshot = createMockSnapshot('https://example.com/page1', 'Page 1', []);

      const node1 = builder.recordState(snapshot, 'project-a', 'pc-web');
      const node2 = builder.recordState(snapshot, 'project-b', 'pc-web');

      // 两个节点应该有相同的哈希但在不同的图谱中
      expect(node1.stateHash).toBe(node2.stateHash);

      const graphA = builder.getGraph('project-a', 'pc-web');
      const graphB = builder.getGraph('project-b', 'pc-web');

      expect(graphA).toBeDefined();
      expect(graphB).toBeDefined();
      expect(graphA?.nodes.length).toBe(1);
      expect(graphB?.nodes.length).toBe(1);
    });
  });

  describe('recordTransition', () => {
    it('应该记录状态转移', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      const node1 = builder.recordState(snapshot1, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot2, 'test-project', 'pc-web');

      const edge = builder.recordTransition(
        node1.stateHash,
        node2.stateHash,
        'click',
        'test-project',
        'pc-web',
        '#button',
        undefined,
        true
      );

      expect(edge).not.toBeNull();
      expect(edge?.sourceStateHash).toBe(node1.stateHash);
      expect(edge?.targetStateHash).toBe(node2.stateHash);
      expect(edge?.actionType).toBe('click');
      expect(edge?.transitionCount).toBe(1);
      expect(edge?.successCount).toBe(1);
    });

    it('应该更新已存在转移的计数', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      const node1 = builder.recordState(snapshot1, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot2, 'test-project', 'pc-web');

      builder.recordTransition(node1.stateHash, node2.stateHash, 'click', 'test-project', 'pc-web', '#button');
      const edge = builder.recordTransition(node1.stateHash, node2.stateHash, 'click', 'test-project', 'pc-web', '#button');

      expect(edge?.transitionCount).toBe(2);
    });
  });

  describe('findAlternativePath', () => {
    it('应该找到存在的路径', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);
      const snapshot3 = createMockSnapshot('https://example.com/page3', 'Page 3', []);

      const node1 = builder.recordState(snapshot1, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot2, 'test-project', 'pc-web');
      const node3 = builder.recordState(snapshot3, 'test-project', 'pc-web');

      builder.recordTransition(node1.stateHash, node2.stateHash, 'click', 'test-project', 'pc-web');
      builder.recordTransition(node2.stateHash, node3.stateHash, 'click', 'test-project', 'pc-web');

      const result = builder.findAlternativePath(
        node1.stateHash,
        node3.stateHash,
        'test-project',
        'pc-web'
      );

      expect(result.found).toBe(true);
      expect(result.path).toHaveLength(3);
      expect(result.path[0]).toBe(node1.stateHash);
      expect(result.path[2]).toBe(node3.stateHash);
    });

    it('对于不存在的路径应该返回 found: false', () => {
      const result = builder.findAlternativePath(
        'nonexistent1',
        'nonexistent2',
        'test-project',
        'pc-web'
      );

      expect(result.found).toBe(false);
      expect(result.path).toHaveLength(0);
    });
  });

  describe('getGraph', () => {
    it('应该返回已创建的图谱', () => {
      const snapshot = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      builder.recordState(snapshot, 'test-project', 'pc-web');

      const graph = builder.getGraph('test-project', 'pc-web');

      expect(graph).toBeDefined();
      expect(graph?.projectId).toBe('test-project');
      expect(graph?.platform).toBe('pc-web');
      expect(graph?.nodes.length).toBe(1);
    });

    it('对于不存在的图谱应该返回 undefined', () => {
      const graph = builder.getGraph('nonexistent', 'pc-web');
      expect(graph).toBeUndefined();
    });
  });

  describe('queryStates', () => {
    it('应该根据条件查询状态', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      builder.recordState(snapshot1, 'test-project', 'pc-web');
      builder.recordState(snapshot2, 'test-project', 'pc-web');
      builder.recordState(snapshot1, 'test-project', 'pc-web'); // 增加访问计数

      const states = builder.queryStates({
        projectId: 'test-project',
        platform: 'pc-web',
        minVisitCount: 2,
      });

      expect(states.length).toBe(1);
      expect(states[0].visitCount).toBe(2);
    });
  });

  describe('exportToDot', () => {
    it('应该导出有效的 DOT 格式', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      const node1 = builder.recordState(snapshot1, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot2, 'test-project', 'pc-web');

      builder.recordTransition(node1.stateHash, node2.stateHash, 'click', 'test-project', 'pc-web');

      const dot = builder.exportToDot('test-project', 'pc-web');

      expect(dot).toContain('digraph');
      expect(dot).toContain(node1.stateHash);
      expect(dot).toContain(node2.stateHash);
      expect(dot).toContain('->');
    });
  });

  describe('cleanup', () => {
    it('应该移除低访问的状态', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      builder.recordState(snapshot1, 'test-project', 'pc-web');
      builder.recordState(snapshot2, 'test-project', 'pc-web');
      builder.recordState(snapshot2, 'test-project', 'pc-web'); // page2 访问两次

      const removed = builder.cleanup('test-project', 'pc-web', 2);

      expect(removed).toBe(1);

      const graph = builder.getGraph('test-project', 'pc-web');
      expect(graph?.nodes.length).toBe(1);
      expect(graph?.nodes[0].visitCount).toBe(2);
    });
  });

  describe('updateStats', () => {
    it('应该更新图谱统计信息', () => {
      const snapshot1 = createMockSnapshot('https://example.com/page1', 'Page 1', []);
      const snapshot2 = createMockSnapshot('https://example.com/page2', 'Page 2', []);

      const node1 = builder.recordState(snapshot1, 'test-project', 'pc-web');
      const node2 = builder.recordState(snapshot2, 'test-project', 'pc-web');

      builder.recordTransition(node1.stateHash, node2.stateHash, 'click', 'test-project', 'pc-web');

      const stats = builder.updateStats('test-project', 'pc-web');

      expect(stats.totalNodes).toBe(2);
      expect(stats.totalEdges).toBe(1);
      expect(stats.avgOutDegree).toBe(0.5);
    });
  });
});

describe('createStateGraphBuilder', () => {
  it('应该创建构建器实例', () => {
    const builder = createStateGraphBuilder();
    expect(builder).toBeInstanceOf(StateGraphBuilder);
  });
});
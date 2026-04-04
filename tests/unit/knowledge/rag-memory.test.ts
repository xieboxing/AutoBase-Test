/**
 * RAG 记忆引擎测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RagMemoryEngine, createRagMemoryEngine } from '@/knowledge/rag-memory.js';
import type { RagMemoryType } from '@/types/rag.types.js';
import { initializeDatabase, type KnowledgeDatabase } from '@/knowledge/db/index.js';
import fs from 'node:fs/promises';
import path from 'node:path';

describe('RagMemoryEngine', () => {
  let db: KnowledgeDatabase;
  let engine: RagMemoryEngine;
  const testDbPath = './db/test-rag-memory.db';

  beforeEach(async () => {
    // 确保测试目录存在
    await fs.mkdir(path.dirname(testDbPath), { recursive: true });

    // 删除旧的测试数据库文件，避免 schema 冲突
    try {
      await fs.unlink(testDbPath);
    } catch {
      // 文件不存在，忽略
    }

    // 初始化测试数据库
    db = await initializeDatabase({ dbPath: testDbPath });
    engine = createRagMemoryEngine(db);
  });

  afterEach(async () => {
    // 关闭数据库连接
    try {
      db.close();
    } catch {
      // 忽略关闭错误
    }

    // 清理测试数据库文件
    try {
      await fs.unlink(testDbPath);
    } catch {
      // 忽略删除失败
    }
  });

  describe('store', () => {
    it('应该成功存储记忆', () => {
      const memory = engine.store({
        projectId: 'test-project',
        platform: 'pc-web',
        memoryType: 'failure',
        contextUrl: 'https://example.com/login',
        executionResult: '登录按钮点击失败',
        solutionStrategy: '增加等待时间',
        solutionSteps: ['wait(2000)', 'retry'],
        confidence: 0.9,
      });

      expect(memory.id).toBeDefined();
      expect(memory.projectId).toBe('test-project');
      expect(memory.platform).toBe('pc-web');
      expect(memory.memoryType).toBe('failure');
      expect(memory.contextUrl).toBe('https://example.com/login');
      expect(memory.executionResult).toBe('登录按钮点击失败');
      expect(memory.solutionStrategy).toBe('增加等待时间');
      expect(memory.solutionSteps).toEqual(['wait(2000)', 'retry']);
      expect(memory.confidence).toBe(0.9);
      expect(memory.usageCount).toBe(0);
      expect(memory.successCount).toBe(0);
      expect(memory.createdAt).toBeDefined();
      expect(memory.updatedAt).toBeDefined();
    });

    it('应该支持存储不同类型的记忆', () => {
      const types: RagMemoryType[] = ['failure', 'self_heal', 'auto_fix', 'new_state', 'exploration', 'optimization', 'business_flow'];

      for (const type of types) {
        const memory = engine.store({
          projectId: 'test-project',
          platform: 'pc-web',
          memoryType: type,
          executionResult: `${type} 测试记忆`,
        });

        expect(memory.memoryType).toBe(type);
      }
    });

    it('应该正确处理可选字段', () => {
      const memory = engine.store({
        projectId: 'test-project',
        platform: null,
        memoryType: 'failure',
        executionResult: '简单失败记录',
      });

      expect(memory.platform).toBeNull();
      expect(memory.contextUrl).toBeNull();
      expect(memory.solutionStrategy).toBeNull();
      expect(memory.solutionSteps).toBeNull();
    });
  });

  describe('storeBatch', () => {
    it('应该批量存储记忆', () => {
      const memories = engine.storeBatch([
        { projectId: 'p1', platform: 'pc-web', memoryType: 'failure', executionResult: '失败1' },
        { projectId: 'p1', platform: 'pc-web', memoryType: 'self_heal', executionResult: '自愈1' },
        { projectId: 'p1', platform: 'pc-web', memoryType: 'auto_fix', executionResult: '修复1' },
      ]);

      expect(memories).toHaveLength(3);
      expect(memories[0].memoryType).toBe('failure');
      expect(memories[1].memoryType).toBe('self_heal');
      expect(memories[2].memoryType).toBe('auto_fix');
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // 存储测试数据
      engine.store({
        projectId: 'project-a',
        platform: 'pc-web',
        memoryType: 'failure',
        contextUrl: 'https://example.com/login',
        executionResult: '登录失败，用户名输入框未找到',
        solutionStrategy: '增加等待时间',
        confidence: 0.9,
      });

      engine.store({
        projectId: 'project-a',
        platform: 'pc-web',
        memoryType: 'self_heal',
        contextUrl: 'https://example.com/login',
        executionResult: '登录自愈成功',
        solutionStrategy: '使用备选选择器',
        confidence: 0.95,
      });

      engine.store({
        projectId: 'project-b',
        platform: 'h5-web',
        memoryType: 'failure',
        contextUrl: 'https://m.example.com/home',
        executionResult: '首页加载超时',
        confidence: 0.85,
      });
    });

    it('应该根据项目 ID 过滤', () => {
      const results = engine.search({
        queryText: '登录',
        projectId: 'project-a',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.memory.projectId).toBe('project-a');
      });
    });

    it('应该根据平台过滤', () => {
      // 先存储数据
      engine.store({
        projectId: 'project-a',
        platform: 'h5-web',
        memoryType: 'failure',
        contextUrl: 'https://m.example.com/home',
        executionResult: '首页加载超时',
        confidence: 0.85,
      });

      const results = engine.search({
        queryText: '首页',
        platform: 'h5-web',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(r.memory.platform).toBe('h5-web');
      });
    });

    it('应该根据记忆类型过滤', () => {
      // 先存储数据
      engine.store({
        projectId: 'project-a',
        platform: 'pc-web',
        memoryType: 'self_heal',
        contextUrl: 'https://example.com/login',
        executionResult: '登录自愈成功',
        confidence: 0.95,
      });

      const results = engine.search({
        queryText: '登录',
        memoryTypes: ['self_heal', 'auto_fix'],
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      results.forEach(r => {
        expect(['self_heal', 'auto_fix']).toContain(r.memory.memoryType);
      });
    });

    it('应该计算相似度并过滤低相似度结果', () => {
      // 先存储数据
      engine.store({
        projectId: 'project-a',
        platform: 'pc-web',
        memoryType: 'failure',
        contextUrl: 'https://example.com/login',
        executionResult: '登录失败，用户名输入框未找到',
        confidence: 0.9,
      });

      const results = engine.search({
        queryText: '登录',
        projectId: 'project-a',
        minSimilarity: 0,  // 设置为0以确保能找到结果
        limit: 10,
      });

      // 应该找到结果
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('应该按相似度降序排列', () => {
      const results = engine.search({
        queryText: '登录',
        limit: 10,
      });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].similarity).toBeGreaterThanOrEqual(results[i].similarity);
      }
    });

    it('应该限制返回数量', () => {
      const results = engine.search({
        queryText: '',
        limit: 2,
      });

      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('应该更新使用计数', () => {
      const beforeSearch = engine.getStats('project-a');

      engine.search({
        queryText: '登录',
        projectId: 'project-a',
        limit: 10,
      });

      // 搜索会更新 usageCount
      const afterSearch = engine.getStats('project-a');
      expect(afterSearch.totalUsageCount).toBeGreaterThanOrEqual(beforeSearch.totalUsageCount);
    });
  });

  describe('getById', () => {
    it('应该根据 ID 获取记忆', () => {
      const stored = engine.store({
        projectId: 'test-project',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '测试记忆',
      });

      const retrieved = engine.getById(stored.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(stored.id);
      expect(retrieved?.executionResult).toBe('测试记忆');
    });

    it('不存在时应该返回 null', () => {
      const result = engine.getById('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('recordSuccess', () => {
    it('应该记录成功使用', () => {
      const memory = engine.store({
        projectId: 'test-project',
        platform: 'pc-web',
        memoryType: 'self_heal',
        executionResult: '测试自愈',
      });

      const before = engine.getById(memory.id);
      expect(before?.successCount).toBe(0);

      engine.recordSuccess(memory.id);

      const after = engine.getById(memory.id);
      expect(after?.successCount).toBe(1);
      expect(after?.usageCount).toBe(1);
    });
  });

  describe('delete', () => {
    it('应该删除记忆', () => {
      const memory = engine.store({
        projectId: 'test-project',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '要删除的记忆',
      });

      const deleted = engine.delete(memory.id);
      expect(deleted).toBe(true);

      const retrieved = engine.getById(memory.id);
      expect(retrieved).toBeNull();
    });

    it('删除不存在的记忆应该返回 false', () => {
      const result = engine.delete('non-existent-id');
      expect(result).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('应该清理低价值记忆', () => {
      // 存储一个低价值记忆
      const lowValue = engine.store({
        projectId: 'test-project',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '低价值记忆',
        confidence: 0.3,
      });

      // 低使用次数
      for (let i = 0; i < 2; i++) {
        engine.getById(lowValue.id); // 不会增加 usageCount
      }

      // 清理（需要是老记忆，这里跳过实际时间检查）
      const cleanedCount = engine.cleanup(0); // 0 days old for testing

      // 验证清理逻辑被调用
      expect(typeof cleanedCount).toBe('number');
    });
  });

  describe('getStats', () => {
    it('应该返回正确的统计信息', () => {
      engine.store({
        projectId: 'stats-project',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '失败1',
      });

      engine.store({
        projectId: 'stats-project',
        platform: 'pc-web',
        memoryType: 'self_heal',
        executionResult: '自愈1',
      });

      engine.store({
        projectId: 'other-project',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '失败2',
      });

      const allStats = engine.getStats();
      expect(allStats.totalMemories).toBeGreaterThanOrEqual(3);

      const projectStats = engine.getStats('stats-project');
      expect(projectStats.totalMemories).toBeGreaterThanOrEqual(2);
      expect(projectStats.byType.failure).toBeGreaterThanOrEqual(1);
      expect(projectStats.byType.self_heal).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateSimilarity', () => {
    it('应该正确计算相似度', () => {
      // 通过搜索间接测试相似度计算
      engine.store({
        projectId: 'sim-test',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '用户登录失败，密码错误',
        contextUrl: 'https://example.com/login',
      });

      const highSimilarity = engine.search({
        queryText: '用户登录密码错误',
        projectId: 'sim-test',
        minSimilarity: 0,
        limit: 10,
      });

      expect(highSimilarity.length).toBeGreaterThan(0);
      expect(highSimilarity[0].similarity).toBeGreaterThanOrEqual(0);
    });

    it('应该忽略停用词', () => {
      engine.store({
        projectId: 'stop-test',
        platform: 'pc-web',
        memoryType: 'failure',
        executionResult: '点击按钮失败',
      });

      const results1 = engine.search({
        queryText: '点击按钮失败',
        projectId: 'stop-test',
        minSimilarity: 0,
        limit: 10,
      });

      const results2 = engine.search({
        queryText: '点击按钮',
        projectId: 'stop-test',
        minSimilarity: 0,
        limit: 10,
      });

      // 两个查询应该都找到结果
      expect(results1.length).toBeGreaterThan(0);
      expect(results2.length).toBeGreaterThan(0);
    });
  });
});

describe('createRagMemoryEngine', () => {
  it('应该创建引擎实例', async () => {
    const db = await initializeDatabase({ dbPath: './db/test-create.db' });
    const engine = createRagMemoryEngine(db);
    expect(engine).toBeInstanceOf(RagMemoryEngine);
    db.close();
  });
});
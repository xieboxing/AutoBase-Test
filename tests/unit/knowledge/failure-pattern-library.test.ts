/**
 * 失败模式库测试
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FailurePatternLibrary, createFailurePatternLibrary } from '@/knowledge/failure-pattern-library.js';
import { getDatabase, initializeDatabase, type KnowledgeDatabase } from '@/knowledge/db/index.js';
import type { AutoFixConfig } from '@/types/knowledge.types.js';
import fs from 'node:fs/promises';
import path from 'node:path';

// 测试数据库路径
const TEST_DB_PATH = './db/test-failure-patterns.db';

describe('FailurePatternLibrary', () => {
  let db: KnowledgeDatabase;
  let library: FailurePatternLibrary;

  beforeEach(async () => {
    // 确保测试目录存在
    await fs.mkdir(path.dirname(TEST_DB_PATH), { recursive: true });

    // 删除旧的测试数据库文件，避免 schema 冲突
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // 文件不存在，忽略
    }

    // 初始化测试数据库
    db = await initializeDatabase({ dbPath: TEST_DB_PATH });
    library = createFailurePatternLibrary(db);
  });

  afterEach(async () => {
    // 清理测试数据库
    db.close();
    try {
      await fs.unlink(TEST_DB_PATH);
    } catch {
      // 忽略删除失败
    }
  });

  describe('matchPattern', () => {
    it('应该匹配内置超时规则', () => {
      const result = library.matchPattern('Error: timeout waiting for element');

      expect(result.matched).toBe(true);
      expect(result.pattern).not.toBeNull();
      expect(result.pattern?.patternType).toBe('timeout');
      expect(result.pattern?.autoFixConfig?.fixType).toBe('increase-timeout');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('应该匹配内置元素未找到规则', () => {
      const result = library.matchPattern('Error: element not found selector "#submit-btn"');

      expect(result.matched).toBe(true);
      expect(result.pattern?.patternType).toBe('element_not_found');
      expect(result.pattern?.autoFixConfig?.fixType).toBe('add-wait');
    });

    it('应该匹配内置网络错误规则', () => {
      const result = library.matchPattern('Error: network error ECONNREFUSED');

      expect(result.matched).toBe(true);
      expect(result.pattern?.patternType).toBe('network_error');
      expect(result.pattern?.autoFixConfig?.fixType).toBe('retry');
    });

    it('断言失败应该标记为需要人工确认', () => {
      const result = library.matchPattern('AssertionError: expected true to be false');

      expect(result.matched).toBe(true);
      expect(result.pattern?.patternType).toBe('assertion_failed');
      expect(result.pattern?.autoFixConfig?.requireManualConfirm).toBe(true);
    });

    it('未知的错误应该不匹配', () => {
      const result = library.matchPattern('Some random error message');

      expect(result.matched).toBe(false);
      expect(result.pattern).toBeNull();
    });
  });

  describe('addPattern', () => {
    it('应该成功添加新的失败模式', () => {
      const autoFixConfig: AutoFixConfig = {
        fixType: 'add-wait',
        fixValue: 1000,
        maxRetries: 2,
      };

      const pattern = library.addPattern({
        patternType: 'element_not_found',
        patternKey: 'test-pattern-1',
        description: '测试用例模式',
        autoFixConfig,
      });

      expect(pattern.id).toBeDefined();
      expect(pattern.patternType).toBe('element_not_found');
      expect(pattern.frequency).toBe(1);
      expect(pattern.autoFixConfig).toEqual(autoFixConfig);
    });

    it('相同 patternKey 应该增加频率', () => {
      // 添加两次相同的模式
      library.addPattern({
        patternType: 'timeout',
        patternKey: 'duplicate-key',
        description: '第一次',
      });

      const pattern = library.addPattern({
        patternType: 'timeout',
        patternKey: 'duplicate-key',
        description: '第二次',
      });

      expect(pattern.frequency).toBe(2);
    });
  });

  describe('incrementFrequency', () => {
    it('应该增加模式频率', () => {
      const pattern = library.addPattern({
        patternType: 'timeout',
        patternKey: 'freq-test',
        description: '频率测试',
      });

      expect(pattern.frequency).toBe(1);

      library.incrementFrequency(pattern.id);

      const updated = library.findById(pattern.id);
      expect(updated?.frequency).toBe(2);
    });
  });

  describe('applyAutoFix', () => {
    it('应该成功应用自动修复', () => {
      const pattern = library.addPattern({
        patternType: 'timeout',
        patternKey: 'autofix-test',
        description: '自动修复测试',
        autoFixConfig: {
          fixType: 'increase-timeout',
          fixValue: 1.5,
          maxRetries: 2,
        },
      });

      const result = library.applyAutoFix(pattern.id);

      expect(result.success).toBe(true);
      expect(result.fixType).toBe('increase-timeout');
      expect(result.appliedFix).toContain('超时时间增加');
    });

    it('无自动修复配置的模式应该返回失败', () => {
      const pattern = library.addPattern({
        patternType: 'assertion_failed',
        patternKey: 'no-autofix',
        description: '无自动修复',
        autoFixConfig: undefined,
      });

      const result = library.applyAutoFix(pattern.id);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('No auto-fix config');
    });

    it('不存在的模式应该返回失败', () => {
      const result = library.applyAutoFix('non-existent-id');

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Pattern not found');
    });
  });

  describe('recordFixSuccess', () => {
    it('应该记录修复成功次数', () => {
      const pattern = library.addPattern({
        patternType: 'timeout',
        patternKey: 'success-test',
        description: '成功测试',
        autoFixConfig: { fixType: 'increase-timeout' },
      });

      expect(pattern.resolvedCount).toBe(0);

      library.recordFixSuccess(pattern.id);

      const updated = library.findById(pattern.id);
      expect(updated?.resolvedCount).toBe(1);
    });
  });

  describe('getTopPatterns', () => {
    it('应该按频率返回模式列表', () => {
      // 添加多个模式
      library.addPattern({ patternType: 'timeout', patternKey: 'p1', description: 'P1' });
      library.addPattern({ patternType: 'timeout', patternKey: 'p2', description: 'P2' });
      library.addPattern({ patternType: 'timeout', patternKey: 'p2', description: 'P2' });
      library.addPattern({ patternType: 'timeout', patternKey: 'p3', description: 'P3' });
      library.addPattern({ patternType: 'timeout', patternKey: 'p3', description: 'P3' });
      library.addPattern({ patternType: 'timeout', patternKey: 'p3', description: 'P3' });

      const topPatterns = library.getTopPatterns(3);

      expect(topPatterns.length).toBe(3);
      // P3 频率最高 (3次)
      expect(topPatterns[0]?.patternKey).toBe('p3');
      // P2 频率第二 (2次)
      expect(topPatterns[1]?.patternKey).toBe('p2');
    });
  });

  describe('getAutoFixablePatterns', () => {
    it('应该返回可自动修复的高频模式', () => {
      // 添加可自动修复的高频模式
      library.addPattern({
        patternType: 'timeout',
        patternKey: 'high-freq-autofix',
        description: '高频可修复',
        autoFixConfig: { fixType: 'increase-timeout' },
      });
      library.addPattern({
        patternType: 'timeout',
        patternKey: 'high-freq-autofix',
        description: '高频可修复',
      });
      library.addPattern({
        patternType: 'timeout',
        patternKey: 'high-freq-autofix',
        description: '高频可修复',
      });

      // 添加无自动修复配置的模式
      library.addPattern({
        patternType: 'assertion_failed',
        patternKey: 'no-autofix-pattern',
        description: '无自动修复',
      });

      const autoFixable = library.getAutoFixablePatterns(3);

      expect(autoFixable.length).toBe(1);
      expect(autoFixable[0]?.patternKey).toBe('high-freq-autofix');
      expect(autoFixable[0]?.autoFixConfig).not.toBeNull();
    });
  });

  describe('高频模式匹配', () => {
    it('高频模式（frequency >= 3）应该直接返回，不走 AI', () => {
      // 添加一个高频模式
      const pattern = library.addPattern({
        patternType: 'timeout',
        patternKey: 'high-freq-pattern',
        description: '高频超时模式',
        autoFixConfig: { fixType: 'increase-timeout' },
      });

      // 增加频率到 3
      library.incrementFrequency(pattern.id);
      library.incrementFrequency(pattern.id);

      // 匹配应该找到这个高频模式
      const result = library.matchPattern('Error: timeout waiting', {
        patternType: 'timeout',
        selector: 'high-freq-pattern',
      });

      expect(result.matched).toBe(true);
      expect(result.pattern?.frequency).toBeGreaterThanOrEqual(3);
    });
  });
});
/**
 * 知识库反哺闭环测试
 * 验证历史数据能够影响下一次测试生成、调度、执行、自愈、优化
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeDatabase } from '@/knowledge/db/index.js';
import { KnowledgeRepository } from '@/knowledge/repository.js';
import type { Platform } from '@/types/test-case.types.js';

describe('KnowledgeRepository - 知识库反哺闭环', () => {
  let db: KnowledgeDatabase;
  let repository: KnowledgeRepository;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
    repository = new KnowledgeRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('历史上下文加载', () => {
    it('第二次运行能够读取第一次结果', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 第一次运行 - 保存测试结果
      const runId1 = 'run-001';
      db.execute(`
        INSERT INTO test_runs (id, project, platform, test_type, start_time, end_time, duration_ms,
          total_cases, passed, failed, skipped, blocked, pass_rate, status, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [runId1, project, platform, 'full', '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z',
        1800000, 5, 3, 2, 0, 0, 0.6, 'completed', '2024-01-01T10:00:00Z']);

      // 保存测试用例结果
      db.execute(`
        INSERT INTO test_results (id, run_id, case_id, case_name, platform, status, priority,
          duration_ms, retry_count, start_time, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['result-001', runId1, 'tc-login-001', '登录测试', platform, 'passed', 'P0', 1000, 0, '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

      db.execute(`
        INSERT INTO test_results (id, run_id, case_id, case_name, platform, status, priority,
          duration_ms, retry_count, error_message, start_time, created)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['result-002', runId1, 'tc-search-001', '搜索测试', platform, 'failed', 'P1', 2000, 1, '元素未找到', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

      // 保存用例统计数据
      db.execute(`
        INSERT INTO case_statistics (id, case_id, project, platform, total_runs, pass_count, fail_count,
          consecutive_passes, consecutive_failures, last_result, last_run_time, pass_rate, stability_score, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cs-001', 'tc-login-001', project, platform, 10, 8, 2, 3, 0, 'passed', '2024-01-01T10:30:00Z', 0.8, 0.7, '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z']);

      db.execute(`
        INSERT INTO case_statistics (id, case_id, project, platform, total_runs, pass_count, fail_count,
          consecutive_passes, consecutive_failures, last_result, last_run_time, pass_rate, stability_score, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cs-002', 'tc-search-001', project, platform, 5, 1, 4, 0, 4, 'failed', '2024-01-01T10:30:00Z', 0.2, 0.3, '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z']);

      // 加载历史上下文
      const context = repository.loadHistoricalContext(project, platform);

      // 验证能读取到历史数据
      expect(context).toBeDefined();
      expect(context.projectId).toBe(project);
      expect(context.platform).toBe(platform);
      expect(context.caseStatistics.length).toBeGreaterThan(0);
    });

    it('高失败率用例应被标记为高风险', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 创建一个高失败率用例
      db.execute(`
        INSERT INTO case_statistics (id, case_id, project, platform, total_runs, pass_count, fail_count,
          consecutive_passes, consecutive_failures, last_result, last_run_time, pass_rate, stability_score, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cs-003', 'tc-high-risk', project, platform, 10, 2, 8, 0, 5, 'failed', '2024-01-01T10:30:00Z', 0.2, 0.1, '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z']);

      const context = repository.loadHistoricalContext(project, platform);

      // 验证高风险用例列表
      expect(context.highRiskCases.length).toBeGreaterThan(0);
      expect(context.highRiskCases.some(c => c.caseId === 'tc-high-risk')).toBe(true);
    });

    it('连续通过的用例应被标记为稳定', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 创建一个稳定用例
      db.execute(`
        INSERT INTO case_statistics (id, case_id, project, platform, total_runs, pass_count, fail_count,
          consecutive_passes, consecutive_failures, last_result, last_run_time, pass_rate, stability_score, is_stable, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cs-004', 'tc-stable', project, platform, 30, 30, 0, 30, 0, 'passed', '2024-01-01T10:30:00Z', 1.0, 1.0, 1, '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z']);

      const context = repository.loadHistoricalContext(project, platform);

      // 验证稳定用例列表
      expect(context.stableCases.length).toBeGreaterThan(0);
      expect(context.stableCases.some(c => c.caseId === 'tc-stable')).toBe(true);
    });
  });

  describe('用例统计更新', () => {
    it('执行后应更新用例统计数据', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 创建初始统计数据
      db.execute(`
        INSERT INTO case_statistics (id, case_id, project, platform, total_runs, pass_count, fail_count,
          consecutive_passes, consecutive_failures, last_result, last_run_time, pass_rate, stability_score, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['cs-005', 'tc-test-001', project, platform, 5, 3, 2, 1, 0, 'passed', '2024-01-01T10:00:00Z', 0.6, 0.5, '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z']);

      // 更新统计 - 模拟一次新的失败
      repository.updateCaseStatistics('tc-test-001', project, platform, 'failed', 1500);

      // 查询更新后的数据
      const rows = db.query<{ total_runs: number; fail_count: number; consecutive_failures: number }>(
        'SELECT total_runs, fail_count, consecutive_failures FROM case_statistics WHERE case_id = ?',
        ['tc-test-001']
      );

      expect(rows[0]?.total_runs).toBe(6);
      expect(rows[0]?.fail_count).toBe(3);
      expect(rows[0]?.consecutive_failures).toBe(1);
    });
  });

  describe('优化建议闭环', () => {
    it('优化建议可回写且下次可读取', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 保存优化建议
      const suggestionId = repository.saveOptimizationSuggestion({
        project,
        platform,
        caseId: 'tc-slow-001',
        suggestionType: 'adjust-wait',
        suggestionValue: '500',
        reason: '用例执行超时，建议减少等待时间',
        confidence: 0.9,
        autoApplicable: true,
      });

      expect(suggestionId).toBeDefined();

      // 加载历史上下文验证建议存在
      const context = repository.loadHistoricalContext(project, platform);

      expect(context.optimizationSuggestions.length).toBeGreaterThan(0);
      expect(context.optimizationSuggestions.some(s => s.caseId === 'tc-slow-001')).toBe(true);
    });

    it('高置信度自动应用建议应被标记', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 保存一个高置信度建议
      const suggestionId = repository.saveOptimizationSuggestion({
        project,
        platform,
        caseId: 'tc-auto-001',
        suggestionType: 'increase-timeout',
        suggestionValue: '30000',
        reason: '用例超时失败，建议增加超时时间',
        confidence: 0.92,
        autoApplicable: true,
      });

      // 标记为已应用
      repository.markOptimizationApplied(suggestionId, 0.85);

      // 验证标记成功
      const rows = db.query<{ applied: number; effectiveness_score: number }>(
        'SELECT applied, effectiveness_score FROM auto_optimization_suggestions WHERE id = ?',
        [suggestionId]
      );

      expect(rows[0]?.applied).toBe(1);
      expect(rows[0]?.effectiveness_score).toBe(0.85);
    });
  });

  describe('失败模式记录', () => {
    it('失败模式应可记录和查询', async () => {
      const project = 'test-project';
      const platform: Platform = 'pc-web';

      // 先插入一个失败模式 - pattern_key 需要与 extractPatternKey 方法的输出匹配
      db.execute(`
        INSERT INTO failure_patterns (id, pattern_type, pattern_key, description, frequency, platform, last_occurrence, first_occurrence, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['fp-001', 'element-not-found', '元素 #button 未找到', '元素未找到', 1, platform, '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

      // 匹配失败模式
      const match = repository.matchFailurePattern(
        'element-not-found',
        '元素 #button 未找到',
        platform
      );

      // 验证失败模式被匹配
      expect(match).toBeDefined();
      expect(match?.patternType).toBe('element-not-found');
    });
  });

  describe('元素映射持久化', () => {
    it('元素映射应可保存和恢复', async () => {
      // 保存元素映射
      db.execute(`
        INSERT INTO element_mappings (id, project, platform, page_url, element_name,
          original_selector, alternative_selectors, last_working_selector, selector_type,
          success_count, failure_count, success_rate, ai_suggested, created, updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, ['map-001', 'test-project', 'pc-web', '/login', '登录按钮',
        '#login-btn', JSON.stringify(['.btn-login', '[data-testid="login"]']), '.btn-login',
        'css', 5, 1, 0.83, 0, '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

      // 查询映射
      const rows = db.query<{ original_selector: string; last_working_selector: string }>(
        'SELECT original_selector, last_working_selector FROM element_mappings WHERE id = ?',
        ['map-001']
      );

      expect(rows[0]?.original_selector).toBe('#login-btn');
      expect(rows[0]?.last_working_selector).toBe('.btn-login');
    });
  });
});

describe('历史上下文传递', () => {
  let db: KnowledgeDatabase;
  let repository: KnowledgeRepository;

  beforeEach(async () => {
    db = new KnowledgeDatabase({ dbPath: ':memory:' });
    await db.initialize();
    repository = new KnowledgeRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it('历史失败上下文应包含失败原因', async () => {
    const project = 'test-project';
    const platform: Platform = 'pc-web';

    // 创建失败记录
    const runId = 'run-fail-001';
    db.execute(`
      INSERT INTO test_runs (id, project, platform, test_type, start_time, end_time, duration_ms,
        total_cases, passed, failed, skipped, blocked, pass_rate, status, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [runId, project, platform, 'full', '2024-01-01T10:00:00Z', '2024-01-01T10:30:00Z',
      1800000, 1, 0, 1, 0, 0, 0, 'completed', '2024-01-01T10:00:00Z']);

    db.execute(`
      INSERT INTO test_results (id, run_id, case_id, case_name, platform, status, priority,
        duration_ms, retry_count, error_message, ai_error_analysis, start_time, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['res-fail-001', runId, 'tc-fail-001', '失败用例', platform, 'failed', 'P1',
      2000, 2, '超时：元素未在指定时间内出现', '建议增加等待时间', '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

    // 加载历史上下文
    const context = repository.loadHistoricalContext(project, platform);

    // 验证失败用例信息
    expect(context.previousFailedCases.length).toBeGreaterThan(0);
    const failedCase = context.previousFailedCases[0];
    if (failedCase) {
      expect(failedCase.failureReason).toBeDefined();
    }
  });

  it('历史覆盖薄弱区域应被识别', async () => {
    const project = 'test-project';
    const platform: Platform = 'pc-web';

    // 创建覆盖薄弱区域记录
    db.execute(`
      INSERT INTO coverage_weak_areas (id, project, platform, url_pattern, feature_area,
        coverage_rate, visit_count, last_visit_time, created)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, ['weak-001', project, platform, '/settings', '设置页面', 0.2, 2, '2024-01-01T10:00:00Z', '2024-01-01T10:00:00Z']);

    // 加载历史上下文
    const context = repository.loadHistoricalContext(project, platform);

    // 验证薄弱区域被识别
    expect(context.weakCoverageAreas.length).toBeGreaterThan(0);
    expect(context.weakCoverageAreas.some(f => f.featureArea === '设置页面')).toBe(true);
  });
});
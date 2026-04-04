/**
 * 测试夹具 - 数据库
 * 提供内存数据库用于测试
 */

import { KnowledgeDatabase } from '@/knowledge/db/index.js';
import type { DatabaseConfig } from '@/knowledge/db/index.js';

/**
 * 创建测试用内存数据库
 */
export async function createTestDatabase(): Promise<KnowledgeDatabase> {
  const db = new KnowledgeDatabase({ dbPath: ':memory:' });
  await db.initialize();
  return db;
}

/**
 * 创建临时文件数据库（用于测试持久化）
 */
export async function createTempDatabase(tempPath: string): Promise<KnowledgeDatabase> {
  const db = new KnowledgeDatabase({ dbPath: tempPath });
  await db.initialize();
  return db;
}

/**
 * 填充测试数据
 */
export async function seedTestData(db: KnowledgeDatabase): Promise<void> {
  const now = new Date().toISOString();

  // 插入测试运行记录
  db.execute(`
    INSERT INTO test_runs (
      id, project, platform, test_type, start_time, end_time,
      duration_ms, total_cases, passed, failed, skipped, blocked,
      pass_rate, status, created
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'run-001', 'test-project', 'pc-web', 'smoke',
    now, now, 5000, 10, 8, 2, 0, 0, 0.8, 'completed', now
  ]);

  // 插入测试用例结果
  const testCases = [
    { id: 'tc-001', name: '登录测试', status: 'passed' },
    { id: 'tc-002', name: '搜索测试', status: 'passed' },
    { id: 'tc-003', name: '下单测试', status: 'failed', errorMsg: '元素未找到' },
  ];

  for (const tc of testCases) {
    db.execute(`
      INSERT INTO test_results (
        id, run_id, case_id, case_name, platform, status,
        start_time, end_time, duration_ms, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      `run-001-${tc.id}`, 'run-001', tc.id, tc.name, 'pc-web',
      tc.status, now, now, 1000, tc.errorMsg ?? null
    ]);
  }

  // 插入用例统计
  db.execute(`
    INSERT INTO case_statistics (
      id, case_id, project, platform, total_runs, pass_count, fail_count,
      skip_count, pass_rate, consecutive_passes, consecutive_failures,
      stability_score, is_stable, last_run_time, last_result,
      avg_duration_ms, created, updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'stat-001', 'tc-001', 'test-project', 'pc-web',
    10, 8, 2, 0, 0.8, 3, 0, 0.7, 0, now, 'passed', 1000, now, now
  ]);

  // 插入失败模式
  db.execute(`
    INSERT INTO failure_patterns (
      id, pattern_type, pattern_key, platform, description,
      frequency, last_occurrence, first_occurrence, ai_analyzed, created, updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'fp-001', 'element_not_found', 'btn-submit', 'pc-web',
    '提交按钮未找到', 5, now, now, 0, now, now
  ]);

  // 插入元素映射
  db.execute(`
    INSERT INTO element_mappings (
      id, project, platform, page_url, element_name, original_selector,
      alternative_selectors, last_working_selector, success_count, failure_count,
      ai_suggested, created, updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'em-001', 'test-project', 'pc-web', '/login', '登录按钮',
    '#login-btn', '["button[type=submit]", ".login-btn"]',
    '#login-btn', 10, 2, 0, now, now
  ]);
}
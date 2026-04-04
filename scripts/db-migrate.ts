#!/usr/bin/env tsx
/**
 * 数据库迁移脚本
 * 用于将旧的 knowledge.db 迁移到新的 db/sqlite.db
 * 并创建增强的表结构（支持平台分类存储）
 */

import path from 'node:path';
import fs from 'node:fs/promises';
import Database from 'better-sqlite3';
import { logger } from '@/core/logger.js';

const OLD_DB_PATH = './data/knowledge/knowledge.db';
const NEW_DB_PATH = './db/sqlite.db';

async function main(): Promise<void> {
  console.log('🔄 开始数据库迁移...\n');

  // 1. 检查旧数据库是否存在
  const oldDbExists = await checkFileExists(OLD_DB_PATH);
  const newDbExists = await checkFileExists(NEW_DB_PATH);

  console.log(`旧数据库 (${OLD_DB_PATH}): ${oldDbExists ? '存在' : '不存在'}`);
  console.log(`新数据库 (${NEW_DB_PATH}): ${newDbExists ? '存在' : '不存在'}\n`);

  // 2. 确保新数据库目录存在
  await fs.mkdir(path.dirname(NEW_DB_PATH), { recursive: true });

  // 3. 创建或更新新数据库
  const newDb = new Database(NEW_DB_PATH);

  // 创建增强的表结构
  createEnhancedTables(newDb);

  // 4. 如果旧数据库存在，迁移数据
  if (oldDbExists) {
    console.log('\n📦 开始迁移旧数据...');
    const oldDb = new Database(OLD_DB_PATH);

    try {
      migrateTestData(oldDb, newDb);
      migrateElementMappings(oldDb, newDb);
      migrateFailurePatterns(oldDb, newDb);
      migrateOptimizations(oldDb, newDb);
      migrateBestPractices(oldDb, newDb);

      console.log('✅ 数据迁移完成\n');
    } catch (error) {
      console.error('❌ 数据迁移失败:', error);
      console.log('新数据库已创建，但旧数据未能迁移');
    } finally {
      oldDb.close();
    }
  }

  // 5. 显示新数据库统计
  showStats(newDb);

  newDb.close();

  console.log('\n🎉 迁移完成！');
  console.log(`新数据库位置: ${NEW_DB_PATH}`);
  console.log('\n提示: 如果迁移成功，可以删除旧数据库文件:');
  console.log(`  rm ${OLD_DB_PATH}`);
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function createEnhancedTables(db: Database.Database): void {
  console.log('📋 创建增强表结构...');

  db.exec(`
    -- 测试运行记录表（增强版）
    CREATE TABLE IF NOT EXISTS test_runs (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'pc-web',
      test_type TEXT DEFAULT 'full',
      start_time TEXT NOT NULL,
      end_time TEXT,
      duration_ms INTEGER DEFAULT 0,
      total_cases INTEGER DEFAULT 0,
      passed INTEGER DEFAULT 0,
      failed INTEGER DEFAULT 0,
      skipped INTEGER DEFAULT 0,
      blocked INTEGER DEFAULT 0,
      pass_rate REAL DEFAULT 0,
      status TEXT DEFAULT 'running',
      browser TEXT,
      browser_version TEXT,
      device TEXT,
      os TEXT,
      os_version TEXT,
      viewport_width INTEGER,
      viewport_height INTEGER,
      app_version TEXT,
      app_package TEXT,
      config_json TEXT,
      ai_analysis TEXT,
      risk_level TEXT,
      created TEXT NOT NULL
    );

    -- 测试用例结果表（增强版）
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      case_name TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'pc-web',
      test_category TEXT DEFAULT 'functional',
      status TEXT NOT NULL,
      priority TEXT DEFAULT 'P2',
      duration_ms INTEGER DEFAULT 0,
      retry_count INTEGER DEFAULT 0,
      error_message TEXT,
      error_stack TEXT,
      error_screenshot TEXT,
      error_video TEXT,
      ai_error_analysis TEXT,
      start_time TEXT NOT NULL,
      end_time TEXT,
      self_healed INTEGER DEFAULT 0,
      self_heal_selector TEXT,
      embedding BLOB,
      FOREIGN KEY (run_id) REFERENCES test_runs(id)
    );

    -- 测试步骤结果表
    CREATE TABLE IF NOT EXISTS test_step_results (
      id TEXT PRIMARY KEY,
      result_id TEXT NOT NULL,
      step_order INTEGER NOT NULL,
      action TEXT NOT NULL,
      target TEXT,
      value TEXT,
      status TEXT NOT NULL,
      duration_ms INTEGER DEFAULT 0,
      error_message TEXT,
      screenshot TEXT,
      created TEXT NOT NULL,
      FOREIGN KEY (result_id) REFERENCES test_results(id)
    );

    -- 元素定位映射表（增强版）
    CREATE TABLE IF NOT EXISTS element_mappings (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'pc-web',
      page_url TEXT NOT NULL,
      page_name TEXT,
      element_name TEXT,
      element_description TEXT,
      original_selector TEXT NOT NULL,
      alternative_selectors TEXT,
      last_working_selector TEXT,
      selector_type TEXT DEFAULT 'css',
      success_count INTEGER DEFAULT 0,
      failure_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0,
      last_success TEXT,
      last_failure TEXT,
      ai_suggested INTEGER DEFAULT 0,
      embedding BLOB,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    -- 失败模式库表（增强版）
    CREATE TABLE IF NOT EXISTS failure_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern_key TEXT NOT NULL,
      platform TEXT,
      description TEXT,
      frequency INTEGER DEFAULT 1,
      last_occurrence TEXT NOT NULL,
      first_occurrence TEXT NOT NULL,
      root_cause TEXT,
      solution TEXT,
      solution_steps TEXT,
      ai_analyzed INTEGER DEFAULT 0,
      auto_fixable INTEGER DEFAULT 0,
      auto_fix_config TEXT,
      resolved_count INTEGER DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE(pattern_type, pattern_key, platform)
    );

    -- 优化历史表（增强版）
    CREATE TABLE IF NOT EXISTS optimization_history (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT,
      optimization_type TEXT NOT NULL,
      case_id TEXT,
      before_value TEXT,
      after_value TEXT,
      improvement REAL DEFAULT 0,
      reason TEXT,
      ai_generated INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      applied_time TEXT,
      created TEXT NOT NULL
    );

    -- 最佳实践表（增强版）
    CREATE TABLE IF NOT EXISTS best_practices (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      platform TEXT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      example TEXT,
      tags TEXT,
      confidence REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      success_rate REAL DEFAULT 0,
      embedding BLOB,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    -- 测试覆盖率统计表
    CREATE TABLE IF NOT EXISTS test_coverage (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      coverage_date TEXT NOT NULL,
      total_features INTEGER DEFAULT 0,
      covered_features INTEGER DEFAULT 0,
      feature_coverage_rate REAL DEFAULT 0,
      total_pages INTEGER DEFAULT 0,
      covered_pages INTEGER DEFAULT 0,
      page_coverage_rate REAL DEFAULT 0,
      total_apis INTEGER DEFAULT 0,
      covered_apis INTEGER DEFAULT 0,
      api_coverage_rate REAL DEFAULT 0,
      uncovered_items TEXT,
      created TEXT NOT NULL,
      UNIQUE(project, platform, coverage_date)
    );

    -- 覆盖薄弱区域表
    CREATE TABLE IF NOT EXISTS coverage_weak_areas (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT,
      url_pattern TEXT NOT NULL,
      feature_area TEXT NOT NULL,
      coverage_rate REAL DEFAULT 0,
      visit_count INTEGER DEFAULT 0,
      last_visit_time TEXT,
      created TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_coverage_weak_areas_project ON coverage_weak_areas(project);
    CREATE INDEX IF NOT EXISTS idx_coverage_weak_areas_platform ON coverage_weak_areas(platform);

    -- AI 交互记录表
    CREATE TABLE IF NOT EXISTS ai_interactions (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT,
      interaction_type TEXT NOT NULL,
      prompt_summary TEXT,
      input_data TEXT,
      output_data TEXT,
      model_used TEXT,
      tokens_used INTEGER DEFAULT 0,
      duration_ms INTEGER DEFAULT 0,
      success INTEGER DEFAULT 1,
      error_message TEXT,
      created TEXT NOT NULL
    );

    -- ===== 新增：智能化升级所需表 =====

    -- 用例历史统计表
    CREATE TABLE IF NOT EXISTS case_statistics (
      id TEXT PRIMARY KEY,
      case_id TEXT NOT NULL,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      total_runs INTEGER DEFAULT 0,
      pass_count INTEGER DEFAULT 0,
      fail_count INTEGER DEFAULT 0,
      skip_count INTEGER DEFAULT 0,
      pass_rate REAL DEFAULT 0,
      consecutive_passes INTEGER DEFAULT 0,
      consecutive_failures INTEGER DEFAULT 0,
      stability_score REAL DEFAULT 0,
      is_stable INTEGER DEFAULT 0,
      last_run_time TEXT,
      last_result TEXT,
      avg_duration_ms INTEGER DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE(case_id, project, platform)
    );

    -- 调度决策记录表
    CREATE TABLE IF NOT EXISTS scheduler_decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      risk_score REAL DEFAULT 0,
      priority TEXT DEFAULT 'P2',
      scheduled_order INTEGER DEFAULT 0,
      skip_decision INTEGER DEFAULT 0,
      skip_reason TEXT,
      historical_pass_rate REAL DEFAULT 0,
      last_status TEXT,
      created TEXT NOT NULL
    );

    -- RAG 长期记忆表
    CREATE TABLE IF NOT EXISTS rag_memories (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT,
      memory_type TEXT NOT NULL,
      context_url TEXT,
      context_package TEXT,
      dom_summary TEXT,
      view_summary TEXT,
      execution_result TEXT NOT NULL,
      solution_strategy TEXT,
      solution_steps TEXT,
      related_screenshots TEXT,
      related_logs TEXT,
      embedding BLOB,
      confidence REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      success_count INTEGER DEFAULT 0,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    -- 业务流结构表
    CREATE TABLE IF NOT EXISTS business_flows (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      flow_name TEXT NOT NULL,
      flow_description TEXT,
      entry_url TEXT,
      entry_activity TEXT,
      steps_json TEXT NOT NULL,
      page_dependencies TEXT,
      critical_path INTEGER DEFAULT 0,
      confidence REAL DEFAULT 0,
      usage_count INTEGER DEFAULT 0,
      last_used TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL
    );

    -- 状态图谱节点表
    CREATE TABLE IF NOT EXISTS state_graph_nodes (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      state_hash TEXT NOT NULL,
      state_name TEXT,
      state_type TEXT,
      url_pattern TEXT,
      activity_name TEXT,
      view_hierarchy_hash TEXT,
      key_elements TEXT,
      screenshot_path TEXT,
      visit_count INTEGER DEFAULT 1,
      last_visit TEXT,
      created TEXT NOT NULL,
      UNIQUE(state_hash, project, platform)
    );

    -- 状态图谱边表
    CREATE TABLE IF NOT EXISTS state_graph_edges (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      source_state_hash TEXT NOT NULL,
      target_state_hash TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_target TEXT,
      action_value TEXT,
      transition_count INTEGER DEFAULT 1,
      success_count INTEGER DEFAULT 1,
      failure_count INTEGER DEFAULT 0,
      last_transition TEXT,
      created TEXT NOT NULL
    );

    -- 视觉回归基线表
    CREATE TABLE IF NOT EXISTS visual_baselines (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT NOT NULL,
      page_url TEXT NOT NULL,
      page_name TEXT,
      viewport_width INTEGER,
      viewport_height INTEGER,
      browser TEXT,
      device TEXT,
      baseline_image_path TEXT NOT NULL,
      baseline_hash TEXT,
      created TEXT NOT NULL,
      updated TEXT NOT NULL,
      UNIQUE(project, platform, page_url, viewport_width, viewport_height, browser, device)
    );

    -- 视觉对比结果表
    CREATE TABLE IF NOT EXISTS visual_diffs (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      baseline_id TEXT NOT NULL,
      current_image_path TEXT NOT NULL,
      diff_image_path TEXT,
      diff_percentage REAL DEFAULT 0,
      diff_pixels INTEGER DEFAULT 0,
      diff_areas TEXT,
      threshold REAL DEFAULT 0,
      passed INTEGER DEFAULT 0,
      created TEXT NOT NULL,
      FOREIGN KEY (baseline_id) REFERENCES visual_baselines(id)
    );

    -- 自动优化建议表
    CREATE TABLE IF NOT EXISTS auto_optimization_suggestions (
      id TEXT PRIMARY KEY,
      project TEXT NOT NULL,
      platform TEXT,
      case_id TEXT,
      suggestion_type TEXT NOT NULL,
      suggestion_value TEXT,
      reason TEXT,
      confidence REAL DEFAULT 0,
      auto_applicable INTEGER DEFAULT 0,
      applied INTEGER DEFAULT 0,
      applied_time TEXT,
      effectiveness_score REAL,
      created TEXT NOT NULL
    );

    -- ===== 创建索引 =====

    -- 原有索引
    CREATE INDEX IF NOT EXISTS idx_test_runs_project ON test_runs(project);
    CREATE INDEX IF NOT EXISTS idx_test_runs_platform ON test_runs(platform);
    CREATE INDEX IF NOT EXISTS idx_test_runs_start_time ON test_runs(start_time);
    CREATE INDEX IF NOT EXISTS idx_test_runs_status ON test_runs(status);
    CREATE INDEX IF NOT EXISTS idx_test_results_run_id ON test_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_test_results_case_id ON test_results(case_id);
    CREATE INDEX IF NOT EXISTS idx_test_results_platform ON test_results(platform);
    CREATE INDEX IF NOT EXISTS idx_test_results_status ON test_results(status);
    CREATE INDEX IF NOT EXISTS idx_test_results_category ON test_results(test_category);
    CREATE INDEX IF NOT EXISTS idx_test_step_results_result ON test_step_results(result_id);
    CREATE INDEX IF NOT EXISTS idx_element_mappings_project ON element_mappings(project);
    CREATE INDEX IF NOT EXISTS idx_element_mappings_platform ON element_mappings(platform);
    CREATE INDEX IF NOT EXISTS idx_element_mappings_original ON element_mappings(original_selector);
    CREATE INDEX IF NOT EXISTS idx_failure_patterns_type ON failure_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_failure_patterns_platform ON failure_patterns(platform);
    CREATE INDEX IF NOT EXISTS idx_optimization_history_project ON optimization_history(project);
    CREATE INDEX IF NOT EXISTS idx_optimization_history_platform ON optimization_history(platform);
    CREATE INDEX IF NOT EXISTS idx_best_practices_category ON best_practices(category);
    CREATE INDEX IF NOT EXISTS idx_best_practices_platform ON best_practices(platform);
    CREATE INDEX IF NOT EXISTS idx_test_coverage_project ON test_coverage(project);
    CREATE INDEX IF NOT EXISTS idx_test_coverage_platform ON test_coverage(platform);
    CREATE INDEX IF NOT EXISTS idx_ai_interactions_project ON ai_interactions(project);
    CREATE INDEX IF NOT EXISTS idx_ai_interactions_type ON ai_interactions(interaction_type);

    -- 新增索引
    CREATE INDEX IF NOT EXISTS idx_case_statistics_case_id ON case_statistics(case_id);
    CREATE INDEX IF NOT EXISTS idx_case_statistics_project ON case_statistics(project);
    CREATE INDEX IF NOT EXISTS idx_case_statistics_platform ON case_statistics(platform);
    CREATE INDEX IF NOT EXISTS idx_case_statistics_stable ON case_statistics(is_stable);
    CREATE INDEX IF NOT EXISTS idx_scheduler_decisions_run_id ON scheduler_decisions(run_id);
    CREATE INDEX IF NOT EXISTS idx_scheduler_decisions_case_id ON scheduler_decisions(case_id);
    CREATE INDEX IF NOT EXISTS idx_rag_memories_project ON rag_memories(project);
    CREATE INDEX IF NOT EXISTS idx_rag_memories_type ON rag_memories(memory_type);
    CREATE INDEX IF NOT EXISTS idx_business_flows_project ON business_flows(project);
    CREATE INDEX IF NOT EXISTS idx_business_flows_platform ON business_flows(platform);
    CREATE INDEX IF NOT EXISTS idx_state_graph_nodes_project ON state_graph_nodes(project);
    CREATE INDEX IF NOT EXISTS idx_state_graph_nodes_hash ON state_graph_nodes(state_hash);
    CREATE INDEX IF NOT EXISTS idx_state_graph_edges_source ON state_graph_edges(source_state_hash);
    CREATE INDEX IF NOT EXISTS idx_state_graph_edges_target ON state_graph_edges(target_state_hash);
    CREATE INDEX IF NOT EXISTS idx_visual_baselines_project ON visual_baselines(project);
    CREATE INDEX IF NOT EXISTS idx_visual_baselines_url ON visual_baselines(page_url);
    CREATE INDEX IF NOT EXISTS idx_visual_diffs_run_id ON visual_diffs(run_id);
    CREATE INDEX IF NOT EXISTS idx_auto_optimization_project ON auto_optimization_suggestions(project);
    CREATE INDEX IF NOT EXISTS idx_auto_optimization_case ON auto_optimization_suggestions(case_id);
  `);

  console.log('✅ 表结构创建完成');
}

function migrateTestData(oldDb: Database.Database, newDb: Database.Database): void {
  // 迁移 test_runs
  try {
    const runs = oldDb.prepare('SELECT * FROM test_runs').all() as Array<Record<string, unknown>>;
    if (runs.length > 0) {
      console.log(`  迁移 ${runs.length} 条测试运行记录...`);
      for (const run of runs) {
        // 添加新字段默认值
        const newRun = {
          ...run,
          platform: run.platform ?? 'pc-web',
          test_type: 'full',
        };
        insertRun(newDb, newRun);
      }
    }
  } catch {
    console.log('  test_runs 表不存在或为空');
  }

  // 迁移 test_results
  try {
    const results = oldDb.prepare('SELECT * FROM test_results').all() as Array<Record<string, unknown>>;
    if (results.length > 0) {
      console.log(`  迁移 ${results.length} 条测试结果...`);
      for (const result of results) {
        const newResult = {
          ...result,
          platform: 'pc-web',
          test_category: 'functional',
          priority: 'P2',
          retry_count: 0,
        };
        insertResult(newDb, newResult);
      }
    }
  } catch {
    console.log('  test_results 表不存在或为空');
  }
}

function insertRun(db: Database.Database, run: Record<string, unknown>): void {
  db.prepare(`
    INSERT OR REPLACE INTO test_runs (
      id, project, platform, test_type, start_time, end_time,
      duration_ms, total_cases, passed, failed, skipped, blocked,
      pass_rate, status, config_json, created
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    run.id,
    run.project,
    run.platform ?? 'pc-web',
    'full',
    run.start_time,
    run.end_time,
    run.duration_ms ?? 0,
    run.total_cases ?? 0,
    run.passed ?? 0,
    run.failed ?? 0,
    run.skipped ?? 0,
    run.blocked ?? 0,
    run.pass_rate ?? 0,
    run.status ?? 'completed',
    run.config_json,
    run.created
  );
}

function insertResult(db: Database.Database, result: Record<string, unknown>): void {
  db.prepare(`
    INSERT OR REPLACE INTO test_results (
      id, run_id, case_id, case_name, platform, test_category,
      status, priority, duration_ms, retry_count, error_message,
      error_stack, error_screenshot, error_video, start_time,
      end_time, self_healed, self_heal_selector
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    result.id,
    result.run_id,
    result.case_id,
    result.case_name,
    'pc-web',
    'functional',
    result.status,
    'P2',
    result.duration_ms ?? 0,
    0,
    result.error_message,
    result.error_stack,
    result.screenshot ?? result.error_screenshot,
    result.video ?? result.error_video,
    result.start_time,
    result.end_time,
    result.self_healed ?? 0,
    result.self_heal_selector
  );
}

function migrateElementMappings(oldDb: Database.Database, newDb: Database.Database): void {
  try {
    const mappings = oldDb.prepare('SELECT * FROM element_mappings').all() as Array<Record<string, unknown>>;
    if (mappings.length > 0) {
      console.log(`  迁移 ${mappings.length} 条元素映射...`);
      for (const mapping of mappings) {
        newDb.prepare(`
          INSERT OR REPLACE INTO element_mappings (
            id, project, platform, page_url, element_name,
            original_selector, alternative_selectors, last_working_selector,
            success_count, failure_count, last_success, last_failure,
            ai_suggested, created, updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          mapping.id,
          mapping.project,
          'pc-web',  // 默认平台
          mapping.page_url,
          mapping.element_name,
          mapping.original_selector,
          mapping.alternative_selectors,
          mapping.last_working_selector,
          mapping.success_count ?? 0,
          mapping.failure_count ?? 0,
          mapping.last_success,
          mapping.last_failure,
          mapping.ai_suggested ?? 0,
          mapping.created,
          mapping.updated
        );
      }
    }
  } catch {
    console.log('  element_mappings 表不存在或为空');
  }
}

function migrateFailurePatterns(oldDb: Database.Database, newDb: Database.Database): void {
  try {
    const patterns = oldDb.prepare('SELECT * FROM failure_patterns').all() as Array<Record<string, unknown>>;
    if (patterns.length > 0) {
      console.log(`  迁移 ${patterns.length} 条失败模式...`);
      for (const pattern of patterns) {
        newDb.prepare(`
          INSERT OR REPLACE INTO failure_patterns (
            id, pattern_type, pattern_key, platform, description,
            frequency, last_occurrence, first_occurrence, root_cause,
            solution, ai_analyzed, created, updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          pattern.id,
          pattern.pattern_type,
          pattern.pattern_key,
          null,  // 旧数据没有平台分类
          pattern.description,
          pattern.frequency ?? 1,
          pattern.last_occurrence,
          pattern.first_occurrence,
          pattern.root_cause,
          pattern.solution,
          pattern.ai_analyzed ?? 0,
          pattern.created,
          pattern.updated
        );
      }
    }
  } catch {
    console.log('  failure_patterns 表不存在或为空');
  }
}

function migrateOptimizations(oldDb: Database.Database, newDb: Database.Database): void {
  try {
    const optimizations = oldDb.prepare('SELECT * FROM optimization_history').all() as Array<Record<string, unknown>>;
    if (optimizations.length > 0) {
      console.log(`  迁移 ${optimizations.length} 条优化历史...`);
      for (const opt of optimizations) {
        newDb.prepare(`
          INSERT OR REPLACE INTO optimization_history (
            id, project, platform, optimization_type, case_id,
            before_value, after_value, improvement, reason,
            ai_generated, applied, created
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          opt.id,
          opt.project,
          null,  // 旧数据没有平台分类
          opt.optimization_type,
          opt.case_id,
          opt.before_value,
          opt.after_value,
          opt.improvement ?? 0,
          opt.reason,
          opt.ai_generated ?? 0,
          opt.applied ?? 0,
          opt.created
        );
      }
    }
  } catch {
    console.log('  optimization_history 表不存在或为空');
  }
}

function migrateBestPractices(oldDb: Database.Database, newDb: Database.Database): void {
  try {
    const practices = oldDb.prepare('SELECT * FROM best_practices').all() as Array<Record<string, unknown>>;
    if (practices.length > 0) {
      console.log(`  迁移 ${practices.length} 条最佳实践...`);
      for (const practice of practices) {
        newDb.prepare(`
          INSERT OR REPLACE INTO best_practices (
            id, category, platform, title, description, example,
            tags, confidence, usage_count, created, updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          practice.id,
          practice.category,
          null,  // 旧数据没有平台分类
          practice.title,
          practice.description,
          practice.example,
          practice.tags,
          practice.confidence ?? 0,
          practice.usage_count ?? 0,
          practice.created,
          practice.updated
        );
      }
    }
  } catch {
    console.log('  best_practices 表不存在或为空');
  }
}

function showStats(db: Database.Database): void {
  console.log('\n📊 新数据库统计:');

  const tables = [
    'test_runs',
    'test_results',
    'test_step_results',
    'element_mappings',
    'failure_patterns',
    'optimization_history',
    'best_practices',
    'test_coverage',
    'ai_interactions',
  ];

  for (const table of tables) {
    try {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      console.log(`  ${table}: ${count.count} 条记录`);
    } catch {
      console.log(`  ${table}: 表不存在`);
    }
  }

  // 按平台统计
  try {
    const platformStats = db.prepare(`
      SELECT platform, COUNT(*) as count
      FROM test_runs
      GROUP BY platform
    `).all() as Array<{ platform: string; count: number }>;

    if (platformStats.length > 0) {
      console.log('\n按平台统计:');
      for (const stat of platformStats) {
        console.log(`  ${stat.platform}: ${stat.count} 次运行`);
      }
    }
  } catch {
    // 忽略错误
  }
}

// 执行迁移
main().catch(console.error);
/**
 * 失败模式库扩展 - 支持自动修复
 */

import { getDatabase, type KnowledgeDatabase } from './db/index.js';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type {
  FailurePatternType,
  AutoFixConfig,
  AutoFixResult,
} from '@/types/knowledge.types.js';

/**
 * 失败模式匹配结果
 */
export interface PatternMatchResult {
  matched: boolean;
  pattern: FailurePatternWithFix | null;
  confidence: number;
}

/**
 * 带自动修复配置的失败模式
 */
export interface FailurePatternWithFix {
  id: string;
  patternType: FailurePatternType;
  patternKey: string;
  description: string;
  frequency: number;
  lastOccurrence: string;
  firstOccurrence: string;
  rootCause: string | null;
  solution: string | null;
  autoFixConfig: AutoFixConfig | null;
  resolvedCount: number;
  /** 误报次数：匹配成功但修复失败的次数 */
  misfireCount: number;
  aiAnalyzed: boolean;
  created: string;
  updated: string;
}

/**
 * 内置规则定义
 */
interface BuiltInRule {
  patternType: FailurePatternType;
  keywords: string[];
  autoFixConfig: AutoFixConfig;
  description: string;
}

/**
 * 内置的失败处理规则
 */
const BUILT_IN_RULES: BuiltInRule[] = [
  {
    patternType: 'timeout',
    keywords: ['timeout', 'timed out', '超时', '等待超时'],
    autoFixConfig: {
      fixType: 'increase-timeout',
      fixValue: 1.5, // 增加 50%
      maxRetries: 2,
    },
    description: '执行超时，自动增加等待时间',
  },
  {
    patternType: 'element_not_found',
    keywords: ['element not found', 'no element', '元素未找到', '无法定位'],
    autoFixConfig: {
      fixType: 'add-wait',
      fixValue: 2000, // 等待 2 秒
      maxRetries: 3,
    },
    description: '元素未找到，增加等待时间后重试',
  },
  {
    patternType: 'network_error',
    keywords: ['network', 'ECONNREFUSED', 'ENOTFOUND', 'fetch failed', '网络错误'],
    autoFixConfig: {
      fixType: 'retry',
      fixValue: 3, // 重试 3 次
      maxRetries: 3,
    },
    description: '网络错误，使用指数退避重试',
  },
  {
    patternType: 'assertion_failed',
    keywords: ['assertion', 'assert failed', '断言失败', 'expected'],
    autoFixConfig: {
      fixType: 'skip', // 断言失败通常需要人工检查
      requireManualConfirm: true,
    },
    description: '断言失败，需要人工确认',
  },
  {
    patternType: 'permission_denied',
    keywords: ['permission', '权限', 'denied', 'unauthorized'],
    autoFixConfig: {
      fixType: 'skip',
      requireManualConfirm: true,
    },
    description: '权限问题，需要人工处理',
  },
];

/**
 * 失败模式库扩展类
 * 提供模式匹配和自动修复能力
 */
export class FailurePatternLibrary {
  private db: KnowledgeDatabase;

  constructor(database?: KnowledgeDatabase) {
    this.db = database ?? getDatabase();
  }

  /**
   * 匹配失败模式
   * 根据错误信息和上下文匹配已知模式
   */
  matchPattern(
    errorMessage: string,
    context?: {
      patternType?: FailurePatternType;
      selector?: string;
      url?: string;
    }
  ): PatternMatchResult {
    // 1. 首先尝试精确匹配（基于 patternKey）
    if (context?.patternType && context?.selector) {
      const patternKey = this.generatePatternKey(context.patternType, context.selector, context.url);
      const exactMatch = this.findByPatternKey(patternKey);
      if (exactMatch && exactMatch.frequency >= 1) {
        logger.info('🎯 精确匹配失败模式', { patternKey, frequency: exactMatch.frequency });
        return {
          matched: true,
          pattern: exactMatch,
          confidence: 0.95,
        };
      }
    }

    // 2. 尝试基于错误类型匹配
    if (context?.patternType) {
      const typePatterns = this.findByType(context.patternType);
      const highFreqPattern = typePatterns.find(p => p.frequency >= 3 && p.autoFixConfig);
      if (highFreqPattern) {
        logger.info('🎯 基于类型匹配高频失败模式', {
          patternType: context.patternType,
          frequency: highFreqPattern.frequency
        });
        return {
          matched: true,
          pattern: highFreqPattern,
          confidence: 0.85,
        };
      }
    }

    // 3. 尝试基于关键词匹配内置规则
    const builtInMatch = this.matchBuiltInRule(errorMessage);
    if (builtInMatch) {
      return {
        matched: true,
        pattern: builtInMatch,
        confidence: 0.75,
      };
    }

    return {
      matched: false,
      pattern: null,
      confidence: 0,
    };
  }

  /**
   * 匹配内置规则
   */
  private matchBuiltInRule(errorMessage: string): FailurePatternWithFix | null {
    const lowerMessage = errorMessage.toLowerCase();

    for (const rule of BUILT_IN_RULES) {
      const matched = rule.keywords.some(keyword =>
        lowerMessage.includes(keyword.toLowerCase())
      );

      if (matched) {
        // 创建临时模式对象（不持久化）
        return {
          id: `builtin-${rule.patternType}`,
          patternType: rule.patternType,
          patternKey: `builtin:${rule.patternType}`,
          description: rule.description,
          frequency: 0,
          lastOccurrence: new Date().toISOString(),
          firstOccurrence: new Date().toISOString(),
          rootCause: null,
          solution: null,
          autoFixConfig: rule.autoFixConfig,
          resolvedCount: 0,
          misfireCount: 0,
          aiAnalyzed: false,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        };
      }
    }

    return null;
  }

  /**
   * 添加或更新失败模式
   */
  addPattern(params: {
    patternType: FailurePatternType;
    patternKey: string;
    description: string;
    autoFixConfig?: AutoFixConfig;
    rootCause?: string;
    solution?: string;
  }): FailurePatternWithFix {
    const now = new Date().toISOString();

    // 查找现有模式
    const existing = this.findByPatternKey(params.patternKey);

    if (existing) {
      // 更新现有模式
      const existingConfig = existing.autoFixConfig;
      const newConfig = params.autoFixConfig
        ? JSON.stringify(params.autoFixConfig)
        : (existingConfig ? JSON.stringify(existingConfig) : null);

      this.db.execute(`
        UPDATE failure_patterns SET
          frequency = frequency + 1,
          last_occurrence = ?,
          description = ?,
          auto_fix_config = ?,
          updated = ?
        WHERE id = ?
      `, [
        now,
        params.description,
        newConfig,
        now,
        existing.id,
      ]);

      return {
        ...existing,
        frequency: existing.frequency + 1,
        lastOccurrence: now,
        description: params.description,
        autoFixConfig: params.autoFixConfig ?? existing.autoFixConfig,
        updated: now,
      };
    }

    // 创建新模式
    const id = nanoid(8);
    const pattern: FailurePatternWithFix = {
      id,
      patternType: params.patternType,
      patternKey: params.patternKey,
      description: params.description,
      frequency: 1,
      lastOccurrence: now,
      firstOccurrence: now,
      rootCause: params.rootCause ?? null,
      solution: params.solution ?? null,
      autoFixConfig: params.autoFixConfig ?? null,
      resolvedCount: 0,
      misfireCount: 0,
      aiAnalyzed: false,
      created: now,
      updated: now,
    };

    this.db.execute(`
      INSERT INTO failure_patterns (
        id, pattern_type, pattern_key, description, frequency,
        last_occurrence, first_occurrence, root_cause, solution,
        auto_fix_config, resolved_count, misfire_count, ai_analyzed, created, updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      pattern.id,
      pattern.patternType,
      pattern.patternKey,
      pattern.description,
      pattern.frequency,
      pattern.lastOccurrence,
      pattern.firstOccurrence,
      pattern.rootCause,
      pattern.solution,
      pattern.autoFixConfig ? JSON.stringify(pattern.autoFixConfig) : null,
      pattern.resolvedCount,
      pattern.misfireCount,
      pattern.aiAnalyzed ? 1 : 0,
      pattern.created,
      pattern.updated,
    ]);

    logger.step('📝 新增失败模式', { type: params.patternType, key: params.patternKey });
    return pattern;
  }

  /**
   * 增加模式频率
   */
  incrementFrequency(patternId: string): void {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE failure_patterns SET
        frequency = frequency + 1,
        last_occurrence = ?,
        updated = ?
      WHERE id = ?
    `, [now, now, patternId]);
  }

  /**
   * 应用自动修复
   */
  applyAutoFix(patternId: string): AutoFixResult {
    const pattern = this.findById(patternId);

    if (!pattern) {
      return {
        success: false,
        patternId,
        fixType: 'none',
        appliedFix: '模式不存在',
        retryCount: 0,
        errorMessage: 'Pattern not found',
        fixedAt: new Date().toISOString(),
      };
    }

    if (!pattern.autoFixConfig) {
      return {
        success: false,
        patternId,
        fixType: 'none',
        appliedFix: '无自动修复配置',
        retryCount: 0,
        errorMessage: 'No auto-fix config',
        fixedAt: new Date().toISOString(),
      };
    }

    const config = pattern.autoFixConfig;
    let appliedFix = '';

    switch (config.fixType) {
      case 'increase-timeout':
        appliedFix = `超时时间增加 ${(config.fixValue as number) * 100}%`;
        break;
      case 'add-wait':
        appliedFix = `增加等待时间 ${config.fixValue}ms`;
        break;
      case 'retry':
        appliedFix = `启用重试机制，最多 ${config.fixValue} 次`;
        break;
      case 'update-selector':
        appliedFix = `更新选择器: ${config.fixValue}`;
        break;
      case 'skip':
        appliedFix = '跳过此步骤';
        break;
      default:
        appliedFix = '自定义修复';
    }

    logger.info('🔧 应用自动修复', { patternId, fixType: config.fixType, appliedFix });

    return {
      success: true,
      patternId,
      fixType: config.fixType,
      appliedFix,
      retryCount: 0,
      newTimeout: config.fixType === 'increase-timeout' ? (config.fixValue as number) : undefined,
      fixedAt: new Date().toISOString(),
    };
  }

  /**
   * 记录修复成功
   */
  recordFixSuccess(patternId: string): void {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE failure_patterns SET
        resolved_count = resolved_count + 1,
        updated = ?
      WHERE id = ?
    `, [now, patternId]);

    logger.pass('✅ 记录修复成功', { patternId });
  }

  /**
   * 记录修复失败（误报）
   * 增加误报计数，用于后续清理低效模式
   */
  recordFixFailure(patternId: string, errorMessage: string): void {
    const now = new Date().toISOString();
    this.db.execute(`
      UPDATE failure_patterns SET
        misfire_count = misfire_count + 1,
        updated = ?
      WHERE id = ?
    `, [now, patternId]);

    logger.warn('⚠️ 自动修复失败（误报）', { patternId, error: errorMessage });
  }

  /**
   * 获取模式的有效性分数
   * 有效性 = 成功次数 / (成功次数 + 误报次数)
   */
  getPatternEffectiveness(patternId: string): number {
    const row = this.db.queryOne<{ resolved_count: number; misfire_count: number }>(
      'SELECT resolved_count, misfire_count FROM failure_patterns WHERE id = ?',
      [patternId]
    );

    if (!row) return 0;

    const total = row.resolved_count + row.misfire_count;
    if (total === 0) return 0.5; // 无数据时返回中性值

    return row.resolved_count / total;
  }

  /**
   * 清理低效模式（误报率高的模式）
   * @param minAttempts 最小尝试次数阈值
   * @param maxMisfireRate 最大允许误报率（0-1）
   * @returns 清理的模式数量
   */
  cleanupIneffectivePatterns(minAttempts: number = 3, maxMisfireRate: number = 0.7): number {
    // 查找低效模式：尝试次数 >= minAttempts 且误报率 > maxMisfireRate
    const ineffectivePatterns = this.db.query<{ id: string; pattern_key: string }>(`
      SELECT id, pattern_key FROM failure_patterns
      WHERE (resolved_count + misfire_count) >= ?
        AND misfire_count > 0
        AND (CAST(misfire_count AS REAL) / (resolved_count + misfire_count)) > ?
    `, [minAttempts, maxMisfireRate]);

    if (ineffectivePatterns.length === 0) {
      return 0;
    }

    // 删除低效模式
    for (const pattern of ineffectivePatterns) {
      this.db.execute('DELETE FROM failure_patterns WHERE id = ?', [pattern.id]);
      logger.info('🗑️ 清理低效失败模式', { patternId: pattern.id, patternKey: pattern.pattern_key });
    }

    logger.info(`🧹 已清理 ${ineffectivePatterns.length} 个低效失败模式`);
    return ineffectivePatterns.length;
  }

  /**
   * 获取高频模式
   */
  getTopPatterns(limit: number = 10): FailurePatternWithFix[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
      resolved_count: number;
      misfire_count: number;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      ORDER BY frequency DESC
      LIMIT ?
    `, [limit]);

    return rows.map(row => this.mapRowToPattern(row));
  }

  /**
   * 获取可自动修复的高频模式
   */
  getAutoFixablePatterns(minFrequency: number = 3): FailurePatternWithFix[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
      resolved_count: number;
      misfire_count: number;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      WHERE frequency >= ? AND auto_fix_config IS NOT NULL
      ORDER BY frequency DESC
    `, [minFrequency]);

    return rows.map(row => this.mapRowToPattern(row));
  }

  /**
   * 根据 ID 查找模式
   */
  findById(patternId: string): FailurePatternWithFix | null {
    const row = this.db.queryOne<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
      resolved_count: number;
      misfire_count: number;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>('SELECT * FROM failure_patterns WHERE id = ?', [patternId]);

    return row ? this.mapRowToPattern(row) : null;
  }

  /**
   * 根据 patternKey 查找模式
   */
  private findByPatternKey(patternKey: string): FailurePatternWithFix | null {
    const row = this.db.queryOne<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
      resolved_count: number;
      misfire_count: number;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>('SELECT * FROM failure_patterns WHERE pattern_key = ?', [patternKey]);

    return row ? this.mapRowToPattern(row) : null;
  }

  /**
   * 根据类型查找模式
   */
  private findByType(patternType: FailurePatternType): FailurePatternWithFix[] {
    const rows = this.db.query<{
      id: string;
      pattern_type: string;
      pattern_key: string;
      description: string;
      frequency: number;
      last_occurrence: string;
      first_occurrence: string;
      root_cause: string | null;
      solution: string | null;
      auto_fix_config: string | null;
      resolved_count: number;
      misfire_count: number;
      ai_analyzed: number;
      created: string;
      updated: string;
    }>(`
      SELECT * FROM failure_patterns
      WHERE pattern_type = ?
      ORDER BY frequency DESC
    `, [patternType]);

    return rows.map(row => this.mapRowToPattern(row));
  }

  /**
   * 生成模式键
   */
  private generatePatternKey(
    patternType: FailurePatternType,
    selector?: string,
    url?: string
  ): string {
    const parts: string[] = [patternType];
    if (selector) parts.push(selector);
    if (url) parts.push(url);
    return parts.join(':');
  }

  /**
   * 映射数据库行到模式对象
   */
  private mapRowToPattern(row: {
    id: string;
    pattern_type: string;
    pattern_key: string;
    description: string;
    frequency: number;
    last_occurrence: string;
    first_occurrence: string;
    root_cause: string | null;
    solution: string | null;
    auto_fix_config: string | null;
    resolved_count: number;
    misfire_count?: number;
    ai_analyzed: number;
    created: string;
    updated: string;
  }): FailurePatternWithFix {
    return {
      id: row.id,
      patternType: row.pattern_type as FailurePatternType,
      patternKey: row.pattern_key,
      description: row.description,
      frequency: row.frequency,
      lastOccurrence: row.last_occurrence,
      firstOccurrence: row.first_occurrence,
      rootCause: row.root_cause,
      solution: row.solution,
      autoFixConfig: row.auto_fix_config ? JSON.parse(row.auto_fix_config) as AutoFixConfig : null,
      resolvedCount: row.resolved_count,
      misfireCount: row.misfire_count ?? 0,
      aiAnalyzed: row.ai_analyzed === 1,
      created: row.created,
      updated: row.updated,
    };
  }
}

/**
 * 快捷函数：创建失败模式库实例
 */
export function createFailurePatternLibrary(db?: KnowledgeDatabase): FailurePatternLibrary {
  return new FailurePatternLibrary(db);
}
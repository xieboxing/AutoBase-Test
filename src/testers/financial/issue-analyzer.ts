/**
 * 问题分析器
 * 负责问题分级、置信度计算、去重和聚类
 */

import type {
  EnhancedInspectionIssue,
  InspectionIssue,
  IssueCluster,
  ConfidenceFactors,
  TestCasePriority,
  InspectionIssueType,
} from '@/types/financial.types.js';
import { logger } from '@/core/logger.js';

/**
 * 问题分析器配置
 */
export interface IssueAnalyzerConfig {
  /** 是否启用去重 */
  enableDeduplication: boolean;
  /** 置信度阈值 */
  confidenceThreshold: number;
  /** 严重级别阈值 */
  severityThreshold?: TestCasePriority;
  /** 忽略规则 */
  ignoreRules?: Array<{
    matchType: 'page' | 'element' | 'text' | 'issue-type';
    pattern: string;
    languages?: string[];
  }>;
}

/**
 * 问题分级规则
 */
const SEVERITY_RULES: Record<InspectionIssueType, {
  defaultSeverity: TestCasePriority;
  description: string;
  blockingLevel: 'critical' | 'major' | 'minor';
}> = {
  'page-blank': {
    defaultSeverity: 'P0',
    description: '页面空白，主流程阻断',
    blockingLevel: 'critical',
  },
  'critical-element-missing': {
    defaultSeverity: 'P0',
    description: '关键元素缺失，核心功能受影响',
    blockingLevel: 'critical',
  },
  'element-not-visible': {
    defaultSeverity: 'P1',
    description: '元素不可见，功能入口受阻',
    blockingLevel: 'major',
  },
  'button-blocked': {
    defaultSeverity: 'P1',
    description: '按钮被遮挡，影响操作',
    blockingLevel: 'major',
  },
  'untranslated-key': {
    defaultSeverity: 'P1',
    description: '未翻译的国际化 key',
    blockingLevel: 'minor',
  },
  'placeholder-unreplaced': {
    defaultSeverity: 'P1',
    description: '占位符未替换',
    blockingLevel: 'minor',
  },
  'garbled-text': {
    defaultSeverity: 'P1',
    description: '乱码或编码异常',
    blockingLevel: 'minor',
  },
  'content-missing': {
    defaultSeverity: 'P1',
    description: '内容缺失',
    blockingLevel: 'major',
  },
  'mixed-language': {
    defaultSeverity: 'P2',
    description: '中英文混杂',
    blockingLevel: 'minor',
  },
  'text-truncated': {
    defaultSeverity: 'P2',
    description: '文本截断',
    blockingLevel: 'minor',
  },
  'element-overlap': {
    defaultSeverity: 'P2',
    description: '元素重叠',
    blockingLevel: 'minor',
  },
  'layout-abnormal': {
    defaultSeverity: 'P2',
    description: '布局异常',
    blockingLevel: 'minor',
  },
  'spacing-abnormal': {
    defaultSeverity: 'P3',
    description: '间距异常',
    blockingLevel: 'minor',
  },
  'color-abnormal': {
    defaultSeverity: 'P3',
    description: '颜色异常',
    blockingLevel: 'minor',
  },
  'icon-missing': {
    defaultSeverity: 'P2',
    description: '图标缺失',
    blockingLevel: 'minor',
  },
};

/**
 * 问题分析器类
 */
export class IssueAnalyzer {
  private config: IssueAnalyzerConfig;

  constructor(config?: Partial<IssueAnalyzerConfig>) {
    this.config = {
      enableDeduplication: config?.enableDeduplication ?? true,
      confidenceThreshold: config?.confidenceThreshold ?? 0.5,
      severityThreshold: config?.severityThreshold,
      ignoreRules: config?.ignoreRules || [],
    };
  }

  /**
   * 增强问题（添加置信度、去重键等）
   */
  enhanceIssues(issues: InspectionIssue[]): EnhancedInspectionIssue[] {
    return issues.map(issue => this.enhanceIssue(issue));
  }

  /**
   * 增强单个问题
   */
  enhanceIssue(issue: InspectionIssue): EnhancedInspectionIssue {
    const confidenceFactors = this.calculateConfidenceFactors(issue);
    const confidence = this.calculateOverallConfidence(confidenceFactors);
    const confidenceReason = this.getConfidenceReason(confidenceFactors, confidence);
    const dedupeKey = this.generateDedupeKey(issue);
    const sourceType = this.determineSourceType(issue, confidenceFactors);

    return {
      ...issue,
      sourceType,
      confidenceFactors,
      confidenceReason,
      dedupeKey,
      confidence,
    };
  }

  /**
   * 计算置信度因素
   */
  calculateConfidenceFactors(issue: InspectionIssue): ConfidenceFactors {
    const factors: ConfidenceFactors = {
      visualEvidence: false,
      domEvidence: false,
      ocrEvidence: false,
      ruleMatch: true,
    };

    // 视觉证据：有截图
    factors.visualEvidence = !!issue.screenshotPath;

    // DOM 证据：有 page source 或元素信息
    factors.domEvidence = !!issue.pageSourcePath || !!issue.elementInfo;

    // OCR 证据：如果有 ocrInfo（扩展后会有）
    factors.ocrEvidence = false;

    return factors;
  }

  /**
   * 计算总体置信度
   */
  calculateOverallConfidence(factors: ConfidenceFactors): number {
    let confidence = 0.5; // 基础置信度

    // 规则匹配是最可靠的
    if (factors.ruleMatch) {
      confidence += 0.2;
    }

    // 有视觉证据
    if (factors.visualEvidence) {
      confidence += 0.15;
    }

    // 有 DOM 证据
    if (factors.domEvidence) {
      confidence += 0.15;
    }

    // 有 OCR 证据
    if (factors.ocrEvidence) {
      confidence += 0.1;
    }

    // AI 确认
    if (factors.aiAgreement !== undefined) {
      confidence = confidence * 0.7 + factors.aiAgreement * 0.3;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * 获取置信度原因说明
   */
  private getConfidenceReason(factors: ConfidenceFactors, confidence: number): string {
    const reasons: string[] = [];

    if (factors.ruleMatch) {
      reasons.push('规则引擎检测');
    }

    if (factors.visualEvidence) {
      reasons.push('有截图证据');
    }

    if (factors.domEvidence) {
      reasons.push('有 DOM 证据');
    }

    if (factors.ocrEvidence) {
      reasons.push('OCR 识别确认');
    }

    if (factors.aiAgreement !== undefined) {
      if (factors.aiAgreement > 0.8) {
        reasons.push('AI 高度确认');
      } else if (factors.aiAgreement > 0.5) {
        reasons.push('AI 部分确认');
      }
    }

    const level = confidence >= 0.8 ? '高' : confidence >= 0.6 ? '中' : '低';

    return `置信度${level}(${(confidence * 100).toFixed(0)}%): ${reasons.join(' + ')}`;
  }

  /**
   * 确定问题来源类型
   */
  private determineSourceType(
    issue: InspectionIssue,
    factors: ConfidenceFactors,
  ): EnhancedInspectionIssue['sourceType'] {
    const hasOcr = factors.ocrEvidence;
    const hasAi = factors.aiAgreement !== undefined;
    const hasRule = factors.ruleMatch;

    if (hasOcr && hasAi) return 'mixed';
    if (hasOcr) return 'ocr';
    if (hasAi) return 'ai';
    return 'rule';
  }

  /**
   * 生成去重键
   */
  generateDedupeKey(issue: InspectionIssue): string {
    // 去重键格式: 页面ID_语言_问题类型_元素标识
    const parts = [
      issue.pageName,
      issue.language,
      issue.type,
    ];

    // 如果有元素信息，添加元素标识
    if (issue.elementInfo?.locator) {
      parts.push(this.hashString(issue.elementInfo.locator));
    } else if (issue.elementInfo?.text) {
      parts.push(this.hashString(issue.elementInfo.text));
    }

    return parts.join('_');
  }

  /**
   * 简单字符串哈希
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * 去重
   */
  deduplicateIssues(issues: EnhancedInspectionIssue[]): IssueCluster[] {
    if (!this.config.enableDeduplication) {
      return issues.map(issue => ({
        representativeIssue: issue,
        duplicateCount: 0,
        affectedPages: [issue.pageName],
        affectedLanguages: [issue.language],
        allIssueIds: [issue.id],
      }));
    }

    const clusters = new Map<string, IssueCluster>();

    for (const issue of issues) {
      const key = issue.dedupeKey;

      if (clusters.has(key)) {
        // 更新现有聚类
        const cluster = clusters.get(key)!;
        cluster.duplicateCount++;
        cluster.allIssueIds.push(issue.id);

        if (!cluster.affectedPages.includes(issue.pageName)) {
          cluster.affectedPages.push(issue.pageName);
        }
        if (!cluster.affectedLanguages.includes(issue.language)) {
          cluster.affectedLanguages.push(issue.language);
        }

        // 记录重复问题 ID
        issue.duplicateIssueIds = cluster.allIssueIds.filter(id => id !== issue.id);
      } else {
        // 创建新聚类
        clusters.set(key, {
          representativeIssue: issue,
          duplicateCount: 0,
          affectedPages: [issue.pageName],
          affectedLanguages: [issue.language],
          allIssueIds: [issue.id],
        });
      }
    }

    return Array.from(clusters.values());
  }

  /**
   * 调整问题严重级别
   */
  adjustSeverity(issue: InspectionIssue): TestCasePriority {
    const rule = SEVERITY_RULES[issue.type];
    if (!rule) return issue.severity;

    // 根据置信度调整
    let severity = rule.defaultSeverity;

    // 如果置信度低，可能降级
    if (issue.confidence < 0.5) {
      severity = this.downgradeSeverity(severity);
    }

    // 如果有明确的严重级别，使用配置的
    if (issue.severity && this.compareSeverity(issue.severity, severity) > 0) {
      severity = issue.severity;
    }

    return severity;
  }

  /**
   * 降级严重级别
   */
  private downgradeSeverity(severity: TestCasePriority): TestCasePriority {
    const levels: TestCasePriority[] = ['P0', 'P1', 'P2', 'P3'];
    const index = levels.indexOf(severity);
    if (index >= 0 && index < levels.length - 1) {
      return levels[index + 1] as TestCasePriority;
    }
    return severity;
  }

  /**
   * 比较严重级别
   */
  private compareSeverity(a: TestCasePriority, b: TestCasePriority): number {
    const levels: TestCasePriority[] = ['P0', 'P1', 'P2', 'P3'];
    return levels.indexOf(a) - levels.indexOf(b);
  }

  /**
   * 过滤问题
   */
  filterIssues(issues: EnhancedInspectionIssue[]): EnhancedInspectionIssue[] {
    return issues.filter(issue => {
      // 置信度过滤
      if (issue.confidence < this.config.confidenceThreshold) {
        logger.debug(`过滤低置信度问题: ${issue.id} (${issue.confidence})`);
        return false;
      }

      // 严重级别过滤
      if (this.config.severityThreshold) {
        if (this.compareSeverity(issue.severity, this.config.severityThreshold) > 0) {
          return false;
        }
      }

      // 忽略规则过滤
      for (const rule of (this.config.ignoreRules || [])) {
        if (this.matchesIgnoreRule(issue, rule)) {
          logger.debug(`忽略问题: ${issue.id} (规则: ${rule.pattern})`);
          return false;
        }
      }

      return true;
    });
  }

  /**
   * 检查是否匹配忽略规则
   */
  private matchesIgnoreRule(
    issue: EnhancedInspectionIssue,
    rule: { matchType: string; pattern: string; languages?: string[] },
  ): boolean {
    // 语言检查
    if (rule.languages && !rule.languages.includes(issue.language)) {
      return false;
    }

    // 匹配类型检查
    switch (rule.matchType) {
      case 'page':
        return new RegExp(rule.pattern, 'i').test(issue.pageName);

      case 'element':
        return issue.elementInfo?.locator !== undefined &&
          new RegExp(rule.pattern, 'i').test(issue.elementInfo.locator);

      case 'text':
        return issue.description !== undefined &&
          new RegExp(rule.pattern, 'i').test(issue.description);

      case 'issue-type':
        return issue.type === rule.pattern;

      default:
        return false;
    }
  }

  /**
   * 分析问题列表
   */
  analyze(issues: InspectionIssue[]): {
    enhancedIssues: EnhancedInspectionIssue[];
    clusters: IssueCluster[];
    summary: {
      total: number;
      bySeverity: Record<TestCasePriority, number>;
      bySourceType: Record<string, number>;
      filtered: number;
    };
  } {
    logger.step('🔍 分析问题...');

    // 增强问题
    const enhancedIssues = this.enhanceIssues(issues);

    // 调整严重级别
    for (const issue of enhancedIssues) {
      issue.severity = this.adjustSeverity(issue);
    }

    // 过滤问题
    const filteredIssues = this.filterIssues(enhancedIssues);

    // 去重聚类
    const clusters = this.deduplicateIssues(filteredIssues);

    // 统计
    const summary = {
      total: issues.length,
      bySeverity: this.countBySeverity(filteredIssues),
      bySourceType: this.countBySourceType(filteredIssues),
      filtered: issues.length - filteredIssues.length,
    };

    logger.pass(`✅ 问题分析完成: ${filteredIssues.length} 个有效问题, ${clusters.length} 个唯一问题`);

    return {
      enhancedIssues: filteredIssues,
      clusters,
      summary,
    };
  }

  /**
   * 按严重级别计数
   */
  private countBySeverity(issues: EnhancedInspectionIssue[]): Record<TestCasePriority, number> {
    const counts: Record<TestCasePriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    for (const issue of issues) {
      if (issue.severity && counts[issue.severity] !== undefined) {
        counts[issue.severity]++;
      }
    }
    return counts;
  }

  /**
   * 按来源类型计数
   */
  private countBySourceType(issues: EnhancedInspectionIssue[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const issue of issues) {
      counts[issue.sourceType] = (counts[issue.sourceType] || 0) + 1;
    }
    return counts;
  }

  /**
   * 获取问题严重级别规则
   */
  getSeverityRule(type: InspectionIssueType): typeof SEVERITY_RULES[InspectionIssueType] | undefined {
    return SEVERITY_RULES[type];
  }
}

/**
 * 创建问题分析器
 */
export function createIssueAnalyzer(config?: Partial<IssueAnalyzerConfig>): IssueAnalyzer {
  return new IssueAnalyzer(config);
}

/**
 * 导出严重级别规则
 */
export { SEVERITY_RULES };
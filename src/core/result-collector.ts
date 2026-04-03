import type { TestCaseResult, TestRunResult, CategoryResult, Platform, TestEnvironment } from '@/types/index.js';

/**
 * 结果收集器
 * 负责收集和汇总测试结果
 */
export class ResultCollector {
  private results: TestCaseResult[] = [];
  private runId: string;
  private project: string;
  private platform: Platform;
  private environment: TestEnvironment;
  private startTime: string;

  constructor(
    runId: string,
    project: string,
    platform: Platform,
    environment: TestEnvironment,
  ) {
    this.runId = runId;
    this.project = project;
    this.platform = platform;
    this.environment = environment;
    this.startTime = new Date().toISOString();
    this.results = [];
  }

  /**
   * 添加测试结果
   */
  addResult(result: TestCaseResult): void {
    this.results.push(result);
  }

  /**
   * 批量添加测试结果
   */
  addResults(results: TestCaseResult[]): void {
    this.results.push(...results);
  }

  /**
   * 获取所有结果
   */
  getResults(): TestCaseResult[] {
    return this.results;
  }

  /**
   * 计算分类结果
   */
  calculateCategoryResult(_type: string): CategoryResult {
    const filtered = this.results.filter(() =>
      // TODO: 根据用例类型过滤
      true
    );

    const passed = filtered.filter(r => r.status === 'passed').length;
    const failed = filtered.filter(r => r.status === 'failed').length;
    const skipped = filtered.filter(r => r.status === 'skipped').length;
    const blocked = filtered.filter(r => r.status === 'blocked').length;
    const total = filtered.length;

    return {
      total,
      passed,
      failed,
      skipped,
      blocked,
      passRate: total > 0 ? passed / total : 0,
      avgDurationMs: total > 0
        ? filtered.reduce((sum, r) => sum + r.durationMs, 0) / total
        : 0,
    };
  }

  /**
   * 生成完整的测试运行结果
   */
  generateTestRunResult(): TestRunResult {
    const endTime = new Date().toISOString();
    const duration = new Date(endTime).getTime() - new Date(this.startTime).getTime();

    const summary = {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'passed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      blocked: this.results.filter(r => r.status === 'blocked').length,
      passRate: this.results.length > 0
        ? this.results.filter(r => r.status === 'passed').length / this.results.length
        : 0,
    };

    const functional = this.calculateCategoryResult('functional');
    const visual = this.calculateCategoryResult('visual');
    const performance = {
      ...this.calculateCategoryResult('performance'),
      metrics: {},
    };
    const security = {
      ...this.calculateCategoryResult('security'),
      issues: [],
    };
    const accessibility = {
      ...this.calculateCategoryResult('accessibility'),
      violations: [],
    };
    const compatibility = this.calculateCategoryResult('compatibility');
    const stability = this.calculateCategoryResult('stability');

    // 计算风险级别
    const riskLevel = this.calculateRiskLevel(summary);

    // AI 分析（占位符）
    const aiAnalysis = {
      overallAssessment: '测试完成',
      criticalIssues: this.results
        .filter(r => r.status === 'failed')
        .slice(0, 5)
        .map(r => r.caseName),
      recommendations: [],
      riskLevel,
    };

    // 收集所有截图和录屏
    const artifacts = {
      screenshots: this.results.flatMap(r => r.artifacts.screenshots),
      videos: this.results
        .filter(r => r.artifacts.video)
        .map(r => r.artifacts.video as string),
      logs: [`data/logs/run-${this.runId}.log`],
    };

    return {
      runId: this.runId,
      project: this.project,
      startTime: this.startTime,
      endTime,
      duration,
      platform: this.platform,
      environment: this.environment,
      summary,
      categories: {
        functional,
        visual,
        performance,
        security,
        accessibility,
        compatibility,
        stability,
      },
      cases: this.results,
      aiAnalysis,
      artifacts,
    };
  }

  /**
   * 计算风险级别
   */
  private calculateRiskLevel(summary: {
    total: number;
    passed: number;
    failed: number;
    blocked: number;
    passRate: number;
  }): 'low' | 'medium' | 'high' | 'critical' {
    const passRate = summary.passRate;
    const blockedRate = summary.total > 0 ? summary.blocked / summary.total : 0;

    if (blockedRate > 0.1 || passRate < 0.5) {
      return 'critical';
    }
    if (passRate < 0.7) {
      return 'high';
    }
    if (passRate < 0.9) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * 获取摘要统计
   */
  getSummary(): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    blocked: number;
    passRate: number;
  } {
    return {
      total: this.results.length,
      passed: this.results.filter(r => r.status === 'passed').length,
      failed: this.results.filter(r => r.status === 'failed').length,
      skipped: this.results.filter(r => r.status === 'skipped').length,
      blocked: this.results.filter(r => r.status === 'blocked').length,
      passRate: this.results.length > 0
        ? this.results.filter(r => r.status === 'passed').length / this.results.length
        : 0,
    };
  }

  /**
   * 清空结果
   */
  clear(): void {
    this.results = [];
  }
}
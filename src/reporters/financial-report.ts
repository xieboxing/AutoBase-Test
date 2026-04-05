/**
 * 金融测试报告生成器
 * 生成金融 APP 专用的 HTML 和 JSON 报告
 */

import type { FinancialTestResult, LanguageExecutionResult, InspectionIssue, EnhancedInspectionIssue } from '@/types/financial.types.js';
import { logger } from '@/core/logger.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, basename, relative } from 'node:path';

/**
 * 报告生成器配置
 */
export interface FinancialReportGeneratorOptions {
  /** 报告格式 */
  formats: ('html' | 'json')[];
  /** 输出目录 */
  outputDir: string;
  /** 报告语言 */
  language: 'zh-CN' | 'en-US';
}

/**
 * 金融测试报告生成器类
 */
export class FinancialReportGenerator {
  private formats: ('html' | 'json')[];
  private outputDir: string;
  private language: 'zh-CN' | 'en-US';

  constructor(options: FinancialReportGeneratorOptions) {
    this.formats = options.formats;
    this.outputDir = options.outputDir;
    this.language = options.language;
  }

  /**
   * 生成报告
   */
  async generate(result: FinancialTestResult): Promise<Record<string, string>> {
    await mkdir(this.outputDir, { recursive: true });

    const reportPaths: Record<string, string> = {};

    for (const format of this.formats) {
      switch (format) {
        case 'html':
          reportPaths.html = await this.generateHtmlReport(result);
          break;
        case 'json':
          reportPaths.json = await this.generateJsonReport(result);
          break;
      }
    }

    logger.pass(`📊 报告已生成`);
    return reportPaths;
  }

  /**
   * 生成 HTML 报告
   */
  private async generateHtmlReport(result: FinancialTestResult): Promise<string> {
    const filePath = join(this.outputDir, 'report.html');

    const html = this.buildHtmlContent(result);
    await writeFile(filePath, html, 'utf-8');

    logger.debug(`HTML 报告已生成: ${filePath}`);
    return filePath;
  }

  /**
   * 构建 HTML 内容
   */
  private buildHtmlContent(result: FinancialTestResult): string {
    const title = `${result.appName} 金融测试报告`;

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    <!-- 报告头部 -->
    <header class="header">
      <h1>${title}</h1>
      <div class="meta">
        <span class="run-id">运行 ID: ${result.runId}</span>
        <span class="time">开始: ${result.startTime}</span>
        <span class="time">结束: ${result.endTime}</span>
        <span class="duration">耗时: ${(result.durationMs / 1000).toFixed(2)} 秒</span>
      </div>
    </header>

    <!-- 测试概览 -->
    <section class="section overview">
      <h2>📊 测试概览</h2>
      <div class="overview-grid">
        <div class="overview-item">
          <div class="label">APP 名称</div>
          <div class="value">${result.appName}</div>
        </div>
        <div class="overview-item">
          <div class="label">包名</div>
          <div class="value">${result.packageName}</div>
        </div>
        <div class="overview-item">
          <div class="label">设备</div>
          <div class="value">${result.device.id}</div>
        </div>
        <div class="overview-item">
          <div class="label">测试语言</div>
          <div class="value">${result.languageResults.map(r => r.languageName).join(', ')}</div>
        </div>
      </div>

      <div class="summary">
        <div class="summary-item status-${result.overallAssessment.status}">
          <div class="label">整体状态</div>
          <div class="value">${result.overallAssessment.status === 'passed' ? '✅ 通过' : '❌ 失败'}</div>
        </div>
        <div class="summary-item">
          <div class="label">通过率</div>
          <div class="value">${(result.overallAssessment.passRate * 100).toFixed(1)}%</div>
        </div>
        <div class="summary-item risk-${result.overallAssessment.riskLevel}">
          <div class="label">风险等级</div>
          <div class="value">${this.getRiskLevelText(result.overallAssessment.riskLevel)}</div>
        </div>
      </div>
    </section>

    <!-- 主流程结果 -->
    <section class="section flow-results">
      <h2>🚀 主流程结果</h2>
      <div class="flow-table">
        <table>
          <thead>
            <tr>
              <th>步骤</th>
              ${result.languageResults.map(r => `<th>${r.languageName}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${this.buildFlowStepsTable(result)}
          </tbody>
        </table>
      </div>
    </section>

    <!-- 按语言展示结果 -->
    ${result.languageResults.map(lang => this.buildLanguageSection(lang)).join('')}

    <!-- 问题列表 -->
    <section class="section issues">
      <h2>❌ 问题列表</h2>
      <div class="issue-summary">
        <div class="severity-badge p0">P0: ${result.allIssues.filter(i => i.severity === 'P0').length}</div>
        <div class="severity-badge p1">P1: ${result.allIssues.filter(i => i.severity === 'P1').length}</div>
        <div class="severity-badge p2">P2: ${result.allIssues.filter(i => i.severity === 'P2').length}</div>
        <div class="severity-badge p3">P3: ${result.allIssues.filter(i => i.severity === 'P3').length}</div>
      </div>

      <div class="issue-list">
        ${this.buildIssueList(result.allIssues)}
      </div>
    </section>

    <!-- 交易结果 -->
    ${result.tradingSummary ? this.buildTradingSection(result) : ''}

    <!-- 整体评估 -->
    <section class="section assessment">
      <h2>📋 整体评估</h2>
      <div class="assessment-content">
        <p class="summary-text">${result.overallAssessment.summary}</p>
        ${result.aiAnalysis ? `
          <div class="ai-analysis">
            <h3>🤖 AI 分析</h3>
            <p>${result.aiAnalysis.overallAssessment}</p>
            ${result.aiAnalysis.criticalIssues.length > 0 ? `
              <h4>关键问题:</h4>
              <ul>
                ${result.aiAnalysis.criticalIssues.map(i => `<li>${i}</li>`).join('')}
              </ul>
            ` : ''}
            ${result.aiAnalysis.recommendations.length > 0 ? `
              <h4>建议:</h4>
              <ul>
                ${result.aiAnalysis.recommendations.map(r => `<li>${r}</li>`).join('')}
              </ul>
            ` : ''}
          </div>
        ` : ''}
      </div>
    </section>

    <!-- 产物链接 -->
    <section class="section artifacts">
      <h2>📁 测试产物</h2>
      <div class="artifact-links">
        <div class="artifact-item">
          <span>截图目录:</span>
          <code>${result.artifacts.screenshotsDir}</code>
        </div>
        <div class="artifact-item">
          <span>Page Source 目录:</span>
          <code>${result.artifacts.pageSourcesDir}</code>
        </div>
        <div class="artifact-item">
          <span>日志目录:</span>
          <code>${result.artifacts.logsDir}</code>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <p>AutoBase-Test 金融测试报告 | 生成时间: ${new Date().toISOString()}</p>
    </footer>
  </div>
</body>
</html>`;
  }

  /**
   * 构建流程步骤表格
   */
  private buildFlowStepsTable(result: FinancialTestResult): string {
    // 获取所有步骤名称（按第一个语言的步骤）
    const allSteps = result.languageResults[0]?.flowResult.steps || [];

    return allSteps.map(step => {
      const row = `<tr><td>${step.stepName}</td>`;
      const cells = result.languageResults.map(lang => {
        const langStep = lang.flowResult.steps.find(s => s.stepId === step.stepId);
        if (!langStep) return '<td class="unknown">-</td>';
        return `<td class="${langStep.status}">${langStep.status === 'passed' ? '✅' : '❌'}</td>`;
      }).join('');
      return row + cells + '</tr>';
    }).join('');
  }

  /**
   * 构建语言部分
   * 第二轮增强：支持标注截图展示
   */
  private buildLanguageSection(lang: LanguageExecutionResult): string {
    return `
    <section class="section language-result">
      <h2>🌐 ${lang.languageName} (${lang.language})</h2>
      <div class="language-summary">
        <div class="summary-item status-${lang.status}">
          <span>状态: ${lang.status === 'passed' ? '✅ 通过' : '❌ 失败'}</span>
        </div>
        <div class="summary-item">
          <span>耗时: ${(lang.durationMs / 1000).toFixed(2)} 秒</span>
        </div>
        <div class="summary-item">
          <span>页面数: ${lang.pageResults.length}</span>
        </div>
      </div>

      <div class="page-results">
        <h3>页面巡检结果</h3>
        ${lang.pageResults.map(page => `
          <div class="page-item ${page.passed ? 'passed' : 'failed'}">
            <div class="page-header">
              <span class="page-name">${page.pageName}</span>
              <span class="page-status">${page.passed ? '✅' : `❌ (${page.issues.length} 问题)`}</span>
            </div>
            <div class="page-screenshots">
              ${page.annotatedScreenshotPath ? `
                <div class="annotated-screenshot">
                  <a href="${this.getRelativePath(page.annotatedScreenshotPath)}" target="_blank">
                    <span class="screenshot-badge annotated">标注截图</span>
                  </a>
                </div>
              ` : ''}
              ${page.screenshotPath ? `
                <div class="page-screenshot">
                  <a href="${this.getRelativePath(page.screenshotPath)}" target="_blank">
                    <span class="screenshot-badge original">原始截图</span>
                  </a>
                </div>
              ` : ''}
              ${page.pageSourcePath ? `
                <div class="page-source">
                  <a href="${this.getRelativePath(page.pageSourcePath)}" target="_blank">
                    <span class="screenshot-badge source">Page Source</span>
                  </a>
                </div>
              ` : ''}
            </div>
            ${!page.passed && page.issues.length > 0 ? `
              <div class="page-issues-preview">
                ${page.issues.slice(0, 3).map(issue => `
                  <span class="issue-preview-badge ${issue.severity}">${issue.severity}: ${this.getIssueTypeText(issue.type)}</span>
                `).join('')}
                ${page.issues.length > 3 ? `<span class="issue-preview-more">+${page.issues.length - 3} 更多</span>` : ''}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </section>`;
  }

  /**
   * 构建问题列表
   * 第二轮增强：支持增强问题信息和标注截图
   */
  private buildIssueList(issues: InspectionIssue[] | EnhancedInspectionIssue[]): string {
    if (issues.length === 0) {
      return '<p class="no-issues">✅ 没有发现问题</p>';
    }

    // 按严重级别排序
    const sortedIssues = [...issues].sort((a, b) => {
      const severityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    return sortedIssues.map(issue => {
      // 检查是否是增强问题
      const isEnhanced = 'confidenceFactors' in issue;
      const confidenceReason = isEnhanced ? (issue as EnhancedInspectionIssue).confidenceReason : '';
      const sourceType = isEnhanced ? (issue as EnhancedInspectionIssue).sourceType : 'rule';
      const duplicateCount = isEnhanced ? (issue as EnhancedInspectionIssue).duplicateIssueIds?.length || 0 : 0;

      return `
      <div class="issue-item severity-${issue.severity}">
        <div class="issue-header">
          <span class="severity-badge ${issue.severity.toLowerCase()}">${issue.severity}</span>
          <span class="issue-type">${this.getIssueTypeText(issue.type)}</span>
          <span class="confidence">置信度: ${(issue.confidence * 100).toFixed(0)}%</span>
          ${sourceType !== 'rule' ? `<span class="source-type">${this.getSourceTypeBadge(sourceType)}</span>` : ''}
          ${duplicateCount > 0 ? `<span class="duplicate-badge">重复 ${duplicateCount} 次</span>` : ''}
        </div>
        <div class="issue-content">
          <div class="issue-description">${issue.description}</div>
          ${confidenceReason ? `<div class="confidence-reason">${confidenceReason}</div>` : ''}
          <div class="issue-meta">
            <span>页面: ${issue.pageName}</span>
            <span>语言: ${issue.language}</span>
          </div>
          ${issue.screenshotPath ? `
            <div class="issue-evidence">
              <a href="${this.getRelativePath(issue.screenshotPath)}" target="_blank">查看截图证据</a>
            </div>
          ` : ''}
          ${issue.suggestion ? `
            <div class="issue-suggestion">
              <span>建议: ${issue.suggestion}</span>
            </div>
          ` : ''}
        </div>
      </div>`;
    }).join('');
  }

  /**
   * 获取来源类型徽章
   */
  private getSourceTypeBadge(sourceType: string): string {
    const badges: Record<string, string> = {
      'rule': '规则检测',
      'ocr': 'OCR 检测',
      'ai': 'AI 分析',
      'mixed': '综合分析',
    };
    return badges[sourceType] || sourceType;
  }

  /**
   * 构建交易部分
   */
  private buildTradingSection(result: FinancialTestResult): string {
    const summary = result.tradingSummary!;

    return `
    <section class="section trading">
      <h2>📈 交易结果</h2>
      <div class="trading-summary">
        <div class="trading-item">
          <div class="label">开仓成功</div>
          <div class="value">${summary.openSuccess}</div>
        </div>
        <div class="trading-item">
          <div class="label">开仓失败</div>
          <div class="value">${summary.openFailed}</div>
        </div>
        <div class="trading-item">
          <div class="label">平仓成功</div>
          <div class="value">${summary.closeSuccess}</div>
        </div>
        <div class="trading-item">
          <div class="label">平仓失败</div>
          <div class="value">${summary.closeFailed}</div>
        </div>
      </div>
      <div class="trading-verification">
        <div class="verify-item ${summary.positionVerified ? 'verified' : 'failed'}">
          ${summary.positionVerified ? '✅' : '❌'} 持仓验证
        </div>
        <div class="verify-item ${summary.historyVerified ? 'verified' : 'failed'}">
          ${summary.historyVerified ? '✅' : '❌'} 历史记录验证
        </div>
        <div class="verify-item ${summary.balanceChangeVerified ? 'verified' : 'failed'}">
          ${summary.balanceChangeVerified ? '✅' : '❌'} 余额变化验证
        </div>
      </div>
    </section>`;
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
      :root {
        --primary-color: #1890ff;
        --success-color: #52c41a;
        --warning-color: #faad14;
        --danger-color: #ff4d4f;
        --text-color: #333;
        --bg-color: #f5f5f5;
        --card-bg: #fff;
      }

      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: var(--bg-color);
        color: var(--text-color);
        margin: 0;
        padding: 20px;
      }

      .container {
        max-width: 1200px;
        margin: 0 auto;
      }

      .header {
        background: var(--card-bg);
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .header h1 {
        margin: 0 0 10px 0;
        color: var(--primary-color);
      }

      .meta {
        display: flex;
        gap: 20px;
        color: #666;
        font-size: 14px;
      }

      .section {
        background: var(--card-bg);
        padding: 20px;
        border-radius: 8px;
        margin-bottom: 20px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .section h2 {
        margin: 0 0 15px 0;
        color: var(--primary-color);
        border-bottom: 2px solid var(--primary-color);
        padding-bottom: 10px;
      }

      .overview-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 15px;
        margin-bottom: 20px;
      }

      .overview-item {
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
      }

      .overview-item .label {
        color: #999;
        font-size: 12px;
      }

      .overview-item .value {
        font-size: 16px;
        font-weight: bold;
        margin-top: 5px;
      }

      .summary {
        display: flex;
        gap: 20px;
        padding: 15px;
        background: #f0f0f0;
        border-radius: 4px;
      }

      .summary-item {
        padding: 10px 20px;
        border-radius: 4px;
      }

      .status-passed {
        background: #e6f7e6;
        color: var(--success-color);
      }

      .status-failed {
        background: #fff2f0;
        color: var(--danger-color);
      }

      .risk-low {
        background: #e6f7e6;
        color: var(--success-color);
      }

      .risk-medium {
        background: #fffbe6;
        color: var(--warning-color);
      }

      .risk-high {
        background: #fff2f0;
        color: var(--danger-color);
      }

      .risk-critical {
        background: #ff4d4f;
        color: white;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        padding: 12px;
        border: 1px solid #ddd;
        text-align: center;
      }

      th {
        background: #f5f5f5;
        font-weight: bold;
      }

      td.passed {
        background: #e6f7e6;
      }

      td.failed {
        background: #fff2f0;
      }

      .issue-summary {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
      }

      .severity-badge {
        padding: 5px 15px;
        border-radius: 4px;
        font-weight: bold;
      }

      .severity-badge.p0 {
        background: #ff4d4f;
        color: white;
      }

      .severity-badge.p1 {
        background: #faad14;
        color: white;
      }

      .severity-badge.p2 {
        background: #1890ff;
        color: white;
      }

      .severity-badge.p3 {
        background: #999;
        color: white;
      }

      .issue-item {
        padding: 15px;
        border-radius: 4px;
        margin-bottom: 10px;
        border-left: 4px solid;
      }

      .issue-item.severity-P0 {
        border-left-color: #ff4d4f;
        background: #fff2f0;
      }

      .issue-item.severity-P1 {
        border-left-color: #faad14;
        background: #fffbe6;
      }

      .issue-item.severity-P2 {
        border-left-color: #1890ff;
        background: #e6f7ff;
      }

      .issue-item.severity-P3 {
        border-left-color: #999;
        background: #f5f5f5;
      }

      .issue-header {
        display: flex;
        gap: 10px;
        align-items: center;
        margin-bottom: 10px;
      }

      .issue-type {
        font-weight: bold;
      }

      .confidence {
        color: #999;
        font-size: 12px;
      }

      .issue-description {
        font-size: 14px;
        margin-bottom: 5px;
      }

      .issue-meta {
        font-size: 12px;
        color: #666;
        display: flex;
        gap: 15px;
      }

      .issue-evidence a {
        color: var(--primary-color);
        font-size: 12px;
      }

      .issue-suggestion {
        font-size: 12px;
        color: #666;
        margin-top: 10px;
        padding: 10px;
        background: #f5f5f5;
        border-radius: 4px;
      }

      .no-issues {
        color: var(--success-color);
        text-align: center;
        padding: 20px;
      }

      .trading-summary {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 15px;
      }

      .trading-item {
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
        text-align: center;
      }

      .verify-item {
        padding: 10px;
        margin: 5px 0;
        border-radius: 4px;
      }

      .verify-item.verified {
        background: #e6f7e6;
      }

      .verify-item.failed {
        background: #fff2f0;
      }

      .ai-analysis {
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
        margin-top: 15px;
      }

      .ai-analysis h3 {
        color: var(--primary-color);
        margin: 0 0 10px 0;
      }

      .artifact-links {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .artifact-item {
        display: flex;
        gap: 10px;
        align-items: center;
      }

      .artifact-item code {
        background: #f5f5f5;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
      }

      .page-results {
        margin-top: 15px;
      }

      .page-item {
        padding: 10px;
        margin-bottom: 10px;
        border-radius: 4px;
      }

      .page-item.passed {
        background: #e6f7e6;
      }

      .page-item.failed {
        background: #fff2f0;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
      }

      .page-name {
        font-weight: bold;
      }

      /* 第二轮增强：标注截图样式 */
      .page-screenshots {
        display: flex;
        gap: 10px;
        margin-top: 8px;
      }

      .screenshot-badge {
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
      }

      .screenshot-badge.annotated {
        background: #ff4d4f;
        color: white;
      }

      .screenshot-badge.original {
        background: #1890ff;
        color: white;
      }

      .screenshot-badge.source {
        background: #52c41a;
        color: white;
      }

      .page-issues-preview {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-top: 8px;
      }

      .issue-preview-badge {
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
      }

      .issue-preview-badge.P0 {
        background: #ff4d4f;
        color: white;
      }

      .issue-preview-badge.P1 {
        background: #faad14;
        color: white;
      }

      .issue-preview-badge.P2 {
        background: #1890ff;
        color: white;
      }

      .issue-preview-badge.P3 {
        background: #999;
        color: white;
      }

      .issue-preview-more {
        color: #666;
        font-size: 11px;
      }

      .source-type {
        padding: 2px 8px;
        border-radius: 3px;
        background: #722ed1;
        color: white;
        font-size: 11px;
      }

      .duplicate-badge {
        padding: 2px 8px;
        border-radius: 3px;
        background: #eb2f96;
        color: white;
        font-size: 11px;
      }

      .confidence-reason {
        font-size: 12px;
        color: #666;
        margin-top: 5px;
        padding: 5px 10px;
        background: #f9f9f9;
        border-radius: 3px;
      }

      .footer {
        text-align: center;
        color: #999;
        padding: 20px;
        font-size: 12px;
      }

      @media (max-width: 768px) {
        .overview-grid,
        .trading-summary {
          grid-template-columns: repeat(2, 1fr);
        }

        .summary {
          flex-direction: column;
        }
      }
    `;
  }

  /**
   * 生成 JSON 报告
   */
  private async generateJsonReport(result: FinancialTestResult): Promise<string> {
    const filePath = join(this.outputDir, 'report.json');

    // 转换为适合 JSON 输出的格式（简化路径）
    const jsonResult = this.simplifyPaths(result);

    await writeFile(filePath, JSON.stringify(jsonResult, null, 2), 'utf-8');

    logger.debug(`JSON 报告已生成: ${filePath}`);
    return filePath;
  }

  /**
   * 简化路径（转换为相对路径）
   */
  private simplifyPaths(result: FinancialTestResult): Record<string, unknown> {
    return {
      runId: result.runId,
      appName: result.appName,
      packageName: result.packageName,
      device: result.device,
      startTime: result.startTime,
      endTime: result.endTime,
      durationMs: result.durationMs,
      overallAssessment: result.overallAssessment,
      tradingSummary: result.tradingSummary,
      languageResults: result.languageResults.map(lang => ({
        language: lang.language,
        languageName: lang.languageName,
        status: lang.status,
        startTime: lang.startTime,
        endTime: lang.endTime,
        durationMs: lang.durationMs,
        flowResult: {
          status: lang.flowResult.status,
          steps: lang.flowResult.steps.map(step => ({
            stepName: step.stepName,
            stepId: step.stepId,
            status: step.status,
            durationMs: step.durationMs,
            errorMessage: step.errorMessage,
          })),
        },
        pageResults: lang.pageResults.map(page => ({
          pageId: page.pageId,
          pageName: page.pageName,
          passed: page.passed,
          issues: page.issues.length,
        })),
      })),
      issues: result.allIssues.map(issue => ({
        id: issue.id,
        type: issue.type,
        description: issue.description,
        pageName: issue.pageName,
        language: issue.language,
        severity: issue.severity,
        confidence: issue.confidence,
        screenshotPath: this.getRelativePath(issue.screenshotPath),
        pageSourcePath: this.getRelativePath(issue.pageSourcePath),
        suggestion: issue.suggestion,
      })),
      aiAnalysis: result.aiAnalysis,
    };
  }

  /**
   * 获取相对路径
   */
  private getRelativePath(absolutePath: string | undefined): string {
    if (!absolutePath) return '';
    try {
      return relative(this.outputDir, absolutePath);
    } catch {
      return basename(absolutePath);
    }
  }

  /**
   * 获取风险等级文本
   */
  private getRiskLevelText(level: string): string {
    const texts: Record<string, string> = {
      low: '低风险',
      medium: '中风险',
      high: '高风险',
      critical: '严重',
    };
    return texts[level] || level;
  }

  /**
   * 获取问题类型文本
   */
  private getIssueTypeText(type: string): string {
    const texts: Record<string, string> = {
      'page-blank': '页面空白',
      'content-missing': '内容缺失',
      'element-not-visible': '元素不可见',
      'element-overlap': '元素重叠',
      'button-blocked': '按钮遮挡',
      'layout-abnormal': '布局异常',
      'untranslated-key': '未翻译 Key',
      'mixed-language': '中英文混杂',
      'placeholder-unreplaced': '占位符未替换',
      'garbled-text': '乱码',
      'critical-element-missing': '关键元素缺失',
      'text-truncated': '文本截断',
      'icon-missing': '图标缺失',
      'color-abnormal': '颜色异常',
      'spacing-abnormal': '间距异常',
    };
    return texts[type] || type;
  }
}
import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import type { TestRunResult } from '@/types/index.js';

/**
 * HTML 报告配置
 */
export interface HtmlReporterConfig {
  outputDir: string;
  templateDir: string;
  openOnComplete: boolean;
  embedScreenshots: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_HTML_REPORTER_CONFIG: HtmlReporterConfig = {
  outputDir: './data/reports',
  templateDir: './src/reporters/templates',
  openOnComplete: false,
  embedScreenshots: true,
};

/**
 * HTML 报告生成器
 * 生成美观的 HTML 格式报告
 */
export class HtmlReporter {
  private config: HtmlReporterConfig;

  constructor(config: Partial<HtmlReporterConfig> = {}) {
    this.config = { ...DEFAULT_HTML_REPORTER_CONFIG, ...config };
  }

  /**
   * 生成 HTML 报告
   */
  async generate(result: TestRunResult): Promise<string> {
    await fs.mkdir(this.config.outputDir, { recursive: true });

    const fileName = `report-${result.runId}.html`;
    const filePath = path.join(this.config.outputDir, fileName);

    const html = this.buildHtml(result);
    await fs.writeFile(filePath, html, 'utf-8');

    logger.pass('✅ HTML 报告已生成', { path: filePath });

    // 自动打开
    if (this.config.openOnComplete) {
      await this.openReport(filePath);
    }

    return filePath;
  }

  /**
   * 构建 HTML 内容
   */
  private buildHtml(result: TestRunResult): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>测试报告 - ${result.project}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    ${this.getStyles()}
  </style>
</head>
<body>
  <div class="container">
    ${this.buildHeader(result)}
    ${this.buildOverview(result)}
    ${this.buildHistoricalContext(result)}
    ${this.buildSchedulingResult(result)}
    ${this.buildAiAnalysis(result)}
    ${this.buildAutoFixSummary(result)}
    ${this.buildRagMemoryStats(result)}
    ${this.buildStateGraphSummary(result)}
    ${this.buildBusinessFlowSummary(result)}
    ${this.buildParallelExecutionStats(result)}
    ${this.buildCategories(result)}
    ${this.buildVisualRegression(result)}
    ${this.buildFailedCases(result)}
    ${this.buildEnvironment(result)}
  </div>
  <script>
    ${this.getChartScript(result)}
  </script>
</body>
</html>`;
  }

  /**
   * 构建头部
   */
  private buildHeader(result: TestRunResult): string {
    return `
    <header class="header">
      <h1>🧪 测试报告</h1>
      <div class="project-name">${result.project}</div>
      <div class="run-id">运行 ID: ${result.runId}</div>
    </header>`;
  }

  /**
   * 构建概览
   */
  private buildOverview(result: TestRunResult): string {
    const passRatePercent = (result.summary.passRate * 100).toFixed(1);
    const passRateColor = result.summary.passRate >= 0.8 ? '#22c55e' : result.summary.passRate >= 0.5 ? '#eab308' : '#ef4444';

    return `
    <section class="section overview">
      <h2>📊 测试概览</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${result.summary.total}</div>
          <div class="stat-label">总用例</div>
        </div>
        <div class="stat-card passed">
          <div class="stat-value">✅ ${result.summary.passed}</div>
          <div class="stat-label">通过</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">❌ ${result.summary.failed}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="stat-card skipped">
          <div class="stat-value">⏭️ ${result.summary.skipped}</div>
          <div class="stat-label">跳过</div>
        </div>
      </div>
      <div class="pass-rate-container">
        <div class="pass-rate-bar" style="width: ${passRatePercent}%; background-color: ${passRateColor};"></div>
        <div class="pass-rate-text" style="color: ${passRateColor};">${passRatePercent}%</div>
      </div>
      <div class="meta-info">
        <span>📅 ${result.startTime}</span>
        <span>⏱️ ${this.formatDuration(result.duration)}</span>
      </div>
      <div class="chart-container">
        <canvas id="overviewChart"></canvas>
      </div>
    </section>`;
  }

  /**
   * 构建历史知识上下文
   */
  private buildHistoricalContext(result: TestRunResult): string {
    if (!result.historicalContext?.loaded) return '';

    const ctx = result.historicalContext;
    return `
    <section class="section historical-context">
      <h2>📚 历史知识加载</h2>
      <div class="info-card">
        <p><strong>策略应用:</strong> ${ctx.strategyApplied}</p>
      </div>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">✅ ${ctx.passedCasesCount}</div>
          <div class="stat-label">历史通过用例</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">❌ ${ctx.failedCasesCount}</div>
          <div class="stat-label">历史失败用例</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🛡️ ${ctx.stableCasesCount}</div>
          <div class="stat-label">稳定用例</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">⚠️ ${ctx.highRiskCasesCount}</div>
          <div class="stat-label">高风险用例</div>
        </div>
      </div>
    </section>`;
  }

  /**
   * 构建调度结果
   */
  private buildSchedulingResult(result: TestRunResult): string {
    if (!result.schedulingResult) return '';

    const sched = result.schedulingResult;
    let html = `
    <section class="section scheduling-result">
      <h2>🎯 智能调度结果</h2>
      <div class="info-card">
        <p><strong>调度策略:</strong> ${sched.strategy}</p>
      </div>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">📋 ${sched.scheduledCount}</div>
          <div class="stat-label">调度用例</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">⏭️ ${sched.skippedCount}</div>
          <div class="stat-label">跳过用例</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">⚠️ ${sched.highRiskCount}</div>
          <div class="stat-label">高风险用例</div>
        </div>
      </div>`;

    if (sched.skippedCases.length > 0) {
      html += `
      <details class="skip-details">
        <summary>跳过用例详情 (${sched.skippedCases.length})</summary>
        <ul class="skip-list">
          ${sched.skippedCases.map(c => `
            <li><strong>${c.caseName}</strong>: ${c.reason}</li>
          `).join('')}
        </ul>
      </details>`;
    }

    html += `</section>`;
    return html;
  }

  /**
   * 构建自动修复摘要
   */
  private buildAutoFixSummary(result: TestRunResult): string {
    if (!result.autoFixSummary || result.autoFixSummary.totalAttempts === 0) return '';

    const fix = result.autoFixSummary;
    const successRate = fix.totalAttempts > 0
      ? ((fix.successCount / fix.totalAttempts) * 100).toFixed(1)
      : '0';

    return `
    <section class="section auto-fix-summary">
      <h2>🔧 自动修复摘要</h2>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">🔄 ${fix.totalAttempts}</div>
          <div class="stat-label">修复尝试</div>
        </div>
        <div class="stat-card passed">
          <div class="stat-value">✅ ${fix.successCount}</div>
          <div class="stat-label">修复成功</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">❌ ${fix.failureCount}</div>
          <div class="stat-label">修复失败</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">📊 ${successRate}%</div>
          <div class="stat-label">成功率</div>
        </div>
      </div>
      ${fix.patternsMatched.length > 0 ? `
        <div class="patterns-list">
          <h4>命中的失败模式</h4>
          <ul>
            ${fix.patternsMatched.map(p => `
              <li><strong>${p.patternType}</strong>: ${p.count} 次</li>
            `).join('')}
          </ul>
        </div>
      ` : ''}
    </section>`;
  }

  /**
   * 构建 RAG 记忆统计
   */
  private buildRagMemoryStats(result: TestRunResult): string {
    if (!result.ragMemoryStats || result.ragMemoryStats.totalMemoriesUsed === 0) return '';

    const rag = result.ragMemoryStats;
    return `
    <section class="section rag-memory-stats">
      <h2>🧠 RAG 记忆使用</h2>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">📝 ${rag.totalMemoriesUsed}</div>
          <div class="stat-label">使用记忆数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🎯 ${(rag.avgSimilarity * 100).toFixed(1)}%</div>
          <div class="stat-label">平均相似度</div>
        </div>
      </div>
      ${Object.keys(rag.byType).length > 0 ? `
        <div class="memory-by-type">
          <h4>按类型统计</h4>
          <div class="type-tags">
            ${Object.entries(rag.byType).map(([type, count]) => `
              <span class="type-tag">${type}: ${count}</span>
            `).join('')}
          </div>
        </div>
      ` : ''}
      ${rag.topMemories.length > 0 ? `
        <details class="top-memories">
          <summary>Top 记忆</summary>
          <ul>
            ${rag.topMemories.map(m => `
              <li><strong>[${m.memoryType}]</strong> ${m.summary} (${m.usageCount} 次使用)</li>
            `).join('')}
          </ul>
        </details>
      ` : ''}
    </section>`;
  }

  /**
   * 构建状态图谱摘要
   */
  private buildStateGraphSummary(result: TestRunResult): string {
    if (!result.stateGraphSummary) return '';

    const sg = result.stateGraphSummary;
    return `
    <section class="section state-graph-summary">
      <h2>🗺️ 状态图谱</h2>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">📍 ${sg.totalStates}</div>
          <div class="stat-label">总状态数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🆕 ${sg.newStatesDiscovered}</div>
          <div class="stat-label">新发现状态</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🔗 ${sg.totalTransitions}</div>
          <div class="stat-label">转移边数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">📊 ${sg.coveragePercent.toFixed(1)}%</div>
          <div class="stat-label">覆盖率</div>
        </div>
      </div>
    </section>`;
  }

  /**
   * 构建业务流摘要
   */
  private buildBusinessFlowSummary(result: TestRunResult): string {
    if (!result.businessFlowSummary || result.businessFlowSummary.totalFlowsDetected === 0) return '';

    const bf = result.businessFlowSummary;
    const passRate = bf.flowsTested > 0
      ? ((bf.flowsPassed / bf.flowsTested) * 100).toFixed(1)
      : '0';

    return `
    <section class="section business-flow-summary">
      <h2>🔄 业务流测试</h2>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">🔍 ${bf.totalFlowsDetected}</div>
          <div class="stat-label">识别业务流</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">▶️ ${bf.flowsTested}</div>
          <div class="stat-label">执行业务流</div>
        </div>
        <div class="stat-card passed">
          <div class="stat-value">✅ ${bf.flowsPassed}</div>
          <div class="stat-label">通过</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">❌ ${bf.flowsFailed}</div>
          <div class="stat-label">失败</div>
        </div>
      </div>
      <div class="info-card">
        <p><strong>业务流通过率:</strong> ${passRate}%</p>
      </div>
    </section>`;
  }

  /**
   * 构建并发执行统计
   */
  private buildParallelExecutionStats(result: TestRunResult): string {
    if (!result.parallelExecutionStats) return '';

    const pe = result.parallelExecutionStats;
    if (!pe.enabled) return '';

    return `
    <section class="section parallel-execution-stats">
      <h2>⚡ 并发执行统计</h2>
      <div class="stats-grid small">
        <div class="stat-card">
          <div class="stat-value">👷 ${pe.workerCount}</div>
          <div class="stat-label">Worker 数量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">⏱️ ${this.formatDuration(pe.totalDurationMs)}</div>
          <div class="stat-label">实际耗时</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">🕐 ${this.formatDuration(pe.serialEstimatedMs)}</div>
          <div class="stat-label">预估串行耗时</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">📈 ${pe.efficiencyPercent.toFixed(1)}%</div>
          <div class="stat-label">效率提升</div>
        </div>
      </div>
    </section>`;
  }

  /**
   * 构建 AI 分析
   */
  private buildAiAnalysis(result: TestRunResult): string {
    if (!result.aiAnalysis) return '';

    const riskEmoji = this.getRiskEmoji(result.aiAnalysis.riskLevel);
    const riskColor = this.getRiskColor(result.aiAnalysis.riskLevel);

    let html = `
    <section class="section ai-analysis">
      <h2>🤖 AI 分析</h2>
      <div class="risk-badge" style="background-color: ${riskColor};">
        ${riskEmoji} 风险等级: ${result.aiAnalysis.riskLevel}
      </div>
      <div class="assessment">
        <strong>总体评价:</strong> ${result.aiAnalysis.overallAssessment}
      </div>`;

    if (result.aiAnalysis.criticalIssues.length > 0) {
      html += `
      <div class="issues">
        <h3>🔴 关键问题</h3>
        <ul class="issue-list">
          ${result.aiAnalysis.criticalIssues.map(issue => `<li>${issue}</li>`).join('')}
        </ul>
      </div>`;
    }

    if (result.aiAnalysis.recommendations.length > 0) {
      html += `
      <div class="recommendations">
        <h3>💡 改进建议</h3>
        <ul class="recommendation-list">
          ${result.aiAnalysis.recommendations.map(rec => `<li>${rec}</li>`).join('')}
        </ul>
      </div>`;
    }

    html += `</section>`;
    return html;
  }

  /**
   * 构建分类结果
   */
  private buildCategories(result: TestRunResult): string {
    const categories = [
      { name: '功能测试', icon: '⚙️', data: result.categories.functional },
      { name: '视觉测试', icon: '👁️', data: result.categories.visual },
      { name: '性能测试', icon: '⚡', data: result.categories.performance },
      { name: '安全测试', icon: '🔒', data: result.categories.security },
      { name: '无障碍测试', icon: '♿', data: result.categories.accessibility },
      { name: '兼容性测试', icon: '🔄', data: result.categories.compatibility },
      { name: '稳定性测试', icon: '📊', data: result.categories.stability },
    ].filter(c => c.data.total > 0);

    if (categories.length === 0) return '';

    return `
    <section class="section categories">
      <h2>📋 分类结果</h2>
      <div class="category-grid">
        ${categories.map(cat => `
          <div class="category-card">
            <div class="category-header">
              <span class="category-icon">${cat.icon}</span>
              <span class="category-name">${cat.name}</span>
            </div>
            <div class="category-stats">
              <span>总数: ${cat.data.total}</span>
              <span class="passed">通过: ${cat.data.passed}</span>
              <span class="failed">失败: ${cat.data.failed}</span>
            </div>
            <div class="category-progress">
              <div class="progress-bar" style="width: ${(cat.data.passRate * 100).toFixed(0)}%;"></div>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="chart-container">
        <canvas id="categoryChart"></canvas>
      </div>
    </section>`;
  }

  /**
   * 构建视觉回归结果
   */
  private buildVisualRegression(result: TestRunResult): string {
    // 过滤有视觉回归结果的用例
    const visualCases = result.cases.filter(c => c.visualRegression);
    if (visualCases.length === 0) return '';

    const passedCount = visualCases.filter(c => c.visualRegression?.status === 'passed').length;
    const failedCount = visualCases.filter(c => c.visualRegression?.status === 'failed').length;
    const newBaselineCount = visualCases.filter(c => c.visualRegression?.status === 'new-baseline').length;
    const errorCount = visualCases.filter(c => c.visualRegression?.status === 'error').length;

    return `
    <section class="section visual-regression">
      <h2>👁️ 视觉回归测试</h2>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">${visualCases.length}</div>
          <div class="stat-label">总对比数</div>
        </div>
        <div class="stat-card passed">
          <div class="stat-value">✅ ${passedCount}</div>
          <div class="stat-label">通过</div>
        </div>
        <div class="stat-card failed">
          <div class="stat-value">❌ ${failedCount}</div>
          <div class="stat-label">失败</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">📸 ${newBaselineCount}</div>
          <div class="stat-label">新基线</div>
        </div>
      </div>
      <div class="visual-case-list">
        ${visualCases.map(tc => {
          const vr = tc.visualRegression!;
          const statusIcon = vr.status === 'passed' ? '✅' :
                            vr.status === 'failed' ? '❌' :
                            vr.status === 'new-baseline' ? '📸' : '⚠️';
          const statusClass = vr.status === 'passed' ? 'status-passed' :
                             vr.status === 'failed' ? 'status-failed' :
                             vr.status === 'new-baseline' ? 'status-new' : 'status-error';

          return `
            <details class="visual-case-item ${statusClass}">
              <summary class="visual-case-summary">
                <span class="status-icon">${statusIcon}</span>
                <span class="case-name">${tc.caseName}</span>
                <span class="diff-percent">${vr.diffResult ? `${vr.diffResult.diffPercentage.toFixed(2)}%` : '-'}</span>
              </summary>
              <div class="visual-case-details">
                <div class="visual-info">
                  <p><strong>页面 URL:</strong> ${vr.pageUrl}</p>
                  <p><strong>状态:</strong> ${vr.status}</p>
                  <p><strong>消息:</strong> ${vr.message}</p>
                  ${vr.baselineId ? `<p><strong>基线 ID:</strong> ${vr.baselineId}</p>` : ''}
                </div>
                ${vr.diffResult ? `
                  <div class="diff-images">
                    <div class="image-comparison">
                      <div class="image-item">
                        <h4>基线图</h4>
                        <img src="${vr.diffResult.currentImagePath}" alt="基线图" class="screenshot">
                      </div>
                      ${vr.diffResult.diffImagePath ? `
                        <div class="image-item">
                          <h4>差异图</h4>
                          <img src="${vr.diffResult.diffImagePath}" alt="差异图" class="screenshot diff-image">
                        </div>
                      ` : ''}
                    </div>
                    <div class="diff-stats">
                      <p><strong>差异像素:</strong> ${vr.diffResult.diffPixels.toLocaleString()}</p>
                      <p><strong>差异百分比:</strong> ${vr.diffResult.diffPercentage.toFixed(2)}%</p>
                      <p><strong>差异区域数:</strong> ${vr.diffResult.diffAreas.length}</p>
                    </div>
                  </div>
                ` : ''}
              </div>
            </details>
          `;
        }).join('')}
      </div>
    </section>`;
  }

  /**
   * 构建失败用例
   */
  private buildFailedCases(result: TestRunResult): string {
    const failedCases = result.cases.filter(c => c.status === 'failed');
    if (failedCases.length === 0) return '';

    return `
    <section class="section failed-cases">
      <h2>❌ 失败用例 (${failedCases.length})</h2>
      <div class="case-list">
        ${failedCases.map(tc => `
          <details class="case-item">
            <summary class="case-summary">
              <span class="case-name">${tc.caseName}</span>
              <span class="case-duration">${tc.durationMs}ms</span>
            </summary>
            <div class="case-details">
              <div class="case-id">ID: ${tc.caseId}</div>
              ${tc.steps.filter(s => s.status === 'failed').map(step => `
                <div class="failed-step">
                  <strong>步骤 ${step.order}</strong>: ${step.action}
                  ${step.errorMessage ? `<div class="error-message">${step.errorMessage}</div>` : ''}
                </div>
              `).join('')}
              ${tc.artifacts.screenshots.length > 0 ? `
                <div class="screenshots">
                  ${tc.artifacts.screenshots.map(s => `<img src="${s}" alt="截图" class="screenshot">`).join('')}
                </div>
              ` : ''}
            </div>
          </details>
        `).join('')}
      </div>
    </section>`;
  }

  /**
   * 构建环境信息
   */
  private buildEnvironment(result: TestRunResult): string {
    return `
    <section class="section environment">
      <h2>🖥️ 测试环境</h2>
      <div class="env-grid">
        <div class="env-item">
          <span class="env-label">平台</span>
          <span class="env-value">${result.platform}</span>
        </div>
        ${result.environment.browser ? `
          <div class="env-item">
            <span class="env-label">浏览器</span>
            <span class="env-value">${result.environment.browser} ${result.environment.browserVersion || ''}</span>
          </div>
        ` : ''}
        ${result.environment.device ? `
          <div class="env-item">
            <span class="env-label">设备</span>
            <span class="env-value">${result.environment.device}</span>
          </div>
        ` : ''}
        ${result.environment.viewport ? `
          <div class="env-item">
            <span class="env-label">视口</span>
            <span class="env-value">${result.environment.viewport.width}x${result.environment.viewport.height}</span>
          </div>
        ` : ''}
      </div>
      <div class="footer">
        报告生成时间: ${new Date().toISOString()}
      </div>
    </section>`;
  }

  /**
   * 获取样式
   */
  private getStyles(): string {
    return `
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        color: #e4e4e7;
        min-height: 100vh;
        line-height: 1.6;
      }
      .container { max-width: 1200px; margin: 0 auto; padding: 2rem; }
      .header { text-align: center; margin-bottom: 2rem; }
      .header h1 { font-size: 2.5rem; background: linear-gradient(90deg, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
      .project-name { font-size: 1.5rem; color: #a1a1aa; margin-top: 0.5rem; }
      .run-id { font-size: 0.875rem; color: #71717a; margin-top: 0.25rem; }
      .section { background: rgba(255,255,255,0.05); border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; }
      .section h2 { font-size: 1.5rem; margin-bottom: 1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 0.5rem; }
      .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
      .stat-card { background: rgba(255,255,255,0.1); border-radius: 0.75rem; padding: 1rem; text-align: center; }
      .stat-card.passed { background: rgba(34,197,94,0.2); }
      .stat-card.failed { background: rgba(239,68,68,0.2); }
      .stat-card.skipped { background: rgba(234,179,8,0.2); }
      .stat-value { font-size: 1.75rem; font-weight: bold; }
      .stat-label { font-size: 0.875rem; color: #a1a1aa; }
      .pass-rate-container { position: relative; height: 30px; background: rgba(255,255,255,0.1); border-radius: 1rem; margin-bottom: 1rem; }
      .pass-rate-bar { height: 100%; border-radius: 1rem; transition: width 0.5s; }
      .pass-rate-text { position: absolute; right: 1rem; top: 50%; transform: translateY(-50%); font-weight: bold; font-size: 1.25rem; }
      .meta-info { display: flex; gap: 2rem; color: #a1a1aa; margin-bottom: 1rem; }
      .chart-container { background: rgba(0,0,0,0.2); border-radius: 0.75rem; padding: 1rem; margin-top: 1rem; }
      .risk-badge { display: inline-block; padding: 0.5rem 1rem; border-radius: 2rem; font-weight: bold; margin-bottom: 1rem; }
      .assessment { margin-bottom: 1rem; }
      .issue-list, .recommendation-list { padding-left: 1.5rem; }
      .issue-list li, .recommendation-list li { margin-bottom: 0.5rem; }
      .category-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem; }
      .category-card { background: rgba(255,255,255,0.05); border-radius: 0.75rem; padding: 1rem; }
      .category-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem; }
      .category-icon { font-size: 1.5rem; }
      .category-name { font-weight: bold; }
      .category-stats { display: flex; gap: 1rem; font-size: 0.875rem; color: #a1a1aa; margin-bottom: 0.5rem; }
      .category-stats .passed { color: #22c55e; }
      .category-stats .failed { color: #ef4444; }
      .category-progress { height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; }
      .progress-bar { height: 100%; background: linear-gradient(90deg, #22c55e, #3b82f6); border-radius: 4px; }
      .case-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .case-item { background: rgba(255,255,255,0.05); border-radius: 0.5rem; overflow: hidden; }
      .case-summary { display: flex; justify-content: space-between; padding: 1rem; cursor: pointer; font-weight: bold; }
      .case-summary:hover { background: rgba(255,255,255,0.1); }
      .case-details { padding: 0 1rem 1rem; }
      .case-id { font-size: 0.75rem; color: #71717a; margin-bottom: 0.5rem; }
      .failed-step { background: rgba(239,68,68,0.1); padding: 0.5rem; border-radius: 0.25rem; margin-bottom: 0.5rem; }
      .error-message { color: #ef4444; font-size: 0.875rem; margin-top: 0.25rem; }
      .screenshots { margin-top: 1rem; }
      .screenshot { max-width: 100%; border-radius: 0.5rem; margin-bottom: 0.5rem; }
      .env-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; }
      .env-item { background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 0.5rem; }
      .env-label { font-size: 0.75rem; color: #71717a; display: block; }
      .env-value { font-weight: bold; }
      .footer { text-align: center; color: #71717a; font-size: 0.875rem; margin-top: 1rem; }
      .visual-regression .visual-case-list { display: flex; flex-direction: column; gap: 0.5rem; }
      .visual-case-item { background: rgba(255,255,255,0.05); border-radius: 0.5rem; overflow: hidden; }
      .visual-case-item.status-passed { border-left: 4px solid #22c55e; }
      .visual-case-item.status-failed { border-left: 4px solid #ef4444; }
      .visual-case-item.status-new { border-left: 4px solid #3b82f6; }
      .visual-case-item.status-error { border-left: 4px solid #eab308; }
      .visual-case-summary { display: flex; align-items: center; gap: 0.5rem; padding: 1rem; cursor: pointer; font-weight: bold; }
      .visual-case-summary:hover { background: rgba(255,255,255,0.1); }
      .visual-case-summary .status-icon { font-size: 1.25rem; }
      .visual-case-summary .case-name { flex: 1; }
      .visual-case-summary .diff-percent { color: #a1a1aa; font-size: 0.875rem; }
      .visual-case-details { padding: 0 1rem 1rem; }
      .visual-info p { margin-bottom: 0.25rem; font-size: 0.875rem; }
      .diff-images { margin-top: 1rem; }
      .image-comparison { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 1rem; }
      .image-item h4 { font-size: 0.875rem; color: #a1a1aa; margin-bottom: 0.5rem; }
      .diff-image { border: 2px solid #ef4444; }
      .diff-stats { margin-top: 1rem; padding: 0.5rem; background: rgba(255,255,255,0.05); border-radius: 0.25rem; }
      .diff-stats p { font-size: 0.875rem; margin-bottom: 0.25rem; }
      .stats-grid.small { grid-template-columns: repeat(4, 1fr); }
      .stats-grid.small .stat-card { padding: 0.75rem; }
      .stats-grid.small .stat-value { font-size: 1.25rem; }
      .stats-grid.small .stat-label { font-size: 0.75rem; }
      .info-card { background: rgba(255,255,255,0.05); padding: 0.75rem; border-radius: 0.5rem; margin-bottom: 1rem; }
      .info-card p { margin-bottom: 0.25rem; font-size: 0.875rem; }
      .skip-details { margin-top: 1rem; }
      .skip-details summary { cursor: pointer; color: #a1a1aa; font-size: 0.875rem; }
      .skip-list { padding-left: 1.5rem; margin-top: 0.5rem; font-size: 0.875rem; }
      .skip-list li { margin-bottom: 0.25rem; }
      .patterns-list { margin-top: 1rem; }
      .patterns-list h4 { font-size: 0.875rem; margin-bottom: 0.5rem; color: #a1a1aa; }
      .patterns-list ul { padding-left: 1.5rem; font-size: 0.875rem; }
      .memory-by-type { margin-top: 1rem; }
      .memory-by-type h4 { font-size: 0.875rem; margin-bottom: 0.5rem; color: #a1a1aa; }
      .type-tags { display: flex; flex-wrap: wrap; gap: 0.5rem; }
      .type-tag { background: rgba(59,130,246,0.2); padding: 0.25rem 0.75rem; border-radius: 1rem; font-size: 0.75rem; }
      .top-memories { margin-top: 1rem; }
      .top-memories summary { cursor: pointer; color: #a1a1aa; font-size: 0.875rem; }
      .top-memories ul { padding-left: 1.5rem; margin-top: 0.5rem; font-size: 0.875rem; }
      @media (max-width: 768px) { .container { padding: 1rem; } .stats-grid { grid-template-columns: repeat(2, 1fr); } .stats-grid.small { grid-template-columns: repeat(2, 1fr); } }
    `;
  }

  /**
   * 获取图表脚本
   */
  private getChartScript(result: TestRunResult): string {
    const categories = [
      { name: '功能', data: result.categories.functional },
      { name: '视觉', data: result.categories.visual },
      { name: '性能', data: result.categories.performance },
      { name: '安全', data: result.categories.security },
      { name: '无障碍', data: result.categories.accessibility },
      { name: '兼容性', data: result.categories.compatibility },
      { name: '稳定性', data: result.categories.stability },
    ].filter(c => c.data.total > 0);

    return `
      // 概览饼图
      new Chart(document.getElementById('overviewChart'), {
        type: 'doughnut',
        data: {
          labels: ['通过', '失败', '跳过', '阻塞'],
          datasets: [{
            data: [${result.summary.passed}, ${result.summary.failed}, ${result.summary.skipped}, ${result.summary.blocked}],
            backgroundColor: ['#22c55e', '#ef4444', '#eab308', '#71717a'],
          }]
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { color: '#e4e4e7' } } }
        }
      });

      // 分类条形图
      new Chart(document.getElementById('categoryChart'), {
        type: 'bar',
        data: {
          labels: [${categories.map(c => `'${c.name}'`).join(',')}],
          datasets: [{
            label: '通过率 %',
            data: [${categories.map(c => (c.data.passRate * 100).toFixed(1)).join(',')}],
            backgroundColor: '#3b82f6',
          }]
        },
        options: {
          responsive: true,
          scales: {
            y: { beginAtZero: true, max: 100, ticks: { color: '#a1a1aa' }, grid: { color: 'rgba(255,255,255,0.1)' } },
            x: { ticks: { color: '#a1a1aa' }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    `;
  }

  /**
   * 格式化持续时间
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  /**
   * 获取风险 Emoji
   */
  private getRiskEmoji(level: string): string {
    switch (level) {
      case 'low': return '🟢';
      case 'medium': return '🟡';
      case 'high': return '🟠';
      case 'critical': return '🔴';
      default: return '⚪';
    }
  }

  /**
   * 获取风险颜色
   */
  private getRiskColor(level: string): string {
    switch (level) {
      case 'low': return '#22c55e';
      case 'medium': return '#eab308';
      case 'high': return '#f97316';
      case 'critical': return '#ef4444';
      default: return '#71717a';
    }
  }

  /**
   * 打开报告
   */
  private async openReport(filePath: string): Promise<void> {
    const { default: open } = await import('open');
    await open(filePath);
  }
}

/**
 * 快捷函数：生成 HTML 报告
 */
export async function generateHtmlReport(
  result: TestRunResult,
  config?: Partial<HtmlReporterConfig>,
): Promise<string> {
  const reporter = new HtmlReporter(config);
  return reporter.generate(result);
}
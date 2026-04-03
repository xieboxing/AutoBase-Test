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
    ${this.buildAiAnalysis(result)}
    ${this.buildCategories(result)}
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
      @media (max-width: 768px) { .container { padding: 1rem; } .stats-grid { grid-template-columns: repeat(2, 1fr); } }
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
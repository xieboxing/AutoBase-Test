import fs from 'node:fs/promises';
import path from 'node:path';
import { logger } from '@/core/logger.js';
import { nanoid } from 'nanoid';
import type { TestRunResult } from '@/types/test-result.types.js';

/**
 * JSON 报告配置
 */
export interface JsonReporterConfig {
  outputDir: string;
  prettyPrint: boolean;
}

/**
 * 默认配置
 */
const DEFAULT_JSON_REPORTER_CONFIG: JsonReporterConfig = {
  outputDir: './data/reports',
  prettyPrint: true,
};

/**
 * JSON 报告生成器
 * 输出完整的 TestRunResult JSON
 */
export class JsonReporter {
  private config: JsonReporterConfig;

  constructor(config: Partial<JsonReporterConfig> = {}) {
    this.config = { ...DEFAULT_JSON_REPORTER_CONFIG, ...config };
  }

  /**
   * 生成 JSON 报告
   */
  async generate(result: TestRunResult): Promise<string> {
    // 确保输出目录存在
    await fs.mkdir(this.config.outputDir, { recursive: true });

    // 生成文件名
    const fileName = `report-${result.runId}.json`;
    const filePath = path.join(this.config.outputDir, fileName);

    // 序列化结果
    const jsonContent = this.config.prettyPrint
      ? JSON.stringify(result, null, 2)
      : JSON.stringify(result);

    // 写入文件
    await fs.writeFile(filePath, jsonContent, 'utf-8');

    logger.pass('✅ JSON 报告已生成', { path: filePath });
    return filePath;
  }

  /**
   * 读取 JSON 报告
   */
  async read(filePath: string): Promise<TestRunResult | null> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as TestRunResult;
    } catch (error) {
      logger.fail('❌ 读取 JSON 报告失败', { path: filePath, error });
      return null;
    }
  }

  /**
   * 列出所有报告
   */
  async list(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.config.outputDir);
      return files
        .filter(f => f.startsWith('report-') && f.endsWith('.json'))
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }

  /**
   * 获取最新报告
   */
  async getLatest(): Promise<TestRunResult | null> {
    const reports = await this.list();
    if (reports.length === 0) return null;

    const latestPath = path.join(this.config.outputDir, reports[0]!);
    return this.read(latestPath);
  }

  /**
   * 获取报告列表（带摘要）
   */
  async listWithSummary(): Promise<Array<{
    fileName: string;
    runId: string;
    project: string;
    startTime: string;
    passRate: number;
    totalCases: number;
  }>> {
    const reports = await this.list();
    const summaries: Array<{
      fileName: string;
      runId: string;
      project: string;
      startTime: string;
      passRate: number;
      totalCases: number;
    }> = [];

    for (const fileName of reports) {
      const filePath = path.join(this.config.outputDir, fileName);
      const result = await this.read(filePath);

      if (result) {
        summaries.push({
          fileName,
          runId: result.runId,
          project: result.project,
          startTime: result.startTime,
          passRate: result.summary.passRate,
          totalCases: result.summary.total,
        });
      }
    }

    return summaries;
  }

  /**
   * 删除旧报告
   */
  async cleanup(maxReports: number = 50): Promise<number> {
    const reports = await this.list();

    if (reports.length <= maxReports) return 0;

    const toDelete = reports.slice(maxReports);
    let deleted = 0;

    for (const fileName of toDelete) {
      try {
        await fs.unlink(path.join(this.config.outputDir, fileName));
        deleted++;
      } catch {
        // ignore
      }
    }

    logger.info(`🧹 清理了 ${deleted} 个旧报告`);
    return deleted;
  }
}

/**
 * 快捷函数：生成 JSON 报告
 */
export async function generateJsonReport(
  result: TestRunResult,
  config?: Partial<JsonReporterConfig>,
): Promise<string> {
  const reporter = new JsonReporter(config);
  return reporter.generate(result);
}
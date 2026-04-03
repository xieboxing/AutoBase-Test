import fs from 'node:fs/promises';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { logger } from '@/core/logger.js';
import type { TestCase, TestCasePriority, TestCaseType, Platform } from '@/types/test-case.types.js';
import { z } from 'zod';

/**
 * 用例查询选项
 */
export interface CaseQueryOptions {
  project?: string;
  priority?: TestCasePriority;
  type?: TestCaseType;
  platform?: Platform;
  tags?: string[];
  search?: string;
}

/**
 * 用例管理器配置
 */
export interface CaseManagerConfig {
  casesDir: string; // 用例存储目录
}

/**
 * 默认配置
 */
const DEFAULT_CASE_MANAGER_CONFIG: CaseManagerConfig = {
  casesDir: './test-suites',
};

/**
 * 测试用例管理器
 * 提供测试用例的增删改查功能
 */
export class CaseManager {
  private config: CaseManagerConfig;

  constructor(config: Partial<CaseManagerConfig> = {}) {
    this.config = { ...DEFAULT_CASE_MANAGER_CONFIG, ...config };
  }

  /**
   * 获取所有项目列表
   */
  async listProjects(): Promise<string[]> {
    try {
      const entries = await fs.readdir(this.config.casesDir, { withFileTypes: true });
      const projects = entries
        .filter(entry => entry.isDirectory() && entry.name !== 'example')
        .map(entry => entry.name);
      return projects;
    } catch {
      return [];
    }
  }

  /**
   * 获取项目用例目录
   */
  private getProjectCasesDir(project: string): string {
    return path.join(this.config.casesDir, project, 'cases');
  }

  /**
   * 确保项目目录存在
   */
  private async ensureProjectDir(project: string): Promise<void> {
    const casesDir = this.getProjectCasesDir(project);
    await fs.mkdir(casesDir, { recursive: true });
  }

  /**
   * 列出所有测试用例
   */
  async listCases(project: string, options?: CaseQueryOptions): Promise<TestCase[]> {
    const casesDir = this.getProjectCasesDir(project);

    try {
      const files = await fs.readdir(casesDir);
      const caseFiles = files.filter(f => f.endsWith('.case.json'));

      const cases: TestCase[] = [];

      for (const file of caseFiles) {
        const filePath = path.join(casesDir, file);
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const testCase = JSON.parse(content) as TestCase;

          // 应用过滤条件
          if (this.matchesQuery(testCase, options)) {
            cases.push(testCase);
          }
        } catch (error) {
          logger.warn(`⚠️ 无法解析用例文件: ${file}`, { error });
        }
      }

      // 按优先级排序
      cases.sort((a, b) => {
        const priorityOrder = { P0: 0, P1: 1, P2: 2, P3: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      return cases;
    } catch {
      return [];
    }
  }

  /**
   * 检查用例是否匹配查询条件
   */
  private matchesQuery(testCase: TestCase, options?: CaseQueryOptions): boolean {
    if (!options) return true;

    if (options.priority && testCase.priority !== options.priority) {
      return false;
    }

    if (options.type && testCase.type !== options.type) {
      return false;
    }

    if (options.platform && !testCase.platform.includes(options.platform)) {
      return false;
    }

    if (options.tags && options.tags.length > 0) {
      const hasTag = options.tags.some(tag => testCase.tags.includes(tag));
      if (!hasTag) return false;
    }

    if (options.search) {
      const searchLower = options.search.toLowerCase();
      const matchesName = testCase.name.toLowerCase().includes(searchLower);
      const matchesDesc = testCase.description.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesDesc) return false;
    }

    return true;
  }

  /**
   * 获取单个测试用例
   */
  async getCase(project: string, caseId: string): Promise<TestCase | null> {
    const casesDir = this.getProjectCasesDir(project);
    const filePath = path.join(casesDir, `${caseId}.case.json`);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as TestCase;
    } catch {
      return null;
    }
  }

  /**
   * 创建测试用例
   */
  async createCase(project: string, testCase: Omit<TestCase, 'id' | 'metadata'>): Promise<TestCase> {
    await this.ensureProjectDir(project);

    const id = this.generateCaseId(testCase.type, testCase.priority);
    const now = new Date().toISOString();

    const newCase: TestCase = {
      ...testCase,
      id,
      metadata: {
        author: 'Manual',
        created: now,
        updated: now,
        run_count: 0,
        pass_rate: 0,
        avg_duration_ms: 0,
      },
    };

    const filePath = path.join(this.getProjectCasesDir(project), `${id}.case.json`);
    await fs.writeFile(filePath, JSON.stringify(newCase, null, 2), 'utf-8');

    logger.pass(`✅ 测试用例已创建: ${id}`, { project, name: testCase.name });
    return newCase;
  }

  /**
   * 更新测试用例
   */
  async updateCase(project: string, caseId: string, updates: Partial<TestCase>): Promise<TestCase | null> {
    const existingCase = await this.getCase(project, caseId);
    if (!existingCase) {
      logger.fail(`❌ 测试用例不存在: ${caseId}`);
      return null;
    }

    const now = new Date().toISOString();
    const updatedCase: TestCase = {
      ...existingCase,
      ...updates,
      id: existingCase.id, // 保持原 ID
      metadata: {
        ...existingCase.metadata,
        updated: now,
      },
    };

    const filePath = path.join(this.getProjectCasesDir(project), `${caseId}.case.json`);
    await fs.writeFile(filePath, JSON.stringify(updatedCase, null, 2), 'utf-8');

    logger.pass(`✅ 测试用例已更新: ${caseId}`, { project });
    return updatedCase;
  }

  /**
   * 删除测试用例
   */
  async deleteCase(project: string, caseId: string): Promise<boolean> {
    const filePath = path.join(this.getProjectCasesDir(project), `${caseId}.case.json`);

    try {
      await fs.unlink(filePath);
      logger.pass(`✅ 测试用例已删除: ${caseId}`, { project });
      return true;
    } catch {
      logger.fail(`❌ 删除失败，用例不存在: ${caseId}`);
      return false;
    }
  }

  /**
   * 复制测试用例
   */
  async copyCase(project: string, caseId: string, newName: string): Promise<TestCase | null> {
    const existingCase = await this.getCase(project, caseId);
    if (!existingCase) {
      return null;
    }

    const copiedCase = await this.createCase(project, {
      ...existingCase,
      name: newName,
      description: `${existingCase.description} (复制)`,
    });

    logger.pass(`✅ 测试用例已复制: ${caseId} → ${copiedCase.id}`);
    return copiedCase;
  }

  /**
   * 批量导入测试用例
   */
  async importCases(project: string, cases: TestCase[]): Promise<{ imported: number; failed: number }> {
    await this.ensureProjectDir(project);

    let imported = 0;
    let failed = 0;

    for (const testCase of cases) {
      try {
        // 确保有 ID
        if (!testCase.id) {
          testCase.id = this.generateCaseId(testCase.type, testCase.priority);
        }

        // 确保有元数据
        if (!testCase.metadata) {
          testCase.metadata = {
            author: 'Imported',
            created: new Date().toISOString(),
            updated: new Date().toISOString(),
          };
        }

        const filePath = path.join(this.getProjectCasesDir(project), `${testCase.id}.case.json`);
        await fs.writeFile(filePath, JSON.stringify(testCase, null, 2), 'utf-8');
        imported++;
      } catch {
        failed++;
      }
    }

    logger.pass(`✅ 批量导入完成`, { imported, failed });
    return { imported, failed };
  }

  /**
   * 批量导出测试用例
   */
  async exportCases(project: string, caseIds?: string[]): Promise<TestCase[]> {
    if (caseIds && caseIds.length > 0) {
      const cases: TestCase[] = [];
      for (const id of caseIds) {
        const testCase = await this.getCase(project, id);
        if (testCase) cases.push(testCase);
      }
      return cases;
    }

    return this.listCases(project);
  }

  /**
   * 获取用例统计信息
   */
  async getStats(project: string): Promise<{
    total: number;
    byPriority: Record<TestCasePriority, number>;
    byType: Record<TestCaseType, number>;
    byPlatform: Record<Platform, number>;
  }> {
    const cases = await this.listCases(project);

    const byPriority: Record<TestCasePriority, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    const byType: Record<TestCaseType, number> = {
      functional: 0,
      visual: 0,
      performance: 0,
      security: 0,
      accessibility: 0,
      compatibility: 0,
      stability: 0,
    };
    const byPlatform: Record<Platform, number> = {
      'pc-web': 0,
      'h5-web': 0,
      'android-app': 0,
      'api': 0,
    };

    for (const testCase of cases) {
      byPriority[testCase.priority]++;
      byType[testCase.type]++;
      for (const platform of testCase.platform) {
        byPlatform[platform]++;
      }
    }

    return {
      total: cases.length,
      byPriority,
      byType,
      byPlatform,
    };
  }

  /**
   * 生成用例 ID
   */
  private generateCaseId(type: TestCaseType, priority: TestCasePriority): string {
    const typePrefix = type.slice(0, 3);
    const randomPart = nanoid(6);
    return `tc-${typePrefix}-${priority}-${randomPart}`;
  }

  /**
   * 验证用例格式
   */
  validateCase(testCase: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // 使用 Zod 进行验证
      const TestCaseSchema = z.object({
        id: z.string().optional(),
        name: z.string().min(1, '名称不能为空'),
        description: z.string().min(1, '描述不能为空'),
        priority: z.enum(['P0', 'P1', 'P2', 'P3']),
        type: z.enum(['functional', 'visual', 'performance', 'security', 'accessibility', 'compatibility', 'stability']),
        platform: z.array(z.enum(['pc-web', 'h5-web', 'android-app', 'api'])),
        tags: z.array(z.string()),
        preconditions: z.array(z.string()).optional(),
        steps: z.array(z.object({
          order: z.number(),
          action: z.string(),
          target: z.string().optional(),
          value: z.string().optional(),
          type: z.string().optional(),
          description: z.string(),
          timeout: z.number().optional(),
          waitBefore: z.number().optional(),
          waitAfter: z.number().optional(),
        })),
        cleanup: z.array(z.any()).optional(),
        metadata: z.any().optional(),
      });

      TestCaseSchema.parse(testCase);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        errors.push(...error.errors.map(e => `${e.path.join('.')}: ${e.message}`));
      }
      return { valid: false, errors };
    }
  }
}

/**
 * 快捷函数：创建用例管理器
 */
export function createCaseManager(config?: Partial<CaseManagerConfig>): CaseManager {
  return new CaseManager(config);
}
/**
 * 数据库适配器 - 支持 sql.js 和 better-sqlite3
 *
 * 优先使用 better-sqlite3（性能更好），如果不可用则降级到 sql.js
 */

import path from 'node:path';
import fs from 'node:fs/promises';

// 类型定义
export interface DatabaseAdapter {
  run(sql: string, params?: unknown[]): DatabaseResult;
  get<T = unknown>(sql: string, params?: unknown[]): T | undefined;
  all<T = unknown>(sql: string, params?: unknown[]): T[];
  exec(sql: string): void;
  prepare(sql: string): StatementAdapter;
  transaction<T>(fn: () => T): T;
  close(): void;
  isOpen(): boolean;
}

export interface StatementAdapter {
  run(...params: unknown[]): DatabaseResult;
  get<T = unknown>(...params: unknown[]): T | undefined;
  all<T = unknown>(...params: unknown[]): T[];
}

export interface DatabaseResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

/**
 * better-sqlite3 适配器
 */
class BetterSQLite3Adapter implements DatabaseAdapter {
  private db: any;
  private open = true;

  constructor(db: any) {
    this.db = db;
  }

  run(sql: string, params: unknown[] = []): DatabaseResult {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
  }

  get<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    return this.db.prepare(sql).get(...params) as T | undefined;
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this.db.prepare(sql).all(...params) as T[];
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  prepare(sql: string): StatementAdapter {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]) => {
        const result = stmt.run(...params);
        return { changes: result.changes, lastInsertRowid: result.lastInsertRowid };
      },
      get: <T = unknown>(...params: unknown[]) => stmt.get(...params) as T | undefined,
      all: <T = unknown>(...params: unknown[]) => stmt.all(...params) as T[],
    };
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  close(): void {
    if (this.open) {
      this.db.close();
      this.open = false;
    }
  }

  isOpen(): boolean {
    return this.open;
  }
}

/**
 * sql.js 适配器
 */
class SqlJsAdapter implements DatabaseAdapter {
  private db: any;
  private open = true;
  private dbPath: string;

  constructor(db: any, dbPath: string) {
    this.db = db;
    this.dbPath = dbPath;
  }

  run(sql: string, params: unknown[] = []): DatabaseResult {
    this.db.run(sql, params);
    const result = this.db.getRowsModified();
    const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0;
    return { changes: result, lastInsertRowid: lastId };
  }

  get<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
    const results = this._query<T>(sql, params);
    return results[0];
  }

  all<T = unknown>(sql: string, params: unknown[] = []): T[] {
    return this._query<T>(sql, params);
  }

  private _query<T>(sql: string, params: unknown[] = []): T[] {
    try {
      // 使用 prepare 和 bind
      const stmt = this.db.prepare(sql);
      if (params.length > 0) {
        stmt.bind(params);
      }

      const results: T[] = [];
      while (stmt.step()) {
        const row = stmt.getAsObject();
        results.push(row as T);
      }
      stmt.free();
      return results;
    } catch {
      // 如果 prepare 失败，尝试直接执行
      const results = this.db.exec(sql, params);
      if (results.length === 0) return [];

      const columns = results[0].columns;
      return results[0].values.map((row: unknown[]) => {
        const obj: Record<string, unknown> = {};
        columns.forEach((col: string, i: number) => {
          obj[col] = row[i];
        });
        return obj as T;
      });
    }
  }

  exec(sql: string): void {
    this.db.run(sql);
  }

  prepare(sql: string): StatementAdapter {
    // sql.js 的 prepare 返回的对象需要手动管理
    const stmt = this.db.prepare(sql);
    return {
      run: (...params: unknown[]) => {
        if (params.length > 0) stmt.bind(params);
        stmt.step();
        stmt.reset();
        const changes = this.db.getRowsModified();
        const lastId = this.db.exec('SELECT last_insert_rowid() as id')[0]?.values[0]?.[0] || 0;
        return { changes, lastInsertRowid: lastId };
      },
      get: <T = unknown>(...params: unknown[]) => {
        if (params.length > 0) stmt.bind(params);
        let result: T | undefined;
        if (stmt.step()) {
          result = stmt.getAsObject() as T;
        }
        stmt.reset();
        return result;
      },
      all: <T = unknown>(...params: unknown[]) => {
        if (params.length > 0) stmt.bind(params);
        const results: T[] = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject() as T);
        }
        stmt.reset();
        return results;
      },
    };
  }

  transaction<T>(fn: () => T): T {
    this.db.run('BEGIN TRANSACTION');
    try {
      const result = fn();
      this.db.run('COMMIT');
      return result;
    } catch (error) {
      this.db.run('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    if (this.open) {
      // 保存数据库到文件
      this._saveToFile();
      this.db.close();
      this.open = false;
    }
  }

  isOpen(): boolean {
    return this.open;
  }

  private async _saveToFile(): Promise<void> {
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      await fs.writeFile(this.dbPath, buffer);
    } catch {
      // 忽略保存错误
    }
  }
}

/**
 * 创建数据库连接
 */
export async function createDatabase(
  dbPath: string,
  logger?: { info: (msg: string, data?: unknown) => void; warn: (msg: string, data?: unknown) => void }
): Promise<{ adapter: DatabaseAdapter; type: 'better-sqlite3' | 'sql.js' }> {
  // 确保目录存在
  const dbDir = path.dirname(dbPath);
  await fs.mkdir(dbDir, { recursive: true });

  // 尝试加载 better-sqlite3
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    logger?.info('✅ 使用 better-sqlite3 数据库引擎', { dbPath });
    return { adapter: new BetterSQLite3Adapter(db), type: 'better-sqlite3' };
  } catch (error) {
    logger?.warn('⚠️ better-sqlite3 不可用，切换到 sql.js', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  // 降级到 sql.js
  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();

    // 尝试加载现有数据库文件
    let db: any;
    try {
      const fileBuffer = await fs.readFile(dbPath);
      db = new SQL.Database(fileBuffer);
    } catch {
      // 文件不存在，创建新数据库
      db = new SQL.Database();
    }

    logger?.info('✅ 使用 sql.js 数据库引擎', { dbPath });
    return { adapter: new SqlJsAdapter(db, dbPath), type: 'sql.js' };
  } catch (error) {
    throw new Error(
      `无法初始化数据库: ${error instanceof Error ? error.message : String(error)}。请安装 better-sqlite3 或 sql.js`
    );
  }
}

export type { DatabaseAdapter as Database };
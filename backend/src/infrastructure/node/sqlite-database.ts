import type { SqlDatabase, SqlStatement, SqlValue } from '../../application/ports';

// node:sqlite is loaded at runtime (Node 22.5+); vite-node can't resolve it as a normal import.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite');
type Db = InstanceType<typeof DatabaseSync>;

/** Local SQL storage: one SQLite file in .admin/ (or ':memory:' in tests). */
export class SqliteDatabase implements SqlDatabase {
  private readonly db: Db;

  constructor(file: string) {
    this.db = new DatabaseSync(file);
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  }

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return this.db.prepare(sql).all(...params) as T[];
  }

  async first<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    return (this.db.prepare(sql).get(...params) as T | undefined) ?? null;
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const r = this.db.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    this.db.exec('BEGIN');
    try {
      for (const s of statements) this.db.prepare(s.sql).run(...(s.params ?? []));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  close(): void {
    this.db.close();
  }
}

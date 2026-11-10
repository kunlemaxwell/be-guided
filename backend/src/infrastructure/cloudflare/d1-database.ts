import type { SqlDatabase, SqlStatement, SqlValue } from '../../application/ports';
import type { D1DatabaseLike } from './bindings';

/** Cloudflare D1 (SQLite) behind the SqlDatabase port. `batch` is atomic in D1. */
export class D1Database implements SqlDatabase {
  constructor(private readonly db: D1DatabaseLike) {}

  async all<T>(sql: string, params: SqlValue[] = []): Promise<T[]> {
    return (await this.db.prepare(sql).bind(...params).all<T>()).results;
  }

  async first<T>(sql: string, params: SqlValue[] = []): Promise<T | null> {
    return this.db.prepare(sql).bind(...params).first<T>();
  }

  async run(sql: string, params: SqlValue[] = []): Promise<{ changes: number }> {
    const r = await this.db.prepare(sql).bind(...params).run();
    return { changes: r.meta.changes ?? 0 };
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    await this.db.batch(statements.map((s) => this.db.prepare(s.sql).bind(...(s.params ?? []))));
  }
}

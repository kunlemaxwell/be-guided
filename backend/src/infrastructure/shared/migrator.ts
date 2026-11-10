import type { SqlDatabase } from '../../application/ports';

export interface Migration {
  /** File name without extension, e.g. "0001_init". */
  name: string;
  sql: string;
}

/**
 * Splits a migration into statements: on ";" at the end of a line, outside
 * "--" comments. Migrations must not put ";" at a line end inside a string.
 */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const raw of sql.split('\n')) {
    const line = raw.replace(/--.*$/, '').trimEnd();
    if (!line.trim()) continue;
    current.push(line);
    if (line.endsWith(';')) {
      out.push(current.join('\n'));
      current = [];
    }
  }
  if (current.length) out.push(current.join('\n'));
  return out;
}

/**
 * One migrator for node:sqlite and D1. Applies, in name order, every
 * migration not yet recorded in schema_migrations; each migration runs in
 * one atomic batch together with its bookkeeping row.
 */
export async function migrate(db: SqlDatabase, migrations: Migration[], now: () => Date = () => new Date()): Promise<string[]> {
  await db.run('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const done = new Set((await db.all<{ name: string }>('SELECT name FROM schema_migrations')).map((r) => r.name));
  const applied: string[] = [];
  for (const m of [...migrations].sort((a, b) => a.name.localeCompare(b.name))) {
    if (done.has(m.name)) continue;
    await db.batch([
      ...splitStatements(m.sql).map((sql) => ({ sql })),
      { sql: 'INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', params: [m.name, now().toISOString()] },
    ]);
    applied.push(m.name);
  }
  return applied;
}

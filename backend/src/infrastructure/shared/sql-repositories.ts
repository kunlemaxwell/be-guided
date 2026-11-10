import type {
  AuditEntryDto,
  AuditQuery,
  DiffHunk,
  FieldChange,
  PageQuery,
  Paged,
  PersonDto,
  RevisionDetailDto,
  RevisionSummaryDto,
} from '../../../../admin/shared/api-types';
import type { ActivityRepository, AppSettingsRepository, PeopleRepository, SqlDatabase, SqlValue } from '../../application/ports';

/** SQL adapters shared by node:sqlite and D1 (same SQLite dialect). Every query is parameterised. */

interface PersonRow {
  id: string;
  name: string;
  email: string | null;
  role: PersonDto['role'];
  active: number;
  created_at: string;
  updated_at: string;
}

function toPerson(r: PersonRow): PersonDto {
  return { id: r.id, name: r.name, email: r.email, role: r.role, active: r.active === 1, createdAt: r.created_at, updatedAt: r.updated_at };
}

export class SqlPeopleRepository implements PeopleRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<PersonDto[]> {
    return (await this.db.all<PersonRow>('SELECT * FROM people ORDER BY active DESC, name COLLATE NOCASE')).map(toPerson);
  }

  async get(id: string): Promise<PersonDto | null> {
    const r = await this.db.first<PersonRow>('SELECT * FROM people WHERE id = ?', [id]);
    return r ? toPerson(r) : null;
  }

  async findByEmail(email: string): Promise<PersonDto | null> {
    const r = await this.db.first<PersonRow>('SELECT * FROM people WHERE email = ?', [email.trim().toLowerCase()]);
    return r ? toPerson(r) : null;
  }

  async insert(p: PersonDto): Promise<void> {
    await this.db.run('INSERT INTO people (id, name, email, role, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
      p.id,
      p.name,
      p.email ? p.email.toLowerCase() : null,
      p.role,
      p.active ? 1 : 0,
      p.createdAt,
      p.updatedAt,
    ]);
  }

  async update(p: PersonDto): Promise<void> {
    await this.db.run('UPDATE people SET name = ?, email = ?, role = ?, active = ?, updated_at = ? WHERE id = ?', [
      p.name,
      p.email ? p.email.toLowerCase() : null,
      p.role,
      p.active ? 1 : 0,
      p.updatedAt,
      p.id,
    ]);
  }

  async count(): Promise<number> {
    return (await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM people'))?.n ?? 0;
  }
}

export class SqlAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly db: SqlDatabase) {}

  async get(key: string): Promise<string | null> {
    return (await this.db.first<{ value: string | null }>('SELECT value FROM app_settings WHERE key = ?', [key]))?.value ?? null;
  }

  async set(key: string, value: string | null, at: string): Promise<void> {
    await this.db.run(
      'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at',
      [key, value, at],
    );
  }
}

interface AuditRow {
  id: string;
  at: string;
  actor_id: string | null;
  actor_name: string;
  area: AuditEntryDto['area'];
  action: string;
  target: string;
  summary: string;
  details: string;
  correlation_id: string | null;
}

interface RevisionRow {
  id: string;
  page_id: string;
  created_at: string;
  actor_id: string | null;
  actor_name: string;
  action: RevisionSummaryDto['action'];
  summary: string;
  field_changes: string;
  body_diff: string;
  lines_added: number;
  lines_removed: number;
  correlation_id: string | null;
}

function parseJson<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function toAudit(r: AuditRow): AuditEntryDto {
  return {
    id: r.id,
    at: r.at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    area: r.area,
    action: r.action,
    target: r.target,
    summary: r.summary,
    details: parseJson<unknown>(r.details, {}),
    correlationId: r.correlation_id,
  };
}

function toRevisionSummary(r: RevisionRow): RevisionSummaryDto {
  return {
    id: r.id,
    pageId: r.page_id,
    createdAt: r.created_at,
    actorId: r.actor_id,
    actorName: r.actor_name,
    action: r.action,
    summary: r.summary,
    linesAdded: r.lines_added,
    linesRemoved: r.lines_removed,
  };
}

function paged<T>(items: T[], total: number, q: PageQuery): Paged<T> {
  return { items, pageNumber: q.pageNumber, pageSize: q.pageSize, totalCount: total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) };
}

/** "2026-11-03" → inclusive start/end ISO bounds. Times are stored as UTC ISO strings. */
function dayStart(d: string): string {
  return d.length === 10 ? `${d}T00:00:00.000Z` : d;
}
function dayEnd(d: string): string {
  return d.length === 10 ? `${d}T23:59:59.999Z` : d;
}

function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export class SqlActivityRepository implements ActivityRepository {
  constructor(private readonly db: SqlDatabase) {}

  async record(e: AuditEntryDto, revision?: RevisionDetailDto): Promise<void> {
    const statements = [
      {
        sql: 'INSERT INTO audit_log (id, at, actor_id, actor_name, area, action, target, summary, details, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [e.id, e.at, e.actorId, e.actorName, e.area, e.action, e.target, e.summary, JSON.stringify(e.details ?? {}), e.correlationId] as SqlValue[],
      },
    ];
    if (revision) {
      statements.push({
        sql: 'INSERT INTO page_revisions (id, page_id, created_at, actor_id, actor_name, action, summary, field_changes, body_diff, lines_added, lines_removed, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [
          revision.id,
          revision.pageId,
          revision.createdAt,
          revision.actorId,
          revision.actorName,
          revision.action,
          revision.summary,
          JSON.stringify(revision.fieldChanges),
          JSON.stringify(revision.bodyDiff),
          revision.linesAdded,
          revision.linesRemoved,
          revision.correlationId,
        ],
      });
    }
    await this.db.batch(statements);
  }

  async queryAudit(q: AuditQuery): Promise<Paged<AuditEntryDto>> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (q.area) {
      where.push('area = ?');
      params.push(q.area);
    }
    if (q.actorId) {
      where.push('actor_id = ?');
      params.push(q.actorId);
    }
    if (q.from) {
      where.push('at >= ?');
      params.push(dayStart(q.from));
    }
    if (q.to) {
      where.push('at <= ?');
      params.push(dayEnd(q.to));
    }
    if (q.q) {
      where.push("(summary LIKE ? ESCAPE '\\' OR target LIKE ? ESCAPE '\\' OR actor_name LIKE ? ESCAPE '\\')");
      const like = `%${escapeLike(q.q)}%`;
      params.push(like, like, like);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const total = (await this.db.first<{ n: number }>(`SELECT COUNT(*) AS n FROM audit_log ${clause}`, params))?.n ?? 0;
    const rows = await this.db.all<AuditRow>(`SELECT * FROM audit_log ${clause} ORDER BY at DESC, id DESC LIMIT ? OFFSET ?`, [
      ...params,
      q.pageSize,
      (q.pageNumber - 1) * q.pageSize,
    ]);
    return paged(rows.map(toAudit), total, q);
  }

  async getAudit(id: string): Promise<AuditEntryDto | null> {
    const r = await this.db.first<AuditRow>('SELECT * FROM audit_log WHERE id = ?', [id]);
    return r ? toAudit(r) : null;
  }

  async listRevisions(pageId: string, q: PageQuery): Promise<Paged<RevisionSummaryDto>> {
    const total = (await this.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM page_revisions WHERE page_id = ?', [pageId]))?.n ?? 0;
    const rows = await this.db.all<RevisionRow>(
      'SELECT id, page_id, created_at, actor_id, actor_name, action, summary, lines_added, lines_removed, correlation_id, \'[]\' AS field_changes, \'[]\' AS body_diff FROM page_revisions WHERE page_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?',
      [pageId, q.pageSize, (q.pageNumber - 1) * q.pageSize],
    );
    return paged(rows.map(toRevisionSummary), total, q);
  }

  async getRevision(pageId: string, id: string): Promise<RevisionDetailDto | null> {
    const r = await this.db.first<RevisionRow>('SELECT * FROM page_revisions WHERE page_id = ? AND id = ?', [pageId, id]);
    if (!r) return null;
    return {
      ...toRevisionSummary(r),
      fieldChanges: parseJson<FieldChange[]>(r.field_changes, []),
      bodyDiff: parseJson<DiffHunk[]>(r.body_diff, []),
      correlationId: r.correlation_id,
    };
  }
}

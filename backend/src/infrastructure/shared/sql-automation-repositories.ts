import type { ChangeDto, CheckDto, Frequency, SkillDto, VoteDto } from '../../../../admin/shared/automation-types';
import type { ContentMode } from '../../../../src/types/content';
import type { SqlDatabase, SqlStatement } from '../../application/ports';

/** SQL adapters for update plans, check runs, skills and readers' votes (node:sqlite and D1). */

export interface PlanRecord {
  id: string;
  name: string;
  autoCheck: boolean;
  frequency: Frequency;
  timeZone: string;
  autoUpdate: boolean;
  requireApproval: boolean;
  contentMode: ContentMode;
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlanRow {
  id: string;
  name: string;
  auto_check: number;
  frequency: string;
  time_zone: string;
  auto_update: number;
  require_approval: number;
  content_mode: string;
  built_in: number;
  created_at: string;
  updated_at: string;
}

const toPlan = (r: PlanRow): PlanRecord => ({
  id: r.id,
  name: r.name,
  autoCheck: r.auto_check === 1,
  frequency: JSON.parse(r.frequency) as Frequency,
  timeZone: r.time_zone,
  autoUpdate: r.auto_update === 1,
  requireApproval: r.require_approval === 1,
  contentMode: r.content_mode as ContentMode,
  builtIn: r.built_in === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

export interface AssignmentRecord {
  product: string;
  planId: string;
  assignedAt: string;
  assignedBy: string | null;
}

export class SqlPlanRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<PlanRecord[]> {
    return (await this.db.all<PlanRow>('SELECT * FROM update_plans WHERE deleted_at IS NULL ORDER BY built_in DESC, name')).map(toPlan);
  }

  async get(id: string): Promise<PlanRecord | null> {
    const r = await this.db.first<PlanRow>('SELECT * FROM update_plans WHERE id = ? AND deleted_at IS NULL', [id]);
    return r ? toPlan(r) : null;
  }

  async upsert(p: PlanRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO update_plans (id, name, auto_check, frequency, time_zone, auto_update, require_approval, content_mode, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, auto_check = excluded.auto_check, frequency = excluded.frequency, time_zone = excluded.time_zone,
         auto_update = excluded.auto_update, require_approval = excluded.require_approval, content_mode = excluded.content_mode, updated_at = excluded.updated_at`,
      [p.id, p.name, p.autoCheck ? 1 : 0, JSON.stringify(p.frequency), p.timeZone, p.autoUpdate ? 1 : 0, p.requireApproval ? 1 : 0, p.contentMode, p.builtIn ? 1 : 0, p.createdAt, p.updatedAt],
    );
  }

  /** Soft delete; also switches the plan off for every product. */
  async remove(id: string, at: string): Promise<void> {
    await this.db.batch([
      { sql: 'DELETE FROM plan_assignments WHERE plan_id = ?', params: [id] },
      { sql: 'UPDATE update_plans SET deleted_at = ? WHERE id = ?', params: [at, id] },
    ]);
  }

  async assignments(): Promise<AssignmentRecord[]> {
    const rows = await this.db.all<{ product: string; plan_id: string; assigned_at: string; assigned_by: string | null }>('SELECT * FROM plan_assignments ORDER BY product');
    return rows.map((r) => ({ product: r.product, planId: r.plan_id, assignedAt: r.assigned_at, assignedBy: r.assigned_by }));
  }

  /** Sets (or with planId null, clears) the plan for each product, atomically. One plan per product. */
  async assign(products: string[], planId: string | null, at: string, by: string | null): Promise<void> {
    const statements: SqlStatement[] = products.map((product) =>
      planId
        ? {
            sql: 'INSERT INTO plan_assignments (product, plan_id, assigned_at, assigned_by) VALUES (?, ?, ?, ?) ON CONFLICT (product) DO UPDATE SET plan_id = excluded.plan_id, assigned_at = excluded.assigned_at, assigned_by = excluded.assigned_by',
            params: [product, planId, at, by],
          }
        : { sql: 'DELETE FROM plan_assignments WHERE product = ?', params: [product] },
    );
    if (statements.length) await this.db.batch(statements);
  }
}

export interface CheckRecord extends Omit<CheckDto, 'changeCount' | 'pendingCount'> {}

interface CheckRow {
  id: string;
  product: string;
  plan_id: string | null;
  plan_name: string | null;
  trigger: 'schedule' | 'manual';
  status: CheckDto['status'];
  content_mode: string;
  auto_update: number;
  require_approval: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  requested_by: string | null;
  run_by: string | null;
  summary: string | null;
  error: string | null;
  change_count?: number;
  pending_count?: number;
}

const toCheck = (r: CheckRow): CheckDto => ({
  id: r.id,
  product: r.product,
  planId: r.plan_id,
  planName: r.plan_name,
  trigger: r.trigger,
  status: r.status,
  contentMode: r.content_mode as ContentMode,
  autoUpdate: r.auto_update === 1,
  requireApproval: r.require_approval === 1,
  createdAt: r.created_at,
  startedAt: r.started_at,
  finishedAt: r.finished_at,
  requestedBy: r.requested_by,
  runBy: r.run_by,
  summary: r.summary,
  error: r.error,
  changeCount: r.change_count ?? 0,
  pendingCount: r.pending_count ?? 0,
});

interface ChangeRow {
  id: string;
  check_id: string;
  seq: number;
  page_id: string | null;
  kind: ChangeDto['kind'];
  title: string;
  detail: string;
  evidence: string | null;
  decision: ChangeDto['decision'];
  mode: string | null;
  decided_by: string | null;
  decided_at: string | null;
}

const toChange = (r: ChangeRow): ChangeDto => ({
  id: r.id,
  pageId: r.page_id,
  kind: r.kind,
  title: r.title,
  detail: r.detail,
  evidence: r.evidence,
  decision: r.decision,
  mode: (r.mode as ContentMode | null) ?? null,
  decidedBy: r.decided_by,
  decidedAt: r.decided_at,
});

const CHECK_WITH_COUNTS = `SELECT c.*,
  (SELECT COUNT(*) FROM update_check_changes x WHERE x.check_id = c.id) AS change_count,
  (SELECT COUNT(*) FROM update_check_changes x WHERE x.check_id = c.id AND x.decision = 'pending') AS pending_count
  FROM update_checks c`;

export class SqlCheckRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(filter: { product?: string; status?: CheckDto['status'][]; limit: number; offset?: number }): Promise<CheckDto[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.product) {
      where.push('c.product = ?');
      params.push(filter.product);
    }
    if (filter.status?.length) {
      where.push(`c.status IN (${filter.status.map(() => '?').join(', ')})`);
      params.push(...filter.status);
    }
    params.push(filter.limit, filter.offset ?? 0);
    const sql = `${CHECK_WITH_COUNTS}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY c.created_at DESC LIMIT ? OFFSET ?`;
    return (await this.db.all<CheckRow>(sql, params)).map(toCheck);
  }

  async get(id: string): Promise<CheckDto | null> {
    const r = await this.db.first<CheckRow>(`${CHECK_WITH_COUNTS} WHERE c.id = ?`, [id]);
    return r ? toCheck(r) : null;
  }

  /** The most recent check of a product that the schedule counts as "a run" (queued or later). */
  async lastScheduledRun(product: string): Promise<string | null> {
    const r = await this.db.first<{ created_at: string }>("SELECT created_at FROM update_checks WHERE product = ? AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 1", [product]);
    return r?.created_at ?? null;
  }

  /** True when the product already has a check that is not finished. */
  async hasOpen(product: string): Promise<boolean> {
    const r = await this.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM update_checks WHERE product = ? AND status IN ('queued', 'running')", [product]);
    return (r?.n ?? 0) > 0;
  }

  async insert(c: CheckRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO update_checks (id, product, plan_id, plan_name, trigger, status, content_mode, auto_update, require_approval, created_at, started_at, finished_at, requested_by, run_by, summary, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [c.id, c.product, c.planId, c.planName, c.trigger, c.status, c.contentMode, c.autoUpdate ? 1 : 0, c.requireApproval ? 1 : 0, c.createdAt, c.startedAt, c.finishedAt, c.requestedBy, c.runBy, c.summary, c.error],
    );
  }

  /** Moves a queued check to running for one runner; false when someone else took it first. */
  async claim(id: string, runBy: string, at: string): Promise<boolean> {
    const r = await this.db.run("UPDATE update_checks SET status = 'running', started_at = ?, run_by = ? WHERE id = ? AND status = 'queued'", [at, runBy, id]);
    return r.changes > 0;
  }

  async setStatus(id: string, status: CheckDto['status'], fields: { summary?: string | null; error?: string | null; finishedAt?: string | null } = {}): Promise<void> {
    const sets = ['status = ?'];
    const params: (string | null)[] = [status];
    if (fields.summary !== undefined) {
      sets.push('summary = ?');
      params.push(fields.summary);
    }
    if (fields.error !== undefined) {
      sets.push('error = ?');
      params.push(fields.error);
    }
    if (fields.finishedAt !== undefined) {
      sets.push('finished_at = ?');
      params.push(fields.finishedAt);
    }
    params.push(id);
    await this.db.run(`UPDATE update_checks SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  async changes(checkId: string): Promise<ChangeDto[]> {
    return (await this.db.all<ChangeRow>('SELECT * FROM update_check_changes WHERE check_id = ? ORDER BY seq', [checkId])).map(toChange);
  }

  /** Stores what a check found and its summary in one go. */
  async report(checkId: string, summary: string, status: CheckDto['status'], changes: ChangeDto[], finishedAt: string | null): Promise<void> {
    const statements: SqlStatement[] = [
      { sql: 'DELETE FROM update_check_changes WHERE check_id = ?', params: [checkId] },
      ...changes.map((ch, i) => ({
        sql: 'INSERT INTO update_check_changes (id, check_id, seq, page_id, kind, title, detail, evidence, decision, mode, decided_by, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        params: [ch.id, checkId, i + 1, ch.pageId, ch.kind, ch.title, ch.detail, ch.evidence, ch.decision, ch.mode, ch.decidedBy, ch.decidedAt],
      })),
      { sql: 'UPDATE update_checks SET summary = ?, status = ?, finished_at = ? WHERE id = ?', params: [summary, status, finishedAt, checkId] },
    ];
    await this.db.batch(statements);
  }

  async decideChanges(checkId: string, items: { id: string; decision: ChangeDto['decision']; mode: ContentMode | null }[], by: string, at: string): Promise<void> {
    if (!items.length) return;
    await this.db.batch(
      items.map((i) => ({
        sql: 'UPDATE update_check_changes SET decision = ?, mode = ?, decided_by = ?, decided_at = ? WHERE id = ? AND check_id = ?',
        params: [i.decision, i.mode, by, at, i.id, checkId],
      })),
    );
  }
}

export interface SkillRecord extends Omit<SkillDto, 'size'> {}

interface SkillRow {
  id: string;
  kind: 'writing' | 'qa';
  name: string;
  content: string;
  file_name: string | null;
  products: string | null;
  active: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

const toSkill = (r: SkillRow): SkillDto => ({
  id: r.id,
  kind: r.kind,
  name: r.name,
  content: r.content,
  fileName: r.file_name,
  products: r.products ? (JSON.parse(r.products) as string[]) : null,
  active: r.active === 1,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  createdBy: r.created_by,
  size: r.content.length,
});

export class SqlSkillRepository {
  constructor(private readonly db: SqlDatabase) {}

  async list(): Promise<SkillDto[]> {
    return (await this.db.all<SkillRow>('SELECT * FROM skills WHERE deleted_at IS NULL ORDER BY kind, name')).map(toSkill);
  }

  async get(id: string): Promise<SkillDto | null> {
    const r = await this.db.first<SkillRow>('SELECT * FROM skills WHERE id = ? AND deleted_at IS NULL', [id]);
    return r ? toSkill(r) : null;
  }

  async upsert(s: SkillRecord): Promise<void> {
    await this.db.run(
      `INSERT INTO skills (id, kind, name, content, file_name, products, active, created_at, updated_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET kind = excluded.kind, name = excluded.name, content = excluded.content, file_name = excluded.file_name,
         products = excluded.products, active = excluded.active, updated_at = excluded.updated_at`,
      [s.id, s.kind, s.name, s.content, s.fileName, s.products ? JSON.stringify(s.products) : null, s.active ? 1 : 0, s.createdAt, s.updatedAt, s.createdBy],
    );
  }

  async remove(id: string, at: string): Promise<boolean> {
    return (await this.db.run('UPDATE skills SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL', [at, id])).changes > 0;
  }
}

interface VoteRow {
  id: string;
  page_id: string;
  visitor: string;
  helpful: number;
  comment: string | null;
  email: string | null;
  country: string | null;
  created_at: string;
  updated_at: string;
}

export class SqlVoteRepository {
  constructor(private readonly db: SqlDatabase) {}

  /** One vote per page per browser: a second vote replaces the first. */
  async upsert(v: { id: string; pageId: string; visitor: string; helpful: boolean; comment: string | null; email: string | null; country: string | null; at: string }): Promise<void> {
    await this.db.run(
      `INSERT INTO page_votes (id, page_id, visitor, helpful, comment, email, country, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (page_id, visitor) DO UPDATE SET helpful = excluded.helpful,
         comment = COALESCE(excluded.comment, page_votes.comment), email = COALESCE(excluded.email, page_votes.email),
         country = excluded.country, updated_at = excluded.updated_at`,
      [v.id, v.pageId, v.visitor, v.helpful ? 1 : 0, v.comment, v.email, v.country, v.at, v.at],
    );
  }

  async list(filter: { pageId?: string; helpful?: boolean; limit: number }): Promise<Omit<VoteDto, 'pageTitle'>[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (filter.pageId) {
      where.push('page_id = ?');
      params.push(filter.pageId);
    }
    if (filter.helpful !== undefined) {
      where.push('helpful = ?');
      params.push(filter.helpful ? 1 : 0);
    }
    params.push(filter.limit);
    const rows = await this.db.all<VoteRow>(`SELECT * FROM page_votes${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC LIMIT ?`, params);
    return rows.map((r) => ({ id: r.id, pageId: r.page_id, helpful: r.helpful === 1, comment: r.comment, email: r.email, country: r.country, createdAt: r.created_at, updatedAt: r.updated_at }));
  }

  async perPage(): Promise<{ pageId: string; up: number; down: number; lastAt: string }[]> {
    const rows = await this.db.all<{ page_id: string; up: number; down: number; last_at: string }>(
      'SELECT page_id, SUM(helpful) AS up, SUM(1 - helpful) AS down, MAX(updated_at) AS last_at FROM page_votes GROUP BY page_id ORDER BY down DESC, up DESC',
    );
    return rows.map((r) => ({ pageId: r.page_id, up: Number(r.up), down: Number(r.down), lastAt: r.last_at }));
  }

  async totals(): Promise<{ up: number; down: number; comments: number }> {
    const r = await this.db.first<{ up: number | null; down: number | null; comments: number | null }>(
      "SELECT SUM(helpful) AS up, SUM(1 - helpful) AS down, SUM(CASE WHEN comment IS NOT NULL AND comment <> '' THEN 1 ELSE 0 END) AS comments FROM page_votes",
    );
    return { up: Number(r?.up ?? 0), down: Number(r?.down ?? 0), comments: Number(r?.comments ?? 0) };
  }
}

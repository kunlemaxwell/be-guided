import type { GuideRequest } from '../../../../admin/shared/api-types';
import {
  planInputSchema,
  type AssignInput,
  type ChangeDto,
  type CheckDetailDto,
  type CheckDto,
  type DecideInput,
  type PlanDto,
  type PlanInput,
  type ProductScheduleDto,
  type ReportInput,
  type SkillDto,
  type SkillInput,
} from '../../../../admin/shared/automation-types';
import type { ContentMode } from '../../../../src/types/content';
import type { RequestContext } from '../../domain/actor';
import { AppError } from '../../domain/errors';
import { describeFrequency, isDue, isValidTimeZone, nextRun } from '../../domain/schedule';
import type { PlanRecord, SqlCheckRepository, SqlPlanRepository, SqlSkillRepository } from '../../infrastructure/shared/sql-automation-repositories';
import type { Clock } from '../ports';
import type { ActivityService } from './activity-service';
import type { ContentService } from './content-service';
import type { RequestService } from './request-service';

export type Level = 'read' | 'write' | 'manage';

/** read = anyone signed in; write = editors and owners; manage = owners. */
export function allowed(role: string, level: Level): boolean {
  if (level === 'read') return true;
  if (level === 'write') return role === 'owner' || role === 'editor';
  return role === 'owner';
}

/** null = every product (owners in the admin, or a key for every product). */
export type ProductScope = string[] | null;

const MODE_LABEL: Record<ContentMode, string> = { text: 'Text only', 'text+screens': 'Text + screenshots', video: 'Video only', all: 'Everything (text, screenshots, video)' };

/** What an AI gets when it takes a check: everything it needs to do the job. */
export interface CheckJob {
  check: CheckDto;
  product: { slug: string; name: string; repos: { url: string; branch: string; paths: string[]; localPath?: string }[] };
  plan: { name: string; contentMode: ContentMode; contentModeLabel: string; autoUpdate: boolean; requireApproval: boolean } | null;
  skills: { kind: 'writing' | 'qa'; name: string; content: string }[];
  steps: string[];
}

export class AutomationService {
  constructor(
    private readonly plans: SqlPlanRepository,
    private readonly checks: SqlCheckRepository,
    private readonly skills: SqlSkillRepository,
    private readonly content: ContentService,
    private readonly requests: RequestService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly newId: () => string,
  ) {}

  private require(ctx: RequestContext, level: Level): void {
    if (!allowed(ctx.actor.role, level)) {
      throw new AppError('FORBIDDEN', level === 'manage' ? 'Only owners can change automatic checks and skills.' : 'Viewers can look but not change anything.');
    }
  }

  private inScope(scope: ProductScope, product: string): void {
    if (scope && !scope.includes(product)) throw new AppError('FORBIDDEN', `Your key does not cover the product "${product}".`);
  }

  // ── Plans and schedules ────────────────────────────────────────────────

  async overview(scope: ProductScope): Promise<{ products: ProductScheduleDto[]; plans: PlanDto[]; recentChecks: CheckDto[]; skills: Omit<SkillDto, 'content'>[] }> {
    const [directory, plans, assignments, skills] = await Promise.all([this.content.productDirectory(), this.plans.list(), this.plans.assignments(), this.skills.list()]);
    const byId = new Map(plans.map((p) => [p.id, p]));
    const now = this.clock.now();
    const visible = directory.filter((p) => !scope || scope.includes(p.slug));
    const products: ProductScheduleDto[] = [];
    for (const p of visible) {
      const a = assignments.find((x) => x.product === p.slug);
      const plan = a ? byId.get(a.planId) : undefined;
      const last = await this.checks.lastScheduledRun(p.slug);
      const lastRun = last ? new Date(last) : null;
      const next = plan?.autoCheck ? nextRun(plan.frequency, plan.timeZone, lastRun && lastRun > new Date(a!.assignedAt) ? lastRun : new Date(Math.max(new Date(a!.assignedAt).getTime(), now.getTime() - 1)), lastRun) : null;
      products.push({ product: p.slug, name: p.name, planId: plan?.id ?? null, planName: plan?.name ?? null, nextRunAt: next ? next.toISOString() : null, lastRunAt: last });
    }
    const recentChecks = (await this.checks.list({ limit: 30 })).filter((c) => !scope || scope.includes(c.product));
    return {
      products,
      plans: plans.map((p) => this.planDto(p, assignments.filter((a) => a.planId === p.id).map((a) => a.product))),
      recentChecks,
      skills: skills.filter((s) => !scope || !s.products || s.products.some((x) => scope.includes(x))).map(({ content: _c, ...rest }) => rest),
    };
  }

  private planDto(p: PlanRecord, products: string[]): PlanDto {
    return { ...p, products };
  }

  async savePlan(ctx: RequestContext, raw: PlanInput): Promise<PlanDto> {
    this.require(ctx, 'manage');
    const input = planInputSchema.parse(raw);
    if (!isValidTimeZone(input.timeZone)) throw new AppError('INVALID', `"${input.timeZone}" is not a time zone this server knows. Try Africa/Lagos or Europe/London.`, [{ field: 'timeZone', message: 'Unknown time zone' }]);
    if (!input.autoUpdate && !input.autoCheck) {
      // A plan that neither checks nor updates is allowed: it is a "Check now" preset.
    }
    const now = this.clock.now().toISOString();
    const existing = input.id ? await this.plans.get(input.id) : null;
    if (input.id && !existing) throw new AppError('NOT_FOUND', 'That plan no longer exists.');
    const record: PlanRecord = {
      id: existing?.id ?? `plan-${this.newId().slice(0, 8)}`,
      name: input.name,
      autoCheck: input.autoCheck,
      frequency: input.frequency,
      timeZone: input.timeZone,
      autoUpdate: input.autoUpdate,
      requireApproval: input.autoUpdate ? input.requireApproval : true,
      contentMode: input.contentMode,
      builtIn: existing?.builtIn ?? false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await this.plans.upsert(record);
    await this.activity.record(ctx, { area: 'automation', action: existing ? 'plan.update' : 'plan.create', target: record.id, summary: `${existing ? 'Changed' : 'Added'} update plan “${record.name}” (${describeFrequency(record.frequency, record.timeZone)}, ${MODE_LABEL[record.contentMode]})` });
    const products = (await this.plans.assignments()).filter((a) => a.planId === record.id).map((a) => a.product);
    return this.planDto(record, products);
  }

  async deletePlan(ctx: RequestContext, id: string): Promise<{ removed: true }> {
    this.require(ctx, 'manage');
    const plan = await this.plans.get(id);
    if (!plan) throw new AppError('NOT_FOUND', 'That plan no longer exists.');
    if (plan.builtIn) throw new AppError('INVALID', 'Ready-made plans can be changed or switched off, but not deleted.');
    await this.plans.remove(id, this.clock.now().toISOString());
    await this.activity.record(ctx, { area: 'automation', action: 'plan.delete', target: id, summary: `Deleted update plan “${plan.name}”` });
    return { removed: true };
  }

  /** Switches a plan on for products (replacing whatever plan they had), or off with planId null. */
  async assign(ctx: RequestContext, input: AssignInput): Promise<ProductScheduleDto[]> {
    this.require(ctx, 'manage');
    const directory = await this.content.productDirectory();
    const products = input.products === 'all' ? directory.map((p) => p.slug) : input.products;
    for (const p of products) if (!directory.some((d) => d.slug === p)) throw new AppError('NOT_FOUND', `There is no product "${p}".`);
    let planName = 'off';
    if (input.planId) {
      const plan = await this.plans.get(input.planId);
      if (!plan) throw new AppError('NOT_FOUND', 'That plan no longer exists.');
      planName = `“${plan.name}”`;
    }
    await this.plans.assign(products, input.planId, this.clock.now().toISOString(), ctx.actor.name);
    await this.activity.record(ctx, { area: 'automation', action: 'plan.assign', target: input.planId ?? 'off', summary: `Set automatic checks to ${planName} for ${input.products === 'all' ? 'all products' : products.join(', ')}` });
    return (await this.overview(null)).products;
  }

  // ── Check runs ─────────────────────────────────────────────────────────

  /** Queues a check right now ("Check now"), using the product's plan if it has one. */
  async runCheckNow(ctx: RequestContext, scope: ProductScope, product: string, contentMode?: ContentMode): Promise<CheckDto> {
    this.require(ctx, 'write');
    this.inScope(scope, product);
    const directory = await this.content.productDirectory();
    if (!directory.some((d) => d.slug === product)) throw new AppError('NOT_FOUND', `There is no product "${product}".`);
    if (await this.checks.hasOpen(product)) throw new AppError('CONFLICT', 'A check for this product is already waiting or running.');
    const assignment = (await this.plans.assignments()).find((a) => a.product === product);
    const plan = assignment ? await this.plans.get(assignment.planId) : null;
    const check = await this.queue(product, plan, 'manual', ctx.actor.name, contentMode);
    await this.activity.record(ctx, { area: 'automation', action: 'check.queue', target: check.id, summary: `Asked for an update check of ${product}${plan ? ` (plan “${plan.name}”)` : ''}` });
    return check;
  }

  private async queue(product: string, plan: PlanRecord | null, trigger: 'schedule' | 'manual', by: string | null, mode?: ContentMode): Promise<CheckDto> {
    const record = {
      id: `chk-${this.newId().slice(0, 12)}`,
      product,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      trigger,
      status: 'queued' as const,
      contentMode: mode ?? plan?.contentMode ?? 'text+screens',
      autoUpdate: plan?.autoUpdate ?? false,
      requireApproval: plan ? plan.requireApproval : true,
      createdAt: this.clock.now().toISOString(),
      startedAt: null,
      finishedAt: null,
      requestedBy: by,
      runBy: null,
      summary: null,
      error: null,
    };
    await this.checks.insert(record);
    return { ...record, changeCount: 0, pendingCount: 0 };
  }

  /** Called by the clock (Cloudflare cron, or the local admin's timer): queues every check that is due. */
  async tick(): Promise<string[]> {
    const now = this.clock.now();
    const [plans, assignments] = await Promise.all([this.plans.list(), this.plans.assignments()]);
    const queued: string[] = [];
    for (const a of assignments) {
      const plan = plans.find((p) => p.id === a.planId);
      if (!plan?.autoCheck) continue;
      if (await this.checks.hasOpen(a.product)) continue;
      const last = await this.checks.lastScheduledRun(a.product);
      const lastRun = last && new Date(last) > new Date(a.assignedAt) ? new Date(last) : null;
      if (!isDue(plan.frequency, plan.timeZone, now, lastRun, new Date(a.assignedAt))) continue;
      queued.push((await this.queue(a.product, plan, 'schedule', null)).id);
    }
    return queued;
  }

  async listChecks(scope: ProductScope, filter: { product?: string; status?: CheckDto['status'][]; limit?: number; offset?: number }): Promise<CheckDto[]> {
    if (filter.product) this.inScope(scope, filter.product);
    const rows = await this.checks.list({ product: filter.product, status: filter.status, limit: Math.min(filter.limit ?? 50, 200), offset: filter.offset });
    return rows.filter((c) => !scope || scope.includes(c.product));
  }

  async getCheck(scope: ProductScope, id: string): Promise<CheckDetailDto> {
    const check = await this.checks.get(id);
    if (!check) throw new AppError('NOT_FOUND', 'That check no longer exists.');
    this.inScope(scope, check.product);
    return { ...check, changes: await this.checks.changes(id) };
  }

  /** An AI takes the next queued check (or a given one) and gets the whole job description. */
  async claimCheck(ctx: RequestContext, scope: ProductScope, id?: string): Promise<CheckJob | null> {
    this.require(ctx, 'write');
    let check: CheckDto | null;
    if (id) {
      check = await this.checks.get(id);
      if (!check) throw new AppError('NOT_FOUND', 'That check no longer exists.');
      this.inScope(scope, check.product);
      if (check.status !== 'queued') throw new AppError('CONFLICT', `That check is ${check.status}, not waiting to start.`);
    } else {
      const waiting = (await this.checks.list({ status: ['queued'], limit: 50 })).filter((c) => !scope || scope.includes(c.product)).reverse();
      check = waiting[0] ?? null;
      if (!check) return null;
    }
    if (!(await this.checks.claim(check.id, ctx.actor.name, this.clock.now().toISOString()))) throw new AppError('CONFLICT', 'Someone else started that check a moment ago.');
    const product = (await this.content.productDirectory()).find((p) => p.slug === check!.product);
    const skills = await this.skillsFor(check.product);
    await this.activity.record(ctx, { area: 'automation', action: 'check.start', target: check.id, summary: `Started the update check of ${check.product}` });
    const started = (await this.checks.get(check.id))!;
    return {
      check: started,
      product: { slug: check.product, name: product?.name ?? check.product, repos: product?.repos ?? [] },
      plan: { name: check.planName ?? 'Check now', contentMode: check.contentMode, contentModeLabel: MODE_LABEL[check.contentMode], autoUpdate: check.autoUpdate, requireApproval: check.requireApproval },
      skills: skills.map((s) => ({ kind: s.kind, name: s.name, content: s.content })),
      steps: [
        'Read the product\'s code (the repos above; on the person\'s computer, use the local folder when given) and compare it with every guide page of this product (list_products, read_page).',
        'If a QA skill is listed, follow it while you look: record real bugs you see as changes of kind "bug".',
        'List every difference that matters to a reader: changed screens or labels, new features without a guide, removed features, pages to add. Give each the page id it affects and where in the code you saw it (evidence).',
        'Call report_update_check once with a short summary and the list. Report an empty list if nothing changed.',
        'If the answer says to apply changes now, update those pages in the content mode it gives (follow the writing skill and get_writing_standard), then call mark_changes_applied. Otherwise stop: a person will choose what to apply.',
        'If you cannot finish, call fail_update_check with the reason.',
      ],
    };
  }

  async reportCheck(ctx: RequestContext, scope: ProductScope, input: ReportInput): Promise<{ check: CheckDetailDto; applyNow: { changeIds: string[]; contentMode: ContentMode; contentModeLabel: string } | null; message: string }> {
    this.require(ctx, 'write');
    const check = await this.checks.get(input.checkId);
    if (!check) throw new AppError('NOT_FOUND', 'That check no longer exists.');
    this.inScope(scope, check.product);
    if (check.status !== 'running') throw new AppError('CONFLICT', `That check is ${check.status}; only a running check can be reported.`);
    for (const c of input.changes) {
      if (c.pageId && !c.pageId.startsWith(`${check.product}/`)) throw new AppError('INVALID', `The page ${c.pageId} is not in ${check.product}.`, [{ field: 'changes', message: 'Page from another product' }]);
    }
    const now = this.clock.now().toISOString();
    const autoApply = check.autoUpdate && !check.requireApproval;
    const changes: ChangeDto[] = input.changes.map((c) => {
      const applies = autoApply && c.kind !== 'bug';
      return {
        id: `chg-${this.newId().slice(0, 12)}`,
        pageId: c.pageId ?? null,
        kind: c.kind,
        title: c.title,
        detail: c.detail ?? '',
        evidence: c.evidence ?? null,
        decision: applies ? 'selected' : 'pending',
        mode: applies ? check.contentMode : null,
        decidedBy: applies ? `Plan “${check.planName ?? ''}” (no approval needed)` : null,
        decidedAt: applies ? now : null,
      };
    });
    const selected = changes.filter((c) => c.decision === 'selected');
    const status: CheckDto['status'] = changes.length === 0 ? 'done' : selected.length ? 'updating' : 'waiting-approval';
    await this.checks.report(check.id, input.summary, status, changes, status === 'done' ? now : null);
    await this.activity.record(ctx, { area: 'automation', action: 'check.report', target: check.id, summary: `Update check of ${check.product} found ${changes.length} change${changes.length === 1 ? '' : 's'}` });
    const detail = await this.getCheck(scope, check.id);
    if (selected.length) {
      return {
        check: detail,
        applyNow: { changeIds: selected.map((c) => c.id), contentMode: check.contentMode, contentModeLabel: MODE_LABEL[check.contentMode] },
        message: `This plan updates without approval: apply the ${selected.length} selected change${selected.length === 1 ? '' : 's'} now in "${MODE_LABEL[check.contentMode]}", then call mark_changes_applied.`,
      };
    }
    return {
      check: detail,
      applyNow: null,
      message: changes.length ? `Saved. ${changes.length} change${changes.length === 1 ? ' waits' : 's wait'} for a person to choose what to apply. Stop here.` : 'Saved: nothing changed. The check is done.',
    };
  }

  /** A person ticks which changes to apply (and in which content mode); the rest are skipped. */
  async decide(ctx: RequestContext, scope: ProductScope, input: DecideInput): Promise<{ check: CheckDetailDto; requests: GuideRequest[] }> {
    this.require(ctx, 'write');
    const detail = await this.getCheck(scope, input.checkId);
    if (!['waiting-approval', 'updating', 'done'].includes(detail.status)) throw new AppError('CONFLICT', `That check is ${detail.status}; wait until it has reported.`);
    const byId = new Map(detail.changes.map((c) => [c.id, c]));
    const decisions: { id: string; decision: ChangeDto['decision']; mode: ContentMode | null }[] = [];
    for (const item of input.items) {
      const change = byId.get(item.changeId);
      if (!change) throw new AppError('NOT_FOUND', `Change ${item.changeId} is not part of this check.`);
      if (change.decision === 'applied') continue;
      decisions.push({ id: change.id, decision: item.include ? 'selected' : 'skipped', mode: item.include ? (item.mode ?? detail.contentMode) : null });
    }
    const now = this.clock.now().toISOString();
    await this.checks.decideChanges(detail.id, decisions, ctx.actor.name, now);
    // One request per content mode, so Claude knows what to produce for each page.
    const chosen = decisions.filter((d) => d.decision === 'selected');
    const requests: GuideRequest[] = [];
    const modes = [...new Set(chosen.map((d) => d.mode!))];
    for (const mode of modes) {
      const items = chosen.filter((d) => d.mode === mode).map((d) => byId.get(d.id)!);
      const pages = [...new Set(items.map((c) => c.pageId).filter((p): p is string => !!p))];
      const lines = items.map((c) => `- [${c.id}] ${c.pageId ?? 'new page'}: ${c.title}${c.detail ? ` (${c.detail.slice(0, 240)})` : ''}`);
      const note = [`From update check ${detail.id} of ${detail.product}. When done, call mark_changes_applied with checkId ${detail.id} and these change ids.`, ...lines, input.note ? `Note: ${input.note}` : '']
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);
      requests.push(
        await this.requests.create(ctx, {
          type: 'refresh-page',
          scope: { products: [detail.product], ...(pages.length ? { pages } : {}) },
          contentMode: mode,
          note,
        }),
      );
    }
    const after = await this.getCheck(scope, detail.id);
    const open = after.changes.some((c) => c.decision === 'pending' || c.decision === 'selected');
    await this.checks.setStatus(detail.id, chosen.length ? 'updating' : open ? 'waiting-approval' : 'done', { finishedAt: chosen.length || open ? null : now });
    await this.activity.record(ctx, { area: 'automation', action: 'check.decide', target: detail.id, summary: `Chose ${chosen.length} of ${decisions.length} changes to apply from the check of ${detail.product}` });
    return { check: await this.getCheck(scope, detail.id), requests };
  }

  async markApplied(ctx: RequestContext, scope: ProductScope, checkId: string, changeIds: string[]): Promise<CheckDetailDto> {
    this.require(ctx, 'write');
    const detail = await this.getCheck(scope, checkId);
    const now = this.clock.now().toISOString();
    const items = detail.changes.filter((c) => changeIds.includes(c.id) && c.decision === 'selected');
    if (!items.length) throw new AppError('INVALID', 'None of those changes is selected for updating.');
    await this.checks.decideChanges(checkId, items.map((c) => ({ id: c.id, decision: 'applied', mode: c.mode })), ctx.actor.name, now);
    const after = await this.getCheck(scope, checkId);
    const open = after.changes.some((c) => c.decision === 'pending' || c.decision === 'selected');
    const stillSelected = after.changes.some((c) => c.decision === 'selected');
    await this.checks.setStatus(checkId, stillSelected ? 'updating' : open ? 'waiting-approval' : 'done', { finishedAt: open ? null : now });
    await this.activity.record(ctx, { area: 'automation', action: 'check.applied', target: checkId, summary: `Applied ${items.length} change${items.length === 1 ? '' : 's'} from the check of ${detail.product}` });
    return this.getCheck(scope, checkId);
  }

  async failCheck(ctx: RequestContext, scope: ProductScope, checkId: string, reason: string): Promise<CheckDetailDto> {
    this.require(ctx, 'write');
    const detail = await this.getCheck(scope, checkId);
    if (!['running', 'updating', 'queued'].includes(detail.status)) throw new AppError('CONFLICT', `That check is ${detail.status}.`);
    await this.checks.setStatus(checkId, 'failed', { error: reason.slice(0, 1000), finishedAt: this.clock.now().toISOString() });
    await this.activity.record(ctx, { area: 'automation', action: 'check.fail', target: checkId, summary: `The update check of ${detail.product} could not finish` });
    return this.getCheck(scope, checkId);
  }

  async cancelCheck(ctx: RequestContext, scope: ProductScope, checkId: string): Promise<CheckDetailDto> {
    this.require(ctx, 'write');
    const detail = await this.getCheck(scope, checkId);
    if (!['queued', 'waiting-approval'].includes(detail.status)) throw new AppError('CONFLICT', `A ${detail.status} check can't be cancelled.`);
    await this.checks.setStatus(checkId, 'cancelled', { finishedAt: this.clock.now().toISOString() });
    await this.activity.record(ctx, { area: 'automation', action: 'check.cancel', target: checkId, summary: `Cancelled the update check of ${detail.product}` });
    return this.getCheck(scope, checkId);
  }

  // ── Skills ─────────────────────────────────────────────────────────────

  async listSkills(): Promise<SkillDto[]> {
    return this.skills.list();
  }

  async getSkill(id: string): Promise<SkillDto> {
    const s = await this.skills.get(id);
    if (!s) throw new AppError('NOT_FOUND', 'That skill no longer exists.');
    return s;
  }

  /** Active skills that apply to a product (all-product skills included). */
  async skillsFor(product: string): Promise<SkillDto[]> {
    return (await this.skills.list()).filter((s) => s.active && (!s.products || s.products.includes(product)));
  }

  async saveSkill(ctx: RequestContext, input: SkillInput): Promise<SkillDto> {
    this.require(ctx, 'manage');
    const now = this.clock.now().toISOString();
    const existing = input.id ? await this.skills.get(input.id) : null;
    if (input.id && !existing) throw new AppError('NOT_FOUND', 'That skill no longer exists.');
    const id = existing?.id ?? `skill-${this.newId().slice(0, 8)}`;
    await this.skills.upsert({
      id,
      kind: input.kind,
      name: input.name,
      content: input.content,
      fileName: input.fileName ?? null,
      products: input.products ?? null,
      active: input.active ?? true,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      createdBy: existing?.createdBy ?? ctx.actor.name,
    });
    await this.activity.record(ctx, { area: 'automation', action: existing ? 'skill.update' : 'skill.create', target: id, summary: `${existing ? 'Changed' : 'Added'} the ${input.kind === 'qa' ? 'QA' : 'writing'} skill “${input.name}”` });
    return this.getSkill(id);
  }

  async deleteSkill(ctx: RequestContext, id: string): Promise<{ removed: true }> {
    this.require(ctx, 'manage');
    const s = await this.getSkill(id);
    await this.skills.remove(id, this.clock.now().toISOString());
    await this.activity.record(ctx, { area: 'automation', action: 'skill.delete', target: id, summary: `Deleted the skill “${s.name}”` });
    return { removed: true };
  }
}

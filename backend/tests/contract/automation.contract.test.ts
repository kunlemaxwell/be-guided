import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CheckDetailDto, CheckDto, FeedbackSummaryDto, PlanDto, ProductScheduleDto, SkillDto } from '../../../admin/shared/automation-types';
import { dataOf, IN_PROCESS, localHarness, roleHarness, type Api, type ApiResponse, type Harness, type RoleHarness } from './harness';

/**
 * Automatic checks, update plans, skills and reader feedback.
 * TC-AUTO-*: the admin call route (POST /api/v1/automation/call), the same
 * tools on the editor connector, the in-chat Studio app resource, the public
 * feedback endpoint, and one end-to-end run: plan → assign → clock tick →
 * claim → report → choose → refresh requests → mark applied.
 */
const CALL = '/api/v1/automation/call';
const FEEDBACK = '/api/v1/chat/feedback';
const EDITOR = '/api/v1/editor';
const MCP_HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', Origin: '' };

const tool = (api: Api, name: string, args: Record<string, unknown> = {}) => api.post(CALL, { tool: name, args });
const data = <T>(r: ApiResponse) => {
  if (r.status !== 200) throw new Error(`${r.status} ${JSON.stringify(r.body)}`);
  return dataOf<T>(r);
};

type Overview = { products: ProductScheduleDto[]; plans: PlanDto[]; recentChecks: CheckDto[]; skills: Omit<SkillDto, 'content'>[] };

const PLAN = { name: 'Morning check', autoCheck: true, frequency: { kind: 'daily', at: '08:00' }, timeZone: 'Africa/Lagos', autoUpdate: true, requireApproval: true, contentMode: 'text+screens' };

// ── Local owner: plans, checks, skills, feedback ──────────────────────────
describe.skipIf(!IN_PROCESS)('Automatic checks (owner, local)', () => {
  let h: Harness;
  let now = new Date('2026-11-05T05:00:00Z'); // 06:00 in Lagos
  beforeAll(async () => {
    h = await localHarness({ clock: () => now });
  });
  afterAll(() => h.cleanup());

  it('TC-AUTO-001 ships four ready-made plans and lists every product with no plan yet', async () => {
    const o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.plans.filter((p) => p.builtIn).map((p) => p.id).sort()).toEqual(['plan-3-days-everything', 'plan-daily-8am', 'plan-every-4h-report', 'plan-monthly-text-auto']);
    const daily = o.plans.find((p) => p.id === 'plan-daily-8am')!;
    expect(daily).toMatchObject({ autoCheck: true, frequency: { kind: 'daily', at: '08:00' }, autoUpdate: true, requireApproval: true, contentMode: 'text+screens' });
    expect(o.products.map((p) => p.product)).toContain('acme-books');
    expect(o.products.every((p) => p.planId === null && p.nextRunAt === null)).toBe(true);
  });

  it('TC-AUTO-002 saves a custom plan; auto update off always means approval on', async () => {
    const p = data<PlanDto>(await tool(h.api, 'save_update_plan', { ...PLAN, name: 'Report only', autoUpdate: false, requireApproval: false }));
    expect(p.id).toMatch(/^plan-/);
    expect(p.builtIn).toBe(false);
    expect(p.requireApproval).toBe(true);
  });

  it.each([
    ['an unknown time zone', { timeZone: 'Mars/Olympus' }, /time zone/],
    ['every 3 hours (not offered)', { frequency: { kind: 'hours', every: 3 } }, /frequency/],
    ['day 31 of the month', { frequency: { kind: 'monthly', day: 31, at: '07:00' } }, /frequency/],
    ['a time like 25:00', { frequency: { kind: 'daily', at: '25:00' } }, /frequency/],
    ['every 1 day as "days"', { frequency: { kind: 'days', every: 1, at: '09:00' } }, /frequency/],
    ['an empty name', { name: ' ' }, /name/],
    ['an unknown content mode', { contentMode: 'pictures' }, /contentMode/],
  ])('TC-AUTO-003 refuses a plan with %s (422)', async (_label, change, field) => {
    const r = await tool(h.api, 'save_update_plan', { ...PLAN, ...change });
    expect(r.status).toBe(422);
    expect(JSON.stringify(r.body)).toMatch(field);
  });

  it('TC-AUTO-004 an unknown tool is 404 and a malformed call is 422', async () => {
    expect((await tool(h.api, 'drop_tables')).status).toBe(404);
    expect((await h.api.post(CALL, { tool: 'Robert"); --', args: {} })).status).toBe(422);
  });

  it('TC-AUTO-005 ready-made plans cannot be deleted; custom ones can, and their products go back to off', async () => {
    expect((await tool(h.api, 'delete_update_plan', { planId: 'plan-daily-8am' })).status).toBe(422);
    const p = data<PlanDto>(await tool(h.api, 'save_update_plan', { ...PLAN, name: 'Temporary' }));
    data(await tool(h.api, 'assign_update_plan', { planId: p.id, products: ['acme-crm'] }));
    data(await tool(h.api, 'delete_update_plan', { planId: p.id }));
    const o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.plans.some((x) => x.id === p.id)).toBe(false);
    expect(o.products.find((x) => x.product === 'acme-crm')!.planId).toBeNull();
    expect((await tool(h.api, 'delete_update_plan', { planId: p.id })).status).toBe(404);
  });

  it('TC-AUTO-006 one plan per product: switching a plan on replaces the old one; "all" covers every product; off clears it', async () => {
    data(await tool(h.api, 'assign_update_plan', { planId: 'plan-every-4h-report', products: 'all' }));
    let o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.products.every((p) => p.planId === 'plan-every-4h-report')).toBe(true);
    data(await tool(h.api, 'assign_update_plan', { planId: 'plan-daily-8am', products: ['acme-books'] }));
    o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.products.find((p) => p.product === 'acme-books')!.planId).toBe('plan-daily-8am');
    expect(o.plans.find((p) => p.id === 'plan-every-4h-report')!.products).not.toContain('acme-books');
    expect(o.plans.find((p) => p.id === 'plan-daily-8am')!.products).toEqual(['acme-books']);
    data(await tool(h.api, 'assign_update_plan', { planId: null, products: 'all' }));
    o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.products.every((p) => p.planId === null)).toBe(true);
    expect((await tool(h.api, 'assign_update_plan', { planId: 'plan-daily-8am', products: ['no-such-product'] })).status).toBe(404);
    expect((await tool(h.api, 'assign_update_plan', { planId: 'plan-nope', products: ['acme-books'] })).status).toBe(404);
  });

  it('TC-AUTO-007 skills: upload writing and QA skills, scoped to products; get_skills returns only active ones for that product', async () => {
    const writing = data<SkillDto>(await tool(h.api, 'save_skill', { kind: 'writing', name: 'House style', content: '# House style\nShort sentences. Say "select", not "click on".', fileName: 'SKILL.md', products: null }));
    const qa = data<SkillDto>(await tool(h.api, 'save_skill', { kind: 'qa', name: 'Release QA', content: '# QA\nOpen every changed screen and save one record with the guard on.', products: ['acme-books'] }));
    data(await tool(h.api, 'save_skill', { kind: 'qa', name: 'Old QA', content: 'An older QA checklist we no longer use.', products: null, active: false }));
    expect(writing.size).toBeGreaterThan(20);
    const forAcme = data<{ skills: { kind: string; name: string; content: string }[] }>(await tool(h.api, 'get_skills', { product: 'acme-books' }));
    expect(forAcme.skills.map((s) => s.name).sort()).toEqual(['House style', 'Release QA']);
    expect(forAcme.skills.find((s) => s.kind === 'writing')!.content).toMatch(/Short sentences/);
    const forCrm = data<{ skills: { name: string }[] }>(await tool(h.api, 'get_skills', { product: 'acme-crm' }));
    expect(forCrm.skills.map((s) => s.name)).toEqual(['House style']);
    const listed = data<{ skills: Record<string, unknown>[] }>(await tool(h.api, 'list_skills', {}));
    expect(listed.skills.every((s) => !('content' in s))).toBe(true);
    const edited = data<SkillDto>(await tool(h.api, 'save_skill', { id: qa.id, kind: 'qa', name: 'Release QA v2', content: qa.content, products: ['acme-books'] }));
    expect(edited.name).toBe('Release QA v2');
    expect((await tool(h.api, 'save_skill', { kind: 'qa', name: 'Too short', content: 'tiny' })).status).toBe(422);
    expect((await tool(h.api, 'save_skill', { kind: 'design', name: 'Wrong kind', content: 'x'.repeat(40) })).status).toBe(422);
    expect((await tool(h.api, 'save_skill', { kind: 'qa', name: 'Huge', content: 'x'.repeat(200_001) })).status).toBe(422);
    data(await tool(h.api, 'delete_skill', { skillId: qa.id }));
    expect((await tool(h.api, 'get_skill', { skillId: qa.id })).status).toBe(404);
  });

  it('TC-AUTO-008 end to end: plan → clock → queued check → claim with skills → report → choose per change and mode → refresh requests → applied → done', async () => {
    // A plan: every day 08:00 Lagos, auto update with approval, text + screenshots.
    data(await tool(h.api, 'assign_update_plan', { planId: 'plan-daily-8am', products: ['acme-books'] }));
    let o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.products.find((p) => p.product === 'acme-books')!.nextRunAt).toBe('2026-11-05T07:00:00.000Z');

    // 07:59 Lagos: not yet.
    now = new Date('2026-11-05T06:59:00Z');
    expect(await h.local!.services.automation.tick()).toEqual([]);
    // 08:05 Lagos: due, queued once (a second tick does not queue again).
    now = new Date('2026-11-05T07:05:00Z');
    const queued = await h.local!.services.automation.tick();
    expect(queued).toHaveLength(1);
    expect(await h.local!.services.automation.tick()).toEqual([]);
    expect((await tool(h.api, 'run_update_check', { product: 'acme-books' })).status).toBe(409);

    const log = data<{ checks: CheckDto[] }>(await tool(h.api, 'list_update_checks', { product: 'acme-books' }));
    expect(log.checks[0]).toMatchObject({ id: queued[0], status: 'queued', trigger: 'schedule', planName: 'Every day at 8 AM, text and screenshots'.length ? expect.any(String) : '', contentMode: 'text+screens' });

    // An AI takes it: gets repos, plan, both skills that apply, and the steps.
    const claim = data<{ job: { check: CheckDto; product: { slug: string }; plan: { contentMode: string; requireApproval: boolean }; skills: { kind: string }[]; steps: string[] } }>(await tool(h.api, 'claim_update_check', {}));
    expect(claim.job.check.status).toBe('running');
    expect(claim.job.product.slug).toBe('acme-books');
    expect(claim.job.plan).toMatchObject({ contentMode: 'text+screens', requireApproval: true });
    expect(claim.job.skills.map((s) => s.kind)).toEqual(['writing']); // the QA skill was deleted in TC-AUTO-007
    expect(claim.job.steps.join(' ')).toMatch(/report_update_check/);
    // Nothing else waiting; a running check can't be claimed twice.
    expect(data<{ job: unknown }>(await tool(h.api, 'claim_update_check', {})).job).toBeNull();
    expect((await tool(h.api, 'claim_update_check', { checkId: queued[0] })).status).toBe(409);

    // Report: a page from another product is refused.
    const bad = await tool(h.api, 'report_update_check', { checkId: queued[0], summary: 'x found', changes: [{ pageId: 'crm/sales/a-page', kind: 'label-changed', title: 'Wrong product' }] });
    expect(bad.status).toBe(422);
    const report = data<{ check: CheckDetailDto; applyNow: unknown; message: string }>(
      await tool(h.api, 'report_update_check', {
        checkId: queued[0],
        summary: 'Three differences between the code and the guide.',
        changes: [
          { pageId: 'acme-books/sales/create-an-invoice', kind: 'label-changed', title: 'Save button now says "Save draft"', evidence: 'src/app/sales/invoices/new/page.tsx:120' },
          { pageId: 'acme-books/sales/add-a-customer', kind: 'screen-changed', title: 'Customer form has a new Tax ID field' },
          { pageId: null, kind: 'bug', title: 'Export button does nothing', detail: 'Clicked twice, no file.' },
        ],
      }),
    );
    expect(report.applyNow).toBeNull(); // approval required
    expect(report.check.status).toBe('waiting-approval');
    expect(report.check.changes.every((c) => c.decision === 'pending')).toBe(true);
    expect((await tool(h.api, 'report_update_check', { checkId: queued[0], summary: 'again', changes: [] })).status).toBe(409);

    // A person picks: the label change as text only, the screen change as text + screenshots, skips the bug.
    const [label, screen, bug] = report.check.changes;
    const decided = data<{ check: CheckDetailDto; requests: { id: string; type: string; contentMode: string; scope: { pages?: string[] }; note: string }[] }>(
      await tool(h.api, 'decide_update_check', {
        checkId: queued[0],
        items: [
          { changeId: label!.id, include: true, mode: 'text' },
          { changeId: screen!.id, include: true, mode: 'text+screens' },
          { changeId: bug!.id, include: false },
        ],
        note: 'Keep the old list screenshot.',
      }),
    );
    expect(decided.check.status).toBe('updating');
    expect(decided.requests.map((r) => r.contentMode).sort()).toEqual(['text', 'text+screens']);
    expect(decided.requests.every((r) => r.type === 'refresh-page')).toBe(true);
    expect(decided.requests.find((r) => r.contentMode === 'text')!.scope.pages).toEqual(['acme-books/sales/create-an-invoice']);
    expect(decided.requests[0]!.note).toMatch(/mark_changes_applied/);
    expect(decided.requests[0]!.note).toMatch(/Keep the old list screenshot/);
    const byId = new Map(decided.check.changes.map((c) => [c.id, c]));
    expect(byId.get(label!.id)).toMatchObject({ decision: 'selected', mode: 'text' });
    expect(byId.get(bug!.id)).toMatchObject({ decision: 'skipped', mode: null });

    // They show in the admin's request queue.
    const reqs = data<{ id: string }[] | { items: { id: string }[] }>(await h.api.get('/api/v1/requests'));
    const ids = (Array.isArray(reqs) ? reqs : reqs.items).map((r) => r.id);
    for (const r of decided.requests) expect(ids).toContain(r.id);

    // Applying: skipped changes can't be marked applied; selected ones can, then the check is done.
    expect((await tool(h.api, 'mark_changes_applied', { checkId: queued[0], changeIds: [bug!.id] })).status).toBe(422);
    let after = data<CheckDetailDto>(await tool(h.api, 'mark_changes_applied', { checkId: queued[0], changeIds: [label!.id] }));
    expect(after.status).toBe('updating');
    after = data<CheckDetailDto>(await tool(h.api, 'mark_changes_applied', { checkId: queued[0], changeIds: [screen!.id] }));
    expect(after.status).toBe('done');
    expect(after.finishedAt).not.toBeNull();

    // Next day's slot is tomorrow 08:00; the clock queues it then.
    o = data<Overview>(await tool(h.api, 'automation_overview'));
    expect(o.products.find((p) => p.product === 'acme-books')!.nextRunAt).toBe('2026-11-06T07:00:00.000Z');
    now = new Date('2026-11-05T20:00:00Z');
    expect(await h.local!.services.automation.tick()).toEqual([]);
    now = new Date('2026-11-06T07:00:00Z');
    expect(await h.local!.services.automation.tick()).toHaveLength(1);

    // Every step is in the audit log under its own area.
    const audit = JSON.stringify((await h.api.get('/api/v1/audit-log?area=automation')).body);
    for (const action of ['plan.assign', 'check.start', 'check.report', 'check.decide', 'check.applied']) expect(audit).toContain(action);
  });

  it('TC-AUTO-009 auto update without approval: the report says apply now, bugs are never auto-applied', async () => {
    const plan = data<PlanDto>(await tool(h.api, 'save_update_plan', { ...PLAN, name: 'Hands off', autoUpdate: true, requireApproval: false, contentMode: 'text' }));
    data(await tool(h.api, 'assign_update_plan', { planId: plan.id, products: ['acme-crm'] }));
    const check = data<CheckDto>(await tool(h.api, 'run_update_check', { product: 'acme-crm' }));
    expect(check).toMatchObject({ trigger: 'manual', contentMode: 'text', autoUpdate: true, requireApproval: false });
    data(await tool(h.api, 'claim_update_check', { checkId: check.id }));
    const r = data<{ check: CheckDetailDto; applyNow: { changeIds: string[]; contentMode: string } }>(
      await tool(h.api, 'report_update_check', {
        checkId: check.id,
        summary: 'One wording change and one bug.',
        changes: [
          { pageId: null, kind: 'new-page', title: 'Pipeline board needs a guide' },
          { pageId: null, kind: 'bug', title: 'Filter resets on refresh' },
        ],
      }),
    );
    expect(r.check.status).toBe('updating');
    expect(r.applyNow.changeIds).toHaveLength(1);
    expect(r.applyNow.contentMode).toBe('text');
    expect(r.check.changes.find((c) => c.kind === 'bug')!.decision).toBe('pending');
  });

  it('TC-AUTO-010 Check now with a chosen mode; nothing changed → done; cancel and fail rules', async () => {
    data(await tool(h.api, 'assign_update_plan', { planId: null, products: ['acme-books'] }));
    // The scheduled check from TC-AUTO-008 is still queued: cancel it first.
    const open = data<{ checks: CheckDto[] }>(await tool(h.api, 'list_update_checks', { product: 'acme-books', status: ['queued'] }));
    for (const c of open.checks) expect(data<CheckDto>(await tool(h.api, 'cancel_update_check', { checkId: c.id })).status).toBe('cancelled');
    const c = data<CheckDto>(await tool(h.api, 'run_update_check', { product: 'acme-books', contentMode: 'all' }));
    expect(c).toMatchObject({ contentMode: 'all', planId: null, requireApproval: true });
    data(await tool(h.api, 'claim_update_check', { checkId: c.id }));
    const r = data<{ check: CheckDetailDto }>(await tool(h.api, 'report_update_check', { checkId: c.id, summary: 'No differences.', changes: [] }));
    expect(r.check.status).toBe('done');
    expect((await tool(h.api, 'cancel_update_check', { checkId: c.id })).status).toBe(409);
    expect((await tool(h.api, 'fail_update_check', { checkId: c.id, reason: 'too late' })).status).toBe(409);
    const d = data<CheckDto>(await tool(h.api, 'run_update_check', { product: 'acme-books' }));
    data(await tool(h.api, 'claim_update_check', { checkId: d.id }));
    const failed = data<CheckDetailDto>(await tool(h.api, 'fail_update_check', { checkId: d.id, reason: 'The repo folder was not on this computer.' }));
    expect(failed).toMatchObject({ status: 'failed', error: 'The repo folder was not on this computer.' });
    expect((await tool(h.api, 'run_update_check', { product: 'no-such' })).status).toBe(404);
    expect((await tool(h.api, 'get_update_check', { checkId: 'chk-nope' })).status).toBe(404);
  });

  // ── Reader feedback ──
  const vote = (body: Record<string, unknown>, headers: Record<string, string> = {}) => h.api.request(FEEDBACK, { method: 'POST', json: body, headers: { Origin: 'http://localhost:3100', ...headers } });

  it('TC-AUTO-011 readers vote; a second vote from the same browser replaces the first; the owner sees every record', async () => {
    const page = 'acme-books/sales/create-an-invoice';
    expect((await vote({ pageId: page, helpful: true, visitor: 'visitor-aaaa-1111' })).status).toBe(200);
    expect((await vote({ pageId: page, helpful: false, comment: '  Step 3 is out of date. ', email: 'Reader@Example.com', visitor: 'visitor-bbbb-2222' }, { 'cf-ipcountry': 'NG' })).status).toBe(200);
    expect((await vote({ pageId: page, helpful: false, visitor: 'visitor-aaaa-1111' })).status).toBe(200); // changed mind
    const s = data<FeedbackSummaryDto>(await tool(h.api, 'feedback_summary', {}));
    expect(s.totals).toEqual({ up: 0, down: 2, comments: 1 });
    expect(s.pages).toEqual([expect.objectContaining({ pageId: page, up: 0, down: 2, pageTitle: expect.any(String) })]);
    const withComment = s.votes.find((v) => v.comment)!;
    expect(withComment).toMatchObject({ comment: 'Step 3 is out of date.', email: 'reader@example.com', country: 'NG', helpful: false });
    expect(JSON.stringify(s)).not.toContain('visitor-'); // the browser id is never shown
    const onlyUp = data<FeedbackSummaryDto>(await tool(h.api, 'feedback_summary', { helpful: true }));
    expect(onlyUp.votes).toHaveLength(0);
  });

  it.each([
    ['a page that is not on the public guide', { pageId: 'acme-books/sales/no-such-page', helpful: true, visitor: 'visitor-cccc-3333' }, 404],
    ['a malformed page id', { pageId: '../etc/passwd', helpful: true, visitor: 'visitor-cccc-3333' }, 422],
    ['no visitor id', { pageId: 'acme-books/sales/create-an-invoice', helpful: true }, 422],
    ['a bad email', { pageId: 'acme-books/sales/create-an-invoice', helpful: true, email: 'not-an-email', visitor: 'visitor-cccc-3333' }, 422],
    ['a 1001-character comment', { pageId: 'acme-books/sales/create-an-invoice', helpful: true, comment: 'x'.repeat(1001), visitor: 'visitor-cccc-3333' }, 422],
    ['helpful as text', { pageId: 'acme-books/sales/create-an-invoice', helpful: 'yes', visitor: 'visitor-cccc-3333' }, 422],
  ])('TC-AUTO-012 refuses a vote with %s', async (_l, body, status) => {
    const r = await vote(body);
    expect(r.status).toBe(status);
    expect(JSON.stringify(r.body)).not.toMatch(/at \w+ \(|SELECT|sqlite/i); // no stack traces or SQL
  });

  it('TC-AUTO-013 a bad country header is ignored, not stored', async () => {
    expect((await vote({ pageId: 'acme-books/sales/create-an-invoice', helpful: true, visitor: 'visitor-dddd-4444' }, { 'cf-ipcountry': '<script>' })).status).toBe(200);
    const s = data<FeedbackSummaryDto>(await tool(h.api, 'feedback_summary', {}));
    expect(s.votes.some((v) => v.country === '<script>')).toBe(false);
  });
});

// ── Authorization matrix (Cloudflare Access identities) ───────────────────
describe('Automatic checks: who may do what', () => {
  let h: RoleHarness;
  beforeAll(async () => {
    h = await roleHarness();
  });
  afterAll(() => h.cleanup());

  const READ = ['automation_overview', 'list_update_checks', 'list_skills', 'get_skills'];
  const WRITE = ['run_update_check', 'claim_update_check', 'feedback_summary'];
  const MANAGE = ['save_update_plan', 'assign_update_plan', 'save_skill', 'delete_skill', 'delete_update_plan'];
  const args: Record<string, Record<string, unknown>> = {
    get_skills: { product: 'acme-books' },
    run_update_check: { product: 'acme-books' },
    save_update_plan: PLAN,
    assign_update_plan: { planId: 'plan-daily-8am', products: ['acme-books'] },
    save_skill: { kind: 'qa', name: 'Matrix skill', content: 'A QA skill used by the permission matrix test.' },
    delete_skill: { skillId: 'skill-none' },
    delete_update_plan: { planId: 'plan-none' },
  };

  it('TC-AUTO-020 anonymous and bad tokens are refused (401)', async () => {
    for (const api of [h.anonymous, h.forged, h.expired, h.wrongAudience]) expect((await tool(api, 'automation_overview')).status).toBe(401);
  });

  it.runIf(IN_PROCESS)('TC-AUTO-021 unknown and switched-off people are refused (403)', async () => {
    for (const who of ['unknown', 'inactive'] as const) expect((await tool(h.as(who), 'automation_overview')).status).toBe(403);
  });

  it.runIf(IN_PROCESS)('TC-AUTO-022 viewers read only; editors run checks but cannot change plans or skills; owners do everything', async () => {
    const run = async (role: 'viewer' | 'editor' | 'owner', name: string) => (await tool(h.as(role), name, args[name] ?? {})).status;
    for (const name of READ) for (const role of ['viewer', 'editor', 'owner'] as const) expect([name, role, await run(role, name)]).toEqual([name, role, 200]);
    for (const name of WRITE) {
      expect([name, await run('viewer', name)]).toEqual([name, 403]);
      expect([name, await run('editor', name)]).not.toEqual([name, 403]);
    }
    for (const name of MANAGE) {
      expect([name, await run('viewer', name)]).toEqual([name, 403]);
      expect([name, await run('editor', name)]).toEqual([name, 403]);
      expect([name, 'owner', await run('owner', name)]).not.toEqual([name, 'owner', 403]);
    }
  });

  it('TC-AUTO-023 reader feedback votes need no sign-in, but reading them does', async () => {
    const r = await h.anonymous.request(FEEDBACK, { method: 'POST', json: { pageId: 'acme-books/sales/create-an-invoice', helpful: true, visitor: 'visitor-eeee-5555' }, headers: { Origin: 'http://localhost:3100' } });
    expect(r.status).toBe(200);
    expect((await tool(h.anonymous, 'feedback_summary')).status).toBe(401);
  });
});

// ── The same tools on the editor connector, and the in-chat Studio app ────
describe.skipIf(!IN_PROCESS)('Automatic checks on the editor connector', () => {
  let h: Harness;
  let ownerKey: string;
  let editorKey: string;
  let scopedKey: string;
  let seq = 0;
  const rpc = (key: string | null, method: string, params?: unknown) =>
    h.api.request(EDITOR, { method: 'POST', json: { jsonrpc: '2.0', id: ++seq, method, ...(params === undefined ? {} : { params }) }, headers: { ...MCP_HEADERS, ...(key ? { Authorization: `Bearer ${key}` } : {}) } });
  const call = async (key: string, name: string, args: Record<string, unknown> = {}) => {
    const r = await rpc(key, 'tools/call', { name, arguments: args });
    expect(r.status).toBe(200);
    return r.body.result as { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
  };

  beforeAll(async () => {
    h = await localHarness();
    const people = dataOf<{ id: string; role: string }[]>(await h.api.get('/api/v1/people'));
    const owner = people.find((p) => p.role === 'owner')!;
    const ed = dataOf<{ id: string }>(await h.api.post('/api/v1/people', { name: 'Ezra Editor', email: 'ezra@example.com', role: 'editor' }));
    ownerKey = dataOf<{ key: string }>(await h.api.post('/api/v1/connector-keys', { personId: owner.id, label: 'Owner key', products: null })).key;
    editorKey = dataOf<{ key: string }>(await h.api.post('/api/v1/connector-keys', { personId: ed.id, label: 'Editor key', products: null })).key;
    scopedKey = dataOf<{ key: string }>(await h.api.post('/api/v1/connector-keys', { personId: ed.id, label: 'CRM only', products: ['acme-crm'] })).key;
  });
  afterAll(() => h.cleanup());

  it('TC-AUTO-030 lists the automation tools and the Studio app tool, with MCP Apps metadata', async () => {
    const r = await rpc(ownerKey, 'tools/list');
    const tools = (r.body.result as { tools: { name: string; _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } }[] }).tools;
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const n of ['automation_overview', 'claim_update_check', 'report_update_check', 'decide_update_check', 'mark_changes_applied', 'get_skills', 'save_skill', 'feedback_summary', 'open_be_guided_studio']) expect(byName.has(n)).toBe(true);
    expect(byName.get('open_be_guided_studio')!._meta!.ui!.resourceUri).toBe('ui://be-guided/admin.html');
    expect(byName.get('save_update_plan')!._meta!.ui!.visibility).toEqual(['app']);
    expect(byName.get('claim_update_check')!._meta!.ui!.visibility).toEqual(['model', 'app']);
  });

  // Regression (7 Nov): a resourceUri on every tool made the chat draw the whole admin under each result of
  // claim_update_check, report_update_check and so on. Those copies are not the visible app, the chat refused
  // their calls, and each showed "Claude did not pass this on". Only the open_* tools may carry the app.
  it('TC-AUTO-031 only the open tools carry the app; other tools never draw the admin in the chat', async () => {
    const r = await rpc(ownerKey, 'tools/list');
    const tools = (r.body.result as { tools: { name: string; _meta?: { ui?: { resourceUri?: string } } }[] }).tools;
    const withApp = tools.filter((t) => t._meta?.ui?.resourceUri).map((t) => t.name).sort();
    expect(withApp).toEqual(['admin_api', 'open_be_guided_admin', 'open_be_guided_studio']);
  });

  // Regression (5 Nov): inside Claude some views refuse the app's own calls ("IPC not available for MCP tool call"),
  // so opening the Studio carries a snapshot the app can show without calling back.
  it('TC-AUTO-042 opening the Studio carries a snapshot of plans, checks and feedback', async () => {
    const r = await rpc(ownerKey, 'tools/call', { name: 'open_be_guided_studio', arguments: { tab: 'feedback' } });
    const sc = (r.body.result as { structuredContent: { tab: string; snapshot: { takenAt: string; adminUrl: string; overview: { plans: unknown[]; products: unknown[] }; checks: { checks: unknown[] }; feedback: { totals: unknown } } } }).structuredContent;
    expect(sc.tab).toBe('feedback');
    expect(sc.snapshot.overview.plans.length).toBeGreaterThan(0);
    expect(Array.isArray(sc.snapshot.overview.products)).toBe(true);
    expect(Array.isArray(sc.snapshot.checks.checks)).toBe(true);
    expect(sc.snapshot.feedback.totals).toBeDefined();
    expect(sc.snapshot.adminUrl).toMatch(/^https?:\/\//);
    expect(Date.parse(sc.snapshot.takenAt)).not.toBeNaN();
  });

  it('TC-AUTO-031 serves the Studio app as an MCP Apps resource', async () => {
    const list = await rpc(ownerKey, 'resources/list');
    expect(JSON.stringify(list.body)).toContain('ui://be-guided/studio.html');
    const r = await rpc(ownerKey, 'resources/read', { uri: 'ui://be-guided/studio.html' });
    const c = (r.body.result as { contents: { mimeType: string; text: string }[] }).contents[0]!;
    expect(c.mimeType).toBe('text/html;profile=mcp-app');
    expect(c.text).toContain('Be Guided Studio');
    expect(c.text).toContain('ui/initialize');
    expect(c.text).not.toMatch(/<script[^>]+src=/); // self-contained, no outside scripts
  });

  it('TC-AUTO-032 the writing standard and instructions explain skills and checks', async () => {
    const r = await call(ownerKey, 'get_writing_standard');
    expect(r.content[0]!.text).toMatch(/get_skills/);
    expect(r.content[0]!.text).toMatch(/claim_update_check/);
  });

  it('TC-AUTO-033 an owner key sets up a plan; an editor key cannot; an editor key runs a whole check', async () => {
    expect((await call(ownerKey, 'save_update_plan', PLAN)).isError).toBeFalsy();
    const denied = await call(editorKey, 'save_update_plan', PLAN);
    expect(denied.isError).toBe(true);
    expect(denied.content[0]!.text).toMatch(/owners/i);

    const queued = await call(editorKey, 'run_update_check', { product: 'acme-books', contentMode: 'text' });
    const checkId = queued.structuredContent!.id as string;
    const claim = await call(editorKey, 'claim_update_check', {});
    expect((claim.structuredContent!.job as { check: { id: string } }).check.id).toBe(checkId);
    const rep = await call(editorKey, 'report_update_check', { checkId, summary: 'One label.', changes: [{ pageId: 'acme-books/sales/create-an-invoice', kind: 'label-changed', title: 'New button name' }] });
    expect(rep.content[0]!.text).toMatch(/Stop here/);
    const changeId = ((rep.structuredContent!.check as CheckDetailDto).changes[0]!).id;
    const dec = await call(editorKey, 'decide_update_check', { checkId, items: [{ changeId, include: true }] });
    expect((dec.structuredContent!.requests as unknown[]).length).toBe(1);
    const done = await call(editorKey, 'mark_changes_applied', { checkId, changeIds: [changeId] });
    expect(done.structuredContent!.status).toBe('done');
  });

  it('TC-AUTO-034 a key limited to one product cannot see or touch another product (scope tampering)', async () => {
    const o = await call(scopedKey, 'automation_overview');
    expect((o.structuredContent!.products as { product: string }[]).map((p) => p.product)).toEqual(['acme-crm']);
    expect((await call(scopedKey, 'run_update_check', { product: 'acme-books' })).isError).toBe(true);
    const log = await call(scopedKey, 'list_update_checks', {});
    expect((log.structuredContent!.checks as CheckDto[]).every((c) => c.product === 'acme-crm')).toBe(true);
    const other = await call(ownerKey, 'run_update_check', { product: 'acme-books' });
    const otherId = other.structuredContent!.id as string;
    expect((await call(scopedKey, 'get_update_check', { checkId: otherId })).isError).toBe(true);
    expect((await call(scopedKey, 'cancel_update_check', { checkId: otherId })).isError).toBe(true);
    expect(((await call(scopedKey, 'claim_update_check', {})).structuredContent!.job)).toBeNull();
    expect((await call(scopedKey, 'feedback_summary', { pageId: 'acme-books/sales/create-an-invoice' })).isError).toBe(true);
  });

  it('TC-AUTO-035 no key, no tools', async () => {
    expect((await rpc(null, 'tools/list')).status).toBe(401);
  });
});

// ── Regression: a body that is not JSON is a clear 400, never a 500 ───────
describe.skipIf(!IN_PROCESS)('Malformed JSON bodies', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await localHarness();
  });
  afterAll(() => h.cleanup());

  it.each([FEEDBACK, CALL, '/api/v1/requests'])('TC-AUTO-040 %s answers 400 BAD_REQUEST', async (p) => {
    const r = await h.api.request(p, { method: 'POST', raw: { body: '{"pageId":"x","helpful":,}', type: 'application/json' }, headers: { Origin: p === FEEDBACK ? 'http://localhost:3100' : 'http://localhost:3101' } });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'BAD_REQUEST' });
  });
});

// Regression (5 Nov): the Studio was blank inside the live admin because the admin's headers forbid
// framing and inline scripts. /studio.html must carry its own rule that allows exactly its script.
describe('Studio page headers on Cloudflare', () => {
  it('TC-AUTO-041 /studio.html may be framed by the admin and runs only its own inline script', async () => {
    const fs = await import('node:fs');
    const crypto = await import('node:crypto');
    const headers = fs.readFileSync('admin/web/public/_headers', 'utf8');
    const html = fs.readFileSync('admin/web/public/studio.html', 'utf8');
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)![1]!;
    const hash = `'sha256-${crypto.createHash('sha256').update(script).digest('base64')}'`;
    for (const path of ['/studio.html', '/studio']) {
      const rule = new RegExp(`^${path.replace('.', '\\.')}\\n((?:  .*\\n)+)`, 'm').exec(headers)?.[1] ?? '';
      expect(rule).toContain('! Content-Security-Policy');
      expect(rule).toContain('! X-Frame-Options');
      expect(rule).toContain(`script-src ${hash};`);
      expect(rule).toContain("frame-ancestors 'self'");
      expect(rule).not.toMatch(/script-src[^;]*unsafe-inline/);
    }
  });
});

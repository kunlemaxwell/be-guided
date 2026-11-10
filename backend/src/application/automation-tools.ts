import { z } from 'zod';
import {
  assignInputSchema,
  CHECK_STATUSES,
  decideInputSchema,
  planInputSchema,
  reportInputSchema,
  SKILL_KINDS,
  skillInputSchema,
} from '../../../admin/shared/automation-types';
import { CONTENT_MODES } from '../../../src/types/content';
import type { RequestContext } from '../domain/actor';
import { AppError } from '../domain/errors';
import { allowed, type AutomationService, type Level, type ProductScope } from './services/automation-service';
import type { FeedbackService } from './services/feedback-service';

/**
 * One list of automation tools, used three ways: as MCP tools on the editor
 * connector (Claude Code, Codex, the in-chat Studio app), and through
 * POST /api/v1/automation/call from the admin's Studio screen. Same rules
 * everywhere: who may do what (level) and which products (scope).
 */

export interface ToolDeps {
  automation: AutomationService;
  feedback: FeedbackService;
  ctx: RequestContext;
  scope: ProductScope;
}

export interface AutomationTool {
  name: string;
  title: string;
  description: string;
  input: z.ZodObject<z.ZodRawShape>;
  level: Level;
  /** Only the Studio app calls it (hidden from the AI's tool list in hosts that support that). */
  appOnly?: boolean;
  readOnly: boolean;
  run(deps: ToolDeps, args: never): Promise<{ data: unknown; message: string }>;
}

const productSlug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);
const id = z.string().min(1).max(80);

function tool<S extends z.ZodRawShape>(t: Omit<AutomationTool, 'input' | 'run'> & { input: z.ZodObject<S>; run(deps: ToolDeps, args: z.infer<z.ZodObject<S>>): Promise<{ data: unknown; message: string }> }): AutomationTool {
  return t as unknown as AutomationTool;
}

export const AUTOMATION_TOOLS: AutomationTool[] = [
  tool({
    name: 'automation_overview',
    title: 'Automatic checks: overview',
    description: 'Each product with its update plan and next check time, every saved plan, the latest checks and the skills on file.',
    input: z.object({}),
    level: 'read',
    readOnly: true,
    run: async (d) => ({ data: await d.automation.overview(d.scope), message: 'Here is the current set-up.' }),
  }),
  tool({
    name: 'save_update_plan',
    title: 'Save an update plan',
    description: 'Add or change a saved plan: whether to check automatically and how often, whether to update the guide after a check, whether a person must approve first, and the content mode. Owners only.',
    input: planInputSchema,
    level: 'manage',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.savePlan(d.ctx, a), message: 'Plan saved.' }),
  }),
  tool({
    name: 'delete_update_plan',
    title: 'Delete an update plan',
    description: 'Deletes a plan you made (ready-made plans stay). Products using it stop checking automatically. Owners only.',
    input: z.object({ planId: id }),
    level: 'manage',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.deletePlan(d.ctx, a.planId), message: 'Plan deleted.' }),
  }),
  tool({
    name: 'assign_update_plan',
    title: 'Switch a plan on for products',
    description: 'Turns a plan on for some products or all of them (planId null turns automatic checks off). A product has one plan at a time: this replaces its old one. Owners only.',
    input: assignInputSchema,
    level: 'manage',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.assign(d.ctx, a), message: a.planId ? 'Plan switched on.' : 'Automatic checks switched off.' }),
  }),
  tool({
    name: 'run_update_check',
    title: 'Check a product for changes now',
    description: 'Queues an update check for one product now, using its plan (or the content mode you give). An AI then takes it with claim_update_check.',
    input: z.object({ product: productSlug, contentMode: z.enum(CONTENT_MODES).optional() }),
    level: 'write',
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.runCheckNow(d.ctx, d.scope, a.product, a.contentMode), message: 'Check queued.' }),
  }),
  tool({
    name: 'list_update_checks',
    title: 'Update check log',
    description: 'The log of update checks, newest first: when, which product, the plan, status and how many changes were found and are still waiting.',
    input: z.object({ product: productSlug.optional(), status: z.array(z.enum(CHECK_STATUSES)).max(7).optional(), limit: z.number().int().min(1).max(200).optional(), offset: z.number().int().min(0).optional() }),
    level: 'read',
    readOnly: true,
    run: async (d, a) => ({ data: { checks: await d.automation.listChecks(d.scope, a) }, message: 'Check log.' }),
  }),
  tool({
    name: 'get_update_check',
    title: 'One update check, with its changes',
    description: 'Everything a check found: each change with its page, kind, detail, evidence in the code, and whether it was selected, skipped or applied.',
    input: z.object({ checkId: id }),
    level: 'read',
    readOnly: true,
    run: async (d, a) => ({ data: await d.automation.getCheck(d.scope, a.checkId), message: 'Check details.' }),
  }),
  tool({
    name: 'claim_update_check',
    title: 'Take the next update check to do',
    description: 'Takes the oldest waiting check (or the one you name) and returns the job: product, code repos, content mode, the writing and QA skills to follow, and the steps. Returns job null when nothing is waiting.',
    input: z.object({ checkId: id.optional() }),
    level: 'write',
    readOnly: false,
    run: async (d, a) => {
      const job = await d.automation.claimCheck(d.ctx, d.scope, a.checkId);
      return { data: { job }, message: job ? `Started the check of ${job.product.name}. Follow the steps.` : 'Nothing is waiting to be checked.' };
    },
  }),
  tool({
    name: 'report_update_check',
    title: 'Report what a check found',
    description: 'Send the summary and the list of changes for a running check (empty list if nothing changed). The answer says whether to apply changes now or stop for a person to choose.',
    input: reportInputSchema,
    level: 'write',
    readOnly: false,
    run: async (d, a) => {
      const r = await d.automation.reportCheck(d.ctx, d.scope, a);
      return { data: r, message: r.message };
    },
  }),
  tool({
    name: 'decide_update_check',
    title: 'Choose which changes to apply',
    description: 'For each change of a check: include it (with a content mode: text, text+screens, video or all) or skip it. Included changes become update requests in the queue.',
    input: decideInputSchema,
    level: 'write',
    readOnly: false,
    run: async (d, a) => {
      const r = await d.automation.decide(d.ctx, d.scope, a);
      return { data: r, message: r.requests.length ? `Queued ${r.requests.length} update request${r.requests.length === 1 ? '' : 's'}.` : 'Saved your choices. Nothing to update.' };
    },
  }),
  tool({
    name: 'mark_changes_applied',
    title: 'Mark changes as applied',
    description: 'After updating the pages for selected changes, mark them applied so the check can finish.',
    input: z.object({ checkId: id, changeIds: z.array(id).min(1).max(300) }),
    level: 'write',
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.markApplied(d.ctx, d.scope, a.checkId, a.changeIds), message: 'Marked as applied.' }),
  }),
  tool({
    name: 'fail_update_check',
    title: 'Say a check could not finish',
    description: 'Marks a check as failed with the reason (shown in the log), e.g. the code could not be read.',
    input: z.object({ checkId: id, reason: z.string().trim().min(3).max(1000) }),
    level: 'write',
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.failCheck(d.ctx, d.scope, a.checkId, a.reason), message: 'Marked as failed.' }),
  }),
  tool({
    name: 'cancel_update_check',
    title: 'Cancel a check',
    description: 'Cancels a check that is still waiting to start or waiting for a decision.',
    input: z.object({ checkId: id }),
    level: 'write',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.cancelCheck(d.ctx, d.scope, a.checkId), message: 'Cancelled.' }),
  }),
  tool({
    name: 'list_skills',
    title: 'Skills on file',
    description: 'The writing and QA skills on file (names, products, on or off), without their text.',
    input: z.object({ kind: z.enum(SKILL_KINDS).optional() }),
    level: 'read',
    readOnly: true,
    run: async (d, a) => ({ data: { skills: (await d.automation.listSkills()).filter((s) => !a.kind || s.kind === a.kind).map(({ content: _c, ...s }) => s) }, message: 'Skills.' }),
  }),
  tool({
    name: 'get_skill',
    title: 'Read one skill',
    description: 'The full text of one skill.',
    input: z.object({ skillId: id }),
    level: 'read',
    appOnly: true,
    readOnly: true,
    run: async (d, a) => ({ data: await d.automation.getSkill(a.skillId), message: 'Skill.' }),
  }),
  tool({
    name: 'get_skills',
    title: 'Skills to follow for a product',
    description: 'The active writing skills (how to document) and QA skills (how to test while you document) for a product, with their full text. Call this with get_writing_standard before writing or checking, and follow them.',
    input: z.object({ product: productSlug }),
    level: 'read',
    readOnly: true,
    run: async (d, a) => {
      if (d.scope && !d.scope.includes(a.product)) throw new AppError('FORBIDDEN', `Your key does not cover the product "${a.product}".`);
      const skills = await d.automation.skillsFor(a.product);
      return { data: { skills: skills.map((s) => ({ kind: s.kind, name: s.name, content: s.content })) }, message: skills.length ? `${skills.length} skill${skills.length === 1 ? '' : 's'} to follow.` : 'No extra skills for this product: follow the writing standard.' };
    },
  }),
  tool({
    name: 'save_skill',
    title: 'Add or change a skill',
    description: 'Saves a writing skill (how guides are written) or a QA skill (how to test while documenting), e.g. the text of a SKILL.md file, for all products or some. Owners only.',
    input: skillInputSchema,
    level: 'manage',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.saveSkill(d.ctx, a), message: 'Skill saved.' }),
  }),
  tool({
    name: 'delete_skill',
    title: 'Delete a skill',
    description: 'Removes a skill. Owners only.',
    input: z.object({ skillId: id }),
    level: 'manage',
    appOnly: true,
    readOnly: false,
    run: async (d, a) => ({ data: await d.automation.deleteSkill(d.ctx, a.skillId), message: 'Skill deleted.' }),
  }),
  tool({
    name: 'feedback_summary',
    title: 'Readers\' votes',
    description: 'How readers voted on "Was this helpful?": totals, per page (most thumbs down first), and each vote with its comment and optional email.',
    input: z.object({ pageId: z.string().max(200).optional(), helpful: z.boolean().optional(), limit: z.number().int().min(1).max(500).optional() }),
    level: 'write',
    readOnly: true,
    run: async (d, a) => {
      if (d.scope && a.pageId && !d.scope.includes(a.pageId.split('/')[0]!)) throw new AppError('FORBIDDEN', 'Your key does not cover that product.');
      const s = await d.feedback.summary(a);
      const keep = (p: string) => !d.scope || d.scope.includes(p.split('/')[0]!);
      return { data: { ...s, pages: s.pages.filter((p) => keep(p.pageId)), votes: s.votes.filter((v) => keep(v.pageId)) }, message: `${s.totals.up} helpful, ${s.totals.down} not helpful.` };
    },
  }),
];

export const AUTOMATION_TOOL_NAMES = AUTOMATION_TOOLS.map((t) => t.name);

/** Runs one tool by name with permission and input checks (the admin's Studio screen uses this). */
export async function runAutomationTool(deps: ToolDeps, name: string, rawArgs: unknown): Promise<{ data: unknown; message: string }> {
  const t = AUTOMATION_TOOLS.find((x) => x.name === name);
  if (!t) throw new AppError('NOT_FOUND', `There is no tool called "${name}".`);
  if (!allowed(deps.ctx.actor.role, t.level)) throw new AppError('FORBIDDEN', t.level === 'manage' ? 'Only owners can do that.' : 'Viewers can look but not change anything.');
  const parsed = t.input.safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => ({ field: i.path.join('.') || 'input', message: i.message }));
    throw new AppError('INVALID', `This can't be done yet: ${issues.map((i) => `${i.field}: ${i.message}`).join('; ')}.`, issues);
  }
  return t.run(deps, parsed.data as never);
}

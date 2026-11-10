import { z } from 'zod';
import { CONTENT_MODES } from '../../src/types/content';

/**
 * Automatic update checks ("update plans"), their run log, the skills an AI
 * follows when it writes or tests, and readers' "Was this helpful?" votes.
 * Shared by the backend, the admin and the Be Guided Studio app.
 */

const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single dashes.').max(80);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time like 08:00.');

// ── How often to check ────────────────────────────────────────────────────

export const HOUR_STEPS = [1, 2, 4, 6, 8, 12] as const;

export const frequencySchema = z.discriminatedUnion('kind', [
  /** Every N hours, on the hour. */
  z.object({ kind: z.literal('hours'), every: z.union([z.literal(1), z.literal(2), z.literal(4), z.literal(6), z.literal(8), z.literal(12)]) }),
  /** Every day at a time. */
  z.object({ kind: z.literal('daily'), at: time }),
  /** Every N days at a time (counted from the last run). */
  z.object({ kind: z.literal('days'), every: z.number().int().min(2).max(30), at: time }),
  /** On one day of each month at a time (1 to 28, so every month has it). */
  z.object({ kind: z.literal('monthly'), day: z.number().int().min(1).max(28), at: time }),
]);
export type Frequency = z.infer<typeof frequencySchema>;

// ── Update plans (the saved set-ups) ──────────────────────────────────────

export const planInputSchema = z.object({
  /** Present to change an existing plan; left out to add one. */
  id: z.string().min(1).max(64).optional(),
  name: z.string().trim().min(2).max(60),
  /** Look for changes on the schedule. Off = the plan only runs when someone presses "Check now". */
  autoCheck: z.boolean(),
  frequency: frequencySchema,
  /** IANA time zone for the times above, e.g. Africa/Lagos. */
  timeZone: z.string().trim().min(1).max(64).default('Africa/Lagos'),
  /** Update the guide after a check (otherwise the check only reports). */
  autoUpdate: z.boolean(),
  /** With auto update on: wait for someone to tick the changes before updating. */
  requireApproval: z.boolean(),
  /** What an update produces. */
  contentMode: z.enum(CONTENT_MODES),
});
export type PlanInput = z.infer<typeof planInputSchema>;

export const planSchema = planInputSchema.extend({
  id: z.string(),
  builtIn: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  /** Products this plan is switched on for. */
  products: z.array(z.string()),
});
export type PlanDto = z.infer<typeof planSchema>;

export const assignInputSchema = z.object({
  /** null switches automatic checks off for these products. */
  planId: z.string().min(1).nullable(),
  products: z.union([z.literal('all'), z.array(slug).min(1).max(100)]),
});
export type AssignInput = z.infer<typeof assignInputSchema>;

export const productScheduleSchema = z.object({
  product: z.string(),
  name: z.string(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  /** When the next automatic check is due (ISO), or null when none is scheduled. */
  nextRunAt: z.string().nullable(),
  lastRunAt: z.string().nullable(),
});
export type ProductScheduleDto = z.infer<typeof productScheduleSchema>;

// ── Check runs and what they found ────────────────────────────────────────

export const CHECK_STATUSES = ['queued', 'running', 'waiting-approval', 'updating', 'done', 'failed', 'cancelled'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];

export const CHANGE_KINDS = ['screen-changed', 'label-changed', 'new-feature', 'removed', 'new-page', 'bug'] as const;
export const CHANGE_DECISIONS = ['pending', 'selected', 'skipped', 'applied'] as const;

export const changeSchema = z.object({
  id: z.string(),
  pageId: z.string().nullable(),
  kind: z.enum(CHANGE_KINDS),
  title: z.string(),
  detail: z.string(),
  /** Where in the code it was seen, e.g. src/app/sales/invoices/page.tsx:120. */
  evidence: z.string().nullable(),
  decision: z.enum(CHANGE_DECISIONS),
  /** The content mode chosen for this change when it was selected. */
  mode: z.enum(CONTENT_MODES).nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
export type ChangeDto = z.infer<typeof changeSchema>;

export const checkSchema = z.object({
  id: z.string(),
  product: z.string(),
  planId: z.string().nullable(),
  planName: z.string().nullable(),
  trigger: z.enum(['schedule', 'manual']),
  status: z.enum(CHECK_STATUSES),
  contentMode: z.enum(CONTENT_MODES),
  autoUpdate: z.boolean(),
  requireApproval: z.boolean(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  requestedBy: z.string().nullable(),
  runBy: z.string().nullable(),
  summary: z.string().nullable(),
  error: z.string().nullable(),
  /** Counts for the log list. */
  changeCount: z.number().int(),
  pendingCount: z.number().int(),
});
export type CheckDto = z.infer<typeof checkSchema>;

export const checkDetailSchema = checkSchema.extend({ changes: z.array(changeSchema) });
export type CheckDetailDto = z.infer<typeof checkDetailSchema>;

export const reportChangeSchema = z.object({
  pageId: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/, 'Give the page id as product/module/page.').nullable().default(null),
  kind: z.enum(CHANGE_KINDS),
  title: z.string().trim().min(3).max(160),
  detail: z.string().trim().max(2000).default(''),
  evidence: z.string().trim().max(300).nullable().default(null),
});

export const reportInputSchema = z.object({
  checkId: z.string().min(1),
  summary: z.string().trim().min(3).max(2000),
  changes: z.array(reportChangeSchema).max(300),
});
export type ReportInput = z.infer<typeof reportInputSchema>;

export const decideInputSchema = z.object({
  checkId: z.string().min(1),
  items: z
    .array(z.object({ changeId: z.string().min(1), include: z.boolean(), mode: z.enum(CONTENT_MODES).optional() }))
    .min(1)
    .max(300),
  note: z.string().trim().max(1000).optional(),
});
export type DecideInput = z.infer<typeof decideInputSchema>;

// ── Skills (house instructions an AI follows) ─────────────────────────────

export const SKILL_KINDS = ['writing', 'qa'] as const;
export type SkillKind = (typeof SKILL_KINDS)[number];

export const skillInputSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  kind: z.enum(SKILL_KINDS),
  name: z.string().trim().min(2).max(80),
  /** The skill text (Markdown), e.g. the contents of a SKILL.md file. */
  content: z.string().trim().min(20).max(200_000),
  fileName: z.string().trim().max(120).nullable().default(null),
  /** null = every product. */
  products: z.array(slug).min(1).max(100).nullable().default(null),
  active: z.boolean().default(true),
});
export type SkillInput = z.infer<typeof skillInputSchema>;

export const skillSchema = skillInputSchema.extend({
  id: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  createdBy: z.string().nullable(),
  /** Length of the text, for the list. */
  size: z.number().int(),
});
export type SkillDto = z.infer<typeof skillSchema>;

// ── Readers' votes ────────────────────────────────────────────────────────

export const voteInputSchema = z.object({
  pageId: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/),
  helpful: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
  /** Only if the reader wants a reply. */
  email: z.string().trim().email().max(200).optional(),
  /** Random id the reader's browser keeps, so a changed vote replaces the earlier one. */
  visitor: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});
export type VoteInput = z.infer<typeof voteInputSchema>;

export const voteSchema = z.object({
  id: z.string(),
  pageId: z.string(),
  pageTitle: z.string().nullable(),
  helpful: z.boolean(),
  comment: z.string().nullable(),
  email: z.string().nullable(),
  country: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type VoteDto = z.infer<typeof voteSchema>;

export const feedbackSummarySchema = z.object({
  totals: z.object({ up: z.number().int(), down: z.number().int(), comments: z.number().int() }),
  pages: z.array(z.object({ pageId: z.string(), pageTitle: z.string().nullable(), up: z.number().int(), down: z.number().int(), lastAt: z.string() })),
  votes: z.array(voteSchema),
});
export type FeedbackSummaryDto = z.infer<typeof feedbackSummarySchema>;

// ── One call shape for every client (admin, Studio app, connector) ───────

export const automationCallSchema = z.object({
  tool: z.string().regex(/^[a-z_]{3,40}$/),
  args: z.record(z.string(), z.unknown()).default({}),
});
export type AutomationCall = z.infer<typeof automationCallSchema>;

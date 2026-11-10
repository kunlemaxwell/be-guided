import { z } from 'zod';
import { CONTENT_MODES, MODULE_GROUPS, type ContentMode, type SiteSettings } from '../../src/types/content';

/**
 * Contract between the Be Guided API (backend/) and the admin web app.
 * Every DTO is declared ONCE here as a zod schema; the server validates and
 * documents with it (OpenAPI is generated from these), the web app uses the
 * inferred types. Never redeclare a DTO elsewhere.
 */

// ── Error codes ────────────────────────────────────────────────────────────

/**
 * Every business code the API can return, with its HTTP status. Clients
 * branch on `code`, never on the message text. Published in docs/openapi.json.
 */
export const API_ERROR_STATUS = {
  /** 400 – a product/module/page/file location that is not allowed (path traversal, bad slug). */
  BAD_PATH: 400,
  /** 400 – the request body is not valid JSON. */
  BAD_REQUEST: 400,
  /** 401 – no identity on the request (cloud: missing/invalid Cloudflare Access token). */
  UNAUTHENTICATED: 401,
  /** 403 – identity known, but its role does not allow this action, or the person is unknown/inactive. */
  FORBIDDEN: 403,
  /** 403 – local admin: request did not come from this computer's own admin page. */
  FORBIDDEN_ORIGIN: 403,
  /** 404 – the thing asked for does not exist (or the address is not part of the API). */
  NOT_FOUND: 404,
  /** 405 – the address exists but not with this method, or the action is not available right now. */
  NOT_ALLOWED: 405,
  /** 409 – something with that name already exists. */
  ALREADY_EXISTS: 409,
  /** 409 – the change conflicts with the current state (e.g. removing the last owner). */
  CONFLICT: 409,
  /** 409 – publish was asked for but nothing changed since the last publish. */
  NOTHING_TO_PUBLISH: 409,
  /** 413 – an upload or body is larger than allowed. */
  FILE_TOO_LARGE: 413,
  /** 415 – an upload is not an allowed file type, or its content does not match its extension. */
  UNSUPPORTED_FILE: 415,
  /** 422 – input failed validation; `issues` lists each field. */
  INVALID: 422,
  /** 429 – too many requests from this address; try again shortly. */
  RATE_LIMITED: 429,
  /** 500 – unexpected failure. Nothing internal is ever included. */
  SERVER_ERROR: 500,
  /** 500 – publishing failed part-way (nothing was sent, or it could not be sent). */
  PUBLISH_FAILED: 500,
  /** 501 – this feature exists only in another mode (e.g. the Mac folder picker in the cloud). */
  NOT_SUPPORTED: 501,
  /** 503 – a feature needs configuration that is missing (e.g. no AI key). */
  NOT_CONFIGURED: 503,
} as const;

export type ApiErrorCode = keyof typeof API_ERROR_STATUS;
export const API_ERROR_CODES = Object.keys(API_ERROR_STATUS) as ApiErrorCode[];

export const fieldIssueSchema = z.object({
  /** e.g. "title" or "video.src" */
  field: z.string(),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const errorEnvelopeSchema = z.object({
  success: z.literal(false),
  code: z.enum(API_ERROR_CODES as [ApiErrorCode, ...ApiErrorCode[]]),
  message: z.string(),
  issues: z.array(fieldIssueSchema).optional(),
});
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

/** `{ success, message, data }` on every successful response. */
export function envelopeSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

export type ApiEnvelope<T> = { success: true; message: string; data: T } | ErrorEnvelope;

// ── Pagination ─────────────────────────────────────────────────────────────

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const pageQuerySchema = z.object({
  pageNumber: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type PageQuery = z.infer<typeof pageQuerySchema>;

export function pagedSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    pageNumber: z.number().int(),
    pageSize: z.number().int(),
    totalCount: z.number().int(),
    totalPages: z.number().int(),
  });
}
export interface Paged<T> {
  items: T[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

// ── Slugs ──────────────────────────────────────────────────────────────────

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z
  .string()
  .min(1, 'is required')
  .max(80, 'is too long')
  .regex(SLUG_PATTERN, 'can only use lowercase letters, numbers and single dashes');

// ── Identity, roles, people ────────────────────────────────────────────────

export const ROLES = ['owner', 'editor', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/**
 * What a role may do. viewer = read; editor = pages, products, modules,
 * requests and uploads; owner = also people, settings and publishing.
 */
export const PERMISSIONS = ['content:read', 'content:write', 'settings:manage', 'people:manage', 'publish'] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };

export const personSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  role: z.enum(ROLES),
  active: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PersonDto = z.infer<typeof personSchema>;

const personNameSchema = z.string().trim().min(1, 'is required').max(120, 'is too long');
const personEmailSchema = z
  .string()
  .trim()
  .max(254, 'is too long')
  .email('must be an email address like name@example.com')
  .or(z.literal(''))
  .optional();

export const newPersonSchema = z.object({
  name: personNameSchema,
  email: personEmailSchema,
  role: z.enum(ROLES),
});
export type NewPersonInput = z.infer<typeof newPersonSchema>;

export const updatePersonSchema = z.object({
  name: personNameSchema,
  email: personEmailSchema,
  role: z.enum(ROLES),
  active: z.boolean(),
});
export type UpdatePersonInput = z.infer<typeof updatePersonSchema>;

export const currentPersonInputSchema = z.object({ personId: z.string().min(1).nullable() });
export type CurrentPersonInput = z.infer<typeof currentPersonInputSchema>;

export const APP_MODES = ['local', 'cloud'] as const;
export type AppMode = (typeof APP_MODES)[number];

export const meSchema = z.object({
  mode: z.enum(APP_MODES),
  /** The person behind this request (null locally until "who is using this computer" is chosen). */
  person: personSchema.nullable(),
  /** Display name used in history and the audit log. */
  displayName: z.string(),
  role: z.enum(ROLES),
  permissions: z.array(z.enum(PERMISSIONS)),
});
export type MeDto = z.infer<typeof meSchema>;

// ── Capabilities ───────────────────────────────────────────────────────────

export const capabilitiesSchema = z.object({
  mode: z.enum(APP_MODES),
  /** The macOS "Choose folder…" picker (local admin on a Mac only). */
  folderPicker: z.boolean(),
  /** Ask AI has an API key configured. */
  chat: z.boolean(),
  uploads: z.object({
    imageMaxBytes: z.number().int(),
    videoMaxBytes: z.number().int(),
    imageExtensions: z.array(z.string()),
    videoExtensions: z.array(z.string()),
  }),
  siteUrl: z.string(),
});
export type CapabilitiesDto = z.infer<typeof capabilitiesSchema>;

// ── Library (products → modules → pages) ───────────────────────────────────

/** Video badge: no video, video file here, or video listed but its file isn't available. */
export const VIDEO_STATES = ['none', 'present', 'missing'] as const;
export type VideoState = (typeof VIDEO_STATES)[number];

export const pageBadgesSchema = z.object({
  text: z.boolean(),
  screenshots: z.boolean(),
  screenshotCount: z.number().int(),
  video: z.enum(VIDEO_STATES),
});
export type PageBadges = z.infer<typeof pageBadgesSchema>;

export const VISIBILITIES = ['public', 'private'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const pageSummarySchema = z.object({
  /** product/module/page */
  id: z.string(),
  product: z.string(),
  module: z.string(),
  slug: z.string(),
  title: z.string(),
  summary: z.string(),
  status: z.enum(['published', 'draft']),
  visibility: z.enum(VISIBILITIES),
  /** As stored in the page (a person's name, or the legacy "claude" / "human"). */
  author: z.string(),
  /** Readable author: legacy "claude" → "Claude", "human" → "Not set". */
  authorName: z.string(),
  updated: z.string(),
  order: z.number(),
  badges: pageBadgesSchema,
  /** Set when the file can't be read; the page is still listed. */
  problem: z.string().optional(),
});
export type PageSummary = z.infer<typeof pageSummarySchema>;

/** module.json / product.json as stored (fields with defaults may be absent; unknown fields are kept). */
export const moduleJsonSchema = z.object({ title: z.string(), summary: z.string() }).passthrough();
export type ModuleJson = z.infer<typeof moduleJsonSchema>;
export const productJsonSchema = z.object({ name: z.string(), summary: z.string() }).passthrough();
export type ProductJson = z.infer<typeof productJsonSchema>;

export const moduleSummarySchema = z.object({ slug: z.string(), meta: moduleJsonSchema, pages: z.array(pageSummarySchema) });
export type ModuleSummary = z.infer<typeof moduleSummarySchema>;

export const productSummarySchema = z.object({ slug: z.string(), meta: productJsonSchema, modules: z.array(moduleSummarySchema) });
export type ProductSummary = z.infer<typeof productSummarySchema>;

export const librarySchema = z.object({ products: z.array(productSummarySchema) });
export type LibraryDto = z.infer<typeof librarySchema>;

/** Free-form JSON object (site.json, product.json, page frontmatter). Validated by the site's own schemas on write. */
export const jsonObjectSchema = z.record(z.unknown());

// ── Page editor ────────────────────────────────────────────────────────────

export const moduleFileSchema = z.object({
  /** As written in markdown/frontmatter, e.g. images/invoice-lines.webp or media/walkthrough.mp4 */
  src: z.string(),
  name: z.string(),
  /** Admin URL that serves the file. */
  url: z.string(),
});
export type ModuleFile = z.infer<typeof moduleFileSchema>;
/** @deprecated name kept for the editor code; same shape as ModuleFile. */
export type ModuleImage = ModuleFile;

export const guideTargetSchema = z.object({
  /** As written in prerequisites / guide: links ("module/page" or "product/module/page"). */
  ref: z.string(),
  title: z.string(),
  moduleTitle: z.string(),
});
export type GuideTarget = z.infer<typeof guideTargetSchema>;

export const pageDetailSchema = z.object({
  id: z.string(),
  product: z.string(),
  module: z.string(),
  slug: z.string(),
  productName: z.string(),
  moduleTitle: z.string(),
  frontmatter: jsonObjectSchema,
  body: z.string(),
  images: z.array(moduleFileSchema),
  media: z.array(moduleFileSchema),
  video: z.object({ state: z.enum(VIDEO_STATES), posterState: z.enum(VIDEO_STATES) }),
  targets: z.array(guideTargetSchema),
  siteDefaultVideoDisplay: z.enum(['collapsed', 'expanded']),
  /** http://localhost:3100/<product>/<module>/<page>/ */
  siteUrl: z.string(),
});
export type PageDetailDto = z.infer<typeof pageDetailSchema>;

export const savePageInputSchema = z.object({ frontmatter: jsonObjectSchema, body: z.string().max(2_000_000, 'is too long') });
export type SavePageInput = z.infer<typeof savePageInputSchema>;

export const savePageResultSchema = z.object({ updated: z.string(), siteUrl: z.string(), revisionId: z.string().nullable() });
export type SavePageResult = z.infer<typeof savePageResultSchema>;

export const newProductSchema = z.object({
  slug: slugSchema,
  name: z.string().trim().min(1, 'is required'),
  summary: z.string().trim().min(1, 'is required'),
});
export type NewProductInput = z.infer<typeof newProductSchema>;

export const newModuleSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, 'is required'),
  summary: z.string().trim().min(1, 'is required'),
  group: z.enum(MODULE_GROUPS),
  /** Business area the module is shown under, e.g. "Accounting" or "HR". */
  area: z.string().trim().min(1).max(40).optional(),
});
export type NewModuleInput = z.infer<typeof newModuleSchema>;

export const newPageSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(1, 'is required'),
  summary: z.string().trim().min(1, 'is required'),
});
export type NewPageInput = z.infer<typeof newPageSchema>;

/**
 * Admin-only additions to a product's source repository row. `localPath` is
 * where the code is on this computer (set with "Choose folder…").
 */
export const repoLocalPathSchema = z.string().max(1024).refine((v) => v.startsWith('/'), 'must be a full folder path');

// ── Version history ────────────────────────────────────────────────────────

export const REVISION_ACTIONS = ['create', 'save', 'draft'] as const;
export type RevisionAction = (typeof REVISION_ACTIONS)[number];

export const fieldChangeSchema = z.object({
  /** e.g. "title", "video.src", "themeCustom.colors.light.accent" */
  field: z.string(),
  label: z.string(),
  before: z.unknown(),
  after: z.unknown(),
});
export type FieldChange = z.infer<typeof fieldChangeSchema>;

export const diffLineSchema = z.object({
  /** ' ' unchanged (context), '+' added, '-' removed */
  op: z.enum([' ', '+', '-']),
  text: z.string(),
  /** Line number in the old text (unchanged/removed lines). */
  oldLine: z.number().int().nullable(),
  /** Line number in the new text (unchanged/added lines). */
  newLine: z.number().int().nullable(),
});
export type DiffLine = z.infer<typeof diffLineSchema>;

export const diffHunkSchema = z.object({ lines: z.array(diffLineSchema) });
export type DiffHunk = z.infer<typeof diffHunkSchema>;

export const revisionSummarySchema = z.object({
  id: z.string(),
  pageId: z.string(),
  createdAt: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  action: z.enum(REVISION_ACTIONS),
  /** "Changed title; 12 lines added, 3 removed" */
  summary: z.string(),
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
});
export type RevisionSummaryDto = z.infer<typeof revisionSummarySchema>;

export const revisionDetailSchema = revisionSummarySchema.extend({
  fieldChanges: z.array(fieldChangeSchema),
  bodyDiff: z.array(diffHunkSchema),
  correlationId: z.string().nullable(),
});
export type RevisionDetailDto = z.infer<typeof revisionDetailSchema>;

// ── Audit log ──────────────────────────────────────────────────────────────

export const AUDIT_AREAS = ['pages', 'products', 'modules', 'settings', 'people', 'requests', 'uploads', 'publish', 'automation'] as const;
export type AuditArea = (typeof AUDIT_AREAS)[number];

export const AUDIT_AREA_LABEL: Record<AuditArea, string> = {
  pages: 'Pages',
  products: 'Products',
  modules: 'Modules',
  settings: 'Settings',
  people: 'People',
  requests: 'Updates & requests',
  uploads: 'Uploads',
  publish: 'Publish',
  automation: 'Automatic checks and skills',
};

export const auditEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  actorId: z.string().nullable(),
  actorName: z.string(),
  area: z.enum(AUDIT_AREAS),
  /** Constant action code, e.g. "page.save". */
  action: z.string(),
  /** What was acted on, e.g. "acme-books/sales/create-an-invoice". */
  target: z.string(),
  summary: z.string(),
  details: z.unknown(),
  correlationId: z.string().nullable(),
});
export type AuditEntryDto = z.infer<typeof auditEntrySchema>;

const isoDateOrTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/, 'must be a date written YYYY-MM-DD');

export const auditQuerySchema = pageQuerySchema.extend({
  area: z.enum(AUDIT_AREAS).optional(),
  actorId: z.string().max(80).optional(),
  /** Inclusive start date (YYYY-MM-DD). */
  from: isoDateOrTime.optional(),
  /** Inclusive end date (YYYY-MM-DD). */
  to: isoDateOrTime.optional(),
  /** Free text matched against summary and target. */
  q: z.string().trim().max(200).optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

// ── Uploads & files ────────────────────────────────────────────────────────

export const UPLOAD_KINDS = ['image', 'video'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export const uploadResultSchema = z.object({
  /** What to write in the page, e.g. media/walkthrough.mp4 */
  src: z.string(),
  name: z.string(),
  url: z.string(),
  size: z.number().int(),
  /** True when a file with the same name existed and this one was saved under a new name. */
  renamed: z.boolean(),
});
export type UploadResultDto = z.infer<typeof uploadResultSchema>;

export const folderChoiceSchema = z.object({ path: z.string().nullable() });
export type FolderChoiceDto = z.infer<typeof folderChoiceSchema>;

// ── Requests queue ─────────────────────────────────────────────────────────

export const REQUEST_TYPES = ['check-updates', 'make-video', 'refresh-page', 'new-page', 'new-product', 'new-module'] as const;
export type RequestType = (typeof REQUEST_TYPES)[number];

export const REQUEST_STATUSES = ['queued', 'in-progress', 'done', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

/**
 * What a "new product" / "new module" request asks to create. The owner's
 * "Approve and create" button creates exactly this.
 */
export const createRequestSchema = z.object({
  kind: z.enum(['product', 'module']),
  /** The product's web address name (new for kind product, existing for kind module). */
  product: slugSchema,
  /** The module's web address name (kind module only). */
  module: slugSchema.optional(),
  /** Product name or module title. */
  name: z.string().trim().min(1).max(80),
  summary: z.string().trim().min(1).max(300),
  group: z.enum(MODULE_GROUPS).optional(),
  area: z.string().trim().min(1).max(40).optional(),
  repos: z
    .array(z.object({ url: z.string().trim().min(1).max(300), branch: z.string().trim().max(100).default('main'), paths: z.array(z.string().trim().max(300)).max(20).default([]) }))
    .max(10)
    .optional(),
});
export type CreateRequest = z.infer<typeof createRequestSchema>;

export const guideRequestSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().min(1),
  type: z.enum(REQUEST_TYPES),
  scope: z.object({
    products: z.union([z.literal('all'), z.array(slugSchema).min(1)]),
    /** Page ids (`product/module/slug`); one instruction may cover many pages. */
    pages: z.array(z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/, 'Not a page id.')).max(500).optional(),
  }),
  contentMode: z.enum(CONTENT_MODES),
  note: z.string().max(2000).optional(),
  status: z.enum(REQUEST_STATUSES),
  /** Who asked (added with the audit log; older requests don't have it). */
  requestedBy: z.string().optional(),
  /** For new-product / new-module requests: what to create on approval. */
  create: createRequestSchema.optional(),
});
export type GuideRequest = z.infer<typeof guideRequestSchema>;

export const newRequestSchema = guideRequestSchema.pick({ type: true, scope: true, contentMode: true, note: true, create: true });
export type NewRequestInput = z.infer<typeof newRequestSchema>;

export const proposalSchema = z
  .object({
    changes: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        page: z.string().optional(),
        kind: z.string().optional(),
        summary: z.string().optional(),
      }),
    ),
    approved: z.array(z.string()).optional(),
  })
  .passthrough();
export type Proposal = z.infer<typeof proposalSchema>;

export const requestDtoSchema = guideRequestSchema.extend({ proposal: proposalSchema.optional() });
export type RequestDto = z.infer<typeof requestDtoSchema>;

export const approveInputSchema = z.object({ approved: z.array(z.string()).max(500) });
export type ApproveInput = z.infer<typeof approveInputSchema>;

// ── Publish ────────────────────────────────────────────────────────────────

export const publishStatusSchema = z.object({
  canPublish: z.boolean(),
  /** Plain-language sentence for the owner. */
  message: z.string(),
});
export type PublishStatusDto = z.infer<typeof publishStatusSchema>;

export const publishResultSchema = z.object({ message: z.string() });
export type PublishResultDto = z.infer<typeof publishResultSchema>;

// ── Ask AI (public) ────────────────────────────────────────────────────────

export const CHAT_LIMITS = { messages: 12, messageChars: 2000, totalChars: 24_000 } as const;

export const chatInputSchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().trim().min(1, 'is required').max(CHAT_LIMITS.messageChars, 'is too long') }))
      .min(1, 'is required')
      .max(CHAT_LIMITS.messages, 'has too many messages'),
    /** Product slug the reader is in, e.g. "acme-books". */
    product: slugSchema.optional(),
    /** Full page id the reader is on, e.g. "acme-books/sales/create-an-invoice". */
    page: z
      .string()
      .max(240)
      .regex(/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/, 'must be a full page id like product/module/page')
      .optional(),
  })
  .refine((v) => v.messages[0]?.role === 'user' && v.messages[v.messages.length - 1]?.role === 'user', {
    message: 'must start and end with a question from the reader',
    path: ['messages'],
  })
  .refine((v) => v.messages.reduce((n, m) => n + m.content.length, 0) <= CHAT_LIMITS.totalChars, {
    message: 'is too long in total',
    path: ['messages'],
  });
export type ChatInput = z.infer<typeof chatInputSchema>;

export const chatSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  /** Site-relative link, e.g. /acme-books/sales/create-an-invoice/ */
  href: z.string(),
});
export type ChatSource = z.infer<typeof chatSourceSchema>;

export const chatAnswerSchema = z.object({ answer: z.string(), sources: z.array(chatSourceSchema) });
export type ChatAnswerDto = z.infer<typeof chatAnswerSchema>;

// ── Connect your AI (MCP) ──────────────────────────────────────────────────
// /api/v1/mcp speaks JSON-RPC 2.0 (Model Context Protocol, Streamable HTTP),
// not the { success, data } envelope. These schemas document it.

export const jsonRpcErrorSchema = z.object({ code: z.number().int(), message: z.string(), data: z.unknown().optional() });

export const jsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number(), z.null()]),
    result: z.record(z.unknown()).optional(),
    error: jsonRpcErrorSchema.optional(),
  });
export type JsonRpcResponse = z.infer<typeof jsonRpcResponseSchema>;

// ── Editor connector (Claude Code / Codex) ────────────────────────────────

export const connectorKeySchema = z.object({
  id: z.string(),
  personId: z.string(),
  personName: z.string(),
  label: z.string(),
  /** First characters of the key, to recognise it (the key itself is never shown again). */
  prefix: z.string(),
  /** Products the key may edit; null = every product. */
  products: z.array(z.string()).nullable(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type ConnectorKeyDto = z.infer<typeof connectorKeySchema>;

export const newConnectorKeySchema = z.object({
  personId: z.string().min(1, 'is required'),
  label: z.string().trim().min(1, 'is required').max(80, 'is too long'),
  products: z.array(slugSchema).min(1, 'pick at least one product').nullable(),
});
export type NewConnectorKeyInput = z.infer<typeof newConnectorKeySchema>;

/** Returned once, when a key is created: the only time the full key is shown. */
export const createdConnectorKeySchema = connectorKeySchema.extend({ key: z.string(), connectorUrl: z.string() });
export type CreatedConnectorKeyDto = z.infer<typeof createdConnectorKeySchema>;

export const PENDING_STATUSES = ['pending', 'approved', 'rejected'] as const;
export const pendingChangeSchema = z.object({
  id: z.string(),
  kind: z.enum(['create', 'save']),
  pageId: z.string(),
  title: z.string(),
  note: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
  status: z.enum(PENDING_STATUSES),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  /** Lines added/removed against the live page (create: all lines added). */
  linesAdded: z.number().int(),
  linesRemoved: z.number().int(),
});
export type PendingChangeDto = z.infer<typeof pendingChangeSchema>;

export const changeCheckSchema = z.object({ label: z.string(), ok: z.boolean(), detail: z.string() });
export type ChangeCheckDto = z.infer<typeof changeCheckSchema>;

/** What an owner needs to decide: where it goes, what it contains, and the house-standard checks. */
export const changeReviewSchema = z.object({
  productName: z.string(),
  moduleTitle: z.string(),
  summary: z.string(),
  publishes: z.boolean(),
  steps: z.number().int(),
  words: z.number().int(),
  screenshots: z.array(z.object({ src: z.string(), found: z.boolean() })),
  prerequisites: z.array(z.object({ ref: z.string(), title: z.string().nullable() })),
  checks: z.array(changeCheckSchema),
});
export type ChangeReviewDto = z.infer<typeof changeReviewSchema>;

export const pendingChangeDetailSchema = pendingChangeSchema.extend({
  frontmatter: jsonObjectSchema,
  body: z.string(),
  currentBody: z.string().nullable(),
  /** Times the editor updated this change while it was waiting (1 = sent once). */
  revisions: z.number().int(),
  review: changeReviewSchema,
});
export type PendingChangeDetailDto = z.infer<typeof pendingChangeDetailSchema>;

export const decideChangeSchema = z.object({ note: z.string().trim().max(500, 'is too long').optional() });
export type DecideChangeInput = z.infer<typeof decideChangeSchema>;

// ── Health ─────────────────────────────────────────────────────────────────

export const healthSchema = z.object({ status: z.literal('ok'), mode: z.enum(APP_MODES), version: z.string() });
export type HealthDto = z.infer<typeof healthSchema>;

export type { ContentMode, SiteSettings };

import type {
  CreateRequest,
  ChangeCheckDto,
  ChangeReviewDto,
  ConnectorKeyDto,
  CreatedConnectorKeyDto,
  NewConnectorKeyInput,
  PendingChangeDetailDto,
  PendingChangeDto,
} from '../../../../admin/shared/api-types';
import { pageFrontmatterSchema } from '../../../../src/types/content';
import type { Actor, RequestContext } from '../../domain/actor';
import { diffText } from '../../domain/diff';
import { AppError, invalid } from '../../domain/errors';
import { checkSlug, isoDay } from '../../domain/slugs';
import type {
  Clock,
  ConnectorKeyRecord,
  ConnectorKeyRepository,
  PendingChangeRecord,
  PendingChangeRepository,
  UploadTicketRepository,
  PeopleRepository,
} from '../ports';
import type { ActivityService } from './activity-service';
import type { ContentService } from './content-service';
import type { RequestService } from './request-service';
import type { UploadService } from './upload-service';

/** Every connector key starts with this, so leaked keys are easy to spot. */
export const KEY_PREFIX = 'bgk_';

/** A signed-in connector user: who they are and which products their key may edit. */
/** "Acme Marketing" -> "acme-marketing". */
function slugify(v: string): string {
  return v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
}

export interface EditorSession {
  ctx: RequestContext;
  keyId: string;
  /** null = every product. */
  products: string[] | null;
}

export type SaveOutcome =
  | { status: 'published'; pageId: string; siteUrl: string }
  | { status: 'waiting-for-approval'; pageId: string; changeId: string; updatedExisting: boolean };

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function newKeyValue(): string {
  return KEY_PREFIX + randomToken();
}

/** How long an upload link works. */
const UPLOAD_LINK_MINUTES = 15;

/**
 * House rules every page must follow, checked before anything is saved or
 * queued. The schema checks the frontmatter; these check the body text.
 * Returns plain-language problems (empty = fine).
 */
export function guideRuleProblems(body: string): string[] {
  const problems: string[] = [];
  if (body.includes('—')) problems.push('Do not use em dashes (—). Use a comma, colon or full stop instead.');
  for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
    const src = m[1]!;
    if (!/^(images|media)\/[a-z0-9][a-z0-9._-]*$/i.test(src)) {
      problems.push(`Pictures must come from this module's images folder (images/name.webp), not "${src}". Upload it with upload_screenshot first.`);
    }
  }
  if (/<script|<iframe|javascript:/i.test(body)) problems.push('Pages cannot contain scripts, iframes or javascript: links.');
  if (body.trimStart().startsWith('---')) problems.push('Send the page details as "frontmatter", not inside the body.');
  return problems;
}

/**
 * The editor connector (Claude Code / Codex): personal keys, product scope,
 * content-only edits that follow the house rules, and "approve before
 * publish" per product. All writes go through ContentService / UploadService
 * / RequestService, so history, audit and validation are exactly the admin's.
 */
export class EditorService {
  constructor(
    private readonly keys: ConnectorKeyRepository,
    private readonly changes: PendingChangeRepository,
    private readonly people: PeopleRepository,
    private readonly content: ContentService,
    private readonly uploads: UploadService,
    private readonly requests: RequestService,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly newId: () => string,
    private readonly tickets: UploadTicketRepository,
  ) {}

  // ── Keys (owners, in the admin) ─────────────────────────────────────────

  private async toDto(k: ConnectorKeyRecord): Promise<ConnectorKeyDto> {
    const person = await this.people.get(k.personId);
    return {
      id: k.id,
      personId: k.personId,
      personName: person?.name ?? 'Removed person',
      label: k.label,
      prefix: k.prefix,
      products: k.products,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
      revokedAt: k.revokedAt,
    };
  }

  async listKeys(): Promise<ConnectorKeyDto[]> {
    return Promise.all((await this.keys.list()).map((k) => this.toDto(k)));
  }

  async createKey(ctx: RequestContext, input: NewConnectorKeyInput, connectorUrl: string): Promise<CreatedConnectorKeyDto> {
    const person = await this.people.get(input.personId);
    if (!person || !person.active) throw new AppError('NOT_FOUND', 'That person is not in the People list (or is switched off).');
    if (person.role === 'viewer') throw new AppError('INVALID', 'Viewers can only read. Make the person an editor first.', [{ field: 'personId', message: 'must be an editor or owner' }]);
    const library = await this.content.getLibrary();
    const known = new Set(library.products.map((p) => p.slug));
    for (const p of input.products ?? []) {
      if (!known.has(p)) throw new AppError('INVALID', `There is no product "${p}".`, [{ field: 'products', message: `unknown product ${p}` }]);
    }
    const key = newKeyValue();
    const record: ConnectorKeyRecord = {
      id: this.newId(),
      personId: person.id,
      label: input.label.trim(),
      prefix: key.slice(0, 12),
      hash: await sha256Hex(key),
      products: input.products,
      createdAt: this.clock.now().toISOString(),
      createdBy: ctx.actor.personId,
      lastUsedAt: null,
      revokedAt: null,
    };
    await this.keys.insert(record);
    await this.activity.record(ctx, {
      area: 'people',
      action: 'connector.key.create',
      target: person.id,
      summary: `Created connector key “${record.label}” for ${person.name}`,
      details: { keyId: record.id, products: record.products ?? 'all' },
    });
    return { ...(await this.toDto(record)), key, connectorUrl };
  }

  async revokeKey(ctx: RequestContext, id: string): Promise<ConnectorKeyDto> {
    const k = await this.keys.get(id);
    if (!k) throw new AppError('NOT_FOUND', 'That key no longer exists.');
    const at = this.clock.now().toISOString();
    if (!k.revokedAt) {
      await this.keys.revoke(id, at);
      await this.activity.record(ctx, { area: 'people', action: 'connector.key.revoke', target: k.personId, summary: `Switched off connector key “${k.label}”`, details: { keyId: id } });
    }
    return this.toDto({ ...k, revokedAt: k.revokedAt ?? at });
  }

  // ── Sign-in (connector requests) ────────────────────────────────────────

  /** Bearer key → session. Any problem is the same UNAUTHENTICATED answer, so keys can't be probed. */
  async authenticate(authorization: string | null, correlationId: string): Promise<EditorSession> {
    const deny = () => new AppError('UNAUTHENTICATED', 'Add your Be Guided connector key (Authorization: Bearer bgk_…). Ask an owner for one.');
    const m = authorization?.match(/^Bearer\s+(bgk_[A-Za-z0-9_-]{20,})$/);
    if (!m) throw deny();
    const k = await this.keys.findByHash(await sha256Hex(m[1]!));
    if (!k || k.revokedAt) throw deny();
    const person = await this.people.get(k.personId);
    if (!person || !person.active || person.role === 'viewer') throw deny();
    await this.keys.touch(k.id, this.clock.now().toISOString());
    const actor: Actor = { personId: person.id, name: person.name, email: person.email, role: person.role };
    return { ctx: { actor, correlationId }, keyId: k.id, products: k.products };
  }

  private requireProduct(session: EditorSession, product: string): void {
    checkSlug(product, 'product');
    if (session.products && !session.products.includes(product)) {
      throw new AppError('FORBIDDEN', `Your key can't change ${product}. Ask an owner to add it to your key.`);
    }
  }

  // ── Reading ─────────────────────────────────────────────────────────────

  async listProducts(session: EditorSession) {
    const library = await this.content.getLibrary();
    return library.products
      .filter((p) => !session.products || session.products.includes(p.slug))
      .map((p) => ({
        product: p.slug,
        name: p.meta.name,
        needsApproval: session.ctx.actor.role !== 'owner' && p.meta.editorApproval !== false,
        // Where this product's code lives, so the editor's AI reads the right repo/folders on their own computer.
        sources: ((p.meta.source as { repos?: { url: string; branch?: string; paths?: string[] }[] } | undefined)?.repos ?? []).map((r) => ({
          url: r.url,
          branch: r.branch ?? 'main',
          paths: r.paths ?? [],
        })),
        modules: p.modules.map((m) => ({
          module: m.slug,
          title: m.meta.title,
          pages: m.pages.map((pg) => ({ id: `${p.slug}/${m.slug}/${pg.slug}`, title: pg.title, status: pg.status })),
        })),
      }));
  }

  /** The person's own change for this page that is still waiting for approval, if any. */
  private async waitingChange(session: EditorSession, product: string, module: string, slug: string): Promise<PendingChangeRecord | null> {
    const mine = (await this.changes.list('pending')).filter(
      (c) => c.authorId === session.ctx.actor.personId && c.product === product && c.module === module && c.slug === slug,
    );
    return mine[0] ?? null;
  }

  /**
   * Reads a page. When the person has a change for it still waiting for
   * approval, they get that version back, so they can keep working on it.
   */
  async readPage(session: EditorSession, product: string, module: string, slug: string) {
    this.requireProduct(session, product);
    const waiting = await this.waitingChange(session, product, module, slug);
    const live = (await this.content.pageExists(product, module, slug)) ? await this.content.getPage(product, module, slug) : null;
    if (waiting) {
      return {
        id: `${product}/${module}/${slug}`,
        frontmatter: waiting.frontmatter,
        body: waiting.body,
        images: live?.images.map((i) => i.src) ?? [],
        siteUrl: live?.siteUrl ?? null,
        waitingForApproval: { changeId: waiting.id, sentAt: waiting.createdAt },
      };
    }
    const page = live ?? (await this.content.getPage(product, module, slug));
    return { id: page.id, frontmatter: page.frontmatter, body: page.body, images: page.images.map((i) => i.src), siteUrl: page.siteUrl, waitingForApproval: null };
  }

  // ── Writing ─────────────────────────────────────────────────────────────

  /**
   * Creates or updates a page. The frontmatter must pass the page schema and
   * the body the house rules. For products that need approval the change is
   * queued for an owner; otherwise it is saved (and goes live) at once.
   */
  async savePage(
    session: EditorSession,
    input: { product: string; module: string; slug: string; frontmatter: Record<string, unknown>; body: string; note?: string },
  ): Promise<SaveOutcome> {
    const { product, module, slug } = input;
    this.requireProduct(session, product);
    checkSlug(module, 'module');
    checkSlug(slug, 'page');
    if ((await this.content.moduleExists(product, module)) === false) {
      throw new AppError('NOT_FOUND', `There is no module "${module}" in ${product}. Pick one from list_products; new modules are added by an owner.`);
    }
    const frontmatter = { author: session.ctx.actor.name, ...input.frontmatter, updated: isoDay(this.clock.now()) };
    const parsed = pageFrontmatterSchema.safeParse(frontmatter);
    if (!parsed.success) throw invalid(parsed.error, 'page');
    const problems = guideRuleProblems(input.body);
    if (problems.length) throw new AppError('INVALID', `The page doesn't follow the guide rules: ${problems.join(' ')}`, problems.map((m) => ({ field: 'body', message: m })));

    const exists = await this.content.pageExists(product, module, slug);
    const pageId = `${product}/${module}/${slug}`;
    // Owners approve changes, so their own changes publish straight away.
    const needsApproval = session.ctx.actor.role !== 'owner' && (await this.content.editorApprovalRequired(product));

    if (needsApproval) {
      const change: PendingChangeRecord = {
        id: this.newId(),
        kind: exists ? 'save' : 'create',
        product,
        module,
        slug,
        frontmatter,
        body: input.body.trim(),
        note: (input.note ?? '').trim().slice(0, 1000),
        authorId: session.ctx.actor.personId,
        authorName: session.ctx.actor.name,
        createdAt: this.clock.now().toISOString(),
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        decisionNote: null,
        revisions: 1,
      };
      // Still waiting from this person for this page: replace it with the newer version
      // so the owner reviews one change (the latest), not a pile of drafts.
      const waiting = await this.waitingChange(session, product, module, slug);
      if (waiting && (await this.changes.revise(waiting.id, { frontmatter, body: change.body, note: change.note || waiting.note, at: change.createdAt }))) {
        await this.activity.record(session.ctx, {
          area: 'pages',
          action: 'connector.change.update',
          target: pageId,
          summary: `Updated “${parsed.data.title}” while it waits for approval (from the connector)`,
          details: { changeId: waiting.id },
        });
        return { status: 'waiting-for-approval', pageId, changeId: waiting.id, updatedExisting: true };
      }
      await this.changes.insert(change);
      await this.activity.record(session.ctx, {
        area: 'pages',
        action: 'connector.change.submit',
        target: pageId,
        summary: `Sent “${parsed.data.title}” for approval (from the connector)`,
        details: { changeId: change.id, kind: change.kind },
      });
      return { status: 'waiting-for-approval', pageId, changeId: change.id, updatedExisting: false };
    }

    const siteUrl = await this.apply(session.ctx, { kind: exists ? 'save' : 'create', product, module, slug, frontmatter, body: input.body.trim() });
    return { status: 'published', pageId, siteUrl };
  }

  private async apply(ctx: RequestContext, c: { kind: 'create' | 'save'; product: string; module: string; slug: string; frontmatter: Record<string, unknown>; body: string }): Promise<string> {
    if (c.kind === 'create' && !(await this.content.pageExists(c.product, c.module, c.slug))) {
      await this.content.createPage(ctx, c.product, c.module, {
        slug: c.slug,
        title: String(c.frontmatter.title ?? c.slug),
        summary: String(c.frontmatter.summary ?? ''),
      });
    }
    const r = await this.content.savePage(ctx, c.product, c.module, c.slug, { frontmatter: c.frontmatter, body: c.body });
    return r.siteUrl;
  }

  async uploadScreenshot(session: EditorSession, product: string, module: string, name: string, base64: string) {
    this.requireProduct(session, product);
    const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(clean), (ch) => ch.charCodeAt(0));
    } catch {
      throw new AppError('INVALID', 'The picture data is not valid base64.');
    }
    const result = await this.uploads.upload(session.ctx, product, module, 'image', { name, size: bytes.byteLength, bytes: async () => bytes });
    return result;
  }

  /**
   * A one-time link (15 minutes) for sending one screenshot or video file with
   * curl, so big files never travel through the chat as base64.
   */
  async createUploadLink(session: EditorSession, product: string, module: string, kind: 'image' | 'video', fileName: string, base: string) {
    this.requireProduct(session, product);
    checkSlug(module, 'module');
    if ((await this.content.moduleExists(product, module)) === false) throw new AppError('NOT_FOUND', `There is no module "${module}" in ${product}.`);
    if (!session.ctx.actor.personId) throw new AppError('FORBIDDEN', 'Upload links need a personal key.');
    const token = randomToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + UPLOAD_LINK_MINUTES * 60_000).toISOString();
    await this.tickets.insert({
      id: this.newId(),
      tokenHash: await sha256Hex(token),
      keyId: session.keyId,
      personId: session.ctx.actor.personId,
      product,
      module,
      kind,
      fileName,
      createdAt: now.toISOString(),
      expiresAt,
      usedAt: null,
    });
    const uploadUrl = `${base}/upload/${token}`;
    return { uploadUrl, expiresAt, maxBytes: this.uploads.limits[kind === 'image' ? 'imageMaxBytes' : 'videoMaxBytes'], curl: `curl -sS -F "file=@<path to ${fileName}>" ${uploadUrl}` };
  }

  /** Receives the file sent to an upload link. The link works once, for 15 minutes, while its key is on. */
  async receiveUpload(token: string, file: { name: string; size: number; bytes: () => Promise<Uint8Array> }, correlationId: string) {
    const denied = () => new AppError('UNAUTHENTICATED', 'This upload link is not valid any more (they work once, for 15 minutes). Ask for a new one with get_upload_link.');
    if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) throw denied();
    const t = await this.tickets.findByHash(await sha256Hex(token));
    if (!t || t.usedAt || Date.parse(t.expiresAt) < this.clock.now().getTime()) throw denied();
    const key = await this.keys.get(t.keyId);
    const person = await this.people.get(t.personId);
    if (!key || key.revokedAt || !person || !person.active || person.role === 'viewer') throw denied();
    if (key.products && !key.products.includes(t.product)) throw denied();
    if (!(await this.tickets.use(t.id, this.clock.now().toISOString()))) throw denied();
    const ctx = { actor: { personId: person.id, name: person.name, email: person.email, role: person.role }, correlationId };
    const ext = (file.name.match(/\.[a-z0-9]+$/i)?.[0] ?? '').toLowerCase();
    const wanted = t.fileName.replace(/\.[a-z0-9]+$/i, '') + (ext || (t.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? ''));
    return this.uploads.upload(ctx, t.product, t.module, t.kind, { name: wanted, size: file.size, bytes: file.bytes });
  }

  async requestVideo(session: EditorSession, pageId: string, note?: string) {
    const [product, module, slug] = pageId.split('/');
    if (!product || !module || !slug) throw new AppError('INVALID', 'Give the page id as product/module/page.');
    this.requireProduct(session, product);
    if (!(await this.content.pageExists(product, module, slug))) throw new AppError('NOT_FOUND', 'That page does not exist yet.');
    const r = await this.requests.create(session.ctx, {
      type: 'make-video',
      scope: { products: [product], pages: [pageId] },
      contentMode: 'video',
      note: note?.trim() ? `${note.trim()} (requested through the connector by ${session.ctx.actor.name})` : `Requested through the connector by ${session.ctx.actor.name}`,
    });
    return { requestId: r.id, status: r.status };
  }

  /**
   * New products and modules. Owners create them straight away (never asked to
   * approve their own work). Editors send a request the owner approves with
   * "Approve and create" in Updates & requests.
   */
  async requestNewProduct(
    session: EditorSession,
    input: { name: string; summary: string; slug?: string; repo?: string; branch?: string; paths?: string[]; note?: string },
  ): Promise<{ status: 'created' | 'waiting-for-approval'; product: string; requestId?: string; message: string }> {
    const slug = slugify(input.slug || input.name);
    if (!slug) throw new AppError('INVALID', 'Give the product a name with letters or numbers.');
    const create: CreateRequest = {
      kind: 'product',
      product: slug,
      name: input.name.trim(),
      summary: input.summary.trim(),
      ...(input.repo?.trim() ? { repos: [{ url: input.repo.trim(), branch: input.branch?.trim() || 'main', paths: input.paths ?? [] }] } : {}),
    };
    if (session.ctx.actor.role === 'owner') {
      await this.requests.createFromRequest(session.ctx, create);
      const keyNote = session.products && !session.products.includes(slug) ? ' Your key is limited to some products, so add this one to it in Settings > Editor connector before writing pages.' : '';
      return { status: 'created', product: slug, message: `Created product "${create.name}" (${slug}). It is private and coming soon until you make it public in Products.${keyNote}` };
    }
    const r = await this.requests.create(session.ctx, {
      type: 'new-product',
      scope: { products: 'all' },
      contentMode: 'text',
      create,
      note: `${input.note?.trim() ? `${input.note.trim()} ` : ''}(requested through the connector by ${session.ctx.actor.name})`.slice(0, 2000),
    });
    return { status: 'waiting-for-approval', product: slug, requestId: r.id, message: `Sent to the owner for approval (request ${r.id}). Once approved and added to your key, "${create.name}" appears in list_products.` };
  }

  async requestNewModule(
    session: EditorSession,
    input: { product: string; title: string; summary: string; slug?: string; group?: 'start' | 'run' | 'approve' | 'administer'; area?: string; note?: string },
  ): Promise<{ status: 'created' | 'waiting-for-approval'; module: string; requestId?: string; message: string }> {
    this.requireProduct(session, input.product);
    const slug = slugify(input.slug || input.title);
    if (!slug) throw new AppError('INVALID', 'Give the module a title with letters or numbers.');
    const create: CreateRequest = { kind: 'module', product: input.product, module: slug, name: input.title.trim(), summary: input.summary.trim(), group: input.group ?? 'run', ...(input.area?.trim() ? { area: input.area.trim() } : {}) };
    const id = `${input.product}/${slug}`;
    if (session.ctx.actor.role === 'owner') {
      await this.requests.createFromRequest(session.ctx, create);
      return { status: 'created', module: id, message: `Created module "${create.name}" (${id}). You can write pages in it now.` };
    }
    const r = await this.requests.create(session.ctx, {
      type: 'new-module',
      scope: { products: [input.product] },
      contentMode: 'text',
      create,
      note: `${input.note?.trim() ? `${input.note.trim()} ` : ''}(requested through the connector by ${session.ctx.actor.name})`.slice(0, 2000),
    });
    return { status: 'waiting-for-approval', module: id, requestId: r.id, message: `Sent to the owner for approval (request ${r.id}). Once approved, write pages in ${id}.` };
  }

  async myChanges(session: EditorSession): Promise<PendingChangeDto[]> {
    const mine = (await this.changes.list()).filter((c) => c.authorId === session.ctx.actor.personId).slice(0, 50);
    return Promise.all(mine.map((c) => this.toChangeDto(c)));
  }

  // ── Approvals (owners, in the admin) ────────────────────────────────────

  private async currentBody(c: PendingChangeRecord): Promise<string | null> {
    if (!(await this.content.pageExists(c.product, c.module, c.slug))) return null;
    return (await this.content.getPage(c.product, c.module, c.slug)).body;
  }

  private async toChangeDto(c: PendingChangeRecord, current?: string | null): Promise<PendingChangeDto> {
    const before = current === undefined ? (c.status === 'pending' ? await this.currentBody(c) : null) : current;
    const d = diffText(before ?? '', c.body);
    return {
      id: c.id,
      kind: c.kind,
      pageId: `${c.product}/${c.module}/${c.slug}`,
      title: String(c.frontmatter.title ?? c.slug),
      note: c.note,
      authorName: c.authorName,
      createdAt: c.createdAt,
      status: c.status,
      decidedBy: c.decidedBy,
      decidedAt: c.decidedAt,
      decisionNote: c.decisionNote,
      linesAdded: d.added,
      linesRemoved: d.removed,
    };
  }

  async listChanges(status?: PendingChangeRecord['status']): Promise<PendingChangeDto[]> {
    return Promise.all((await this.changes.list(status)).map((c) => this.toChangeDto(c)));
  }

  async getChange(id: string): Promise<PendingChangeDetailDto> {
    const c = await this.changes.get(id);
    if (!c) throw new AppError('NOT_FOUND', 'That change is no longer in the list.');
    const current = await this.currentBody(c);
    return {
      ...(await this.toChangeDto(c, current)),
      frontmatter: c.frontmatter,
      body: c.body,
      currentBody: current,
      revisions: c.revisions,
      review: await this.review(c),
    };
  }

  /** A plain summary of a proposed page and the house-standard checks, for the owner deciding on it. */
  private async review(c: PendingChangeRecord): Promise<ChangeReviewDto> {
    const ctx = await this.content.reviewContext(c.product, c.module);
    const fm = c.frontmatter;
    const uploaded = new Set(ctx.images.map((i) => i.src));
    const screenshots = [...c.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)].map((m) => ({ src: m[1]!, found: uploaded.has(m[1]!) }));
    const titleOf = (ref: string) => ctx.targets.find((t) => t.ref === ref)?.title ?? null;
    const prerequisites = (Array.isArray(fm.prerequisites) ? fm.prerequisites : [])
      .map((p) => (p && typeof p === 'object' ? String((p as { page?: unknown }).page ?? '') : String(p)))
      .filter(Boolean)
      .map((ref) => ({ ref, title: titleOf(ref) }));
    const links = [...c.body.matchAll(/\]\(guide:([^)\s#]+)/g)].map((m) => m[1]!);
    const brokenLinks = [...new Set(links.filter((l) => !titleOf(l)))];
    const steps = (c.body.match(/^::::step\b/gm) ?? []).length;
    const words = c.body.replace(/[:#*!\[\]()`>{}"=_-]/g, ' ').split(/\s+/).filter(Boolean).length;
    const rules = guideRuleProblems(c.body);
    const missingShots = screenshots.filter((x) => !x.found);
    const missingPrereqs = prerequisites.filter((p) => !p.title);
    const title = String(fm.title ?? '').trim();
    const summary = String(fm.summary ?? '').trim();
    const checks: ChangeCheckDto[] = [
      { label: 'Follows the house writing rules', ok: rules.length === 0, detail: rules.length ? rules.join(' ') : 'No em dashes, pictures only from the guide, nothing unsafe.' },
      { label: 'Has a title and summary', ok: Boolean(title && summary), detail: title && summary ? summary : 'The title or the one-sentence summary is missing.' },
      { label: 'Written as numbered steps', ok: steps > 0, detail: steps > 0 ? `${steps} step${steps === 1 ? '' : 's'}.` : 'No steps block. Task pages should be step by step.' },
      {
        label: 'Screenshots uploaded',
        ok: missingShots.length === 0,
        detail: screenshots.length === 0 ? 'No screenshots (fine for a text-only page).' : missingShots.length ? `Missing: ${missingShots.map((x) => x.src).join(', ')}` : `${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'}, all uploaded.`,
      },
      {
        label: 'Setup pages linked (Before you start)',
        ok: missingPrereqs.length === 0,
        detail: prerequisites.length === 0 ? 'None listed. Check the task needs no setup first.' : missingPrereqs.length ? `Not found: ${missingPrereqs.map((p) => p.ref).join(', ')}` : prerequisites.map((p) => p.title).join(', '),
      },
      { label: 'Guide links work', ok: brokenLinks.length === 0, detail: links.length === 0 ? 'No links to other guides.' : brokenLinks.length ? `Broken: ${brokenLinks.join(', ')}` : `${new Set(links).size} link${new Set(links).size === 1 ? '' : 's'}, all found.` },
      { label: 'Has a Troubleshooting section', ok: /^##\s+Troubleshooting/im.test(c.body), detail: /^##\s+Troubleshooting/im.test(c.body) ? 'Yes.' : 'No Troubleshooting section.' },
      { label: 'Has Related guides', ok: /^##\s+Related guides/im.test(c.body), detail: /^##\s+Related guides/im.test(c.body) ? 'Yes.' : 'No Related guides section.' },
    ];
    return {
      productName: ctx.productName,
      moduleTitle: ctx.moduleTitle,
      summary,
      publishes: fm.status !== 'draft',
      steps,
      words,
      screenshots,
      prerequisites,
      checks,
    };
  }

  async decide(ctx: RequestContext, id: string, decision: 'approved' | 'rejected', note?: string): Promise<PendingChangeDto> {
    const c = await this.changes.get(id);
    if (!c) throw new AppError('NOT_FOUND', 'That change is no longer in the list.');
    if (c.status !== 'pending') throw new AppError('CONFLICT', 'That change was already decided.');
    const pageId = `${c.product}/${c.module}/${c.slug}`;
    if (decision === 'approved') await this.apply(ctx, c);
    const at = this.clock.now().toISOString();
    const done = await this.changes.decide(id, decision, ctx.actor.name, at, note?.trim() || null);
    if (!done) throw new AppError('CONFLICT', 'That change was already decided.');
    await this.activity.record(ctx, {
      area: 'pages',
      action: decision === 'approved' ? 'connector.change.approve' : 'connector.change.reject',
      target: pageId,
      summary: `${decision === 'approved' ? 'Approved' : 'Rejected'} ${c.authorName}'s change to “${String(c.frontmatter.title ?? c.slug)}”`,
      details: { changeId: id, note: note ?? null },
    });
    return this.toChangeDto({ ...c, status: decision, decidedBy: ctx.actor.name, decidedAt: at, decisionNote: note?.trim() || null }, null);
  }
}

import { moduleSchema, pageFrontmatterSchema, productSchema, siteSettingsSchema, type SiteSettings } from '../../../../src/types/content';
import {
  repoLocalPathSchema,
  type GuideTarget,
  type LibraryDto,
  type ModuleFile,
  type ModuleJson,
  type ModuleSummary,
  type NewModuleInput,
  type NewPageInput,
  type NewProductInput,
  type PageBadges,
  type PageDetailDto,
  type PageSummary,
  type ProductJson,
  type ProductSummary,
  type SavePageInput,
  type SavePageResult,
  type VideoState,
} from '../../../../admin/shared/api-types';
import type { RequestContext } from '../../domain/actor';
import { authorDisplayName } from '../../domain/authors';
import { diffFields } from '../../domain/diff';
import { AppError, invalid } from '../../domain/errors';
import { extensionOf, SERVABLE_TYPES } from '../../domain/files';
import { headingsOf, imageRefs, isRemoteUrl, moduleFileRef, plainText, type PublicPage } from '../../domain/library';
import { joinPageFile, splitPageFile, updateFrontmatter } from '../../domain/page-file';
import { checkSlug, isoDay } from '../../domain/slugs';
import { isPubliclyVisible } from '../../domain/visibility';
import type { Clock, ContentRepository, MediaFolder, MediaStore, StoredFile } from '../ports';
import type { ActivityService } from './activity-service';

function asObject(value: unknown, what: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('INVALID', `${what} must be a set of settings.`);
  return value as Record<string, unknown>;
}

function orderOf(meta: Record<string, unknown>): number {
  return typeof meta.order === 'number' ? meta.order : 100;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function fileUrl(product: string, module: string, src: string): string {
  return `/api/v1/files?path=${encodeURIComponent(`products/${product}/${module}/${src}`)}`;
}

export type { PublicPage } from '../../domain/library';

/**
 * Products, modules, pages and site settings. Every write is validated with
 * the public site's own schemas first, so the site never gets a file it
 * can't build; every write is then recorded in the audit log (and, for
 * pages, the version history). "Removing" a page never deletes it.
 */
export class ContentService {
  constructor(
    private readonly content: ContentRepository,
    private readonly media: MediaStore,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly siteUrl: string,
  ) {}

  // ── Site settings ──────────────────────────────────────────────────────

  async getSite(): Promise<Record<string, unknown>> {
    return asObject(await this.content.readSite(), 'site.json');
  }

  async siteParsed(): Promise<SiteSettings> {
    const r = siteSettingsSchema.safeParse(await this.getSite());
    return r.success ? r.data : siteSettingsSchema.parse({ siteName: 'Be Guided', theme: 'classic' });
  }

  async saveSite(ctx: RequestContext, next: Record<string, unknown>): Promise<Record<string, unknown>> {
    const r = siteSettingsSchema.safeParse(next);
    if (!r.success) throw invalid(r.error, 'setting');
    const before = await this.getSite();
    const changes = diffFields(before, next);
    await this.content.writeSite(next, 'Update site settings');
    await this.activity.record(ctx, {
      area: 'settings',
      action: 'site.save',
      target: 'site.json',
      summary: changes.length
        ? `Changed site settings: ${[...new Set(changes.map((c) => c.label.split(' › ')[0]!.toLowerCase()))].join(', ')}`
        : 'Saved site settings (no changes)',
      details: { changes },
    });
    return next;
  }

  // ── Library ────────────────────────────────────────────────────────────

  private async readProductJson(product: string): Promise<ProductJson | null> {
    const raw = await this.content.readProduct(product);
    if (raw === null) return null;
    const o = asObject(raw, 'product.json');
    return { ...o, name: typeof o.name === 'string' ? o.name : product, summary: str(o.summary) };
  }

  private async readModuleJson(product: string, module: string): Promise<ModuleJson | null> {
    const raw = await this.content.readModule(product, module);
    if (raw === null) return null;
    const o = asObject(raw, 'module.json');
    return { ...o, title: typeof o.title === 'string' ? o.title : module, summary: str(o.summary) };
  }

  private async requireProduct(product: string): Promise<ProductJson> {
    const p = await this.readProductJson(checkSlug(product, 'product'));
    if (!p) throw new AppError('NOT_FOUND', 'That product no longer exists.');
    return p;
  }

  private async requireModule(product: string, module: string): Promise<ModuleJson> {
    await this.requireProduct(product);
    const m = await this.readModuleJson(product, checkSlug(module, 'module'));
    if (!m) throw new AppError('NOT_FOUND', 'That module no longer exists.');
    return m;
  }

  /** Every product's slug, name and code repos (for update checks), in site order. */
  async productDirectory(): Promise<{ slug: string; name: string; status: string; repos: { url: string; branch: string; paths: string[]; localPath?: string }[] }[]> {
    const out: { slug: string; name: string; status: string; order: number; repos: { url: string; branch: string; paths: string[]; localPath?: string }[] }[] = [];
    for (const slug of await this.content.listProducts()) {
      const meta = await this.readProductJson(slug);
      if (!meta) continue;
      const source = (meta as { source?: { repos?: { url: string; branch?: string; paths?: string[]; localPath?: string }[] } }).source;
      out.push({ slug, name: meta.name, status: String((meta as { status?: string }).status ?? 'available'), order: orderOf(meta), repos: (source?.repos ?? []).map((r) => ({ url: r.url, branch: r.branch ?? 'main', paths: r.paths ?? [], ...(r.localPath ? { localPath: r.localPath } : {}) })) });
    }
    out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return out.map(({ order: _o, ...p }) => p);
  }

  async getLibrary(): Promise<LibraryDto> {
    const products: ProductSummary[] = [];
    for (const slug of await this.content.listProducts()) {
      const meta = await this.readProductJson(slug);
      if (!meta) continue;
      const modules: ModuleSummary[] = [];
      for (const m of await this.content.listModules(slug)) {
        const mm = await this.readModuleJson(slug, m);
        if (mm) modules.push(await this.moduleSummary(slug, m, mm));
      }
      modules.sort((a, b) => orderOf(a.meta) - orderOf(b.meta) || a.meta.title.localeCompare(b.meta.title));
      products.push({ slug, meta, modules });
    }
    products.sort((a, b) => orderOf(a.meta) - orderOf(b.meta) || a.meta.name.localeCompare(b.meta.name));
    return { products };
  }

  private async moduleSummary(product: string, module: string, meta: ModuleJson): Promise<ModuleSummary> {
    const images = new Set(await this.media.list(product, module, 'images'));
    const media = new Set(await this.media.list(product, module, 'media'));
    const pages: PageSummary[] = [];
    for (const slug of await this.content.listPages(product, module)) {
      pages.push(await this.pageSummary(product, module, slug, { images, media }));
    }
    pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    return { slug: module, meta, pages };
  }

  private videoState(src: unknown, files: { images: Set<string>; media: Set<string> }): VideoState {
    if (typeof src !== 'string' || !src.trim()) return 'none';
    if (isRemoteUrl(src)) return 'present';
    const ref = moduleFileRef(src);
    if (!ref) return 'missing';
    return files[ref.folder].has(ref.name) ? 'present' : 'missing';
  }

  private badges(frontmatter: Record<string, unknown>, body: string, files: { images: Set<string>; media: Set<string> }): PageBadges {
    const existing = imageRefs(body).filter((ref) => files.images.has(ref.slice('images/'.length)));
    const video = frontmatter.video as { src?: unknown } | undefined;
    return { text: body.trim().length > 0, screenshots: existing.length > 0, screenshotCount: existing.length, video: this.videoState(video?.src, files) };
  }

  private async pageSummary(product: string, module: string, slug: string, files: { images: Set<string>; media: Set<string> }): Promise<PageSummary> {
    const id = `${product}/${module}/${slug}`;
    const fallback = (problem: string, title = slug): PageSummary => ({
      id,
      product,
      module,
      slug,
      title,
      summary: '',
      status: 'draft',
      visibility: 'public',
      author: 'human',
      authorName: 'Not set',
      updated: '',
      order: 100,
      badges: { text: false, screenshots: false, screenshotCount: 0, video: 'none' },
      problem,
    });
    try {
      const text = await this.content.readPage(product, module, slug);
      if (text === null) return fallback("This page file couldn't be read.");
      const { frontmatter, body } = splitPageFile(text);
      const badges = this.badges(frontmatter, body, files);
      const fm = pageFrontmatterSchema.safeParse(frontmatter);
      if (!fm.success) {
        return { ...fallback('Some details at the top of this page need fixing before the site can show it.', str(frontmatter.title) || slug), badges };
      }
      const d = fm.data;
      return {
        id,
        product,
        module,
        slug,
        title: d.title,
        summary: d.summary,
        status: d.status,
        visibility: d.visibility,
        author: d.author,
        authorName: authorDisplayName(d.author),
        updated: d.updated,
        order: d.order,
        badges,
      };
    } catch (error) {
      if (error instanceof AppError && error.code === 'BAD_PATH') throw error;
      return fallback("This page file couldn't be read.");
    }
  }

  // ── Products & modules ─────────────────────────────────────────────────

  private validateProduct(value: Record<string, unknown>): void {
    const r = productSchema.safeParse(value);
    if (!r.success) throw invalid(r.error, 'product');
    // Admin-only field: where a repository's code is on this computer.
    const repos = ((value.source as { repos?: unknown } | undefined)?.repos ?? []) as unknown[];
    repos.forEach((repo, i) => {
      const lp = (repo as { localPath?: unknown } | null)?.localPath;
      if (lp === undefined) return;
      const ok = repoLocalPathSchema.safeParse(lp);
      if (!ok.success) {
        const field = `source.repos.${i}.localPath`;
        throw new AppError('INVALID', 'This product can\'t be saved yet: Folder on this computer must be a full folder path.', [
          { field, message: 'Folder on this computer must be a full folder path' },
        ]);
      }
    });
  }

  async createProduct(ctx: RequestContext, input: NewProductInput): Promise<ProductJson> {
    checkSlug(input.slug, 'product');
    if (await this.content.exists(input.slug)) throw new AppError('ALREADY_EXISTS', 'A product with that web address name already exists.');
    const siblings = await Promise.all((await this.content.listProducts()).map((p) => this.readProductJson(p)));
    const value = {
      name: input.name.trim(),
      summary: input.summary.trim(),
      visibility: 'private',
      status: 'coming-soon',
      order: nextOrder(siblings.filter((s): s is ProductJson => s !== null)),
    };
    this.validateProduct(value);
    await this.content.writeProduct(input.slug, value, `Add product ${input.slug}`);
    await this.activity.record(ctx, { area: 'products', action: 'product.create', target: input.slug, summary: `Added product “${value.name}” (private, coming soon)`, details: { after: value } });
    return (await this.readProductJson(input.slug)) ?? { ...value };
  }

  async saveProduct(ctx: RequestContext, product: string, next: Record<string, unknown>): Promise<ProductJson> {
    const before = await this.requireProduct(product);
    this.validateProduct(next);
    const changes = diffFields(before, next);
    await this.content.writeProduct(product, next, `Update product ${product}`);
    const visibilityChange = changes.find((c) => c.field === 'visibility');
    await this.activity.record(ctx, {
      area: 'products',
      action: 'product.save',
      target: product,
      summary: visibilityChange
        ? `Made product “${str(next.name)}” ${visibilityChange.after === 'private' ? 'private' : 'public'}`
        : changes.length
          ? `Changed product “${str(next.name)}”: ${changes.map((c) => c.label.toLowerCase()).slice(0, 4).join(', ')}`
          : `Saved product “${str(next.name)}” (no changes)`,
      details: { changes },
    });
    return (await this.readProductJson(product)) ?? (next as ProductJson);
  }

  async createModule(ctx: RequestContext, product: string, input: NewModuleInput): Promise<ModuleJson> {
    await this.requireProduct(product);
    checkSlug(input.slug, 'module');
    if (await this.content.exists(product, input.slug)) throw new AppError('ALREADY_EXISTS', 'A module with that web address name already exists.');
    const siblings = await Promise.all((await this.content.listModules(product)).map((m) => this.readModuleJson(product, m)));
    const value = { title: input.title.trim(), summary: input.summary.trim(), group: input.group, order: nextOrder(siblings.filter((s): s is ModuleJson => s !== null)), ...(input.area ? { area: input.area.trim() } : {}) };
    const r = moduleSchema.safeParse(value);
    if (!r.success) throw invalid(r.error, 'module');
    await this.content.writeModule(product, input.slug, value, `Add module ${product}/${input.slug}`);
    await this.activity.record(ctx, { area: 'modules', action: 'module.create', target: `${product}/${input.slug}`, summary: `Added module “${value.title}”`, details: { after: value } });
    return (await this.readModuleJson(product, input.slug)) ?? value;
  }

  async saveModule(ctx: RequestContext, product: string, module: string, next: Record<string, unknown>): Promise<ModuleJson> {
    const before = await this.requireModule(product, module);
    const r = moduleSchema.safeParse(next);
    if (!r.success) throw invalid(r.error, 'module');
    const changes = diffFields(before, next);
    await this.content.writeModule(product, module, next, `Update module ${product}/${module}`);
    await this.activity.record(ctx, {
      area: 'modules',
      action: 'module.save',
      target: `${product}/${module}`,
      summary: changes.length ? `Changed module “${str(next.title)}”: ${changes.map((c) => c.label.toLowerCase()).join(', ')}` : `Saved module “${str(next.title)}” (no changes)`,
      details: { changes },
    });
    return (await this.readModuleJson(product, module)) ?? (next as ModuleJson);
  }

  // ── Pages ──────────────────────────────────────────────────────────────

  async moduleExists(product: string, module: string): Promise<boolean> {
    checkSlug(product, 'product');
    checkSlug(module, 'module');
    return (await this.readModuleJson(product, module)) !== null;
  }

  async pageExists(product: string, module: string, page: string): Promise<boolean> {
    checkSlug(product, 'product');
    checkSlug(module, 'module');
    checkSlug(page, 'page');
    return (await this.content.readPage(product, module, page)) !== null;
  }

  /** "Approve before publish" for connector changes; on unless product.json says editorApproval: false. */
  async editorApprovalRequired(product: string): Promise<boolean> {
    const meta = await this.requireProduct(product);
    return meta.editorApproval !== false;
  }

  private siteUrlFor(product: string, module: string, page: string): string {
    return `${this.siteUrl}/${product}/${module}/${page}/`;
  }

  private async readPageParts(product: string, module: string, page: string) {
    checkSlug(product, 'product');
    checkSlug(module, 'module');
    checkSlug(page, 'page');
    const text = await this.content.readPage(product, module, page);
    if (text === null) throw new AppError('NOT_FOUND', 'That page no longer exists.');
    return splitPageFile(text);
  }

  private async moduleFiles(product: string, module: string, folder: MediaFolder): Promise<ModuleFile[]> {
    const names = await this.media.list(product, module, folder);
    return names
      .filter((n) => SERVABLE_TYPES[extensionOf(n)] !== undefined)
      .map((name) => ({ src: `${folder}/${name}`, name, url: fileUrl(product, module, `${folder}/${name}`) }));
  }

  async getPage(product: string, module: string, page: string): Promise<PageDetailDto> {
    const { frontmatter, body } = await this.readPageParts(product, module, page);
    const productMeta = await this.requireProduct(product);
    const moduleMeta = await this.requireModule(product, module);
    const images = await this.moduleFiles(product, module, 'images');
    const media = await this.moduleFiles(product, module, 'media');
    const files = { images: new Set(images.map((i) => i.name)), media: new Set(media.map((m) => m.name)) };
    const video = frontmatter.video as { src?: unknown; poster?: unknown } | undefined;
    return {
      id: `${product}/${module}/${page}`,
      product,
      module,
      slug: page,
      productName: productMeta.name,
      moduleTitle: moduleMeta.title,
      frontmatter,
      body,
      images,
      media,
      video: { state: this.videoState(video?.src, files), posterState: this.videoState(video?.poster, files) },
      targets: await this.targets(product),
      siteDefaultVideoDisplay: (await this.siteParsed()).video.display,
      siteUrl: this.siteUrlFor(product, module, page),
    };
  }

  /** Names, the module's uploaded pictures and every linkable page: what a reviewer needs around a proposed page. */
  async reviewContext(product: string, module: string): Promise<{ productName: string; moduleTitle: string; images: ModuleFile[]; targets: GuideTarget[] }> {
    const productMeta = await this.requireProduct(product);
    const moduleMeta = await this.requireModule(product, module);
    return { productName: productMeta.name, moduleTitle: moduleMeta.title, images: await this.moduleFiles(product, module, 'images'), targets: await this.targets(product) };
  }

  /** Every page a prerequisite or guide link can point at. */
  private async targets(currentProduct: string): Promise<GuideTarget[]> {
    const out: GuideTarget[] = [];
    for (const p of (await this.getLibrary()).products) {
      for (const m of p.modules) {
        for (const pg of m.pages) {
          const local = `${m.slug}/${pg.slug}`;
          out.push({
            ref: p.slug === currentProduct ? local : `${p.slug}/${local}`,
            title: pg.title,
            moduleTitle: p.slug === currentProduct ? m.meta.title : `${p.meta.name} › ${m.meta.title}`,
          });
        }
      }
    }
    return out;
  }

  // PROTOTYPE: the content file is written first, then history + audit in one DB batch.
  // Files and the database can't share a transaction, so a DB failure after a
  // successful file write leaves the change without its history entry (the
  // request still fails loudly). Production: an outbox/journal, or content in the DB.
  async savePage(ctx: RequestContext, product: string, module: string, page: string, input: SavePageInput): Promise<SavePageResult> {
    const original = await this.readPageParts(product, module, page);
    const frontmatter = { ...asObject(input.frontmatter, 'Page details'), updated: isoDay(this.clock.now()) };
    const r = pageFrontmatterSchema.safeParse(frontmatter);
    if (!r.success) throw invalid(r.error, 'page');
    const id = `${product}/${module}/${page}`;
    const fieldChanges = diffFields(original.frontmatter, frontmatter, ['updated']);
    await this.content.writePage(product, module, page, joinPageFile(updateFrontmatter(original.frontmatterSource, frontmatter), input.body), `Update ${id}`);
    const revision = this.activity.revision(ctx, { pageId: id, action: 'save', bodyBefore: original.body, bodyAfter: input.body.trim(), fieldChanges });
    await this.activity.record(
      ctx,
      { area: 'pages', action: 'page.save', target: id, summary: `Saved “${r.data.title}”: ${revision.summary}`, details: { revisionId: revision.id, fieldChanges, linesAdded: revision.linesAdded, linesRemoved: revision.linesRemoved } },
      revision,
    );
    return { updated: r.data.updated, siteUrl: this.siteUrlFor(product, module, page), revisionId: revision.id };
  }

  /** "Remove" never deletes: the page becomes a draft, hidden from the public site. */
  async markDraft(ctx: RequestContext, product: string, module: string, page: string): Promise<SavePageResult> {
    const original = await this.readPageParts(product, module, page);
    const frontmatter = { ...original.frontmatter, status: 'draft' };
    const r = pageFrontmatterSchema.safeParse(frontmatter);
    if (!r.success) throw invalid(r.error, 'page');
    const id = `${product}/${module}/${page}`;
    const fieldChanges = diffFields(original.frontmatter, frontmatter);
    await this.content.writePage(product, module, page, joinPageFile(updateFrontmatter(original.frontmatterSource, frontmatter), original.body), `Make ${id} a draft`);
    const revision = this.activity.revision(ctx, { pageId: id, action: 'draft', bodyBefore: original.body, bodyAfter: original.body, fieldChanges, summary: 'Removed from the site (now a draft)' });
    await this.activity.record(ctx, { area: 'pages', action: 'page.draft', target: id, summary: `Removed “${r.data.title}” from the site (now a draft)`, details: { revisionId: revision.id } }, revision);
    return { updated: r.data.updated, siteUrl: this.siteUrlFor(product, module, page), revisionId: revision.id };
  }

  async createPage(ctx: RequestContext, product: string, module: string, input: NewPageInput): Promise<PageSummary> {
    await this.requireModule(product, module);
    checkSlug(input.slug, 'page');
    if ((await this.content.readPage(product, module, input.slug)) !== null) {
      throw new AppError('ALREADY_EXISTS', 'A page with that web address name already exists in this module.');
    }
    const siblings = await this.moduleSummary(product, module, { title: '', summary: '' });
    const frontmatter = {
      title: input.title.trim(),
      summary: input.summary.trim(),
      updated: isoDay(this.clock.now()),
      status: 'draft',
      author: ctx.actor.personId ? ctx.actor.name : 'human',
      order: nextOrder(siblings.pages.map((s) => ({ order: s.order }))),
    };
    const r = pageFrontmatterSchema.safeParse(frontmatter);
    if (!r.success) throw invalid(r.error, 'page');
    const id = `${product}/${module}/${input.slug}`;
    await this.content.writePage(product, module, input.slug, joinPageFile(updateFrontmatter('', frontmatter), ''), `Add page ${id}`);
    const fieldChanges = diffFields({}, frontmatter);
    const revision = this.activity.revision(ctx, { pageId: id, action: 'create', bodyBefore: '', bodyAfter: '', fieldChanges, summary: 'Created the page' });
    revision.summary = 'Created the page (draft)';
    await this.activity.record(ctx, { area: 'pages', action: 'page.create', target: id, summary: `Created draft page “${frontmatter.title}”`, details: { revisionId: revision.id } }, revision);
    const files = { images: new Set<string>(), media: new Set<string>() };
    return this.pageSummary(product, module, input.slug, files);
  }

  // ── Files ──────────────────────────────────────────────────────────────

  /** "products/<p>/<m>/<images|media>/<name>" → the stored file, for the admin to show. */
  async getFile(relative: string): Promise<{ file: StoredFile; type: string }> {
    const parts = relative.replace(/^\/+/, '').split('/');
    if (parts.length !== 5 || parts[0] !== 'products') throw new AppError('BAD_PATH', 'That file location is not allowed.');
    const [, product = '', module = '', folder = '', name = ''] = parts;
    checkSlug(product, 'product');
    checkSlug(module, 'module');
    if (folder !== 'images' && folder !== 'media') throw new AppError('BAD_PATH', 'That file location is not allowed.');
    if (!name || name.startsWith('.') || name.includes('\\') || name.includes('\0')) throw new AppError('BAD_PATH', 'That file location is not allowed.');
    const type = SERVABLE_TYPES[extensionOf(name)];
    if (!type) throw new AppError('BAD_PATH', 'That kind of file is not shared.');
    const file = await this.media.get(product, module, folder, name);
    if (!file) throw new AppError('NOT_FOUND', 'That file is not available.');
    return { file, type };
  }

  // ── Public pages (Ask AI) ──────────────────────────────────────────────

  /** Published, public pages of public products, with their text, in site order (product, module, page). */
  async publicPages(): Promise<PublicPage[]> {
    const products: { order: number; name: string; pages: (PublicPage & { sort: [number, number, string] })[] }[] = [];
    for (const product of await this.content.listProducts()) {
      const meta = await this.readProductJson(product);
      if (!meta || meta.visibility === 'private') continue;
      const pages: (PublicPage & { sort: [number, number, string] })[] = [];
      for (const module of await this.content.listModules(product)) {
        const moduleMeta = await this.readModuleJson(product, module);
        if (!moduleMeta) continue;
        for (const slug of await this.content.listPages(product, module)) {
          const text = await this.content.readPage(product, module, slug);
          if (text === null) continue;
          let parts: ReturnType<typeof splitPageFile>;
          try {
            parts = splitPageFile(text);
          } catch {
            continue; // A page whose frontmatter can't be read is left out, not allowed to break the rest.
          }
          const { frontmatter, body } = parts;
          const fm = pageFrontmatterSchema.safeParse(frontmatter);
          if (!fm.success || !isPubliclyVisible(meta, fm.data)) continue;
          pages.push({
            id: `${product}/${module}/${slug}`,
            product,
            module,
            slug,
            title: fm.data.title,
            summary: fm.data.summary,
            headings: headingsOf(body),
            body: plainText(body),
            href: `/${product}/${module}/${slug}/`,
            productName: meta.name,
            moduleTitle: moduleMeta.title,
            markdown: body.trim(),
            prerequisites: fm.data.prerequisites,
            video: fm.data.video ? { src: fm.data.video.src, poster: fm.data.video.poster, length: fm.data.video.length } : null,
            updated: fm.data.updated,
            sort: [orderOf(moduleMeta), fm.data.order, fm.data.title],
          });
        }
      }
      pages.sort((a, b) => a.sort[0] - b.sort[0] || a.module.localeCompare(b.module) || a.sort[1] - b.sort[1] || a.sort[2].localeCompare(b.sort[2]));
      products.push({ order: orderOf(meta), name: meta.name, pages });
    }
    products.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
    return products.flatMap((p) => p.pages.map(({ sort: _sort, ...page }) => page));
  }
}

function nextOrder(items: Record<string, unknown>[]): number {
  const max = items.reduce((m, i) => Math.max(m, typeof i.order === 'number' ? i.order : 0), 0);
  return Math.floor(max / 10) * 10 + 10;
}

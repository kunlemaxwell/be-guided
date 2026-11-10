import { z } from 'zod';
import type { GuidePageSource, Logger } from '../../application/ports';
import { AppError } from '../../domain/errors';
import { headingsOf, plainText, type PublicPage } from '../../domain/library';
import { isPubliclyVisible } from '../../domain/visibility';

/** The page index the public site publishes at /ask-ai/pages.json (src/app/ask-ai/pages.json/route.ts). */
const indexSchema = z.object({
  supportUrl: z.string().url().nullable().optional(),
  pages: z.array(
    z.object({
      id: z.string().min(1),
      product: z.string().min(1),
      module: z.string().min(1),
      slug: z.string().min(1),
      title: z.string(),
      summary: z.string().default(''),
      status: z.string().optional(),
      visibility: z.string().optional(),
      href: z.string().startsWith('/'),
      body: z.string(),
      // Added for the MCP connector; optional so an older published index still loads.
      productName: z.string().optional(),
      productVisibility: z.string().optional(),
      moduleTitle: z.string().optional(),
      updated: z.string().nullable().optional(),
      prerequisites: z.array(z.object({ page: z.string(), why: z.string().optional() })).default([]),
      video: z.object({ src: z.string(), poster: z.string().optional(), length: z.string().optional() }).nullable().optional(),
    }),
  ),
});

interface Options {
  /** Full address of the index, e.g. https://guide.example.com/ask-ai/pages.json */
  url: string;
  /** How long a downloaded index is reused. */
  ttlMs?: number;
  fetch?: typeof fetch;
  logger: Logger;
  now?: () => number;
}

/**
 * Guide pages for Ask AI and the MCP connector, read from the published site's own index. Needs no GitHub
 * or Access settings, and answers only from what readers can already see.
 * The index is cached; if a refresh fails, the last good copy is kept.
 */
export class SiteIndexGuideSource implements GuidePageSource {
  private cached: { at: number; pages: PublicPage[]; supportUrl: string | null } | null = null;
  private readonly ttlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: Options) {
    this.ttlMs = options.ttlMs ?? 5 * 60_000;
    this.fetchFn = options.fetch ?? ((input, init) => fetch(input, init));
    this.now = options.now ?? (() => Date.now());
  }

  async publicPages(): Promise<PublicPage[]> {
    return (await this.load()).pages;
  }

  async supportUrl(): Promise<string | null> {
    return (await this.load()).supportUrl;
  }

  private async load(): Promise<{ pages: PublicPage[]; supportUrl: string | null }> {
    if (this.cached && this.now() - this.cached.at < this.ttlMs) return this.cached;
    try {
      const res = await this.fetchFn(this.options.url, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const index = indexSchema.parse(await res.json());
      const pages = index.pages
        .filter((p) => isPubliclyVisible({ visibility: p.productVisibility }, p))
        .map((p) => ({
          id: p.id,
          product: p.product,
          module: p.module,
          slug: p.slug,
          title: p.title,
          summary: p.summary,
          headings: headingsOf(p.body),
          body: plainText(p.body),
          href: p.href,
          productName: p.productName ?? p.product,
          moduleTitle: p.moduleTitle ?? p.module,
          markdown: p.body,
          prerequisites: p.prerequisites,
          video: p.video ?? null,
          updated: p.updated ?? null,
        }));
      this.cached = { at: this.now(), pages, supportUrl: index.supportUrl ?? null };
      return this.cached;
    } catch (error) {
      this.options.logger.warn('chat.index_unavailable', { error: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
      if (this.cached) return this.cached;
      throw new AppError('NOT_CONFIGURED', "Ask AI can't read the guide right now. Please use the guide pages or try again later.");
    }
  }
}

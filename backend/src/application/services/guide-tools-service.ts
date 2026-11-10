// Relative imports: the site's own section splitter and snippet cutter, so a
// result points at the same step/section anchor the site search would.
import { sectionsOf } from '../../../../src/lib/search/documents';
import { snippetAround } from '../../../../src/lib/search/match';
import { guideMarkdownToText, type LinkTarget } from '../../domain/guide-document';
import { guideRefToId, publicAssetPath, type PublicPage } from '../../domain/library';
import { rankPages, tokenize } from '../../domain/retrieval';
import type { GuidePageSource } from '../ports';

/** Results returned by one search. */
export const SEARCH_LIMIT = 8;

/** One search hit, in the shape ChatGPT connectors expect (id, title, url) plus context. */
export interface GuideSearchResult {
  id: string;
  title: string;
  url: string;
  /** "Product › Module" */
  breadcrumb: string;
  product: string;
  module: string;
  snippet: string;
}

/** A full page, in the shape ChatGPT connectors expect for `fetch` (id, title, text, url, metadata). */
export interface GuideDocument {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string>;
}

export interface GuideListing {
  products: {
    product: string;
    name: string;
    modules: { module: string; title: string; pages: { id: string; title: string; summary: string; url: string }[] }[];
  }[];
}

/** Page ids look like product/module/page (lower-case slugs); "#anchor" is ignored. */
const PAGE_ID = /^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/;

/**
 * The guide as tools for an AI assistant (the MCP connector): search, fetch
 * one page, list everything. Reads only through GuidePageSource, which yields
 * published, public pages of public products — so a private or draft page is
 * indistinguishable from one that doesn't exist.
 */
export class GuideToolsService {
  constructor(
    private readonly guide: GuidePageSource,
    /** Public site address, without a trailing slash. */
    private readonly siteUrl: string,
  ) {}

  private url(path: string): string {
    return `${this.siteUrl}${path}`;
  }

  async search(query: string, limit = SEARCH_LIMIT): Promise<GuideSearchResult[]> {
    const pages = await this.guide.publicPages();
    const terms = [...new Set(tokenize(query))];
    return rankPages(pages, query, { limit }).map(({ page }) => {
      const sections = sectionsOf(page.markdown);
      // The part of the page that matches the question best gives the snippet and the anchor.
      let best = { anchor: null as string | null, text: page.summary, hits: 0 };
      for (const s of sections) {
        const words = new Set(tokenize(`${s.heading} ${s.text}`));
        const hits = terms.filter((t) => words.has(t)).length + (terms.some((t) => tokenize(s.heading).includes(t)) ? 0.5 : 0);
        if (hits > best.hits) best = { anchor: s.anchor, text: s.text || s.heading, hits };
      }
      const titleWords = new Set(tokenize(page.title));
      const titleCovers = terms.every((t) => titleWords.has(t));
      const anchor = best.anchor && !titleCovers ? `#${best.anchor}` : '';
      const snippetSource = titleCovers ? page.summary : best.text;
      return {
        id: page.id,
        title: page.title,
        url: this.url(`${page.href}${anchor}`),
        breadcrumb: `${page.productName} › ${page.moduleTitle}`,
        product: page.productName,
        module: page.moduleTitle,
        snippet: snippetAround(snippetSource.replace(/\s+/g, ' ').trim(), terms),
      };
    });
  }

  /** The whole page as clean markdown, or null when there is no public page with that id. */
  async fetch(id: string): Promise<GuideDocument | null> {
    const pageId = id.trim().split('#')[0]?.replace(/^\/+|\/+$/g, '') ?? '';
    if (!PAGE_ID.test(pageId)) return null;
    const pages = await this.guide.publicPages();
    const byId = new Map(pages.map((p) => [p.id, p]));
    const page = byId.get(pageId);
    if (!page) return null;

    const pageUrl = this.url(page.href);
    const target = (ref: string): LinkTarget | null => {
      const { id: refId, hash } = guideRefToId(page.product, ref);
      const p = byId.get(refId);
      return p ? { id: p.id, title: p.title, url: `${this.url(p.href)}${hash ? `#${hash}` : ''}` } : null;
    };
    const asset = (src: string): string | null => {
      const path = publicAssetPath(page.product, page.module, src);
      if (!path) return null;
      return path.startsWith('/') ? this.url(path) : path;
    };
    const body = guideMarkdownToText(page.markdown, { pageUrl, siteUrl: this.siteUrl, assetUrl: asset, resolveRef: target });

    const lines: string[] = [`# ${page.title}`, '', `${page.productName} › ${page.moduleTitle}`, `Page: ${pageUrl}`];
    if (page.updated) lines.push(`Last updated: ${page.updated}`);
    lines.push('', page.summary);

    const before = page.prerequisites.map((pre) => ({ pre, to: target(pre.page) })).filter((x): x is { pre: typeof x.pre; to: LinkTarget } => x.to !== null);
    if (before.length) {
      lines.push('', '## Before you start', ...before.map(({ pre, to }) => `- [${to.title}](${to.url})${pre.why ? `: ${pre.why}` : ''}`));
    }

    const videoUrl = page.video ? asset(page.video.src) : null;
    const posterUrl = page.video?.poster ? asset(page.video.poster) : null;
    if (videoUrl) {
      lines.push('', '## Walkthrough video', `Video${page.video?.length ? ` (${page.video.length})` : ''}: ${videoUrl}`);
      if (posterUrl) lines.push(`Cover picture: ${posterUrl}`);
    }

    lines.push('', body.markdown);

    const related = new Map<string, LinkTarget>();
    for (const t of [...before.map((b) => b.to), ...body.linked]) if (t.id !== page.id && !related.has(t.id)) related.set(t.id, { ...t, url: this.url(byId.get(t.id)!.href) });
    if (related.size) lines.push('', '## Related guides', ...[...related.values()].map((t) => `- [${t.title}](${t.url}) (id: ${t.id})`));

    const metadata: Record<string, string> = {
      product: page.productName,
      module: page.moduleTitle,
      breadcrumb: `${page.productName} › ${page.moduleTitle}`,
      steps: String(body.steps.length),
      screenshots: String(body.screenshots.length),
    };
    if (page.updated) metadata.updated = page.updated;
    if (videoUrl) metadata.video_url = videoUrl;

    return { id: page.id, title: page.title, text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim(), url: pageUrl, metadata };
  }

  /** Products, modules and page titles with ids; optionally one product and/or module (slug or name, any case). */
  async list(filter: { product?: string; module?: string } = {}): Promise<GuideListing> {
    const matches = (value: string | undefined, slug: string, name: string) => {
      if (!value?.trim()) return true;
      const v = value.trim().toLowerCase();
      return v === slug.toLowerCase() || v === name.toLowerCase();
    };
    const products: GuideListing['products'] = [];
    for (const page of await this.guide.publicPages()) {
      if (!matches(filter.product, page.product, page.productName) || !matches(filter.module, page.module, page.moduleTitle)) continue;
      let product = products.find((p) => p.product === page.product);
      if (!product) products.push((product = { product: page.product, name: page.productName, modules: [] }));
      let mod = product.modules.find((m) => m.module === page.module);
      if (!mod) product.modules.push((mod = { module: page.module, title: page.moduleTitle, pages: [] }));
      mod.pages.push({ id: page.id, title: page.title, summary: page.summary, url: this.url(page.href) });
    }
    return { products };
  }

  /** Names of the products that have public pages (for "nothing matched that filter" messages). */
  async productNames(): Promise<string[]> {
    return [...new Set((await this.guide.publicPages()).map((p: PublicPage) => p.productName))];
  }
}

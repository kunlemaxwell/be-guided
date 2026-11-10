import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
// Relative imports (not '@/…') so the loader also runs under vitest, which has no path aliases.
import { config } from '../config';
import {
  moduleSchema,
  pageFrontmatterSchema,
  productSchema,
  siteSettingsSchema,
  type GuidePage,
  type Module,
  type Product,
  type ResolvedLink,
  type SiteSettings,
} from '../../types/content';
import { extractHeadings } from './headings';

/**
 * Reads and validates everything under CONTENT_DIR.
 *
 *   content/site.json
 *   content/products/<product>/product.json
 *   content/products/<product>/<module>/module.json
 *   content/products/<product>/<module>/<page>.md
 *   content/products/<product>/<module>/images/*
 *
 * Results are memoised for the lifetime of the build.
 */

interface Library {
  site: SiteSettings;
  products: Product[];
  pagesById: Map<string, GuidePage>;
  /**
   * Pages that exist but are left out of this build (private page, page of
   * a private product, or a draft outside local preview). Links to them
   * render as plain text, never as a broken link.
   */
  excludedIds: Set<string>;
}

let cache: Library | null = null;

function readJson(file: string): unknown {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
}

function subdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !['images', 'media'].includes(d.name) && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map((d) => d.name)
    .sort();
}

function fail(file: string, error: unknown): never {
  const rel = path.relative(process.cwd(), file);
  throw new Error(`Invalid content in ${rel}: ${error instanceof Error ? error.message : String(error)}`);
}

function parse<T>(file: string, schema: { parse: (v: unknown) => T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (err) {
    fail(file, err);
  }
}

/**
 * Drafts are visible only when previewing on your own computer. Private
 * pages follow the same rule as private products: only in a build made with
 * INCLUDE_PRIVATE_PRODUCTS=true.
 */
function isVisiblePage(page: GuidePage): boolean {
  if (page.visibility === 'private' && !config.includePrivate) return false;
  return page.status === 'published' || config.env === 'local';
}

/** Ids of the pages under a product folder, without parsing them (for private products). */
function pageIdsIn(productDir: string, productSlug: string): string[] {
  return subdirs(productDir).flatMap((moduleSlug) => {
    const moduleDir = path.join(productDir, moduleSlug);
    return fs
      .readdirSync(moduleDir)
      .filter((f) => f.endsWith('.md'))
      .map((f) => `${productSlug}/${moduleSlug}/${f.replace(/\.md$/, '')}`);
  });
}

function loadLibrary(): Library {
  const root = config.contentDir;
  const siteFile = path.join(root, 'site.json');
  const site = parse(siteFile, siteSettingsSchema, readJson(siteFile));

  const products: Product[] = [];
  const pagesById = new Map<string, GuidePage>();
  const excludedIds = new Set<string>();
  const productsDir = path.join(root, 'products');

  for (const productSlug of subdirs(productsDir)) {
    const productDir = path.join(productsDir, productSlug);
    const productFile = path.join(productDir, 'product.json');
    if (!fs.existsSync(productFile)) continue;
    const meta = parse(productFile, productSchema, readJson(productFile));
    if (meta.visibility === 'private' && !config.includePrivate) {
      for (const id of pageIdsIn(productDir, productSlug)) excludedIds.add(id);
      continue;
    }

    const modules: Module[] = [];
    for (const moduleSlug of subdirs(productDir)) {
      const moduleDir = path.join(productDir, moduleSlug);
      const moduleFile = path.join(moduleDir, 'module.json');
      if (!fs.existsSync(moduleFile)) continue;
      const moduleMeta = parse(moduleFile, moduleSchema, readJson(moduleFile));

      const pages: GuidePage[] = [];
      for (const file of fs.readdirSync(moduleDir).filter((f) => f.endsWith('.md')).sort()) {
        const full = path.join(moduleDir, file);
        const { data, content } = matter(fs.readFileSync(full, 'utf8'));
        const fm = parse(full, pageFrontmatterSchema, data);
        const slug = file.replace(/\.md$/, '');
        const page: GuidePage = {
          ...fm,
          id: `${productSlug}/${moduleSlug}/${slug}`,
          slug,
          moduleSlug,
          productSlug,
          body: content.trim(),
          headings: extractHeadings(content),
        };
        if (!isVisiblePage(page)) {
          excludedIds.add(page.id);
          continue;
        }
        pages.push(page);
        pagesById.set(page.id, page);
      }
      pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
      modules.push({ ...moduleMeta, slug: moduleSlug, productSlug, pages });
    }
    modules.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
    products.push({ ...meta, slug: productSlug, modules });
  }
  products.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

  return { site, products, pagesById, excludedIds };
}

function library(): Library {
  // While previewing (npm run dev) re-read on every request, so content
  // edits show on a plain browser refresh with no restart.
  if (process.env.NODE_ENV !== 'production') return loadLibrary();
  cache ??= loadLibrary();
  return cache;
}

export function getSite(): SiteSettings {
  return library().site;
}

export function getProducts(): Product[] {
  return library().products;
}

/**
 * Products readers can open: "Available" ones. A "Coming soon" product shows
 * as a card only; none of its pages are built, searched or given to Ask AI.
 */
export function getOpenProducts(): Product[] {
  return library().products.filter((p) => p.status === 'available');
}

export function getProduct(slug: string): Product | undefined {
  return library().products.find((p) => p.slug === slug);
}

export function getModule(productSlug: string, moduleSlug: string): Module | undefined {
  return getProduct(productSlug)?.modules.find((m) => m.slug === moduleSlug);
}

export function getPage(productSlug: string, moduleSlug: string, pageSlug: string): GuidePage | undefined {
  return library().pagesById.get(`${productSlug}/${moduleSlug}/${pageSlug}`);
}

export function getAllPages(): GuidePage[] {
  return [...library().pagesById.values()];
}

export function pageHref(page: Pick<GuidePage, 'productSlug' | 'moduleSlug' | 'slug'>): string {
  return `/${page.productSlug}/${page.moduleSlug}/${page.slug}/`;
}

/** "module/page" or "product/module/page" (with optional guide: prefix and #hash) → page id. */
function refToId(fromProduct: string, ref: string): string {
  const clean = ref.replace(/^guide:/, '').replace(/^\/+|\/+$/g, '').split('#')[0] ?? '';
  return clean.split('/').length === 2 ? `${fromProduct}/${clean}` : clean;
}

/**
 * True when the reference points at a page that exists but is left out of
 * this build (private, in a private product, or a draft). Such links are
 * shown as plain text: readers never see a broken link or learn the page exists.
 */
export function isExcludedRef(fromProduct: string, ref: string): boolean {
  return library().excludedIds.has(refToId(fromProduct, ref));
}

/**
 * Turns a guide reference into a link. "module/page" is relative to the
 * current product; "product/module/page" is absolute. Returns null when the
 * target does not exist (or is private / draft in this build).
 */
export function resolveGuideRef(fromProduct: string, ref: string): ResolvedLink | null {
  const id = refToId(fromProduct, ref);
  const page = library().pagesById.get(id);
  if (!page) return null;
  return { id, href: pageHref(page), title: page.title, summary: page.summary };
}

/**
 * Pages whose prerequisites or links point at a missing page — shown in
 * admin. Links to pages that are only excluded from this build (private,
 * draft) are not broken, so they are not listed.
 */
export function findBrokenRefs(): { page: string; ref: string }[] {
  const broken: { page: string; ref: string }[] = [];
  for (const page of getAllPages()) {
    const refs = [
      ...page.prerequisites.map((p) => p.page),
      ...[...page.body.matchAll(/\]\(guide:([^)\s]+)\)/g)].map((m) => m[1] ?? ''),
    ];
    for (const ref of refs) {
      if (!resolveGuideRef(page.productSlug, ref) && !isExcludedRef(page.productSlug, ref)) broken.push({ page: page.id, ref });
    }
  }
  return broken;
}

/** For tests only. */
export function __resetContentCache(): void {
  cache = null;
}

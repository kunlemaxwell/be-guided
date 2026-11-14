import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { whatsNewFileSchema, type WhatsNewEntry } from '../../types/content';
import { getOpenProducts, getProduct, resolveGuideRef } from './load';

/**
 * What's new for a product (content/products/<product>/whats-new.json), newest
 * first. A guide link that points at a page that is private, a draft or missing
 * is left off, so readers never meet a broken link; the entry itself stays.
 * A module that does not exist is an error: it would show under a blank heading.
 */
export function getWhatsNew(productSlug: string): WhatsNewEntry[] {
  const product = getProduct(productSlug);
  if (!product) return [];
  const file = path.join(config.contentDir, 'products', productSlug, 'whats-new.json');
  if (!fs.existsSync(file)) return [];
  const rel = path.relative(process.cwd(), file);
  let parsed;
  try {
    parsed = whatsNewFileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    throw new Error(`Invalid content in ${rel}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const moduleTitle = new Map(product.modules.map((m) => [m.slug, m.title]));
  const seen = new Set<string>();
  const out: WhatsNewEntry[] = [];
  for (const e of parsed.entries) {
    if (seen.has(e.slug)) throw new Error(`Invalid content in ${rel}: entry "${e.slug}" appears twice`);
    seen.add(e.slug);
    const title = moduleTitle.get(e.module);
    if (!title) throw new Error(`Invalid content in ${rel}: entry "${e.slug}" names the module "${e.module}", which "${productSlug}" does not have`);
    const { module, guide, where, ...rest } = e;
    const link = guide ? resolveGuideRef(productSlug, guide) : null;
    out.push({ ...rest, productSlug, productName: product.name, moduleSlug: module, moduleTitle: where ?? title, ...(link ? { guideHref: link.href } : {}) });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

/** Every open product's entries, newest first, for the site-wide What's new page. */
export function getAllWhatsNew(): WhatsNewEntry[] {
  return getOpenProducts()
    .flatMap((p) => getWhatsNew(p.slug))
    .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

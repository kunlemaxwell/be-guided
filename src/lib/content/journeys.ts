import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { journeysFileSchema, type Journey } from '../../types/content';
import { getProduct, pageHref, resolveGuideRef } from './load';

/**
 * Journeys of a product (content/products/<product>/journeys.json), with each
 * step resolved to a guide page that exists in this build. Steps that point at
 * a page that is private, a draft or missing are dropped, and a journey left
 * with no steps is not shown. A product without the file has no journeys: its
 * readers see the whole guide ("Everyone").
 */
export function getJourneys(productSlug: string): Journey[] {
  const product = getProduct(productSlug);
  if (!product) return [];
  const file = path.join(config.contentDir, 'products', productSlug, 'journeys.json');
  if (!fs.existsSync(file)) return [];
  let parsed;
  try {
    parsed = journeysFileSchema.parse(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (err) {
    throw new Error(`Invalid content in ${path.relative(process.cwd(), file)}: ${err instanceof Error ? err.message : String(err)}`);
  }
  const moduleTitle = new Map(product.modules.map((m) => [m.slug, m.title]));
  const seen = new Set<string>();
  const journeys: Journey[] = [];
  for (const j of parsed.journeys) {
    if (seen.has(j.slug)) throw new Error(`Invalid content in ${path.relative(process.cwd(), file)}: journey "${j.slug}" appears twice`);
    seen.add(j.slug);
    const steps: Journey['steps'] = [];
    const used = new Set<string>();
    for (const s of j.steps) {
      const link = resolveGuideRef(productSlug, s.page);
      if (!link || used.has(link.id)) continue;
      used.add(link.id);
      const modSlug = link.id.split('/')[1] ?? '';
      steps.push({ id: link.id, title: link.title, summary: link.summary, href: link.href, moduleTitle: moduleTitle.get(modSlug) ?? '', ...(s.why ? { why: s.why } : {}) });
    }
    if (steps.length === 0) continue;
    journeys.push({ ...j, productSlug, steps });
  }
  return journeys.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
}

export function getJourney(productSlug: string, slug: string): Journey | undefined {
  return getJourneys(productSlug).find((j) => j.slug === slug);
}

/** Journeys that include a page (used to show "your journey" on an article). */
export function journeysWithPage(productSlug: string, pageId: string): string[] {
  return getJourneys(productSlug).filter((j) => j.steps.some((s) => s.id === pageId)).map((j) => j.slug);
}

export { pageHref };

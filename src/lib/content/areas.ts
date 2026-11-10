import type { Module, Product } from '@/types/content';

/** A business area (e.g. "HR") made of several modules, one per role. */
export interface Area {
  slug: string;
  title: string;
  modules: Module[];
}

/** "HR" -> "hr", "Sales & CRM" -> "sales-crm". */
export function areaSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Areas of a product, in the order their first module appears. Only areas with two or more modules count. */
export function areasOf(product: Pick<Product, 'modules'>): Area[] {
  const byTitle = new Map<string, Area>();
  for (const m of product.modules) {
    if (!m.area) continue;
    const a = byTitle.get(m.area) ?? { slug: areaSlug(m.area), title: m.area, modules: [] };
    a.modules.push(m);
    byTitle.set(m.area, a);
  }
  return [...byTitle.values()].filter((a) => a.modules.length > 1);
}

/** Section titles across an area's modules, in first-seen order (e.g. Leave, Expenses, Loans, Performance). */
export function areaSections(area: Area): string[] {
  const seen: string[] = [];
  for (const m of area.modules) for (const p of m.pages) {
    const s = p.section?.trim();
    if (s && !seen.includes(s)) seen.push(s);
  }
  return seen;
}

/** A block of modules shown together on the product and home pages. */
export interface ModuleGroupBlock {
  slug: string;
  title: string;
  modules: Module[];
  /** True when the group has its own "everything in one view" page (two or more modules). */
  oneView: boolean;
}

/**
 * Modules grouped by business area (module.json `area`), in the order of each
 * area's first module, so the area with the lowest module order comes first.
 * Modules without an area are kept together under "More modules".
 */
export function moduleGroups(product: Pick<Product, 'modules'>): ModuleGroupBlock[] {
  const blocks = new Map<string, ModuleGroupBlock>();
  for (const m of product.modules) {
    const title = m.area ?? 'More modules';
    const b = blocks.get(title) ?? { slug: areaSlug(title), title, modules: [], oneView: false };
    b.modules.push(m);
    blocks.set(title, b);
  }
  return [...blocks.values()].map((b) => ({ ...b, oneView: !!b.modules[0]?.area && b.modules.length > 1 }));
}

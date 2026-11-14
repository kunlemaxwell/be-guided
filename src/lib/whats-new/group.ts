import type { WhatsNewEntry } from '../../types/content';

/** How the reader wants the list grouped. Switching it never changes the filters. */
export type WhatsNewView = 'date' | 'module' | 'user' | 'product';

/**
 * The "View by" buttons. Product is only offered when the page covers every
 * product; on one product's own page the choices are Date, Module and User.
 */
export function viewOptions(allProducts: boolean): { value: WhatsNewView; label: string }[] {
  return [
    ...(allProducts ? [{ value: 'product' as const, label: 'Product' }] : []),
    { value: 'date', label: 'Date' },
    { value: 'module', label: 'Module' },
    { value: 'user', label: 'User' },
  ];
}

export type WhatsNewKind = WhatsNewEntry['kind'];
export const KINDS: WhatsNewKind[] = ['new', 'improved', 'fixed'];
export const KIND_LABEL: Record<WhatsNewKind, string> = { new: 'New', improved: 'Improved', fixed: 'Bug fix' };

/** What the reader has ticked in the filter menus. An empty list means "All". */
export interface WhatsNewFilters {
  products: string[];
  dates: string[];
  modules: string[];
  users: string[];
  types: WhatsNewKind[];
}
export type FilterFacet = keyof WhatsNewFilters;
export const EMPTY_FILTERS: WhatsNewFilters = { products: [], dates: [], modules: [], users: [], types: [] };

export interface WhatsNewGroup {
  /** Stable key within one view, used to remember which groups are folded. */
  key: string;
  label: string;
  entries: WhatsNewEntry[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-13 → "13 Nov 2026". Written by hand so the server and the browser always agree. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  return y && m && d && month ? `${Number(d)} ${month} ${y}` : iso;
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function hasFilters(f: WhatsNewFilters): boolean {
  return f.products.length + f.dates.length + f.modules.length + f.users.length + f.types.length > 0;
}

/**
 * Does an entry pass the filters? Every facet is "any of what is ticked", and
 * the facets combine with "and". An entry for everyone passes whatever users
 * are ticked, so a reader who is one kind of user also sees what is for all.
 * `skip` leaves one facet out, to count what its own options would give.
 */
export function matchesFilters(e: WhatsNewEntry, f: WhatsNewFilters, skip?: FilterFacet): boolean {
  if (skip !== 'products' && f.products.length > 0 && !f.products.includes(e.productSlug)) return false;
  if (skip !== 'dates' && f.dates.length > 0 && !f.dates.includes(e.date)) return false;
  if (skip !== 'modules' && f.modules.length > 0 && !f.modules.includes(e.moduleTitle)) return false;
  if (skip !== 'users' && f.users.length > 0 && !e.audience.includes('Everyone') && !e.audience.some((a) => f.users.includes(a))) return false;
  if (skip !== 'types' && f.types.length > 0 && !f.types.includes(e.kind)) return false;
  return true;
}

export function applyFilters(entries: WhatsNewEntry[], f: WhatsNewFilters): WhatsNewEntry[] {
  return entries.filter((e) => matchesFilters(e, f));
}

/** How many entries a menu option would show, given what is ticked in the other menus. */
export function countOption(entries: WhatsNewEntry[], f: WhatsNewFilters, facet: FilterFacet, test: (e: WhatsNewEntry) => boolean): number {
  return entries.filter((e) => matchesFilters(e, f, facet) && test(e)).length;
}

/** The choices each menu offers: dates newest first, modules and users A to Z ("Everyone" is not a choice). */
export function facetValues(entries: WhatsNewEntry[]) {
  const uniq = (xs: string[]) => [...new Set(xs)];
  return {
    dates: uniq(entries.map((e) => e.date)).sort((a, b) => b.localeCompare(a)),
    modules: uniq(entries.map((e) => e.moduleTitle)).sort((a, b) => a.localeCompare(b)),
    users: uniq(entries.flatMap((e) => e.audience)).filter((u) => u !== 'Everyone').sort((a, b) => a.localeCompare(b)),
    products: uniq(entries.map((e) => e.productSlug)),
  };
}

const newest = (a: WhatsNewEntry, b: WhatsNewEntry) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title);

function bucket(items: WhatsNewEntry[], keyOf: (e: WhatsNewEntry) => string[]): Map<string, WhatsNewEntry[]> {
  const out = new Map<string, WhatsNewEntry[]>();
  for (const item of items) for (const k of new Set(keyOf(item))) out.set(k, [...(out.get(k) ?? []), item]);
  return out;
}

/**
 * Groups entries for one view, newest first. An entry for several kinds of user
 * is listed under each of them in the user view, so a reader who is only one of
 * them finds it. "Everyone" comes first among users.
 */
export function groupEntries(entries: WhatsNewEntry[], view: WhatsNewView): WhatsNewGroup[] {
  const make = (key: string, label: string, list: WhatsNewEntry[]): WhatsNewGroup => ({ key, label, entries: [...list].sort(newest) });
  const byLatest = (a: WhatsNewGroup, b: WhatsNewGroup) => (b.entries[0]?.date ?? '').localeCompare(a.entries[0]?.date ?? '') || a.label.localeCompare(b.label);
  if (view === 'product') return [...bucket(entries, (e) => [e.productSlug])].map(([slug, l]) => make(slug, l[0]?.productName ?? slug, l)).sort(byLatest);
  if (view === 'date') return [...bucket(entries, (e) => [e.date])].map(([d, l]) => make(d, formatDate(d), l)).sort((a, b) => b.key.localeCompare(a.key));
  if (view === 'module') {
    return [...bucket(entries, (e) => [e.moduleTitle])].map(([m, l]) => make(m, m, l)).sort(byLatest);
  }
  return [...bucket(entries, (e) => e.audience)]
    .map(([u, l]) => make(u, u, l))
    .sort((a, b) => (a.label === 'Everyone' ? -1 : b.label === 'Everyone' ? 1 : a.label.localeCompare(b.label)));
}

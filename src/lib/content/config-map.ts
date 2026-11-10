/**
 * The Configuration center's data: every setup page of a product, the order
 * to do them in, and which everyday tasks need which setups. It is worked out
 * from the guide pages themselves (setup pages + their `prerequisites`), so
 * the map stays right as pages are added.
 */

export interface MapPageInput {
  id: string;
  moduleSlug: string;
  moduleTitle: string;
  slug: string;
  title: string;
  summary: string;
  href: string;
  section?: string | undefined;
  kind?: 'setup' | 'task' | 'overview' | 'reference' | undefined;
  /** Resolved prerequisite page ids (unknown or hidden ones already dropped). */
  needs: { id: string; why?: string | undefined }[];
}

export interface SetupNode {
  id: string;
  title: string;
  summary: string;
  href: string;
  area: string;
  /** 1 = nothing to do first. */
  stage: number;
  /** Setups to finish first (direct), with the reason given on the page. */
  needs: { id: string; why?: string | undefined }[];
  /** Setups that list this one as something to do first (direct). */
  unlocks: string[];
  /** Everyday tasks that need this setup, directly or through another task. */
  usedBy: string[];
}

export interface ProcessNode {
  id: string;
  title: string;
  href: string;
  area: string;
  /** Every setup this task needs (directly or through earlier setups/tasks), in the order to do them. */
  chain: string[];
}

export interface ConfigMap {
  setups: SetupNode[];
  processes: ProcessNode[];
  stages: number;
  areas: string[];
}

const AREA_BY_MODULE: Record<string, string> = {
  settings: 'Company and finance',
  accounting: 'Accounting',
  procurement: 'Purchases',
  sales: 'Sales',
  inventory: 'Inventory',
  reports: 'Reports',
};

const HR_MODULES = new Set(['hr-admin', 'my-workspace', 'managers']);

/** Which coloured area a page belongs to on the map. */
export function areaOf(p: Pick<MapPageInput, 'moduleSlug' | 'moduleTitle' | 'section'>): string {
  const section = p.section?.trim();
  if (HR_MODULES.has(p.moduleSlug)) return section && !/^start here$/i.test(section) ? `HR: ${section}` : 'HR';
  if (p.moduleSlug === 'settings' && section && !/^start here$/i.test(section)) return section;
  return AREA_BY_MODULE[p.moduleSlug] ?? p.moduleTitle;
}

/** A page that sets something up, rather than an everyday task, overview or explainer. */
export function isSetupPage(p: Pick<MapPageInput, 'moduleSlug' | 'slug'> & { kind?: MapPageInput['kind'] }): boolean {
  if (p.kind) return p.kind === 'setup';
  // "Set up a recurring invoice/bill/journal" is an everyday task, not company setup.
  if (/^set-up-a-recurring-/.test(p.slug)) return false;
  if (/-overview$/.test(p.slug) || /^how-/.test(p.slug) || p.slug === 'what-gets-posted') return false;
  if (/^(set-up|enter|configure)-/.test(p.slug)) return true;
  return p.moduleSlug === 'settings';
}

/** Builds the map. Prerequisite cycles (shouldn't happen) are broken, never looped. */
export function buildConfigMap(pages: readonly MapPageInput[]): ConfigMap {
  const byId = new Map(pages.map((p) => [p.id, p]));
  const setupIds = new Set(pages.filter(isSetupPage).map((p) => p.id));

  // Stage = 1 + the deepest setup this one needs.
  const stage = new Map<string, number>();
  const visiting = new Set<string>();
  const stageOf = (id: string): number => {
    const known = stage.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 1;
    visiting.add(id);
    let s = 1;
    for (const n of byId.get(id)?.needs ?? []) if (setupIds.has(n.id) && n.id !== id) s = Math.max(s, stageOf(n.id) + 1);
    visiting.delete(id);
    stage.set(id, s);
    return s;
  };

  // Every setup reachable from a page through its prerequisites (setups and tasks alike).
  const chainMemo = new Map<string, Set<string>>();
  const chainOf = (id: string, seen = new Set<string>()): Set<string> => {
    const memo = chainMemo.get(id);
    if (memo) return memo;
    const out = new Set<string>();
    if (seen.has(id)) return out;
    seen.add(id);
    for (const n of byId.get(id)?.needs ?? []) {
      if (n.id === id) continue;
      if (setupIds.has(n.id)) out.add(n.id);
      for (const x of chainOf(n.id, seen)) out.add(x);
    }
    seen.delete(id);
    chainMemo.set(id, out);
    return out;
  };

  const order = (ids: Iterable<string>): string[] =>
    [...ids].sort((a, b) => stageOf(a) - stageOf(b) || (byId.get(a)?.title ?? a).localeCompare(byId.get(b)?.title ?? b));

  const processes: ProcessNode[] = pages
    .filter((p) => !setupIds.has(p.id) && !/-overview$/.test(p.slug) && p.kind !== 'overview' && p.kind !== 'reference')
    .map((p) => ({ id: p.id, title: p.title, href: p.href, area: areaOf(p), chain: order(chainOf(p.id)) }))
    .filter((p) => p.chain.length > 0)
    .sort((a, b) => a.area.localeCompare(b.area) || a.title.localeCompare(b.title));

  const setups: SetupNode[] = pages
    .filter((p) => setupIds.has(p.id))
    .map((p) => ({
      id: p.id,
      title: p.title,
      summary: p.summary,
      href: p.href,
      area: areaOf(p),
      stage: stageOf(p.id),
      needs: p.needs.filter((n) => setupIds.has(n.id) && n.id !== p.id),
      unlocks: [] as string[],
      usedBy: processes.filter((t) => t.chain.includes(p.id)).map((t) => t.id),
    }));
  const setupById = new Map(setups.map((s) => [s.id, s]));
  for (const s of setups) for (const n of s.needs) setupById.get(n.id)?.unlocks.push(s.id);
  setups.sort((a, b) => a.stage - b.stage || a.area.localeCompare(b.area) || a.title.localeCompare(b.title));

  return {
    setups,
    processes,
    stages: setups.reduce((m, s) => Math.max(m, s.stage), 0),
    areas: [...new Set(setups.map((s) => s.area))].sort(),
  };
}

/** All setups that must come before `id` (transitive), for highlighting. */
export function upstreamOf(map: Pick<ConfigMap, 'setups'>, id: string): Set<string> {
  const byId = new Map(map.setups.map((s) => [s.id, s]));
  const out = new Set<string>();
  const walk = (x: string) => {
    for (const n of byId.get(x)?.needs ?? []) if (!out.has(n.id)) (out.add(n.id), walk(n.id));
  };
  walk(id);
  return out;
}

/** All setups that build on `id` (transitive), for highlighting. */
export function downstreamOf(map: Pick<ConfigMap, 'setups'>, id: string): Set<string> {
  const byId = new Map(map.setups.map((s) => [s.id, s]));
  const out = new Set<string>();
  const walk = (x: string) => {
    for (const u of byId.get(x)?.unlocks ?? []) if (!out.has(u)) (out.add(u), walk(u));
  };
  walk(id);
  return out;
}

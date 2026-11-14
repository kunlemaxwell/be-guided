import type { WhatsNewEntry } from '../../types/content';

/** How the reader wants the list grouped. */
export type WhatsNewView = 'date' | 'module' | 'user' | 'module-user';

export const VIEW_OPTIONS: { value: WhatsNewView; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'module', label: 'Module' },
  { value: 'user', label: 'User' },
  { value: 'module-user', label: 'Module and user' },
];

export interface WhatsNewGroup {
  /** Stable key within one view, used to remember which groups are folded. */
  key: string;
  label: string;
  /** Entries directly under this heading (leaf groups). */
  entries: WhatsNewEntry[];
  /** Sub-groups (the user level in "Module and user"). */
  children: WhatsNewGroup[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 2026-11-13 → "13 Nov 2026". Written by hand so the server and the browser always agree. */
export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  const month = MONTHS[Number(m) - 1];
  return y && m && d && month ? `${Number(d)} ${month} ${y}` : iso;
}

const newest = (a: WhatsNewEntry, b: WhatsNewEntry) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title);

/** Groups with their newest entry first; ties by name. "Everyone" always comes first among users. */
function orderGroups(groups: WhatsNewGroup[], by: 'date' | 'name' | 'user'): WhatsNewGroup[] {
  const latest = (g: WhatsNewGroup) => [...g.entries, ...g.children.flatMap((c) => c.entries)].map((e) => e.date).sort().pop() ?? '';
  return [...groups].sort((a, b) => {
    if (by === 'user') {
      if (a.label === 'Everyone' && b.label !== 'Everyone') return -1;
      if (b.label === 'Everyone' && a.label !== 'Everyone') return 1;
    }
    if (by === 'date') return b.key.localeCompare(a.key);
    return latest(b).localeCompare(latest(a)) || a.label.localeCompare(b.label);
  });
}

function bucket<T>(items: T[], keyOf: (item: T) => string[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) for (const k of new Set(keyOf(item))) out.set(k, [...(out.get(k) ?? []), item]);
  return out;
}

function leaf(key: string, label: string, entries: WhatsNewEntry[]): WhatsNewGroup {
  return { key, label, entries: [...entries].sort(newest), children: [] };
}

/**
 * Groups entries for one view. An entry for several kinds of user appears under
 * each of them in the user views, so a reader who is only one of them finds it.
 */
export function groupEntries(entries: WhatsNewEntry[], view: WhatsNewView): WhatsNewGroup[] {
  if (view === 'date') {
    return orderGroups([...bucket(entries, (e) => [e.date])].map(([d, list]) => leaf(d, formatDate(d), list)), 'date');
  }
  if (view === 'module') {
    return orderGroups([...bucket(entries, (e) => [e.moduleTitle])].map(([m, list]) => leaf(m, m, list)), 'name');
  }
  if (view === 'user') {
    return orderGroups([...bucket(entries, (e) => e.audience)].map(([u, list]) => leaf(u, u, list)), 'user');
  }
  const modules = [...bucket(entries, (e) => [e.moduleTitle])].map(([m, list]) => {
    const children = orderGroups([...bucket(list, (e) => e.audience)].map(([u, l]) => leaf(`${m}/${u}`, u, l)), 'user');
    return { key: m, label: m, entries: [], children } satisfies WhatsNewGroup;
  });
  return orderGroups(modules, 'name');
}

/** How many different changes sit under a heading, counting an entry once even when it is listed under several users. */
export function countChanges(group: WhatsNewGroup): number {
  return new Set([...group.entries, ...group.children.flatMap((c) => c.entries)].map((e) => `${e.productSlug}/${e.slug}`)).size;
}

import type { SiteSettings } from '@/types/content';

/** Settings' tabs, in the order shown. The first is where Settings opens. */
export const SETTINGS_TABS = [
  { id: 'appearance', label: 'Appearance' },
  { id: 'layout', label: 'Layout' },
  { id: 'home', label: 'Home page' },
  { id: 'pages', label: 'Pages and videos' },
  { id: 'people', label: 'People' },
  { id: 'connector', label: 'Editor connector' },
  { id: 'site', label: 'Site details' },
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];
export const DEFAULT_SETTINGS_TAB: SettingsTab = 'appearance';

/**
 * Which site-settings fields each tab edits. Every field is on exactly one
 * tab, so the one Save/Discard bar covers them all. People are not part of the
 * site settings: they save straight away.
 */
export const TAB_FIELDS: Record<SettingsTab, (keyof SiteSettings)[]> = {
  appearance: ['theme', 'defaultMode', 'themeCustom'],
  layout: ['layout'],
  home: ['hero'],
  pages: ['video'],
  people: [],
  connector: [],
  site: ['siteName', 'supportUrl'],
};

/** The tab named in the address (`?tab=…`), or the default for a missing or unknown one. */
export function tabFromParam(param: string | null): SettingsTab {
  return SETTINGS_TABS.some((t) => t.id === param) ? (param as SettingsTab) : DEFAULT_SETTINGS_TAB;
}

/** Stable JSON for "has anything changed?" (key order independent). */
export function canonical(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : val,
  );
}

/** The tabs holding unsaved changes, so each can show a dot. */
export function dirtyTabs(saved: Record<string, unknown>, draft: Record<string, unknown>): Set<SettingsTab> {
  const out = new Set<SettingsTab>();
  for (const [tab, fields] of Object.entries(TAB_FIELDS) as [SettingsTab, string[]][]) {
    if (fields.some((f) => canonical(saved[f]) !== canonical(draft[f]))) out.add(tab);
  }
  return out;
}

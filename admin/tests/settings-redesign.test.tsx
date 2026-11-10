import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { siteSettingsSchema, themeCustomSchema } from '@/types/content';
import { Accordion } from '../web/src/components/Accordion';
import { nextTabIndex, TabPanel, Tabs, tabIds } from '../web/src/components/Tabs';
import { SidebarToggle, sidebarToggleLabel } from '../web/src/components/Layout';
import { DEFAULT_SETTINGS_TAB, dirtyTabs, SETTINGS_TABS, tabFromParam, TAB_FIELDS } from '../web/src/features/settings/settings-tabs';
import { CUSTOMIZER_SECTIONS, resetSection, SECTION_FIELDS, sectionSummary, ThemeCustomizer } from '../web/src/features/settings/ThemeCustomizer';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('Tabs keyboard (WAI-ARIA tabs)', () => {
  it('→ and ← move and wrap around', () => {
    expect(nextTabIndex(0, 'ArrowRight', 4)).toBe(1);
    expect(nextTabIndex(3, 'ArrowRight', 4)).toBe(0);
    expect(nextTabIndex(0, 'ArrowLeft', 4)).toBe(3);
  });
  it('Home and End jump to the ends; other keys do nothing', () => {
    expect(nextTabIndex(2, 'Home', 4)).toBe(0);
    expect(nextTabIndex(1, 'End', 4)).toBe(3);
    expect(nextTabIndex(1, 'Enter', 4)).toBeNull();
    expect(nextTabIndex(0, 'ArrowRight', 0)).toBeNull();
  });
  it('only the chosen tab is in the Tab order, and tabs point at their panels', () => {
    const out = html(
      createElement(Tabs<'a' | 'b'>, {
        label: 'Sections',
        idPrefix: 'x',
        value: 'b',
        onChange: () => undefined,
        tabs: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B', marked: true, markLabel: 'unsaved changes' },
        ],
      }),
    );
    expect(out).toContain('role="tablist"');
    expect(out).toContain('aria-label="Sections"');
    expect(out).toMatch(/id="x-tab-a"[^>]*aria-selected="false"[^>]*tabindex="-1"/);
    expect(out).toMatch(/id="x-tab-b"[^>]*aria-selected="true"[^>]*aria-controls="x-panel-b"[^>]*tabindex="0"/);
    expect(out).toContain('(unsaved changes)');
  });
  it('a panel is labelled by its tab and only the chosen one renders', () => {
    const on = html(createElement(TabPanel, { idPrefix: 'x', id: 'b', active: true, children: 'Hello' }));
    expect(on).toContain(`id="${tabIds('x', 'b').panel}"`);
    expect(on).toContain(`aria-labelledby="${tabIds('x', 'b').tab}"`);
    expect(on).toContain('role="tabpanel"');
    expect(html(createElement(TabPanel, { idPrefix: 'x', id: 'a', active: false, children: 'Hidden' }))).toBe('');
  });
});

describe('Settings tabs', () => {
  it('the tab comes from the address, with a safe default', () => {
    expect(tabFromParam('people')).toBe('people');
    expect(tabFromParam('site')).toBe('site');
    expect(tabFromParam(null)).toBe(DEFAULT_SETTINGS_TAB);
    expect(tabFromParam('nonsense')).toBe(DEFAULT_SETTINGS_TAB);
    expect(DEFAULT_SETTINGS_TAB).toBe('appearance');
  });

  it('every site setting is on exactly one tab, so Save/Discard covers them all', () => {
    const fields = Object.keys(siteSettingsSchema.shape).sort();
    const onTabs = Object.values(TAB_FIELDS).flat().map(String);
    expect([...onTabs].sort()).toEqual(fields);
    expect(new Set(onTabs).size).toBe(onTabs.length);
    expect(SETTINGS_TABS.map((t) => t.id).sort()).toEqual(Object.keys(TAB_FIELDS).sort());
  });

  it('marks only the tabs that hold unsaved changes', () => {
    const saved = { siteName: 'Guide', theme: 'warm', defaultMode: 'light', video: { display: 'expanded' } };
    expect(dirtyTabs(saved, { ...saved }).size).toBe(0);
    expect([...dirtyTabs(saved, { ...saved, theme: 'ink' })]).toEqual(['appearance']);
    expect([...dirtyTabs(saved, { ...saved, video: { display: 'collapsed' } })]).toEqual(['pages']);
    expect([...dirtyTabs(saved, { ...saved, siteName: 'New name', themeCustom: { radius: 4 } })].sort()).toEqual(['appearance', 'site']);
  });

  it('a different key order is not a change', () => {
    const saved = { siteName: 'Guide', theme: 'warm', themeCustom: { radius: 4, lineWidth: 2 } };
    expect(dirtyTabs(saved, { theme: 'warm', themeCustom: { lineWidth: 2, radius: 4 }, siteName: 'Guide' }).size).toBe(0);
  });
});

describe('Accordion', () => {
  it('is closed by default: the button says so and the region is hidden', () => {
    const out = html(createElement(Accordion, { title: 'Colours', summary: 'Theme colours', children: 'Inside' }));
    expect(out).toContain('aria-expanded="false"');
    expect(out).toMatch(/role="region"[^>]*hidden=""/);
    expect(out).toContain('Theme colours');
  });
  it('can start open', () => {
    const out = html(createElement(Accordion, { title: 'Colours', defaultOpen: true, children: 'Inside' }));
    expect(out).toContain('aria-expanded="true"');
    expect(out).not.toMatch(/role="region"[^>]*hidden/);
  });
  it('the button controls its region', () => {
    const out = html(createElement(Accordion, { title: 'Colours', children: 'Inside' }));
    const controls = /aria-controls="([^"]+)"/.exec(out)?.[1];
    expect(controls).toBeTruthy();
    expect(out).toContain(`id="${controls}"`);
  });
  it('the button is named by the title alone; the summary is its description', () => {
    const out = html(createElement(Accordion, { title: 'Colours', summary: 'Theme colours', children: 'Inside' }));
    const labelledby = /<button[^>]*aria-labelledby="([^"]+)"/.exec(out)?.[1];
    const describedby = /<button[^>]*aria-describedby="([^"]+)"/.exec(out)?.[1];
    expect(out).toContain(`id="${labelledby}">Colours<`);
    expect(out).toContain(`id="${describedby}">Theme colours<`);
  });
});

describe('Theme customizer sections', () => {
  it('every customizer field belongs to exactly one section', () => {
    const fields = Object.keys(themeCustomSchema.shape).sort();
    const inSections = Object.values(SECTION_FIELDS).flat().map(String);
    expect([...inSections].sort()).toEqual(fields);
    expect(new Set(inSections).size).toBe(inSections.length);
  });

  it('all sections start closed', () => {
    const out = html(createElement(ThemeCustomizer, { theme: 'warm', value: undefined, onChange: () => undefined }));
    expect(out.match(/aria-expanded="false"/g)?.length).toBe(CUSTOMIZER_SECTIONS.length);
    expect(out).not.toContain('aria-expanded="true"');
  });

  it('summaries say "theme" when nothing is changed, and what is set when it is', () => {
    expect(sectionSummary('colours', undefined)).toBe('Theme colours');
    expect(sectionSummary('colours', { colors: { light: { accent: '#ff0000' }, dark: { accent: '#00ff00', text: '#ffffff' } } })).toBe('3 custom colours');
    expect(sectionSummary('text', { fontBody: 'Inter', baseSize: 16 })).toBe('Inter text · 16 px');
    expect(sectionSummary('headings', { headingSizes: { h1: 40 }, headingWeight: 700 })).toBe('1 custom size · weight 700');
    expect(sectionSummary('shape', { radius: 12 })).toBe('corners 12 px');
    expect(sectionSummary('shadow', { shadow: 'soft' })).toBe('Soft');
    expect(sectionSummary('shadow', {})).toBe('Theme shadow');
  });

  it('resetting one section keeps the others', () => {
    const v = { radius: 12, lineWidth: 2, shadow: 'soft' as const, fontBody: 'Inter' as const };
    expect(resetSection(v, 'shape')).toEqual({ shadow: 'soft', fontBody: 'Inter' });
    expect(resetSection({ radius: 4 }, 'shape')).toBeUndefined();
    expect(resetSection(undefined, 'colours')).toBeUndefined();
  });
});

describe('Sidebar collapse button', () => {
  it('is icon-only, with a spoken label and a matching tooltip', () => {
    const open = html(createElement(SidebarToggle, { collapsed: false, onToggle: () => undefined }));
    expect(open).toContain('aria-label="Collapse sidebar"');
    expect(open).toContain('data-tip="Collapse sidebar"');
    expect(open).toContain('aria-expanded="true"');
    expect(open.replace(/<[^>]+>/g, '').trim()).toBe('');
    expect(sidebarToggleLabel(true)).toBe('Expand sidebar');
  });

  it('sits at the top of the sidebar, before the menu', () => {
    const src = readFileSync(path.join(import.meta.dirname, '../web/src/components/Layout.tsx'), 'utf8');
    const aside = src.slice(src.indexOf('<aside'));
    const toggle = aside.indexOf('<SidebarToggle');
    expect(toggle).toBeGreaterThan(-1);
    expect(toggle).toBeLessThan(aside.indexOf('<nav'));
    expect(aside.slice(aside.indexOf('sidebar__foot'))).not.toContain('SidebarToggle');
  });
});

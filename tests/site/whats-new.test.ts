import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_FILTERS, applyFilters, countOption, facetValues, formatDate, groupEntries, hasFilters, slugify, viewOptions } from '../../src/lib/whats-new/group';
import { whatsNewEntrySchema } from '../../src/types/content';
import { whatsNewAllHref, whatsNewHref } from '../../src/lib/whats-new/href';

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const saved = { c: process.env.CONTENT_DIR, e: process.env.NEXT_PUBLIC_HELP_ENV };

async function load(helpEnv: 'local' | 'production', contentDir = FIXTURE) {
  vi.resetModules();
  process.env.CONTENT_DIR = contentDir;
  process.env.NEXT_PUBLIC_HELP_ENV = helpEnv;
  return import('../../src/lib/content/whats-new');
}

afterEach(() => {
  if (saved.c === undefined) delete process.env.CONTENT_DIR; else process.env.CONTENT_DIR = saved.c;
  if (saved.e === undefined) delete process.env.NEXT_PUBLIC_HELP_ENV; else process.env.NEXT_PUBLIC_HELP_ENV = saved.e;
});

describe("What's new: loading", () => {
  it('lists the newest day first, and within a day by title', async () => {
    const { getWhatsNew } = await load('production');
    expect(getWhatsNew('alpha').map((e) => e.slug)).toEqual(['no-guide', 'same-day-b', 'newer-feature', 'older-feature']);
  });

  it('turns the guide reference into a link, and names the place readers know', async () => {
    const { getWhatsNew } = await load('production');
    const e = getWhatsNew('alpha').find((x) => x.slug === 'newer-feature');
    expect(e?.guideHref).toBe('/alpha/sales/open-page/');
    expect(e?.moduleTitle).toBe('Dashboard');
    expect(e?.productName).toBe('Alpha');
    expect(e?.kind).toBe('improved');
  });

  it('keeps an entry whose guide page is a draft or missing, without a link', async () => {
    const { getWhatsNew } = await load('production');
    const list = getWhatsNew('alpha');
    expect(list.find((x) => x.slug === 'same-day-b')?.guideHref).toBeUndefined();
    expect(list.find((x) => x.slug === 'no-guide')?.guideHref).toBeUndefined();
  });

  it('defaults to "Everyone" and "new"', async () => {
    const { getWhatsNew } = await load('production');
    const e = getWhatsNew('alpha').find((x) => x.slug === 'no-guide');
    expect(e?.audience).toEqual(['Everyone']);
    expect(e?.kind).toBe('new');
  });

  it('has nothing for a product without the file, or one that is not there', async () => {
    const { getWhatsNew, getAllWhatsNew } = await load('production');
    expect(getWhatsNew('secret')).toEqual([]);
    expect(getWhatsNew('nope')).toEqual([]);
    expect(getAllWhatsNew().every((e) => e.productSlug === 'alpha')).toBe(true);
  });
});

describe("What's new: the entry rules", () => {
  const ok = { slug: 'a-feature', date: '2026-11-06', title: 'A feature', summary: 'What you can now do.', module: 'settings' };
  it('accepts a complete entry', () => {
    expect(whatsNewEntrySchema.safeParse(ok).success).toBe(true);
  });
  it('knows three kinds: new, improved and a bug fix', () => {
    for (const kind of ['new', 'improved', 'fixed']) expect(whatsNewEntrySchema.safeParse({ ...ok, kind }).success).toBe(true);
    expect(whatsNewEntrySchema.safeParse({ ...ok, kind: 'removed' }).success).toBe(false);
  });
  it('wants a real date', () => {
    expect(whatsNewEntrySchema.safeParse({ ...ok, date: '6 Nov 2026' }).success).toBe(false);
  });
  it('keeps the detail short', () => {
    expect(whatsNewEntrySchema.safeParse({ ...ok, detail: 'x'.repeat(321) }).success).toBe(false);
  });
  it('wants an audience when one is given', () => {
    expect(whatsNewEntrySchema.safeParse({ ...ok, audience: [] }).success).toBe(false);
  });
});

describe("What's new: grouping and filters", () => {
  const base = { summary: 's', productSlug: 'p', productName: 'P' };
  const entries = [
    { ...base, slug: 'a', date: '2026-11-13', title: 'A', moduleSlug: 'deals', moduleTitle: 'Deals', audience: ['Seller', 'Manager'], kind: 'new' as const },
    { ...base, slug: 'b', date: '2026-11-13', title: 'B', moduleSlug: 'settings', moduleTitle: 'Settings', audience: ['Everyone'], kind: 'new' as const },
    { ...base, slug: 'c', date: '2026-11-06', title: 'C', moduleSlug: 'deals', moduleTitle: 'Deals', audience: ['Seller'], kind: 'improved' as const },
    { ...base, slug: 'd', date: '2026-11-06', title: 'D', moduleSlug: 'reports', moduleTitle: 'Reports', audience: ['Manager'], kind: 'fixed' as const },
  ];
  const slugs = (list: { slug: string }[]) => list.map((e) => e.slug);

  it('formats a date by hand', () => {
    expect(formatDate('2026-11-06')).toBe('6 Nov 2026');
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('groups by day, newest day first', () => {
    const g = groupEntries(entries, 'date');
    expect(g.map((x) => x.label)).toEqual(['13 Nov 2026', '6 Nov 2026']);
    expect(slugs(g[0]!.entries)).toEqual(['a', 'b']);
  });

  it('groups by module, newest module first, entries newest first', () => {
    const g = groupEntries(entries, 'module');
    expect(g.map((x) => x.label)).toEqual(['Deals', 'Settings', 'Reports']);
    expect(slugs(g[0]!.entries)).toEqual(['a', 'c']);
  });

  it('lists an entry under each kind of user it is for, "Everyone" first', () => {
    const g = groupEntries(entries, 'user');
    expect(g.map((x) => x.label)).toEqual(['Everyone', 'Manager', 'Seller']);
    expect(slugs(g.find((x) => x.label === 'Seller')!.entries)).toEqual(['a', 'c']);
    expect(slugs(g.find((x) => x.label === 'Manager')!.entries)).toEqual(['a', 'd']);
  });

  it('offers dates newest first, modules and users A to Z, and never "Everyone" as a user', () => {
    const v = facetValues(entries);
    expect(v.dates).toEqual(['2026-11-13', '2026-11-06']);
    expect(v.modules).toEqual(['Deals', 'Reports', 'Settings']);
    expect(v.users).toEqual(['Manager', 'Seller']);
  });

  it('shows everything when nothing is ticked', () => {
    expect(hasFilters(EMPTY_FILTERS)).toBe(false);
    expect(slugs(applyFilters(entries, EMPTY_FILTERS))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('takes several ticks in one menu as "any of", and menus together as "and"', () => {
    expect(slugs(applyFilters(entries, { ...EMPTY_FILTERS, modules: ['Deals', 'Reports'] }))).toEqual(['a', 'c', 'd']);
    expect(slugs(applyFilters(entries, { ...EMPTY_FILTERS, modules: ['Deals', 'Reports'], types: ['new', 'fixed'] }))).toEqual(['a', 'd']);
    expect(slugs(applyFilters(entries, { ...EMPTY_FILTERS, dates: ['2026-11-06'], types: ['improved'] }))).toEqual(['c']);
  });

  it('keeps what is for everyone when a user is ticked', () => {
    expect(slugs(applyFilters(entries, { ...EMPTY_FILTERS, users: ['Seller'] }))).toEqual(['a', 'b', 'c']);
    expect(slugs(applyFilters(entries, { ...EMPTY_FILTERS, users: ['Seller', 'Manager'] }))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('counts what an option would show given the other menus, not its own', () => {
    const f = { ...EMPTY_FILTERS, modules: ['Deals'], types: ['new' as const] };
    expect(countOption(entries, f, 'modules', (e) => e.moduleTitle === 'Reports')).toBe(0);
    expect(countOption(entries, f, 'modules', (e) => e.moduleTitle === 'Settings')).toBe(1);
    expect(countOption(entries, f, 'types', (e) => e.kind === 'improved')).toBe(1);
  });

  it('changing the view never changes what passes the filters', () => {
    const f = { ...EMPTY_FILTERS, types: ['new' as const] };
    const count = (view: 'date' | 'module' | 'user') => new Set(groupEntries(applyFilters(entries, f), view).flatMap((g) => slugs(g.entries))).size;
    expect([count('date'), count('module'), count('user')]).toEqual([2, 2, 2]);
  });

  it('filters by product: none ticked shows every product, ticked ones show only theirs', () => {
    const two = [
      { ...entries[0]!, productSlug: 'crm', productName: 'CRM' },
      { ...entries[1]!, productSlug: 'wbiz', productName: 'WbizManager' },
      { ...entries[2]!, productSlug: 'crm', productName: 'CRM' },
    ];
    expect(slugs(applyFilters(two, EMPTY_FILTERS))).toEqual(['a', 'b', 'c']);
    expect(slugs(applyFilters(two, { ...EMPTY_FILTERS, products: ['crm'] }))).toEqual(['a', 'c']);
    expect(slugs(applyFilters(two, { ...EMPTY_FILTERS, products: ['crm', 'wbiz'] }))).toEqual(['a', 'b', 'c']);
    expect(countOption(two, { ...EMPTY_FILTERS, modules: ['Settings'] }, 'products', (e) => e.productSlug === 'crm')).toBe(0);
  });

  it('offers Product as a way to view only when the page covers every product', () => {
    expect(viewOptions(true).map((o) => o.value)).toEqual(['product', 'date', 'module', 'user']);
    expect(viewOptions(false).map((o) => o.value)).toEqual(['date', 'module', 'user']);
  });

  it('groups by product, the product with the newest change first', () => {
    const two = [
      { ...entries[2]!, productSlug: 'crm', productName: 'CRM' },
      { ...entries[0]!, productSlug: 'wbiz', productName: 'WbizManager' },
      { ...entries[1]!, productSlug: 'wbiz', productName: 'WbizManager' },
    ];
    const g = groupEntries(two, 'product');
    expect(g.map((x) => x.label)).toEqual(['WbizManager', 'CRM']);
    expect(slugs(g[0]!.entries)).toEqual(['a', 'b']);
  });

  it('makes a safe anchor name', () => {
    expect(slugify('Companies and contacts')).toBe('companies-and-contacts');
    expect(slugify('13 Nov 2026')).toBe('13-nov-2026');
  });
});

describe("What's new: where the link goes", () => {
  it("opens the product's own page from inside a product, and the all-products page from the main page", () => {
    expect(whatsNewHref('crm-business-development')).toBe('/crm-business-development/whats-new/');
    expect(whatsNewHref('wbizmanager')).toBe('/wbizmanager/whats-new/');
    expect(whatsNewHref()).toBe('/changelog/');
    expect(whatsNewHref('')).toBe('/changelog/');
    expect(whatsNewAllHref).toBe('/changelog/all/');
  });
});

describe("What's new: Be Guided's own entries", () => {
  it('are valid, every guide link resolves, and none is dated in the future', async () => {
    const { getWhatsNew } = await load('production', path.resolve(__dirname, '../../content'));
    const list = getWhatsNew('be-guided');
    expect(list.length).toBeGreaterThan(0);
    const today = new Date().toISOString().slice(0, 10);
    for (const e of list) {
      if (e.guideHref === undefined) continue; // a guide link is optional
      expect(e.guideHref.startsWith('/be-guided/'), `${e.slug} links outside the product`).toBe(true);
      expect(e.date <= today, `${e.slug} is dated in the future`).toBe(true);
      expect(e.summary.includes('—') || (e.detail ?? '').includes('—'), `${e.slug} uses an em dash`).toBe(false);
    }
    // Every guide that an entry names must exist (a missing or private page silently drops the link).
    const named = JSON.parse((await import('node:fs')).readFileSync(path.resolve(__dirname, '../../content/products/be-guided/whats-new.json'), 'utf8')).entries.filter((e: { guide?: string }) => e.guide).length;
    expect(list.filter((e) => e.guideHref).length).toBe(named);
  });
});

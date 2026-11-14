import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { countChanges, formatDate, groupEntries } from '../../src/lib/whats-new/group';
import { whatsNewEntrySchema } from '../../src/types/content';

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

describe("What's new: grouping", () => {
  const entries = [
    { slug: 'a', date: '2026-11-13', title: 'A', summary: 's', productSlug: 'p', productName: 'P', moduleSlug: 'deals', moduleTitle: 'Deals', audience: ['Seller', 'Manager'], kind: 'new' as const },
    { slug: 'b', date: '2026-11-13', title: 'B', summary: 's', productSlug: 'p', productName: 'P', moduleSlug: 'settings', moduleTitle: 'Settings', audience: ['Everyone'], kind: 'new' as const },
    { slug: 'c', date: '2026-11-06', title: 'C', summary: 's', productSlug: 'p', productName: 'P', moduleSlug: 'deals', moduleTitle: 'Deals', audience: ['Seller'], kind: 'improved' as const },
  ];

  it('formats a date by hand', () => {
    expect(formatDate('2026-11-06')).toBe('6 Nov 2026');
    expect(formatDate('not a date')).toBe('not a date');
  });

  it('groups by day, newest day first', () => {
    const g = groupEntries(entries, 'date');
    expect(g.map((x) => x.label)).toEqual(['13 Nov 2026', '6 Nov 2026']);
    expect(g[0]?.entries.map((e) => e.slug)).toEqual(['a', 'b']);
  });

  it('groups by module, newest module first, entries newest first', () => {
    const g = groupEntries(entries, 'module');
    expect(g.map((x) => x.label)).toEqual(['Deals', 'Settings']);
    expect(g[0]?.entries.map((e) => e.slug)).toEqual(['a', 'c']);
  });

  it('lists an entry under each kind of user it is for, "Everyone" first', () => {
    const g = groupEntries(entries, 'user');
    expect(g.map((x) => x.label)).toEqual(['Everyone', 'Manager', 'Seller']);
    expect(g.find((x) => x.label === 'Seller')?.entries.map((e) => e.slug)).toEqual(['a', 'c']);
    expect(g.find((x) => x.label === 'Manager')?.entries.map((e) => e.slug)).toEqual(['a']);
  });

  it('counts an entry once under a module even when it is listed under several users', () => {
    const deals = groupEntries(entries, 'module-user').find((x) => x.label === 'Deals');
    expect(deals && countChanges(deals)).toBe(2);
    const seller = groupEntries(entries, 'user').find((x) => x.label === 'Seller');
    expect(seller && countChanges(seller)).toBe(2);
  });

  it('nests users inside modules', () => {
    const g = groupEntries(entries, 'module-user');
    expect(g.map((x) => x.label)).toEqual(['Deals', 'Settings']);
    expect(g[0]?.children.map((x) => x.label)).toEqual(['Manager', 'Seller']);
    expect(g[0]?.children.find((x) => x.label === 'Seller')?.entries.map((e) => e.slug)).toEqual(['a', 'c']);
    expect(g[0]?.entries).toEqual([]);
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

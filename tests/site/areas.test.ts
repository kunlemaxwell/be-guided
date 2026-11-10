import { describe, expect, it } from 'vitest';
import { areaSections, areaSlug, areasOf, moduleGroups } from '@/lib/content/areas';

const page = (section?: string) => ({ section }) as never;
const mod = (slug: string, area: string | undefined, sections: (string | undefined)[]) =>
  ({ slug, title: slug, area, pages: sections.map(page) }) as never;

describe('areas', () => {
  it('makes web-safe slugs', () => {
    expect(areaSlug('HR')).toBe('hr');
    expect(areaSlug('Sales & CRM')).toBe('sales-crm');
  });

  it('groups modules that share an area, ignoring single-module areas', () => {
    const areas = areasOf({ modules: [mod('a', 'HR', []), mod('b', undefined, []), mod('c', 'HR', []), mod('d', 'Finance', [])] });
    expect(areas.map((a) => [a.slug, a.modules.map((m) => m.slug)])).toEqual([['hr', ['a', 'c']]]);
  });

  it('lists section titles across modules in first-seen order', () => {
    const [hr] = areasOf({ modules: [mod('a', 'HR', ['Leave', 'Loans']), mod('b', 'HR', ['Expenses', 'Leave', undefined])] });
    expect(areaSections(hr!)).toEqual(['Leave', 'Loans', 'Expenses']);
  });

  it('groups modules by area in order, with one-view pages only for multi-module areas', () => {
    const groups = moduleGroups({ modules: [mod('acc', 'Accounting', []), mod('rep', 'Accounting', []), mod('me', 'HR', []), mod('x', undefined, []), mod('hr', 'HR', []), mod('set', 'Settings', [])] });
    expect(groups.map((g) => [g.title, g.modules.map((m) => m.slug), g.oneView])).toEqual([
      ['Accounting', ['acc', 'rep'], true],
      ['HR', ['me', 'hr'], true],
      ['More modules', ['x'], false],
      ['Settings', ['set'], false],
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { mixedShowcase } from '@/lib/content/showcase';

const page = (id: string, updated: string) => ({ id, updated }) as never;
const product = (name: string, modules: [string, [string, string][]][]) =>
  ({ name, modules: modules.map(([title, pages]) => ({ title, pages: pages.map(([id, u]) => page(id, u)) })) }) as never;

describe('mixedShowcase', () => {
  it('takes turns between products, newest first, one per module before repeating', () => {
    const a = product('A', [['Sales', [['a1', '2026-11-01'], ['a2', '2026-11-04']]], ['HR', [['a3', '2026-11-03']]]]);
    const b = product('B', [['Deals', [['b1', '2026-11-02']]]]);
    const items = mixedShowcase([a, b], 4, () => true);
    expect(items.map((i) => i.page.id)).toEqual(['a2', 'b1', 'a3', 'a1']);
    expect(items[1]).toMatchObject({ productName: 'B', moduleTitle: 'Deals' });
  });

  it('skips guides without a screenshot', () => {
    const a = product('A', [['Sales', [['a1', '2026-11-01'], ['a2', '2026-11-04']]]]);
    expect(mixedShowcase([a], 4, (p) => (p as { id: string }).id !== 'a2').map((i) => i.page.id)).toEqual(['a1']);
  });
});

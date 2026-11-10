import { describe, expect, it } from 'vitest';
import { pageFrontmatterSchema } from '@/types/content';
import { groupBySection, hasSections } from '@/lib/content/sections';

describe('page sections inside a module', () => {
  it('groups sorted pages under their headings in first-seen order', () => {
    const pages = [
      { id: 'a', section: 'Leave' },
      { id: 'b', section: 'Leave' },
      { id: 'c', section: 'Expenses' },
      { id: 'd', section: 'Leave' },
    ];
    const groups = groupBySection(pages);
    expect(groups.map((g) => g.title)).toEqual(['Leave', 'Expenses']);
    expect(groups[0]?.pages.map((p) => p.id)).toEqual(['a', 'b', 'd']);
  });
  it('keeps pages without a section together, untitled', () => {
    const groups = groupBySection([{ id: 'x' }, { id: 'y', section: '  ' }, { id: 'z', section: 'Loans' }]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ title: undefined });
    expect(groups[0]?.pages).toHaveLength(2);
    expect(hasSections([{ section: undefined }])).toBe(false);
  });
  it('accepts a section in page frontmatter and refuses an over-long one', () => {
    const base = { title: 'T', summary: 'S', updated: '2026-11-04' };
    expect(pageFrontmatterSchema.parse({ ...base, section: 'Leave' }).section).toBe('Leave');
    expect(pageFrontmatterSchema.safeParse({ ...base, section: 'x'.repeat(61) }).success).toBe(false);
  });
});

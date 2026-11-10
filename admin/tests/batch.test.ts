import { describe, expect, it } from 'vitest';
import type { PageSummary } from '../shared/api-types';
import { buildBatchRequest, MAX_BATCH_PAGES, selectionState, toggleAll, toggleOne } from '../web/src/features/pages/batch';

const page = (id: string, video: PageSummary['badges']['video'] = 'none'): PageSummary => {
  const [product, module, slug] = id.split('/');
  return { id, product, module, slug, title: slug, badges: { text: true, screenshots: false, screenshotCount: 0, video } } as unknown as PageSummary;
};

describe('selecting many pages', () => {
  it('select all adds every page, and a second press clears them', () => {
    const ids = ['a/b/c', 'a/b/d', 'a/e/f'];
    const once = toggleAll(new Set(['a/b/c']), ids);
    expect([...once].sort()).toEqual(ids);
    expect(toggleAll(once, ids).size).toBe(0);
  });
  it('select all in one module leaves other selections alone', () => {
    const next = toggleAll(new Set(['x/y/z']), ['a/b/c']);
    expect(next.has('x/y/z') && next.has('a/b/c')).toBe(true);
  });
  it('one box toggles one page', () => {
    expect(toggleOne(new Set(), 'a/b/c').has('a/b/c')).toBe(true);
    expect(toggleOne(new Set(['a/b/c']), 'a/b/c').size).toBe(0);
  });
  it('reports all / some / none for the select-all box', () => {
    expect(selectionState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(selectionState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
    expect(selectionState(new Set(), ['a'])).toBe('none');
  });
});

describe('one instruction for all selected pages', () => {
  const twenty = Array.from({ length: 20 }, (_, i) => page(`acme-books/sales/p-${i}`));
  it('makes a single video request covering all 20 pages', () => {
    const r = buildBatchRequest(twenty, 'make-video', null, '  keep them short  ');
    expect(r).toEqual({
      type: 'make-video',
      scope: { products: ['acme-books'], pages: twenty.map((p) => p.id) },
      contentMode: 'video',
      note: 'keep them short',
    });
  });
  it('page updates need a content mode chosen by the owner', () => {
    expect(buildBatchRequest(twenty, 'refresh-page', null, '')).toBeNull();
    expect(buildBatchRequest(twenty, 'refresh-page', 'text+screens', '')).toMatchObject({ type: 'refresh-page', contentMode: 'text+screens' });
  });
  it('lists each product once when pages come from several', () => {
    const r = buildBatchRequest([page('acme-books/a/b'), page('crm/a/b'), page('acme-books/c/d')], 'make-video', null, '');
    expect(r?.scope.products).toEqual(['acme-books', 'crm']);
  });
  it('refuses an empty or oversized selection', () => {
    expect(buildBatchRequest([], 'make-video', null, '')).toBeNull();
    const many = Array.from({ length: MAX_BATCH_PAGES + 1 }, (_, i) => page(`w/m/p-${i}`));
    expect(buildBatchRequest(many, 'make-video', null, '')).toBeNull();
  });
});

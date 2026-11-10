import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuditEntryDto, Paged, PageDetailDto, RevisionDetailDto, RevisionSummaryDto } from '../../../admin/shared/api-types';
import { dataOf, localHarness, type Harness } from './harness';

let h: Harness;
const PAGE = '/api/v1/pages/acme-books/sales/create-an-invoice';

beforeAll(async () => {
  h = await localHarness();
  const p = dataOf<PageDetailDto>(await h.api.get(PAGE));
  // Revision 1: title + two added lines. Revision 2: body only.
  await h.api.put(PAGE, { frontmatter: { ...p.frontmatter, title: 'Create a sales invoice' }, body: `${p.body}\n\nExtra line one.\nExtra line two.` });
  await h.api.put(PAGE, { frontmatter: { ...p.frontmatter, title: 'Create a sales invoice' }, body: `${p.body}\n\nExtra line one.` });
});
afterAll(() => h.cleanup());

describe('version history', () => {
  it('lists revisions newest first with who, when and a human summary', async () => {
    const list = dataOf<Paged<RevisionSummaryDto>>(await h.api.get(`${PAGE}/revisions`));
    expect(list.totalCount).toBe(2);
    expect(list.items[0]).toMatchObject({ action: 'save', actorName: 'Site Owner', linesRemoved: 1, linesAdded: 0, summary: '1 line removed' });
    expect(list.items[1]!.summary).toBe('Changed title; 3 lines added');
  });

  it('shows one revision: field before/after and the text diff (no files)', async () => {
    const list = dataOf<Paged<RevisionSummaryDto>>(await h.api.get(`${PAGE}/revisions`));
    const detail = dataOf<RevisionDetailDto>(await h.api.get(`${PAGE}/revisions/${list.items[1]!.id}`));
    expect(detail.fieldChanges).toEqual([{ field: 'title', label: 'Title', before: 'Create an invoice', after: 'Create a sales invoice' }]);
    const added = detail.bodyDiff.flatMap((hk) => hk.lines).filter((l) => l.op === '+').map((l) => l.text);
    expect(added).toEqual(['', 'Extra line one.', 'Extra line two.']);
    expect(detail.correlationId).toBeTruthy();
  });

  it('paginates and caps the page size', async () => {
    const one = dataOf<Paged<RevisionSummaryDto>>(await h.api.get(`${PAGE}/revisions?pageSize=1&pageNumber=2`));
    expect(one).toMatchObject({ pageNumber: 2, pageSize: 1, totalCount: 2, totalPages: 2 });
    expect(one.items).toHaveLength(1);
    for (const q of ['pageSize=101', 'pageSize=0', 'pageNumber=0', 'pageNumber=abc']) {
      const r = await h.api.get(`${PAGE}/revisions?${q}`);
      expect(r.status, q).toBe(422);
    }
  });

  it('404s an unknown revision and 400s a bad page address', async () => {
    expect((await h.api.get(`${PAGE}/revisions/nope`)).status).toBe(404);
    expect((await h.api.get(`/api/v1/pages/acme-books/${encodeURIComponent('../x')}/x/revisions`)).status).toBe(400);
  });
});

describe('audit log', () => {
  it('records every change with actor, area, action, target and correlation id', async () => {
    const log = dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?area=pages'));
    expect(log.totalCount).toBe(2);
    expect(log.items[0]).toMatchObject({ area: 'pages', action: 'page.save', target: 'acme-books/sales/create-an-invoice', actorName: 'Site Owner' });
    expect(log.items[0]!.correlationId).toBeTruthy();
    const one = dataOf<AuditEntryDto>(await h.api.get(`/api/v1/audit-log/${log.items[0]!.id}`));
    expect(one.details).toMatchObject({ linesRemoved: 1 });
  });

  it('filters by person, text and dates', async () => {
    const me = dataOf<{ person: { id: string } }>(await h.api.get('/api/v1/me'));
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get(`/api/v1/audit-log?actorId=${me.person.id}`)).totalCount).toBeGreaterThanOrEqual(2);
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?actorId=someone-else')).totalCount).toBe(0);
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?q=sales%20invoice')).totalCount).toBe(2);
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?q=%25')).totalCount).toBe(0);
    const today = new Date().toISOString().slice(0, 10);
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get(`/api/v1/audit-log?from=${today}&to=${today}`)).totalCount).toBeGreaterThanOrEqual(2);
    expect(dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?to=2000-01-01')).totalCount).toBe(0);
  });

  it('rejects bad filters', async () => {
    for (const q of ['area=nope', 'from=yesterday', 'pageSize=500']) {
      expect((await h.api.get(`/api/v1/audit-log?${q}`)).status, q).toBe(422);
    }
    expect((await h.api.get('/api/v1/audit-log/does-not-exist')).status).toBe(404);
  });

  it('logs settings, products, requests and publish attempts too', async () => {
    const site = dataOf<Record<string, unknown>>(await h.api.get('/api/v1/site'));
    await h.api.put('/api/v1/site', { ...site, defaultMode: 'dark' });
    await h.api.post('/api/v1/requests', { type: 'check-updates', scope: { products: 'all' }, contentMode: 'text' });
    await h.api.post('/api/v1/publish');
    const areas = dataOf<Paged<AuditEntryDto>>(await h.api.get('/api/v1/audit-log?pageSize=100')).items.map((e) => e.area);
    expect(new Set(areas)).toEqual(new Set(['pages', 'settings', 'requests', 'publish']));
  });
});

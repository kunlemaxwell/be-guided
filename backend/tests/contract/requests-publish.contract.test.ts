import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { GuideRequest, PublishStatusDto, RequestDto } from '../../../admin/shared/api-types';
import { dataOf, IN_PROCESS, localHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await localHarness();
});
afterAll(() => h.cleanup());

describe('updates & requests', () => {
  it('queues a request for some products, records who asked', async () => {
    const r = await h.api.post('/api/v1/requests', { type: 'check-updates', scope: { products: ['acme-books', 'crm'] }, contentMode: 'text+screens', note: 'March release' });
    expect(r.status).toBe(201);
    expect(dataOf<GuideRequest>(r)).toMatchObject({ status: 'queued', requestedBy: 'Site Owner', scope: { products: ['acme-books', 'crm'] } });
  });

  it('requires a content mode and a valid scope', async () => {
    expect((await h.api.post('/api/v1/requests', { type: 'check-updates', scope: { products: 'all' } })).status).toBe(422);
    expect((await h.api.post('/api/v1/requests', { type: 'check-updates', scope: { products: [] }, contentMode: 'text' })).status).toBe(422);
    expect((await h.api.post('/api/v1/requests', { type: 'nope', scope: { products: 'all' }, contentMode: 'text' })).status).toBe(422);
    expect((await h.api.post('/api/v1/requests', { type: 'check-updates', scope: { products: ['../x'] }, contentMode: 'text' })).status).toBe(422);
  });

  it('cancels, then removes; refuses out-of-order actions and bad ids', async () => {
    const list = dataOf<RequestDto[]>(await h.api.get('/api/v1/requests'));
    const id = list[0]!.id;
    expect((await h.api.post(`/api/v1/requests/${id}/dismiss`)).status).toBe(422);
    expect(dataOf<GuideRequest>(await h.api.post(`/api/v1/requests/${id}/cancel`)).status).toBe('cancelled');
    expect((await h.api.post(`/api/v1/requests/${id}/cancel`)).status).toBe(422);
    expect(dataOf<{ removed: boolean }>(await h.api.post(`/api/v1/requests/${id}/dismiss`)).removed).toBe(true);
    expect((await h.api.post('/api/v1/requests/req-unknown/cancel')).status).toBe(404);
    expect((await h.api.post(`/api/v1/requests/${encodeURIComponent('../../x')}/cancel`)).status).toBe(400);
  });

  it('takes one instruction for many pages, and checks the page list', async () => {
    const pages = Array.from({ length: 20 }, (_, i) => `acme-books/sales/page-${i + 1}`);
    const r = dataOf<GuideRequest>(await h.api.post('/api/v1/requests', { type: 'make-video', scope: { products: ['acme-books'], pages }, contentMode: 'video', note: 'Use PV Demo data' }));
    expect(r.scope.pages).toHaveLength(20);
    expect(r).toMatchObject({ type: 'make-video', contentMode: 'video', status: 'queued', note: 'Use PV Demo data' });
    const tooMany = Array.from({ length: 501 }, (_, i) => `acme-books/sales/p-${i}`);
    expect((await h.api.post('/api/v1/requests', { type: 'make-video', scope: { products: ['acme-books'], pages: tooMany }, contentMode: 'video' })).status).toBe(422);
    expect((await h.api.post('/api/v1/requests', { type: 'refresh-page', scope: { products: ['acme-books'], pages: ['../../etc/passwd'] }, contentMode: 'text' })).status).toBe(422);
    expect((await h.api.post(`/api/v1/requests/${r.id}/cancel`)).status).toBe(200);
  });

  it.runIf(IN_PROCESS)('approves suggested changes Claude wrote', async () => {
    const r = dataOf<GuideRequest>(await h.api.post('/api/v1/requests', { type: 'make-video', scope: { products: ['acme-books'], pages: ['acme-books/sales/create-an-invoice'] }, contentMode: 'video' }));
    expect((await h.api.post(`/api/v1/requests/${r.id}/approve`, { approved: ['a'] })).status).toBe(404);
    const dir = path.join(h.workspace!.stateDir, 'proposals');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${r.id}.json`), JSON.stringify({ changes: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }] }));
    expect((await h.api.post(`/api/v1/requests/${r.id}/approve`, { approved: ['zzz'] })).status).toBe(422);
    expect((await h.api.post(`/api/v1/requests/${r.id}/approve`, { approved: 'a' })).status).toBe(422);
    const ok = dataOf<RequestDto>(await h.api.post(`/api/v1/requests/${r.id}/approve`, { approved: ['b'] }));
    expect(ok).toMatchObject({ status: 'in-progress', proposal: { approved: ['b'] } });
  });
});

describe('publish', () => {
  it('explains when publishing is not connected, and refuses to publish then', async () => {
    const status = dataOf<PublishStatusDto>(await h.api.get('/api/v1/publish'));
    if (IN_PROCESS) {
      expect(status.canPublish).toBe(false);
      const r = await h.api.post('/api/v1/publish');
      expect(r.status).toBe(405);
      expect(r.body.code).toBe('NOT_ALLOWED');
    } else {
      expect(typeof status.canPublish).toBe('boolean');
    }
  });
});

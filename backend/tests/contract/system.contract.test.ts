import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_ERROR_STATUS, PERMISSIONS } from '../../../admin/shared/api-types';
import { dataOf, IN_PROCESS, localHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await localHarness();
});
afterAll(() => h.cleanup());

describe('system endpoints', () => {
  it('GET /api/v1/health answers in the envelope', async () => {
    const r = await h.api.get('/api/v1/health');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, message: expect.any(String), data: { status: 'ok' } });
  });

  it('every response carries a correlation id, and a well-formed incoming one is echoed', async () => {
    const r = await h.api.get('/api/v1/health', { 'X-Correlation-Id': 'abc12345-test' });
    expect(r.headers.get('x-correlation-id')).toBe('abc12345-test');
    const bad = await h.api.get('/api/v1/health', { 'X-Correlation-Id': 'bad id with spaces' });
    expect(bad.headers.get('x-correlation-id')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends security headers', async () => {
    const r = await h.api.get('/api/v1/library');
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('x-frame-options')).toBe('DENY');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('unknown addresses are NOT_FOUND in the error envelope', async () => {
    const r = await h.api.get('/api/v1/nothing-here');
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ success: false, code: 'NOT_FOUND', message: expect.any(String) });
  });

  it('GET /api/v1/me and /capabilities describe the caller and the install', async () => {
    const me = dataOf<{ role: string; permissions: string[]; mode: string; displayName: string }>(await h.api.get('/api/v1/me'));
    expect(me.role).toBe('owner');
    expect(me.permissions).toEqual([...PERMISSIONS]);
    const caps = dataOf<{ folderPicker: boolean; chat: boolean; uploads: { imageExtensions: string[] } }>(await h.api.get('/api/v1/capabilities'));
    expect(typeof caps.folderPicker).toBe('boolean');
    expect(caps.uploads.imageExtensions).toContain('.webp');
    expect(caps.uploads.imageExtensions).not.toContain('.svg');
  });

  it.runIf(IN_PROCESS)('choose-folder is NOT_SUPPORTED where there is no Mac picker', async () => {
    const r = await h.api.post('/api/v1/system/choose-folder');
    expect(r.status).toBe(501);
    expect(r.body.code).toBe('NOT_SUPPORTED');
  });
});

describe('published API contract (OpenAPI)', () => {
  it('serves OpenAPI 3 with x-policy on every operation and the error code list', async () => {
    const r = await h.api.get('/api/v1/openapi.json');
    expect(r.status).toBe(200);
    const doc = r.body as unknown as { openapi: string; paths: Record<string, Record<string, { 'x-policy'?: string }>>; 'x-error-codes': Record<string, number> };
    expect(doc.openapi).toMatch(/^3\./);
    const policies = new Set(['public', 'authenticated', ...PERMISSIONS]);
    const ops = Object.entries(doc.paths).flatMap(([p, methods]) => Object.entries(methods).map(([m, op]) => ({ id: `${m.toUpperCase()} ${p}`, policy: op['x-policy'] })));
    expect(ops.length).toBeGreaterThan(25);
    for (const op of ops) expect(policies.has(String(op.policy)), `${op.id} must declare x-policy`).toBe(true);
    expect(doc['x-error-codes']).toEqual(API_ERROR_STATUS);
  });

  it.runIf(IN_PROCESS)('docs/openapi.json is up to date (run npm run api:contract after changing routes)', async () => {
    const file = path.resolve(__dirname, '../../../docs/openapi.json');
    const live = (await h.api.get('/api/v1/openapi.json')).body;
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toEqual(live);
  });
});

describe('local-only guard (CSRF / DNS rebinding)', () => {
  it.runIf(IN_PROCESS)('refuses a foreign Origin on a change', async () => {
    const r = await h.api.request('/api/v1/requests', { method: 'POST', json: {}, headers: { Origin: 'https://evil.example' } });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN_ORIGIN');
  });

  it.runIf(IN_PROCESS)('refuses a foreign Host', async () => {
    const r = await h.api.get('/api/v1/library', { Host: 'evil.example:3101' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('FORBIDDEN_ORIGIN');
  });

  it('refuses bodies that are not JSON or a file upload', async () => {
    const r = await h.api.request('/api/v1/requests', { method: 'POST', raw: { body: 'type=check-updates', type: 'application/x-www-form-urlencoded' } });
    expect(r.status).toBe(422);
    expect(r.body.code).toBe('INVALID');
  });
});

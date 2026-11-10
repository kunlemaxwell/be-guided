import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MeDto, PersonDto } from '../../../admin/shared/api-types';
import { dataOf, IN_PROCESS, roleHarness, type Api, type RoleHarness } from './harness';

/**
 * Authorization matrix: every protected endpoint as anonymous (401), with a
 * bad token (401), as an unknown or inactive person (403), as a role without
 * the permission (403), and as a role with it (not 401/403).
 */
let h: RoleHarness;
beforeAll(async () => {
  h = await roleHarness();
});
afterAll(() => h.cleanup());

type Call = { name: string; run: (api: Api) => ReturnType<Api['get']>; need: 'authenticated' | 'content:read' | 'content:write' | 'settings:manage' | 'people:manage' | 'publish' };

const CALLS: Call[] = [
  { name: 'GET /me', need: 'authenticated', run: (a) => a.get('/api/v1/me') },
  { name: 'GET /capabilities', need: 'authenticated', run: (a) => a.get('/api/v1/capabilities') },
  { name: 'GET /library', need: 'content:read', run: (a) => a.get('/api/v1/library') },
  { name: 'GET /site', need: 'content:read', run: (a) => a.get('/api/v1/site') },
  { name: 'GET /pages/…', need: 'content:read', run: (a) => a.get('/api/v1/pages/acme-books/sales/create-an-invoice') },
  { name: 'GET /pages/…/revisions', need: 'content:read', run: (a) => a.get('/api/v1/pages/acme-books/sales/create-an-invoice/revisions') },
  { name: 'GET /people', need: 'content:read', run: (a) => a.get('/api/v1/people') },
  { name: 'GET /audit-log', need: 'content:read', run: (a) => a.get('/api/v1/audit-log') },
  { name: 'GET /requests', need: 'content:read', run: (a) => a.get('/api/v1/requests') },
  { name: 'GET /publish', need: 'content:read', run: (a) => a.get('/api/v1/publish') },
  { name: 'GET /files', need: 'content:read', run: (a) => a.get('/api/v1/files?path=products/acme-books/sales/images/none.png') },
  { name: 'PUT /pages/…', need: 'content:write', run: (a) => a.put('/api/v1/pages/acme-books/sales/create-an-invoice', { frontmatter: {}, body: '' }) },
  { name: 'POST /pages/…/draft', need: 'content:write', run: (a) => a.post('/api/v1/pages/acme-books/sales/no-such/draft') },
  { name: 'POST /products', need: 'content:write', run: (a) => a.post('/api/v1/products', {}) },
  { name: 'PUT /products/x', need: 'content:write', run: (a) => a.put('/api/v1/products/nope', {}) },
  { name: 'POST /modules', need: 'content:write', run: (a) => a.post('/api/v1/products/nope/modules', {}) },
  { name: 'POST /pages (create)', need: 'content:write', run: (a) => a.post('/api/v1/products/nope/modules/nope/pages', {}) },
  { name: 'POST /uploads', need: 'content:write', run: (a) => a.request('/api/v1/products/nope/modules/nope/uploads', { method: 'POST', form: new FormData() }) },
  { name: 'POST /requests', need: 'content:write', run: (a) => a.post('/api/v1/requests', {}) },
  { name: 'POST /requests/x/cancel', need: 'content:write', run: (a) => a.post('/api/v1/requests/req-x/cancel') },
  { name: 'POST /system/choose-folder', need: 'content:write', run: (a) => a.post('/api/v1/system/choose-folder') },
  { name: 'PUT /site', need: 'settings:manage', run: (a) => a.put('/api/v1/site', {}) },
  { name: 'PUT /settings/current-person', need: 'settings:manage', run: (a) => a.put('/api/v1/settings/current-person', { personId: null }) },
  { name: 'POST /people', need: 'people:manage', run: (a) => a.post('/api/v1/people', {}) },
  { name: 'PUT /people/x', need: 'people:manage', run: (a) => a.put('/api/v1/people/x', {}) },
  { name: 'POST /publish', need: 'publish', run: (a) => a.post('/api/v1/publish') },
];

const ALLOWED: Record<'viewer' | 'editor' | 'owner', Call['need'][]> = {
  viewer: ['authenticated', 'content:read'],
  editor: ['authenticated', 'content:read', 'content:write'],
  owner: ['authenticated', 'content:read', 'content:write', 'settings:manage', 'people:manage', 'publish'],
};

describe('authorization matrix', () => {
  for (const call of CALLS) {
    it(`${call.name}: anonymous → 401`, async () => {
      const r = await call.run(h.anonymous);
      expect(r.status).toBe(401);
      expect(r.body.code).toBe('UNAUTHENTICATED');
    });

    it.runIf(IN_PROCESS)(`${call.name}: forged / expired / wrong-audience token → 401`, async () => {
      for (const api of [h.forged, h.expired, h.wrongAudience]) expect((await call.run(api)).status).toBe(401);
    });

    it.runIf(IN_PROCESS)(`${call.name}: unknown or inactive person → 403`, async () => {
      for (const who of ['unknown', 'inactive'] as const) {
        const r = await call.run(h.as(who));
        expect(r.status).toBe(403);
        expect(r.body.code).toBe('FORBIDDEN');
      }
    });

    for (const role of ['viewer', 'editor', 'owner'] as const) {
      const allowed = ALLOWED[role].includes(call.need);
      it.runIf(IN_PROCESS || Boolean(process.env[`API_TOKEN_${role.toUpperCase()}`]))(`${call.name}: ${role} → ${allowed ? 'allowed' : '403'}`, async () => {
        const r = await call.run(h.as(role));
        if (allowed) expect([401, 403]).not.toContain(r.status);
        else {
          expect(r.status).toBe(403);
          expect(r.body.code).toBe('FORBIDDEN');
        }
      });
    }
  }

  it('public endpoints need no identity', async () => {
    expect((await h.anonymous.get('/api/v1/health')).status).toBe(200);
    expect((await h.anonymous.get('/api/v1/openapi.json')).status).toBe(200);
  });
});

describe.runIf(IN_PROCESS)('identity and privilege rules', () => {
  it('maps a verified email (case-insensitive) to the person and role', async () => {
    const me = dataOf<MeDto>(await h.as('editor').get('/api/v1/me'));
    expect(me).toMatchObject({ role: 'editor', displayName: 'Eddie Editor', permissions: ['content:read', 'content:write'] });
  });

  it('an editor cannot give themselves owner (hidden-control bypass is denied)', async () => {
    const people = dataOf<PersonDto[]>(await h.as('editor').get('/api/v1/people'));
    const eddie = people.find((p) => p.name === 'Eddie Editor')!;
    const r = await h.as('editor').put(`/api/v1/people/${eddie.id}`, { name: eddie.name, email: eddie.email, role: 'owner', active: true });
    expect(r.status).toBe(403);
    expect(dataOf<MeDto>(await h.as('editor').get('/api/v1/me')).role).toBe('editor');
  });

  it('a role change applies on the very next request', async () => {
    const people = dataOf<PersonDto[]>(await h.api.get('/api/v1/people'));
    const vera = people.find((p) => p.name === 'Vera Viewer')!;
    expect((await h.as('viewer').post('/api/v1/requests', { type: 'check-updates', scope: { products: 'all' }, contentMode: 'text' })).status).toBe(403);
    await h.api.put(`/api/v1/people/${vera.id}`, { name: vera.name, email: vera.email, role: 'editor', active: true });
    expect((await h.as('viewer').post('/api/v1/requests', { type: 'check-updates', scope: { products: 'all' }, contentMode: 'text' })).status).toBe(201);
    await h.api.put(`/api/v1/people/${vera.id}`, { name: vera.name, email: vera.email, role: 'viewer', active: true });
    expect((await h.as('viewer').post('/api/v1/requests', { type: 'check-updates', scope: { products: 'all' }, contentMode: 'text' })).status).toBe(403);
  });

  it('errors never leak internals', async () => {
    const r = await h.forged.get('/api/v1/me');
    expect(JSON.stringify(r.body)).not.toMatch(/stack|JWS|signature|at \w+ \(/i);
  });

  it('who-is-using-this-computer is local only', async () => {
    const r = await h.api.put('/api/v1/settings/current-person', { personId: null });
    // This harness runs local storage with cloud identity; the service refuses outside local mode only.
    expect([200, 501]).toContain(r.status);
  });
});

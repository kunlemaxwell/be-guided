import { describe, expect, it } from 'vitest';
import { CloudflareAccessSignInList } from '../../src/infrastructure/cloudflare/access-sign-in-list';

/** A fake Cloudflare Access API: one app (with an unrelated policy) and reusable policies. */
function fakeCloudflare() {
  const policies: { id: string; name: string; include: unknown[] }[] = [{ id: 'p-members', name: 'Cloudflare account members', include: [] }];
  const app = { id: 'app-1', aud: 'aud-123', name: 'be-guided-admin', domain: 'x.workers.dev', policies: [{ id: 'p-members', precedence: 1 }] };
  const calls: { method: string; path: string }[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = url.pathname.replace('/client/v4/accounts/acc/access', '');
    const method = init?.method ?? 'GET';
    calls.push({ method, path });
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    const ok = (result: unknown) => Response.json({ success: true, result });
    if (path === '/policies' && method === 'GET') return ok(policies);
    if (path === '/policies' && method === 'POST') {
      const p = { id: `p-${policies.length + 1}`, name: String(body.name), include: body.include as unknown[] };
      policies.push(p);
      return ok(p);
    }
    const pm = /^\/policies\/(.+)$/.exec(path);
    if (pm && method === 'PUT') {
      const p = policies.find((x) => x.id === pm[1])!;
      p.include = body.include as unknown[];
      return ok(p);
    }
    if (path === '/apps' && method === 'GET') return ok([{ id: 'app-other', aud: 'zzz' }, { id: app.id, aud: app.aud }]);
    if (path === '/apps/app-1' && method === 'GET') return ok(app);
    if (path === '/apps/app-1' && method === 'PUT') {
      app.policies = body.policies as typeof app.policies;
      return ok(app);
    }
    return Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
  }) as typeof fetch;
  return { fetcher, policies, app, calls };
}

describe('CloudflareAccessSignInList', () => {
  const make = (cf: ReturnType<typeof fakeCloudflare>) => new CloudflareAccessSignInList({ accountId: 'acc', apiToken: 't', audience: 'aud-123', fetch: cf.fetcher });

  it('creates its own allow policy with every email and attaches it to the admin app, keeping the other policies', async () => {
    const cf = fakeCloudflare();
    await make(cf).sync(['Dana@Example.com', 'max@example.com', 'dana@example.com']);
    const mine = cf.policies.find((p) => p.name.startsWith('Be Guided people'))!;
    expect(mine.include).toEqual([{ email: { email: 'dana@example.com' } }, { email: { email: 'max@example.com' } }]);
    expect(cf.app.policies.map((p) => p.id)).toEqual(['p-members', mine.id]);
  });

  it('updates the same policy next time (adds and removes people) and does not re-attach it', async () => {
    const cf = fakeCloudflare();
    const list = make(cf);
    await list.sync(['a@example.com', 'b@example.com']);
    await list.sync(['a@example.com']);
    const mine = cf.policies.filter((p) => p.name.startsWith('Be Guided people'));
    expect(mine).toHaveLength(1);
    expect(mine[0]!.include).toEqual([{ email: { email: 'a@example.com' } }]);
    expect(cf.calls.filter((c) => c.method === 'PUT' && c.path === '/apps/app-1')).toHaveLength(1);
  });

  it('never writes an empty allow rule, and explains a token without permission', async () => {
    const cf = fakeCloudflare();
    await make(cf).sync([]);
    expect(cf.calls).toHaveLength(0);
    const denied = new CloudflareAccessSignInList({ accountId: 'acc', apiToken: 'bad', audience: 'aud-123', fetch: (async () => new Response('{}', { status: 403 })) as typeof fetch });
    await expect(denied.sync(['a@example.com'])).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});

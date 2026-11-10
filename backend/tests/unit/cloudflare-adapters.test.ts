import { describe, expect, it } from 'vitest';
import { GitHubContentRepository } from '../../src/infrastructure/cloudflare/github-content-repository';
import { DeployHookPublisher } from '../../src/infrastructure/cloudflare/deploy-hook-publisher';
import { D1Database } from '../../src/infrastructure/cloudflare/d1-database';
import { R2MediaStore } from '../../src/infrastructure/cloudflare/r2-media-store';
import { NoMediaStore } from '../../src/infrastructure/cloudflare/no-media-store';
import { GitHubMediaStore } from '../../src/infrastructure/cloudflare/github-media-store';
import type { D1DatabaseLike, D1PreparedStatementLike, R2BucketLike } from '../../src/infrastructure/cloudflare/bindings';
import { SqliteDatabase } from '../../src/infrastructure/node/sqlite-database';
import { migrate } from '../../src/infrastructure/shared/migrator';
import { SqlActivityRepository, SqlPeopleRepository } from '../../src/infrastructure/shared/sql-repositories';
import { readMigrations } from '../../src/local';
import { AppError } from '../../src/domain/errors';

// ── GitHub (fake fetch) ────────────────────────────────────────────────────

function b64(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64');
}

function fakeGitHub(files: Record<string, string>) {
  const calls: { method: string; url: string; body?: Record<string, unknown>; auth: string | null }[] = [];
  const shas: Record<string, string> = Object.fromEntries(Object.keys(files).map((k, i) => [k, `sha${i}`]));
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? 'GET';
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body, auth: new Headers(init?.headers).get('authorization') });
    if (url.includes('/git/trees/')) {
      const dirs = new Set<string>();
      for (const f of Object.keys(files)) {
        const parts = f.split('/');
        for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/'));
      }
      return Response.json({ tree: [...[...dirs].map((path) => ({ path, type: 'tree' })), ...Object.keys(files).map((path) => ({ path, type: 'blob' }))] });
    }
    if (url.endsWith('/graphql')) {
      const query = String(body?.query ?? '');
      const repository: Record<string, unknown> = {};
      for (const [, alias, expr] of query.matchAll(/(f\d+): object\(expression: ("[^"]*")\)/g)) {
        const p = (JSON.parse(expr!) as string).replace(/^[^:]+:/, '');
        repository[alias!] = p in files ? { oid: shas[p], text: files[p], isTruncated: false } : null;
      }
      return Response.json({ data: { repository } });
    }
    const m = /\/contents\/(.+?)(\?|$)/.exec(url);
    const path = decodeURIComponent(m?.[1] ?? '');
    if (method === 'GET') {
      if (!(path in files)) return new Response('{}', { status: 404 });
      if (new Headers(init?.headers).get('accept') === 'application/vnd.github.raw') return new Response(files[path]!);
      return Response.json({ content: b64(files[path]!), sha: shas[path], encoding: 'base64' });
    }
    if (method === 'PUT') {
      if (path in files && body?.sha !== shas[path]) return new Response('{}', { status: 409 });
      files[path] = Buffer.from(String(body?.content), 'base64').toString('utf8');
      shas[path] = `sha-new-${calls.length}`;
      return Response.json({ content: { sha: shas[path] } }, { status: 201 });
    }
    return new Response('{}', { status: 405 });
  }) as typeof fetch;
  return { fetcher, calls, files };
}

describe('GitHubContentRepository', () => {
  const content = {
    'content/site.json': '{"siteName":"PV","theme":"classic"}',
    'content/products/acme/product.json': '{"name":"ACME","summary":"S","visibility":"public"}',
    'content/products/acme/sales/module.json': '{"title":"Sales","summary":"S"}',
    'content/products/acme/sales/create-an-invoice.md': '---\ntitle: Créer\n---\n\nBody ✓\n',
    'content/products/acme/sales/images/a.webp': 'x',
    'content/products/Bad Name/product.json': '{}',
    'content/products/nomarker/readme.txt': 'x',
  };
  const make = () => {
    const gh = fakeGitHub({ ...content });
    const repo = new GitHubContentRepository({ repo: 'owner/guide', branch: 'main', token: 'test-token', contentDir: 'content', committer: { name: 'PV', email: 'pv@example.com' }, fetch: gh.fetcher });
    return { gh, repo };
  };

  it('lists products, modules and pages from one tree call', async () => {
    const { gh, repo } = make();
    expect(await repo.listProducts()).toEqual(['acme']);
    expect(await repo.listModules('acme')).toEqual(['sales']);
    expect(await repo.listPages('acme', 'sales')).toEqual(['create-an-invoice']);
    expect(gh.calls.filter((c) => c.url.includes('/git/trees/'))).toHaveLength(1);
    expect(gh.calls[0]!.auth).toBe('Bearer test-token');
  });

  it('reads JSON and UTF-8 page text', async () => {
    const { repo } = make();
    expect(await repo.readSite()).toEqual({ siteName: 'PV', theme: 'classic' });
    expect(await repo.readPage('acme', 'sales', 'create-an-invoice')).toContain('Créer');
    expect(await repo.readPage('acme', 'sales', 'missing')).toBeNull();
    expect(await repo.exists('acme')).toBe(true);
    expect(await repo.exists('nope')).toBe(false);
  });

  it('reads every content file in one batched GraphQL call, not one call per file', async () => {
    const { gh, repo } = make();
    await repo.readSite();
    await repo.readProduct('acme');
    await repo.readModule('acme', 'sales');
    expect(await repo.readPage('acme', 'sales', 'create-an-invoice')).toContain('Body ✓');
    expect(gh.calls.filter((c) => c.url.endsWith('/graphql'))).toHaveLength(1);
    expect(gh.calls.filter((c) => c.url.includes('/contents/'))).toHaveLength(0);
  });

  it('falls back to single-file reads when GraphQL is unavailable', async () => {
    const gh = fakeGitHub({ ...content });
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => (String(input).endsWith('/graphql') ? new Response('{}', { status: 502 }) : gh.fetcher(input, init))) as typeof fetch;
    const repo = new GitHubContentRepository({ repo: 'owner/guide', branch: 'main', token: 't', contentDir: 'content', committer: { name: 'PV', email: 'pv@example.com' }, fetch: fetcher });
    expect(await repo.readSite()).toEqual({ siteName: 'PV', theme: 'classic' });
  });

  it('writes with the current sha (a commit per save) and creates new files', async () => {
    const { gh, repo } = make();
    await repo.writePage('acme', 'sales', 'create-an-invoice', '---\ntitle: New ✓\n---\n', 'Update page');
    const put = gh.calls.find((c) => c.method === 'PUT')!;
    expect(put.body).toMatchObject({ message: 'Update page', branch: 'main', sha: 'sha3', committer: { name: 'PV' } });
    expect(gh.files['content/products/acme/sales/create-an-invoice.md']).toContain('New ✓');
    await repo.writeModule('acme', 'payroll', { title: 'P', summary: 'S' }, 'Add module');
    const create = gh.calls.filter((c) => c.method === 'PUT')[1]!;
    expect(create.body?.sha).toBeUndefined();
  });

  it('keeps pictures in GitHub next to the pages: lists, reads, adds new ones and never replaces', async () => {
    const { gh, repo } = make();
    const media = new GitHubMediaStore(repo);
    expect(await media.list('acme', 'sales', 'images')).toEqual(['a.webp']);
    expect(await media.exists('acme', 'sales', 'images', 'a.webp')).toBe(true);
    const got = await media.get('acme', 'sales', 'images', 'a.webp');
    expect(new TextDecoder().decode(got!.body as Uint8Array)).toBe('x');
    expect(await media.putNew('acme', 'sales', 'images', 'b.webp', new TextEncoder().encode('png-bytes'), 'image/webp')).toBe(true);
    expect(gh.files['content/products/acme/sales/images/b.webp']).toBe('png-bytes');
    expect(await media.putNew('acme', 'sales', 'images', 'a.webp', new Uint8Array([1]), 'image/webp')).toBe(false);
    expect(await media.list('acme', 'sales', 'images')).toEqual(['a.webp', 'b.webp']);
  });

  it('sends videos too big for the site to the big-file store and gives their public address', async () => {
    const { gh, repo } = make();
    const r2: Record<string, Uint8Array> = {};
    const bigStore = {
      list: async () => Object.keys(r2),
      exists: async (_p: string, _m: string, _f: string, n: string) => n in r2,
      putNew: async (_p: string, _m: string, _f: string, n: string, d: Uint8Array) => ((r2[n] = d), true),
      get: async () => null,
    };
    const media = new GitHubMediaStore(repo, bigStore, { store: bigStore, publicBase: 'https://pub-test.r2.dev/' });
    const big = new Uint8Array(25 * 1024 * 1024);
    expect(await media.putNew('acme', 'sales', 'media', 'long.mp4', big, 'video/mp4')).toBe(true);
    expect(gh.calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(await media.publicUrl('acme', 'sales', 'media', 'long.mp4')).toBe('https://pub-test.r2.dev/products/acme/sales/media/long.mp4');
    expect(await media.publicUrl('acme', 'sales', 'images', 'a.webp')).toBeNull();
    const noBig = new GitHubMediaStore(repo);
    await expect(noBig.putNew('acme', 'sales', 'media', 'long2.mp4', big, 'video/mp4')).rejects.toMatchObject({ code: 'FILE_TOO_LARGE' });
  });

  it('maps auth failures to NOT_CONFIGURED and races to CONFLICT', async () => {
    const denied = new GitHubContentRepository({ repo: 'a/b', branch: 'main', token: 'bad', contentDir: 'content', committer: { name: 'x', email: 'x@example.com' }, fetch: (async () => new Response('{}', { status: 401 })) as typeof fetch });
    await expect(denied.listProducts()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
    const conflict = new GitHubContentRepository({
      repo: 'a/b',
      branch: 'main',
      token: 't',
      contentDir: 'content',
      committer: { name: 'x', email: 'x@example.com' },
      fetch: (async (_u: RequestInfo | URL, init?: RequestInit) => (init?.method === 'PUT' ? new Response('{}', { status: 409 }) : new Response('{}', { status: 404 }))) as typeof fetch,
    });
    await expect(conflict.writeSite({}, 'x')).rejects.toBeInstanceOf(AppError);
    await expect(conflict.writeSite({}, 'x')).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ── Deploy hook ────────────────────────────────────────────────────────────

describe('DeployHookPublisher', () => {
  it('is "not set up" without a hook', async () => {
    const p = new DeployHookPublisher(null);
    expect((await p.status()).canPublish).toBe(false);
    await expect(p.publish()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });

  it('POSTs the hook and reports failures', async () => {
    const seen: string[] = [];
    const ok = new DeployHookPublisher('https://api.cloudflare.com/hook/x', (async (u: RequestInfo | URL, init?: RequestInit) => {
      seen.push(`${init?.method} ${String(u)}`);
      return new Response('{}', { status: 200 });
    }) as typeof fetch);
    expect((await ok.publish()).message).toMatch(/Published/);
    expect(seen).toEqual(['POST https://api.cloudflare.com/hook/x']);
    const bad = new DeployHookPublisher('https://h', (async () => new Response('', { status: 500 })) as typeof fetch);
    await expect(bad.publish()).rejects.toMatchObject({ code: 'PUBLISH_FAILED' });
  });
});

// ── D1 (fake D1 over node:sqlite) ──────────────────────────────────────────

function fakeD1(sqlite: SqliteDatabase): D1DatabaseLike {
  const stmt = (sql: string, params: unknown[] = []): D1PreparedStatementLike & { sql: string; params: unknown[] } => ({
    sql,
    params,
    bind: (...v: unknown[]) => stmt(sql, v),
    all: async <T>() => ({ results: await sqlite.all<T>(sql, params as never) }),
    first: async <T>() => sqlite.first<T>(sql, params as never),
    run: async () => ({ meta: { changes: (await sqlite.run(sql, params as never)).changes } }),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (statements) => {
      await sqlite.batch(statements.map((s) => ({ sql: (s as unknown as { sql: string }).sql, params: (s as unknown as { params: never[] }).params })));
      return [];
    },
  };
}

describe('D1Database + shared SQL repositories + migrator', () => {
  it('migrates once and runs the same repositories as local', async () => {
    const db = new D1Database(fakeD1(new SqliteDatabase(':memory:')));
    expect(await migrate(db, readMigrations())).toEqual(['0001_init', '0002_editor_connector', '0003_change_revisions', '0004_upload_tickets', '0005_automation']);
    expect(await migrate(db, readMigrations())).toEqual([]);
    const people = new SqlPeopleRepository(db);
    await people.insert({ id: 'p1', name: 'Ada', email: 'ADA@example.com', role: 'owner', active: true, createdAt: 'x', updatedAt: 'x' });
    expect((await people.findByEmail('ada@EXAMPLE.com'))?.id).toBe('p1');
    await expect(people.insert({ id: 'p2', name: 'Ada 2', email: 'ada@example.com', role: 'viewer', active: true, createdAt: 'x', updatedAt: 'x' })).rejects.toThrow();
    const activity = new SqlActivityRepository(db);
    await activity.record({ id: 'a1', at: '2026-11-03T10:00:00.000Z', actorId: 'p1', actorName: 'Ada', area: 'pages', action: 'page.save', target: 't', summary: 's', details: { x: 1 }, correlationId: 'c' });
    const page = await activity.queryAudit({ pageNumber: 1, pageSize: 20, area: 'pages' });
    expect(page).toMatchObject({ totalCount: 1, items: [{ id: 'a1', details: { x: 1 } }] });
  });

  it('rolls back a failed batch (audit + revision are all-or-nothing)', async () => {
    const sqlite = new SqliteDatabase(':memory:');
    await migrate(sqlite, readMigrations());
    const activity = new SqlActivityRepository(sqlite);
    const entry = { id: 'a1', at: 'now', actorId: null, actorName: 'X', area: 'pages' as const, action: 'page.save', target: 't', summary: 's', details: {}, correlationId: null };
    const badRevision = { id: 'r1', pageId: 'p', createdAt: 'now', actorId: null, actorName: 'X', action: 'nonsense' as 'save', summary: 's', linesAdded: 0, linesRemoved: 0, fieldChanges: [], bodyDiff: [], correlationId: null };
    await expect(activity.record(entry, badRevision)).rejects.toThrow();
    expect((await activity.queryAudit({ pageNumber: 1, pageSize: 10 })).totalCount).toBe(0);
  });
});

// ── R2 (fake bucket) ───────────────────────────────────────────────────────

describe('R2MediaStore', () => {
  it('lists, checks, creates without replacing, and reads', async () => {
    const objects = new Map<string, Uint8Array>();
    const bucket: R2BucketLike = {
      head: async (k) => (objects.has(k) ? { size: objects.get(k)!.byteLength } : null),
      get: async (k) => (objects.has(k) ? { body: new Blob([new Uint8Array(objects.get(k)!)]).stream(), size: objects.get(k)!.byteLength } : null),
      put: async (k, v, o) => {
        if (o?.onlyIf?.etagDoesNotMatch === '*' && objects.has(k)) return null;
        objects.set(k, v);
        return {};
      },
      list: async ({ prefix }) => ({ objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })), truncated: false }),
    };
    const store = new R2MediaStore(bucket);
    expect(await store.putNew('p', 'm', 'images', 'a.png', new Uint8Array([1]), 'image/png')).toBe(true);
    expect(await store.putNew('p', 'm', 'images', 'a.png', new Uint8Array([2]), 'image/png')).toBe(false);
    expect(objects.get('products/p/m/images/a.png')).toEqual(new Uint8Array([1]));
    expect(await store.list('p', 'm', 'images')).toEqual(['a.png']);
    expect(await store.exists('p', 'm', 'media', 'a.png')).toBe(false);
    expect((await store.get('p', 'm', 'images', 'a.png'))?.size).toBe(1);
  });
});

describe('NoMediaStore (R2 not switched on yet)', () => {
  it('finds nothing and refuses uploads with a plain NOT_ALLOWED message', async () => {
    const store = new NoMediaStore();
    expect(await store.list('p', 'm', 'images')).toEqual([]);
    expect(await store.exists('p', 'm', 'images', 'a.png')).toBe(false);
    expect(await store.get('p', 'm', 'images', 'a.png')).toBeNull();
    const err = await store.putNew('p', 'm', 'images', 'a.png', new Uint8Array([1]), 'image/png').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('NOT_ALLOWED');
    expect((err as AppError).message).toContain('R2');
  });
});

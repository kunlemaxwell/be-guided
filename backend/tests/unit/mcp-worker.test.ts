import { describe, expect, it } from 'vitest';
import { cloudConfigSchema, loadConfig } from '../../src/config';
import { buildMcpApp } from '../../src/mcp-worker';
import worker from '../../src/worker';

const SITE = 'https://help.example.com';
/** Only the connector's settings: no GitHub, no Access, no Claude key, no D1/R2. */
const MCP_ONLY_ENV = { SITE_URL: SITE };

const step = (title: string, text: string) => `::::step{title="${title}"}\n${text}\n::::`;

const index = {
  supportUrl: null,
  pages: [
    {
      id: 'acme-books/settings/set-up-taxes',
      product: 'acme-books',
      module: 'settings',
      slug: 'set-up-taxes',
      title: 'Set up taxes',
      summary: 'Add the taxes you charge, such as VAT.',
      status: 'published',
      visibility: 'public',
      productName: 'Acme Books',
      productVisibility: 'public',
      moduleTitle: 'Settings',
      href: '/acme-books/settings/set-up-taxes/',
      updated: '2026-11-03',
      prerequisites: [{ page: 'settings/set-up-default-accounts', why: 'Taxes post to an account.' }],
      video: { src: 'media/taxes.mp4', length: '56 s' },
      body: `## Steps\n\n::::::steps\n${step('Open Settings › Taxes', 'Select **Add New**.\n\n![The tax list](images/taxes-list.webp)\n\n:::legend\n1. **Add New**.\n:::')}\n${step('Save', 'Select **Save**.')}\n::::::\n\nSee [default accounts](guide:settings/set-up-default-accounts) and [secret](guide:settings/secret-taxes).`,
    },
    {
      id: 'acme-books/settings/set-up-default-accounts',
      product: 'acme-books',
      module: 'settings',
      slug: 'set-up-default-accounts',
      title: 'Set up default accounts',
      summary: 'Choose the accounts documents post to.',
      status: 'published',
      visibility: 'public',
      productName: 'Acme Books',
      moduleTitle: 'Settings',
      href: '/acme-books/settings/set-up-default-accounts/',
      body: 'Pick an account for each kind of document.',
    },
    { id: 'acme-books/settings/secret-taxes', product: 'acme-books', module: 'settings', slug: 'secret-taxes', title: 'Secret taxes', summary: 'Set up taxes secretly.', status: 'published', visibility: 'private', href: '/acme-books/settings/secret-taxes/', body: 'Set up taxes' },
    { id: 'acme-books/settings/draft-taxes', product: 'acme-books', module: 'settings', slug: 'draft-taxes', title: 'Draft taxes', summary: 'Set up taxes draft.', status: 'draft', visibility: 'public', href: '/acme-books/settings/draft-taxes/', body: 'Set up taxes' },
    { id: 'hidden/ops/taxes', product: 'hidden', module: 'ops', slug: 'taxes', title: 'Hidden taxes', summary: 'Set up taxes hidden.', status: 'published', visibility: 'public', productVisibility: 'private', href: '/hidden/ops/taxes/', body: 'Set up taxes' },
  ],
};

function fakeSite(respond: () => Response = () => Response.json(index)) {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return respond();
  }) as typeof fetch;
  return { urls, fetchFn };
}

let seq = 0;
const call = (method: string, params?: unknown, url = `https://admin.example.com/api/v1/mcp`) =>
  new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, ...(params === undefined ? {} : { params }) }),
  });

type Result = { content: { text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
async function result(res: Response): Promise<Result> {
  expect(res.status).toBe(200);
  return ((await res.json()) as { result: Result }).result;
}

describe('MCP connector on Cloudflare with only its own settings', () => {
  it('those settings are not enough for the rest of the admin', () => {
    expect(() => loadConfig(cloudConfigSchema, MCP_ONLY_ENV)).toThrow(/Configuration problem/);
  });

  it('reads the published site index and never shows private, draft or private-product pages', async () => {
    const site = fakeSite();
    const app = buildMcpApp(MCP_ONLY_ENV, { fetch: site.fetchFn });
    const r = await result(await app.fetch(call('tools/call', { name: 'search', arguments: { query: 'set up taxes' } })));
    const ids = (r.structuredContent as { results: { id: string; url: string }[] }).results.map((x) => x.id);
    expect(ids[0]).toBe('acme-books/settings/set-up-taxes');
    expect(ids).not.toContain('acme-books/settings/secret-taxes');
    expect(ids).not.toContain('acme-books/settings/draft-taxes');
    expect(ids).not.toContain('hidden/ops/taxes');
    expect(site.urls).toEqual([`${SITE}/ask-ai/pages.json`]);

    for (const id of ['acme-books/settings/secret-taxes', 'acme-books/settings/draft-taxes', 'hidden/ops/taxes']) {
      const hidden = await result(await app.fetch(call('tools/call', { name: 'fetch', arguments: { id } })));
      expect(hidden.isError, id).toBe(true);
      expect(hidden.content[0]!.text).toMatch(/no public guide page/);
    }
  });

  it('fetch builds absolute links to the public site: page, steps, screenshots, video, prerequisites', async () => {
    const app = buildMcpApp(MCP_ONLY_ENV, { fetch: fakeSite().fetchFn });
    const r = await result(await app.fetch(call('tools/call', { name: 'fetch', arguments: { id: 'acme-books/settings/set-up-taxes' } })));
    const doc = r.structuredContent as { url: string; text: string; metadata: Record<string, string> };
    expect(doc.url).toBe(`${SITE}/acme-books/settings/set-up-taxes/`);
    expect(doc.text).toContain(`### Step 1: Open Settings › Taxes\nDirect link to this step: ${SITE}/acme-books/settings/set-up-taxes/#step-open-settings-taxes`);
    expect(doc.text).toContain(`![Screenshot: The tax list](${SITE}/_content/acme-books/settings/images/taxes-list.webp)`);
    expect(doc.text).toContain(`Video (56 s): ${SITE}/_content/acme-books/settings/media/taxes.mp4`);
    expect(doc.text).toContain(`- [Set up default accounts](${SITE}/acme-books/settings/set-up-default-accounts/): Taxes post to an account.`);
    expect(doc.text).toContain('[default accounts](https://help.example.com/acme-books/settings/set-up-default-accounts/)');
    // The link to a private page is plain text: the reader can't open it, and the AI isn't told it exists.
    expect(doc.text).toContain(' and secret.');
    expect(doc.text).not.toContain('secret-taxes');
    expect(doc.metadata).toMatchObject({ product: 'Acme Books', module: 'Settings', steps: '2', screenshots: '1', updated: '2026-11-03' });
  });

  it('reuses the downloaded index between requests', async () => {
    const site = fakeSite();
    const app = buildMcpApp(MCP_ONLY_ENV, { fetch: site.fetchFn });
    await app.fetch(call('tools/call', { name: 'list_guides', arguments: {} }));
    await app.fetch(call('tools/call', { name: 'search', arguments: { query: 'taxes' } }));
    expect(site.urls).toHaveLength(1);
  });

  it('uses MCP_CONTENT_URL when it is set', async () => {
    const site = fakeSite();
    const app = buildMcpApp({ ...MCP_ONLY_ENV, MCP_CONTENT_URL: 'https://cdn.example.com/pages.json' }, { fetch: site.fetchFn });
    await app.fetch(call('tools/call', { name: 'list_guides', arguments: {} }));
    expect(site.urls).toEqual(['https://cdn.example.com/pages.json']);
  });

  it('says the guide cannot be read (as a tool error, nothing internal) when the site index is unreachable', async () => {
    const app = buildMcpApp(MCP_ONLY_ENV, { fetch: fakeSite(() => new Response('nope', { status: 500 })).fetchFn });
    const r = await result(await app.fetch(call('tools/call', { name: 'search', arguments: { query: 'taxes' } })));
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/can't be read right now/);
    expect(r.content[0]!.text).not.toMatch(/status|500|fetch/i);
  });

  it('the Worker serves /api/v1/mcp with only SITE_URL, but nothing else', async () => {
    const env = MCP_ONLY_ENV as unknown as Parameters<typeof worker.fetch>[1];
    const init = await worker.fetch(call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }), env, {});
    expect(init.status).toBe(200);
    expect(await init.json()).toMatchObject({ result: { serverInfo: { name: 'be-guided' } } });

    const library = await worker.fetch(new Request('https://admin.example.com/api/v1/library'), env, {});
    expect(library.status).toBe(503);
  });

  it('refuses to start without a valid site address, without echoing the value', () => {
    expect(() => buildMcpApp({})).toThrow(/SITE_URL/);
    expect(() => buildMcpApp({ SITE_URL: 'not a url secret-ish' })).toThrow(/SITE_URL/);
    expect(() => buildMcpApp({ SITE_URL: 'not a url secret-ish' })).not.toThrow(/secret-ish/);
  });
});

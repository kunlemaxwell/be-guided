import { describe, expect, it } from 'vitest';
import { buildChatApp } from '../../src/chat-worker';
import { cloudConfigSchema, loadConfig } from '../../src/config';
import worker from '../../src/worker';
import { fakeChatModel } from '../contract/harness';

const SITE = 'https://help.example.com';
/** Only the Ask AI settings: no GitHub, no Access, no site address, no D1/R2. */
const CHAT_ONLY_ENV = { CHAT_ALLOWED_ORIGINS: SITE, ANTHROPIC_API_KEY: 'test-key' };

const index = {
  supportUrl: 'https://help.example.com/support',
  pages: [
    { id: 'acme-books/sales/create-an-invoice', product: 'acme-books', module: 'sales', slug: 'create-an-invoice', title: 'Create an invoice', summary: 'Bill a customer.', status: 'published', visibility: 'public', href: '/acme-books/sales/create-an-invoice/', body: '## Steps\n\n::::step{title="Open invoices"}\nSelect **New invoice** to create an invoice.\n::::' },
    { id: 'acme-books/sales/secret-invoice', product: 'acme-books', module: 'sales', slug: 'secret-invoice', title: 'Secret invoice', summary: 'Create an invoice secretly.', status: 'published', visibility: 'private', href: '/acme-books/sales/secret-invoice/', body: 'Create an invoice' },
    { id: 'acme-books/sales/draft-invoice', product: 'acme-books', module: 'sales', slug: 'draft-invoice', title: 'Draft invoice', summary: 'Create an invoice draft.', status: 'draft', visibility: 'public', href: '/acme-books/sales/draft-invoice/', body: 'Create an invoice' },
  ],
};

function fakeSite() {
  const urls: string[] = [];
  const fetchFn = (async (input: RequestInfo | URL) => {
    urls.push(String(input));
    return Response.json(index);
  }) as typeof fetch;
  return { urls, fetchFn };
}

const post = (body: unknown, origin = SITE) =>
  new Request(`https://admin.example.com/api/v1/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
const ask = (q: string) => ({ messages: [{ role: 'user', content: q }] });

describe('Ask AI on Cloudflare with only its own settings', () => {
  it('those settings are not enough for the rest of the admin', () => {
    expect(() => loadConfig(cloudConfigSchema, CHAT_ONLY_ENV)).toThrow(/Configuration problem/);
  });

  it('answers from the published site index, never from private or draft pages', async () => {
    const model = fakeChatModel();
    const site = fakeSite();
    const app = buildChatApp(CHAT_ONLY_ENV, { chatModel: model, fetch: site.fetchFn });
    const res = await app.fetch(post(ask('How do I create an invoice?')));
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe(SITE);
    const body = (await res.json()) as { success: boolean; data: { sources: { id: string; href: string }[] } };
    expect(body.success).toBe(true);
    expect(body.data.sources).toEqual([{ id: 'acme-books/sales/create-an-invoice', title: 'Create an invoice', href: '/acme-books/sales/create-an-invoice/' }]);
    expect(site.urls).toEqual([`${SITE}/ask-ai/pages.json`]);
    const seen = model.calls[0]!;
    expect(seen.pages.map((p) => p.id)).toEqual(['acme-books/sales/create-an-invoice']);
    expect(seen.pages[0]!.text).not.toContain('::::');
    expect(seen.supportUrl).toBe('https://help.example.com/support');
  });

  it('reuses the downloaded index between questions', async () => {
    const site = fakeSite();
    const app = buildChatApp(CHAT_ONLY_ENV, { chatModel: fakeChatModel(), fetch: site.fetchFn });
    await app.fetch(post(ask('create an invoice')));
    await app.fetch(post(ask('create an invoice again')));
    expect(site.urls).toHaveLength(1);
  });

  it('answers the browser preflight from the site, and refuses other sites', async () => {
    const app = buildChatApp(CHAT_ONLY_ENV, { chatModel: fakeChatModel(), fetch: fakeSite().fetchFn });
    const pre = await app.fetch(new Request('https://admin.example.com/api/v1/chat', { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } }));
    expect(pre.status).toBe(204);
    const other = await app.fetch(post(ask('create an invoice'), 'https://evil.example'));
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ success: false, code: 'FORBIDDEN_ORIGIN' });
  });

  it('says Ask AI cannot read the guide when the site index is unreachable', async () => {
    const down = (async () => new Response('nope', { status: 500 })) as typeof fetch;
    const app = buildChatApp(CHAT_ONLY_ENV, { chatModel: fakeChatModel(), fetch: down });
    const res = await app.fetch(post(ask('create an invoice')));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ success: false, code: 'NOT_CONFIGURED' });
  });

  it('the Worker serves /api/v1/chat with only the Ask AI settings, but nothing else', async () => {
    // No Claude key: the chat app itself answers (with CORS), proving it started without GitHub/Access.
    const env = { CHAT_ALLOWED_ORIGINS: SITE } as unknown as Parameters<typeof worker.fetch>[1];
    const chat = await worker.fetch(post(ask('create an invoice')), env, {});
    expect(chat.status).toBe(503);
    expect(chat.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(await chat.json()).toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringMatching(/not switched on/) });

    const library = await worker.fetch(new Request('https://admin.example.com/api/v1/library'), env, {});
    expect(library.status).toBe(503);
    expect(await library.json()).toMatchObject({ code: 'NOT_CONFIGURED', message: expect.stringMatching(/admin is not set up/) });
  });
});

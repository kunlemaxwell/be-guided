import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IN_PROCESS, localHarness, type Harness } from './harness';

/**
 * What readers see is controlled in the admin: a page can be shown or kept off,
 * a What's new entry can be switched on or off, and "publish automatically"
 * (default on) can be turned off per product for pages and for What's new.
 */
const EDITOR = '/api/v1/editor';
const HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', Origin: '' };
interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
let seq = 0;

describe.skipIf(!IN_PROCESS)('Show/hide and publish automatically', () => {
  let h: Harness;
  let key: string;
  const dir = () => path.join(h.workspace!.contentDir, 'products', 'acme-books');
  const productFile = () => path.join(dir(), 'product.json');
  const wnFile = () => path.join(dir(), 'whats-new.json');
  const readJson = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8')) as Record<string, any>;
  const setProduct = (patch: Record<string, unknown>) => fs.writeFileSync(productFile(), JSON.stringify({ ...readJson(productFile()), ...patch }, null, 2));
  const tool = async (name: string, args: Record<string, unknown>): Promise<ToolResult> => {
    const r = await h.api.request(EDITOR, { method: 'POST', json: { jsonrpc: '2.0', id: ++seq, method: 'tools/call', params: { name, arguments: args } }, headers: { ...HEADERS, Authorization: `Bearer ${key}` } });
    expect(r.status).toBe(200);
    return r.body.result as ToolResult;
  };
  const entry = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, date: '2026-11-13', title: `Feature ${slug}`, summary: 'Readers can do something new here.', module: 'sales', audience: ['Everyone'], kind: 'new', ...extra });

  beforeAll(async () => {
    h = await localHarness();
    const e = await h.api.post('/api/v1/people', { name: 'Dana Developer', email: 'dana@example.com', role: 'editor' });
    const k = await h.api.post('/api/v1/connector-keys', { personId: (e.body.data as { id: string }).id, label: 'Dana laptop', products: null });
    key = (k.body.data as { key: string }).key;
    setProduct({ editorApproval: false });
    fs.writeFileSync(wnFile(), JSON.stringify({ entries: [entry('first'), entry('second', { hidden: true })] }, null, 2));
  });
  afterAll(() => h.cleanup());

  it('shows or hides a page from the Pages list (hide = draft, show = published), and records it', async () => {
    const lib = (await h.api.get('/api/v1/library')).body.data as { products: { slug: string; modules: { slug: string; pages: { slug: string }[] }[] }[] };
    const m = lib.products.find((p) => p.slug === 'acme-books')!.modules.find((x) => x.slug === 'sales')!;
    const page = m.pages[0]!.slug;
    const file = path.join(dir(), 'sales', `${page}.md`);
    const off = await h.api.post(`/api/v1/pages/acme-books/sales/${page}/shown`, { shown: false });
    expect(off.status).toBe(200);
    expect(fs.readFileSync(file, 'utf8')).toMatch(/status: draft/);
    const on = await h.api.post(`/api/v1/pages/acme-books/sales/${page}/shown`, { shown: true });
    expect(on.status).toBe(200);
    expect(fs.readFileSync(file, 'utf8')).not.toMatch(/status: draft/);
    const audit = JSON.stringify((await h.api.get('/api/v1/audit-log?pageSize=100')).body);
    expect(audit).toContain('page.hide');
    expect(audit).toContain('page.show');
  });

  it("lists What's new entries with their shown state and the setting", async () => {
    const r = await h.api.get('/api/v1/products/acme-books/whats-new');
    expect(r.status).toBe(200);
    const d = r.body.data as { autoPublish: boolean; entries: { slug: string; shown: boolean }[] };
    expect(d.autoPublish).toBe(true);
    expect(d.entries.map((e) => [e.slug, e.shown])).toEqual([['first', true], ['second', false]]);
  });

  it('switches one entry on or off and keeps the rest of the file', async () => {
    const off = await h.api.put('/api/v1/products/acme-books/whats-new/first/shown', { shown: false });
    expect(off.status).toBe(200);
    expect(readJson(wnFile()).entries[0]).toMatchObject({ slug: 'first', hidden: true });
    const on = await h.api.put('/api/v1/products/acme-books/whats-new/first/shown', { shown: true });
    expect(on.status).toBe(200);
    expect(readJson(wnFile()).entries[0].hidden).toBeUndefined();
    const missing = await h.api.put('/api/v1/products/acme-books/whats-new/nope/shown', { shown: true });
    expect(missing.status).toBe(404);
    expect(JSON.stringify((await h.api.get('/api/v1/audit-log?pageSize=100')).body)).toContain('whatsnew.hide');
  });

  it('new entries are shown at once by default', async () => {
    const r = await tool('save_whats_new', { product: 'acme-books', entries: [entry('third')] });
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text).toMatch(/1 added/);
    expect(r.content[0]!.text).toMatch(/live in about 2 minutes/);
    expect(readJson(wnFile()).entries.find((e: any) => e.slug === 'third').hidden).toBeUndefined();
  });

  it("with What's new publishing off, new entries are saved switched off and an existing entry keeps its state", async () => {
    setProduct({ autoPublish: { pages: true, whatsNew: false } });
    const r = await tool('save_whats_new', { product: 'acme-books', entries: [entry('fourth'), entry('second', { title: 'Second, reworded' })] });
    expect(r.content[0]!.text).toMatch(/switched off until an owner/);
    const file = readJson(wnFile());
    expect(file.entries.find((e: any) => e.slug === 'fourth').hidden).toBe(true);
    const second = file.entries.find((e: any) => e.slug === 'second');
    expect(second).toMatchObject({ title: 'Second, reworded', hidden: true });
    expect(file.entries.find((e: any) => e.slug === 'third').hidden).toBeUndefined();
    const admin = (await h.api.get('/api/v1/products/acme-books/whats-new')).body.data as { autoPublish: boolean };
    expect(admin.autoPublish).toBe(false);
    // An owner switches it on.
    const on = await h.api.put('/api/v1/products/acme-books/whats-new/fourth/shown', { shown: true });
    expect(on.status).toBe(200);
    expect(readJson(wnFile()).entries.find((e: any) => e.slug === 'fourth').hidden).toBeUndefined();
  });

  it('rejects an entry with a module the product does not have', async () => {
    const r = await tool('save_whats_new', { product: 'acme-books', entries: [entry('fifth', { module: 'no-such-module' })] });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/no module/);
  });

  it('with page publishing off, page changes wait for approval even without the approval setting', async () => {
    setProduct({ editorApproval: false, autoPublish: { pages: false, whatsNew: true } });
    const list = await tool('list_products', {});
    expect(JSON.stringify(list.structuredContent)).toContain('"pages":false');
    const r = await tool('save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'publish-setting-test',
      frontmatter: { title: 'Publish setting test', summary: 'A page that should wait.', status: 'published' },
      body: 'One line of text.\n',
    });
    expect(r.structuredContent).toMatchObject({ status: 'waiting-for-approval' });
    expect(fs.existsSync(path.join(dir(), 'sales', 'publish-setting-test.md'))).toBe(false);
    setProduct({ autoPublish: { pages: true, whatsNew: true } });
    const live = await tool('save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'publish-setting-test',
      frontmatter: { title: 'Publish setting test', summary: 'A page that goes live.', status: 'published' },
      body: 'One line of text.\n',
    });
    expect(live.structuredContent).toMatchObject({ status: 'published' });
  });
});

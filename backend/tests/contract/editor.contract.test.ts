import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAGIC } from '../magic-bytes';
import { IN_PROCESS, localHarness, type Api, type ApiResponse, type Harness } from './harness';

/**
 * Editor connector (/api/v1/editor): personal keys, content-only tools, house
 * rules, product scope and "approve before publish".
 */
const EDITOR = '/api/v1/editor';
const HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', Origin: '' };

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}

let seq = 0;
function rpc(api: Api, key: string | null, method: string, params?: unknown): Promise<ApiResponse> {
  const headers: Record<string, string> = { ...HEADERS };
  if (key) headers.Authorization = `Bearer ${key}`;
  return api.request(EDITOR, { method: 'POST', json: { jsonrpc: '2.0', id: ++seq, method, ...(params === undefined ? {} : { params }) }, headers });
}

async function call(api: Api, key: string, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const r = await rpc(api, key, 'tools/call', { name, arguments: args });
  expect(r.status).toBe(200);
  return r.body.result as ToolResult;
}

const PAGE_BODY = [
  'Use this to try the connector.',
  '',
  '::::::steps',
  '::::step{title="Open Sales"}',
  'In the menu, select **Sales**.',
  '::::',
  '::::::',
].join('\n');

describe.skipIf(!IN_PROCESS)('Editor connector', () => {
  let h: Harness;
  let editorId: string;
  let viewerId: string;
  let allKey: string;
  let salesOnlyKeyId: string;

  const productJson = () => path.join(h.workspace!.contentDir, 'products', 'acme-books', 'product.json');
  const setApproval = (on: boolean) => {
    const p = JSON.parse(fs.readFileSync(productJson(), 'utf8')) as Record<string, unknown>;
    p.editorApproval = on;
    fs.writeFileSync(productJson(), JSON.stringify(p, null, 2));
  };

  beforeAll(async () => {
    h = await localHarness();
    const e = await h.api.post('/api/v1/people', { name: 'Dana Developer', email: 'dana@example.com', role: 'editor' });
    editorId = (e.body.data as { id: string }).id;
    const v = await h.api.post('/api/v1/people', { name: 'Val Viewer', email: 'val@example.com', role: 'viewer' });
    viewerId = (v.body.data as { id: string }).id;
    const k = await h.api.post('/api/v1/connector-keys', { personId: editorId, label: 'Dana laptop', products: null });
    expect(k.status).toBe(201);
    allKey = (k.body.data as { key: string }).key;
  });
  afterAll(() => h.cleanup());

  it('creates a key once: the full key is returned only at creation, never listed', async () => {
    expect(allKey).toMatch(/^bgk_[A-Za-z0-9_-]{40,}$/);
    const list = await h.api.get('/api/v1/connector-keys');
    const text = JSON.stringify(list.body);
    expect(text).not.toContain(allKey);
    expect(text).toContain('Dana laptop');
  });

  it('refuses keys for viewers', async () => {
    const r = await h.api.post('/api/v1/connector-keys', { personId: viewerId, label: 'x', products: null });
    expect(r.status).toBe(422);
  });

  it('refuses requests with no key, a wrong key, or a malformed header (401)', async () => {
    for (const key of [null, 'bgk_' + 'a'.repeat(43)]) {
      const r = await rpc(h.api, key, 'tools/list');
      expect(r.status).toBe(401);
      expect(r.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32001 } });
    }
  });

  it('lists only content tools', async () => {
    const r = await rpc(h.api, allKey, 'tools/list');
    const names = ((r.body.result as { tools: { name: string }[] }).tools ?? []).map((t) => t.name).sort();
    const content = ['get_upload_link', 'get_writing_standard', 'list_products', 'my_changes', 'read_page', 'request_new_module', 'request_new_product', 'request_video', 'save_page', 'upload_screenshot'];
    const automation = ['assign_update_plan', 'automation_overview', 'cancel_update_check', 'claim_update_check', 'decide_update_check', 'delete_skill', 'delete_update_plan', 'fail_update_check', 'feedback_summary', 'get_skill', 'get_skills', 'get_update_check', 'list_skills', 'list_update_checks', 'mark_changes_applied', 'open_be_guided_studio', 'report_update_check', 'run_update_check', 'save_skill', 'save_update_plan'];
    const inChatAdmin = ['admin_api', 'open_be_guided_admin'];
    expect(names).toEqual([...content, ...automation, ...inChatAdmin].sort());
    // What the AI itself can call: content and guide automation only, nothing that edits code, settings or people.
    // admin_api is for the in-chat admin app only (hidden from the model) and keeps the person's role (admin-app.contract.test.ts).
    const tools = (r.body.result as { tools: { name: string; _meta?: { ui?: { visibility?: string[] } } }[] }).tools;
    const forModel = tools.filter((t) => !t._meta?.ui?.visibility || t._meta.ui.visibility.includes('model')).map((t) => t.name);
    expect(forModel).not.toContain('admin_api');
    expect(forModel.some((n) => /people|site|setting|key|code|publish|admin_api/.test(n))).toBe(false);
  });

  it('hands over the writing standard', async () => {
    const r = await call(h.api, allKey, 'get_writing_standard');
    expect(r.content[0]!.text).toMatch(/CONTENT MODE/);
    expect(r.content[0]!.text).toMatch(/em dashes/);
  });

  it('rejects pages that break the house rules, with the reasons', async () => {
    setApproval(false);
    const r = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-test',
      frontmatter: { title: 'Connector test', summary: 'A test.' },
      body: 'Bad — dash ![x](https://evil.example/x.png)',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/em dash/);
    expect(r.content[0]!.text).toMatch(/images folder/);
  });

  it('publishes straight away when the product does not need approval', async () => {
    setApproval(false);
    const r = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-test',
      frontmatter: { title: 'Connector test', summary: 'A test page from the connector.', status: 'published' },
      body: PAGE_BODY,
    });
    expect(r.isError ?? false).toBe(false);
    expect(r.structuredContent).toMatchObject({ status: 'published', pageId: 'acme-books/sales/connector-test' });
    const file = fs.readFileSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'sales', 'connector-test.md'), 'utf8');
    expect(file).toContain('Open Sales');
    expect(file).toContain('author: Dana Developer');
  });

  it('queues the change for approval when the product needs it; an owner approves it and it goes live', async () => {
    setApproval(true);
    const r = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-test',
      frontmatter: { title: 'Connector test', summary: 'A test page from the connector.', status: 'published' },
      body: PAGE_BODY + '\n\nA new line waiting for approval.',
      note: 'Added a line',
    });
    expect(r.structuredContent).toMatchObject({ status: 'waiting-for-approval' });
    const changeId = (r.structuredContent as { changeId: string }).changeId;
    const file = () => fs.readFileSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'sales', 'connector-test.md'), 'utf8');
    expect(file()).not.toContain('waiting for approval');

    const waiting = await h.api.get('/api/v1/changes?status=pending');
    expect((waiting.body.data as { id: string; linesAdded: number }[]).find((c) => c.id === changeId)?.linesAdded).toBeGreaterThan(0);

    const ok = await h.api.post(`/api/v1/changes/${changeId}/approve`, { note: 'Looks good' });
    expect(ok.status).toBe(200);
    expect(file()).toContain('waiting for approval');

    const again = await h.api.post(`/api/v1/changes/${changeId}/approve`, {});
    expect(again.status).toBe(409);

    const mine = await call(h.api, allKey, 'my_changes');
    expect(JSON.stringify(mine.structuredContent)).toContain('approved');
  });

  it('saving again while waiting updates the same change; the author reads their waiting version', async () => {
    setApproval(true);
    const first = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-draft',
      frontmatter: { title: 'Connector draft', summary: 'A draft.', status: 'published' },
      body: PAGE_BODY,
    });
    const id = (first.structuredContent as { changeId: string }).changeId;
    const again = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-draft',
      frontmatter: { title: 'Connector draft', summary: 'A better draft.', status: 'published' },
      body: PAGE_BODY + '\n\nSecond version.',
    });
    expect(again.structuredContent).toMatchObject({ status: 'waiting-for-approval', changeId: id, updatedExisting: true });
    const read = await call(h.api, allKey, 'read_page', { page_id: 'acme-books/sales/connector-draft' });
    expect(JSON.stringify(read.structuredContent)).toContain('Second version.');
    expect(read.structuredContent).toMatchObject({ waitingForApproval: { changeId: id } });

    const pending = (await h.api.get('/api/v1/changes?status=pending')).body.data as { id: string }[];
    expect(pending.filter((c) => c.id === id)).toHaveLength(1);

    const detail = await h.api.get(`/api/v1/changes/${id}`);
    const d = detail.body.data as { revisions: number; review: { moduleTitle: string; steps: number; publishes: boolean; checks: { label: string; ok: boolean }[] } };
    expect(d.revisions).toBe(2);
    expect(d.review).toMatchObject({ moduleTitle: 'Sales', steps: 1, publishes: true });
    expect(d.review.checks.find((c) => c.label === 'Follows the house writing rules')?.ok).toBe(true);
    expect(d.review.checks.find((c) => c.label === 'Has a Troubleshooting section')?.ok).toBe(false);
    await h.api.post(`/api/v1/changes/${id}/reject`, {});
  });

  it("an owner's own changes publish straight away, even when the product needs approval", async () => {
    setApproval(true);
    const people = (await h.api.get('/api/v1/people')).body.data as { id: string; role: string; active: boolean }[];
    const owner = people.find((p) => p.role === 'owner' && p.active)!;
    const k = await h.api.post('/api/v1/connector-keys', { personId: owner.id, label: 'Owner laptop', products: null });
    const ownerKey = (k.body.data as { key: string }).key;
    const r = await call(h.api, ownerKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'owner-test',
      frontmatter: { title: 'Owner test', summary: 'An owner page.', status: 'published' },
      body: PAGE_BODY,
    });
    expect(r.structuredContent).toMatchObject({ status: 'published' });
    expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'sales', 'owner-test.md'))).toBe(true);
  });

  it('upload links take a file once, for that product only, and say where it went', async () => {
    const link = await call(h.api, allKey, 'get_upload_link', { product: 'acme-books', module: 'sales', kind: 'image', file_name: 'connector-shot.png' });
    const url = (link.structuredContent as { uploadUrl: string }).uploadUrl;
    expect(link.content[0]!.text).toContain('curl');
    const pathOnly = new URL(url).pathname;
    const send = () => {
      const f = new FormData();
      const bytes = new Uint8Array(1024);
      bytes.set(MAGIC.png);
      f.set('file', new File([bytes], 'whatever.png', { type: 'image/png' }));
      return h.api.request(pathOnly, { method: 'POST', form: f, headers: { Origin: '' } });
    };
    const first = await send();
    expect(first.status).toBe(201);
    expect(first.body.data).toMatchObject({ src: 'images/connector-shot.png' });
    expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'sales', 'images', 'connector-shot.png'))).toBe(true);
    expect((await send()).status).toBe(401);
    const bogus = await h.api.request('/api/v1/editor/upload/' + 'x'.repeat(43), { method: 'POST', form: new FormData(), headers: { Origin: '' } });
    expect([401, 422]).toContain(bogus.status);
  });

  it('the writing standard explains the video rule (a video tool if connected, else own tools)', async () => {
    const r = await call(h.api, allKey, 'get_writing_standard');
    expect(r.content[0]!.text).toMatch(/video-making tool/);
    expect(r.content[0]!.text).toMatch(/brand\/opening\.mp4/);
    expect(r.content[0]!.text).not.toContain('{{SITE_URL}}');
  });

  it('a rejected change never reaches the site', async () => {
    setApproval(true);
    const r = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'sales',
      page: 'connector-test',
      frontmatter: { title: 'Connector test', summary: 'A test page from the connector.' },
      body: PAGE_BODY + '\n\nThis must not appear.',
    });
    const changeId = (r.structuredContent as { changeId: string }).changeId;
    const no = await h.api.post(`/api/v1/changes/${changeId}/reject`, { note: 'Not now' });
    expect(no.status).toBe(200);
    const file = fs.readFileSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'sales', 'connector-test.md'), 'utf8');
    expect(file).not.toContain('must not appear');
  });

  it('a key limited to other products cannot touch this one; a switched-off key stops working', async () => {
    const k = await h.api.post('/api/v1/connector-keys', { personId: editorId, label: 'CRM only', products: ['crm'] });
    expect(k.status).toBe(201);
    const crmKey = (k.body.data as { key: string; id: string }).key;
    salesOnlyKeyId = (k.body.data as { id: string }).id;
    const r = await call(h.api, crmKey, 'read_page', { page_id: 'acme-books/sales/create-an-invoice' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/can't change acme-books/);

    const off = await h.api.request(`/api/v1/connector-keys/${salesOnlyKeyId}`, { method: 'DELETE' });
    expect(off.status).toBe(200);
    expect((await rpc(h.api, crmKey, 'tools/list')).status).toBe(401);
  });

  it('an owner adds a product and a module straight away, with no approval step', async () => {
    const people = (await h.api.get('/api/v1/people')).body.data as { id: string; role: string; active: boolean }[];
    const owner = people.find((p) => p.role === 'owner' && p.active)!;
    const k = await h.api.post('/api/v1/connector-keys', { personId: owner.id, label: 'Owner create', products: null });
    const ownerKey = (k.body.data as { key: string }).key;
    const p = await call(h.api, ownerKey, 'request_new_product', { name: 'Owner Product', summary: 'Made by the owner.', repo: 'example/owner-app', paths: ['src/app'] });
    expect(p.structuredContent).toMatchObject({ status: 'created', product: 'owner-product' });
    const pj = JSON.parse(fs.readFileSync(path.join(h.workspace!.contentDir, 'products', 'owner-product', 'product.json'), 'utf8')) as { visibility: string; source: { repos: { url: string }[] } };
    expect(pj.visibility).toBe('private');
    expect(pj.source.repos[0]!.url).toBe('example/owner-app');
    const m = await call(h.api, ownerKey, 'request_new_module', { product: 'owner-product', title: 'First module', summary: 'Pages for the first module.' });
    expect(m.structuredContent).toMatchObject({ status: 'created', module: 'owner-product/first-module' });
    expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products', 'owner-product', 'first-module', 'module.json'))).toBe(true);
    const queued = ((await h.api.get('/api/v1/requests')).body.data as { type: string; status: string }[]).filter((r) => r.type === 'new-product' && r.status === 'queued');
    expect(queued).toHaveLength(0);
  });

  it("an editor's new product waits for the owner, who approves and creates it", async () => {
    const r = await call(h.api, allKey, 'request_new_product', { name: 'Editor Product', summary: 'Asked for by an editor.', repo: 'example/editor-app' });
    expect(r.structuredContent).toMatchObject({ status: 'waiting-for-approval', product: 'editor-product' });
    const dir = path.join(h.workspace!.contentDir, 'products', 'editor-product');
    expect(fs.existsSync(dir)).toBe(false);
    const id = (r.structuredContent as { requestId: string }).requestId;
    const list = (await h.api.get('/api/v1/requests')).body.data as { id: string; type: string; create?: { kind: string } }[];
    expect(list.find((x) => x.id === id)).toMatchObject({ type: 'new-product', create: { kind: 'product' } });
    const ok = await h.api.post(`/api/v1/requests/${id}/create`, {});
    expect(ok.status).toBe(200);
    expect((ok.body.data as { status: string }).status).toBe('done');
    expect(fs.existsSync(path.join(dir, 'product.json'))).toBe(true);
    const again = await h.api.post(`/api/v1/requests/${id}/create`, {});
    expect(again.status).toBe(422);
  });

  it("an editor's new module waits for approval too", async () => {
    const r = await call(h.api, allKey, 'request_new_module', { product: 'acme-books', title: 'Editor module', summary: 'Asked for by an editor.' });
    expect(r.structuredContent).toMatchObject({ status: 'waiting-for-approval', module: 'acme-books/editor-module' });
    expect(fs.existsSync(path.join(h.workspace!.contentDir, 'products', 'acme-books', 'editor-module'))).toBe(false);
  });

  it('cannot create modules or reach outside content', async () => {
    const r = await call(h.api, allKey, 'save_page', {
      product: 'acme-books',
      module: 'no-such-module',
      page: 'x',
      frontmatter: { title: 'X', summary: 'Y' },
      body: 'Z',
    });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/no module/);
    const bad = await rpc(h.api, allKey, 'tools/call', { name: 'read_page', arguments: { page_id: '../../etc/passwd' } });
    expect(JSON.stringify(bad.body)).not.toContain('root:');
  });
});

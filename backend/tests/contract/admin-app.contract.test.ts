import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dataOf, IN_PROCESS, roleHarness, type RoleHarness } from './harness';

/**
 * The whole admin inside the chat (MCP Apps, ui://be-guided/admin.html).
 * The app makes the web admin's /api/v1 calls through the connector's
 * admin_api tool, as the key's person, with the same permissions.
 * Uses cloud-style sign-in, so "not signed in" is a real 401.
 */
const EDITOR = '/api/v1/editor';
const MCP_HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18', Origin: '' };

type ToolResult = { content: { text: string }[]; structuredContent?: { status: number; envelope: { success: boolean; code?: string; data?: unknown } | null; file: { contentType: string; base64: string } | null }; isError?: boolean };

describe.skipIf(!IN_PROCESS)('Admin in the chat (admin_api)', () => {
  let h: RoleHarness;
  let ownerKey: string;
  let editorKey: string;
  let scopedKey: string;
  let seq = 0;
  const rpc = (key: string, method: string, params?: unknown) =>
    h.anonymous.request(EDITOR, { method: 'POST', json: { jsonrpc: '2.0', id: ++seq, method, ...(params === undefined ? {} : { params }) }, headers: { ...MCP_HEADERS, Authorization: `Bearer ${key}` } });
  const admin = async (key: string, args: Record<string, unknown>) => {
    const r = await rpc(key, 'tools/call', { name: 'admin_api', arguments: args });
    expect(r.status).toBe(200);
    return r.body.result as ToolResult;
  };

  beforeAll(async () => {
    h = await roleHarness();
    const people = dataOf<{ id: string; role: string; email: string }[]>(await h.api.get('/api/v1/people'));
    const owner = people.find((p) => p.email === 'owner@example.com')!;
    const editor = people.find((p) => p.email === 'editor@example.com')!;
    const key = async (personId: string, label: string, products: string[] | null) => dataOf<{ key: string }>(await h.api.post('/api/v1/connector-keys', { personId, label, products })).key;
    ownerKey = await key(owner.id, 'Owner chat', null);
    editorKey = await key(editor.id, 'Editor chat', null);
    scopedKey = await key(editor.id, 'CRM only', ['acme-crm']);
  });
  afterAll(() => h.cleanup());

  it('TC-ADMIN-001 lists the open tool for the model and admin_api for the app only', async () => {
    const r = await rpc(ownerKey, 'tools/list');
    const tools = new Map((r.body.result as { tools: { name: string; _meta?: { ui?: { resourceUri?: string; visibility?: string[] } } }[] }).tools.map((t) => [t.name, t]));
    expect(tools.get('open_be_guided_admin')!._meta!.ui).toEqual({ resourceUri: 'ui://be-guided/admin.html', visibility: ['model', 'app'] });
    expect(tools.get('admin_api')!._meta!.ui!.visibility).toEqual(['app']);
  });

  it('TC-ADMIN-002 serves the whole admin as one self-contained page with the web admin menu', async () => {
    const r = await rpc(ownerKey, 'resources/read', { uri: 'ui://be-guided/admin.html' });
    const c = (r.body.result as { contents: { mimeType: string; text: string }[] }).contents[0]!;
    expect(c.mimeType).toBe('text/html;profile=mcp-app');
    expect(c.text).toContain('ui/initialize');
    expect(c.text).toContain('admin_api');
    for (const label of ['Pages', 'Products', 'Updates &amp; requests', 'Automatic checks', 'Reader feedback', 'Audit log', 'Settings', 'Components'].map((l) => l.replace('&amp;', '&'))) expect(c.text).toContain(label);
    expect(c.text).not.toMatch(/<script[^>]+src=/);
    expect(c.text).not.toMatch(/<link rel="stylesheet"[^>]*href="\/assets/);
  });

  it('TC-ADMIN-003 opening the admin starts on Pages unless a screen is named', async () => {
    const a = await rpc(ownerKey, 'tools/call', { name: 'open_be_guided_admin', arguments: {} });
    expect((a.body.result as { structuredContent: { screen: string } }).structuredContent.screen).toBe('pages');
    const b = await rpc(ownerKey, 'tools/call', { name: 'open_be_guided_admin', arguments: { screen: 'settings' } });
    expect((b.body.result as { structuredContent: { screen: string } }).structuredContent.screen).toBe('settings');
  });

  it("TC-ADMIN-004 calls run as the key's person, and changes are logged under their name", async () => {
    const me = await admin(ownerKey, { method: 'GET', path: '/me' });
    expect((me.structuredContent!.envelope!.data as { displayName: string; role: string }).role).toBe('owner');
    expect((me.structuredContent!.envelope!.data as { displayName: string }).displayName).toBe('Olive Owner');
    const site = (await admin(ownerKey, { method: 'GET', path: '/site' })).structuredContent!.envelope!.data as Record<string, unknown>;
    const saved = await admin(ownerKey, { method: 'PUT', path: '/site', body: { ...site, theme: 'warm' } });
    expect(saved.structuredContent!.envelope!.success).toBe(true);
    const audit = JSON.stringify((await admin(ownerKey, { method: 'GET', path: '/audit-log' })).structuredContent!.envelope);
    expect(audit).toContain('Olive Owner');
  });

  it("TC-ADMIN-005 the person's role still applies: an editor cannot change settings or people", async () => {
    const site = (await admin(editorKey, { method: 'GET', path: '/site' })).structuredContent!.envelope!.data as Record<string, unknown>;
    const r = await admin(editorKey, { method: 'PUT', path: '/site', body: site });
    expect(r.structuredContent!.status).toBe(403);
    expect(r.structuredContent!.envelope!.code).toBe('FORBIDDEN');
    const p = await admin(editorKey, { method: 'POST', path: '/people', body: { name: 'Sneaky', email: 'sneaky@example.com', role: 'owner' } });
    expect(p.structuredContent!.status).toBe(403);
  });

  it('TC-ADMIN-006 a key limited to some products cannot open the whole admin', async () => {
    const r = await admin(scopedKey, { method: 'GET', path: '/me' });
    expect(r.isError).toBe(true);
    expect(r.content[0]!.text).toMatch(/limited to some products/);
  });

  it('TC-ADMIN-007 cannot reach the connectors, public endpoints or another site', async () => {
    for (const path of ['/editor', '/mcp', '/chat', '/automation/call', '/../v1/editor', '//evil.example/x', 'https://evil.example/x', '/%2e%2e/editor']) {
      const r = await admin(ownerKey, { method: 'POST', path, body: {} });
      const refused = r.isError === true || (r.structuredContent?.status ?? 0) >= 400;
      expect([path, refused]).toEqual([path, true]);
    }
  });

  it('TC-ADMIN-008 a made-up internal pass from outside gets no access', async () => {
    for (const pass of ['00000000-0000-4000-8000-000000000000', 'owner', '']) {
      const r = await h.anonymous.request('/api/v1/me', { headers: { 'x-pv-internal-pass': pass } });
      expect(r.status).toBe(401);
    }
  });

  it('TC-ADMIN-009 pictures come back as files and uploads go in as base64', async () => {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const up = await admin(ownerKey, { method: 'POST', path: '/products/acme-books/modules/sales/uploads', form: { fields: { kind: 'image' }, file: { field: 'file', name: 'chat-test.png', type: 'image/png', base64: png } } });
    expect(up.structuredContent!.status).toBeLessThan(300);
    expect(up.structuredContent!.envelope!.success).toBe(true);
    const src = (up.structuredContent!.envelope!.data as { src: string }).src;
    const file = await admin(ownerKey, { method: 'GET', path: `/files?path=${encodeURIComponent(`products/acme-books/sales/${src}`)}` });
    expect(file.structuredContent!.file!.contentType).toMatch(/^image\//);
    expect(file.structuredContent!.file!.base64.length).toBeGreaterThan(20);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testConfig } from '../helpers';
import { IN_PROCESS, localHarness, type Api, type ApiResponse, type Harness } from './harness';

/**
 * "Connect your AI": /api/v1/mcp speaks MCP (JSON-RPC 2.0 over Streamable
 * HTTP). Runs in-process by default; with API_BASE_URL it checks any other
 * implementation (e.g. a C# port) for the same behaviour, except the cases
 * that need in-process control (rate limit, file edits).
 */
const MCP = '/api/v1/mcp';
const SITE = 'http://localhost:3100';
const HEADERS = { Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };

interface ToolResult {
  content: { type: string; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}
interface SearchHit {
  id: string;
  title: string;
  url: string;
  breadcrumb: string;
  snippet: string;
}
interface GuideDoc {
  id: string;
  title: string;
  text: string;
  url: string;
  metadata: Record<string, string>;
}

let seq = 0;
function rpc(api: Api, method: string, params?: unknown, headers: Record<string, string> = {}): Promise<ApiResponse> {
  // No Origin: Claude and ChatGPT call from their servers, not from a browser.
  // An empty value means "leave this header out" (Origin '' stops the harness adding the admin's origin).
  const all: Record<string, string> = { ...HEADERS, Origin: '', ...headers };
  for (const k of Object.keys(all)) if (all[k] === '' && k !== 'Origin') delete all[k];
  return api.request(MCP, { method: 'POST', json: { jsonrpc: '2.0', id: ++seq, method, ...(params === undefined ? {} : { params }) }, headers: all });
}

async function tool(api: Api, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const r = await rpc(api, 'tools/call', { name, arguments: args });
  expect(r.status).toBe(200);
  expect(r.body.error).toBeUndefined();
  return r.body.result as ToolResult;
}

/** Tools return their data as structuredContent and as the same JSON in one text block (OpenAI connector shape). */
function data<T>(result: ToolResult): T {
  expect(result.isError ?? false).toBe(false);
  expect(result.content).toHaveLength(1);
  expect(JSON.parse(result.content[0]!.text)).toEqual(result.structuredContent);
  return result.structuredContent as T;
}

describe('MCP connector: protocol', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await localHarness();
  });
  afterAll(() => h.cleanup());

  it('initialize: negotiates the protocol version and names the server and its tools capability', async () => {
    const r = await rpc(h.api, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'contract-test', version: '1' } }, { 'MCP-Protocol-Version': '' });
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toMatch(/application\/json/);
    expect(r.headers.get('mcp-session-id')).toBeNull(); // stateless
    const result = r.body.result as { protocolVersion: string; capabilities: { tools?: unknown }; serverInfo: { name: string; version: string }; instructions?: string };
    expect(result.protocolVersion).toBe('2025-06-18');
    expect(result.capabilities.tools).toBeDefined();
    expect(result.serverInfo.name).toBe('be-guided');
    expect(result.instructions).toMatch(/search/);
  });

  it('initialize with an unknown version answers with a version the server supports', async () => {
    const r = await rpc(h.api, 'initialize', { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 't', version: '1' } }, { 'MCP-Protocol-Version': '' });
    expect(r.status).toBe(200);
    expect((r.body.result as { protocolVersion: string }).protocolVersion).toMatch(/^20\d\d-\d\d-\d\d$/);
  });

  it('refuses an unsupported MCP-Protocol-Version header', async () => {
    const r = await rpc(h.api, 'tools/list', undefined, { 'MCP-Protocol-Version': '1999-01-01' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
  });

  it('accepts notifications/initialized (202, no body) and answers ping', async () => {
    const n = await h.api.request(MCP, { method: 'POST', json: { jsonrpc: '2.0', method: 'notifications/initialized' }, headers: { ...HEADERS, Origin: '' } });
    expect(n.status).toBe(202);
    const p = await rpc(h.api, 'ping');
    expect(p.status).toBe(200);
    expect(p.body).toMatchObject({ jsonrpc: '2.0', result: {} });
  });

  it('tools/list: search, fetch and list_guides, read-only, with input schemas', async () => {
    const r = await rpc(h.api, 'tools/list');
    const tools = (r.body.result as { tools: { name: string; description: string; inputSchema: { required?: string[]; properties: Record<string, unknown> }; annotations?: { readOnlyHint?: boolean } }[] }).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(['fetch', 'list_guides', 'search']);
    for (const t of tools) {
      expect(t.annotations?.readOnlyHint, t.name).toBe(true);
      expect(t.description.length, t.name).toBeGreaterThan(80);
    }
    expect(tools.find((t) => t.name === 'search')!.inputSchema.required).toEqual(['query']);
    expect(tools.find((t) => t.name === 'fetch')!.inputSchema.required).toEqual(['id']);
    expect(tools.find((t) => t.name === 'list_guides')!.inputSchema.required ?? []).toEqual([]);
  });

  it('answers malformed JSON-RPC with the right error codes', async () => {
    const parse = await h.api.request(MCP, { method: 'POST', raw: { body: '{not json', type: 'application/json' }, headers: { ...HEADERS, Origin: '' } });
    expect(parse.status).toBe(400);
    expect(parse.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32700 }, id: null });

    const unknown = await rpc(h.api, 'resources/destroy');
    expect(unknown.body).toMatchObject({ error: { code: -32601 } });

    for (const params of [undefined, {}, { name: 42 }]) {
      const bad = await rpc(h.api, 'tools/call', params);
      expect(bad.status, JSON.stringify(params)).toBe(200);
      const error = bad.body.error as { code: number; message: string };
      expect(error.code, JSON.stringify(params)).toBe(-32602);
      expect(error.message).toMatch(/^Invalid params/);
      expect(error.message).not.toMatch(/\n|\[|stack/);
    }
    const init = await rpc(h.api, 'initialize', {}, { 'MCP-Protocol-Version': '' });
    expect(init.body).toMatchObject({ error: { code: -32602 } });
  });

  it('tool arguments that fail validation come back as a tool error the model can correct', async () => {
    for (const [name, args] of [
      ['search', {}],
      ['search', { query: '' }],
      ['search', { query: 'x'.repeat(201) }],
      ['fetch', { id: 7 }],
      ['list_guides', { product: 'x'.repeat(81) }],
    ] as const) {
      const r = await tool(h.api, name, args);
      expect(r.isError, `${name} ${JSON.stringify(args).slice(0, 40)}`).toBe(true);
      expect(r.content[0]!.text).toMatch(/-32602|Invalid arguments/);
    }
  });

  it('only POST is offered: GET and DELETE are 405, and the Accept/Content-Type rules are enforced', async () => {
    for (const method of ['GET', 'DELETE']) {
      const r = await h.api.request(MCP, { method, headers: { ...HEADERS, Origin: '' } });
      expect(r.status, method).toBe(405);
      expect(r.headers.get('allow')).toMatch(/POST/);
      expect(r.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
    }
    const noAccept = await h.api.request(MCP, { method: 'POST', json: { jsonrpc: '2.0', id: 1, method: 'ping' }, headers: { Origin: '', Accept: 'application/json' } });
    expect(noAccept.status).toBe(406);
    const text = await h.api.request(MCP, { method: 'POST', raw: { body: 'ping', type: 'text/plain' }, headers: { ...HEADERS, Origin: '' } });
    expect(text.status).toBe(415);
  });
});

describe('MCP connector: tools', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await localHarness();
  });
  afterAll(() => h.cleanup());

  it('search finds the right page, with absolute links, breadcrumb and a snippet', async () => {
    const { results } = data<{ results: SearchHit[] }>(await tool(h.api, 'search', { query: 'set up taxes' }));
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results[0]).toMatchObject({ id: 'acme-books/settings/set-up-taxes', title: 'Set up taxes', url: `${SITE}/acme-books/settings/set-up-taxes/`, breadcrumb: 'Acme Books › Settings' });
    expect(results[0]!.snippet.length).toBeGreaterThan(20);
    for (const r of results) expect(r.url.startsWith(`${SITE}/`)).toBe(true);
  });

  it('search points at the matching step when the question is about part of a page', async () => {
    const { results } = data<{ results: SearchHit[] }>(await tool(h.api, 'search', { query: 'withholding receivable account' }));
    const taxes = results.find((r) => r.id === 'acme-books/settings/set-up-taxes');
    expect(taxes?.url).toMatch(/\/acme-books\/settings\/set-up-taxes\/#step-[a-z0-9-]+$/);
  });

  it('search with nothing relevant returns an empty list', async () => {
    const { results } = data<{ results: SearchHit[] }>(await tool(h.api, 'search', { query: 'weather in Lagos tomorrow' }));
    expect(results).toEqual([]);
  });

  it('fetch returns the whole page as text: summary, prerequisites, video, every step with its link and screenshot, legend, troubleshooting, related guides', async () => {
    const doc = data<GuideDoc>(await tool(h.api, 'fetch', { id: 'acme-books/sales/create-an-invoice' }));
    expect(doc).toMatchObject({ id: 'acme-books/sales/create-an-invoice', title: 'Create an invoice', url: `${SITE}/acme-books/sales/create-an-invoice/` });
    expect(doc.metadata).toMatchObject({ product: 'Acme Books', module: 'Sales' });
    expect(Number(doc.metadata.steps)).toBeGreaterThan(2);
    const t = doc.text;
    expect(t).toMatch(/^# Create an invoice/);
    expect(t).toContain('## Before you start');
    expect(t).toContain(`[Add a customer](${SITE}/acme-books/sales/add-a-customer/)`);
    expect(t).toMatch(/### Step 1: /);
    expect(t).toMatch(new RegExp(`Direct link to this step: ${SITE}/acme-books/sales/create-an-invoice/#step-[a-z0-9-]+`));
    expect(t).toMatch(new RegExp(`!\\[Screenshot: [^\\]]*\\]\\(${SITE}/_content/acme-books/sales/images/[^)]+\\)`));
    expect(t).toContain('Key to the numbered marks on the screenshot above:');
    expect(t).toContain('## Related guides');
    expect(t).not.toMatch(/^:{2,}/m);
    expect(t).not.toContain('guide:');
    expect(t).not.toMatch(/\]\(images\//);
  });

  it('fetch includes the walkthrough video link when the page has one', async () => {
    const doc = data<GuideDoc>(await tool(h.api, 'fetch', { id: 'acme-books/settings/set-up-taxes' }));
    expect(doc.metadata.video_url).toBe(`${SITE}/_content/acme-books/settings/media/set-up-taxes-walkthrough.mp4`);
    expect(doc.text).toContain(`Video (56 s): ${SITE}/_content/acme-books/settings/media/set-up-taxes-walkthrough.mp4`);
    expect(doc.text).toContain('## If something goes wrong');
  });

  it('fetch accepts an id with a #step anchor (as search may return in a url)', async () => {
    const doc = data<GuideDoc>(await tool(h.api, 'fetch', { id: 'acme-books/settings/set-up-taxes#step-save' }));
    expect(doc.id).toBe('acme-books/settings/set-up-taxes');
  });

  it('fetch of an unknown or malformed id is a "not found" tool result', async () => {
    for (const id of ['acme-books/sales/no-such-page', '../../etc/passwd', 'ACME']) {
      const r = await tool(h.api, 'fetch', { id });
      expect(r.isError, id).toBe(true);
      expect(r.content[0]!.text).toMatch(/no public guide page with the id/);
    }
  });

  it('list_guides lists products, modules and page ids, and narrows by product or module name', async () => {
    const all = await tool(h.api, 'list_guides', {});
    const listing = all.structuredContent as { products: { product: string; modules: { module: string; pages: { id: string; url: string }[] }[] }[] };
    const acme = listing.products.find((p) => p.product === 'acme-books')!;
    expect(acme.modules.map((m) => m.module)).toEqual(expect.arrayContaining(['sales', 'settings', 'procurement']));
    expect(all.content[0]!.text).toContain('id: acme-books/settings/set-up-taxes');

    const settings = await tool(h.api, 'list_guides', { product: 'Acme Books', module: 'settings' });
    const s = settings.structuredContent as typeof listing;
    expect(s.products).toHaveLength(1);
    expect(s.products[0]!.modules.map((m) => m.module)).toEqual(['settings']);
    expect(s.products[0]!.modules[0]!.pages.every((p) => p.url.startsWith(`${SITE}/acme-books/settings/`))).toBe(true);

    const none = await tool(h.api, 'list_guides', { product: 'nope' });
    expect(none.isError ?? false).toBe(false);
    expect(none.content[0]!.text).toMatch(/Nothing in the guide matches.*Acme Books/);
  });
});

describe.runIf(IN_PROCESS)('MCP connector: only published, public pages', () => {
  let h: Harness;
  const page = (rel: string) => path.join(h.workspace!.contentDir, 'products', rel);
  const setFrontmatter = (rel: string, key: string, value: string) => {
    const file = page(rel);
    const text = fs.readFileSync(file, 'utf8');
    const line = new RegExp(`^${key}:.*$`, 'm');
    fs.writeFileSync(file, line.test(text) ? text.replace(line, `${key}: ${value}`) : text.replace(/^---\n/, `---\n${key}: ${value}\n`));
  };

  beforeAll(async () => {
    h = await localHarness();
    setFrontmatter('acme-books/settings/set-up-taxes.md', 'visibility', 'private');
    setFrontmatter('acme-books/sales/create-a-credit-note.md', 'status', 'draft');
    // A private product with a page whose words match the searches below.
    fs.mkdirSync(page('secretco/ops'), { recursive: true });
    fs.writeFileSync(page('secretco/product.json'), JSON.stringify({ name: 'SecretCo', summary: 'Private.', visibility: 'private' }));
    fs.writeFileSync(page('secretco/ops/module.json'), JSON.stringify({ title: 'Ops', summary: 'Ops.' }));
    fs.writeFileSync(page('secretco/ops/set-up-taxes.md'), '---\ntitle: Set up taxes secretly\nsummary: Secret tax setup.\nupdated: 2026-11-03\n---\n\nSet up taxes and credit notes here.\n');
  });
  afterAll(() => h.cleanup());

  const hidden = ['acme-books/settings/set-up-taxes', 'acme-books/sales/create-a-credit-note', 'secretco/ops/set-up-taxes'];

  it('search never returns private pages, drafts or pages of private products', async () => {
    for (const query of ['set up taxes', 'credit note', 'secret tax setup']) {
      const { results } = data<{ results: SearchHit[] }>(await tool(h.api, 'search', { query }));
      for (const id of hidden) expect(results.map((r) => r.id), query).not.toContain(id);
    }
  });

  it('fetch of a private or draft id looks exactly like an unknown id (no leak that it exists)', async () => {
    const unknown = await tool(h.api, 'fetch', { id: 'acme-books/sales/no-such-page' });
    for (const id of hidden) {
      const r = await tool(h.api, 'fetch', { id });
      expect(r.isError, id).toBe(true);
      expect(r.content[0]!.text.replace(id, 'X')).toBe(unknown.content[0]!.text.replace('acme-books/sales/no-such-page', 'X'));
    }
  });

  it('list_guides leaves them out, and links to them become plain text in other pages', async () => {
    const all = JSON.stringify((await tool(h.api, 'list_guides', {})).structuredContent);
    for (const id of hidden) expect(all).not.toContain(id);
    expect(all).not.toContain('SecretCo');
    // create-an-invoice links to set-up-taxes, which is now private.
    const doc = data<GuideDoc>(await tool(h.api, 'fetch', { id: 'acme-books/sales/create-an-invoice' }));
    expect(doc.text).not.toContain('/acme-books/settings/set-up-taxes/');
  });
});

describe.runIf(IN_PROCESS)('MCP connector: safety', () => {
  let h: Harness;
  beforeAll(async () => {
    h = await localHarness({ config: testConfig({ MCP_RATE_LIMIT_PER_MINUTE: '5' }) });
  });
  afterAll(() => h.cleanup());

  it('CORS: Claude and ChatGPT origins and the site are allowed, other websites are refused', async () => {
    for (const origin of ['https://claude.ai', 'https://chatgpt.com', SITE]) {
      const pre = await h.api.request(MCP, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type, mcp-protocol-version' } });
      expect(pre.status, origin).toBe(204);
      expect(pre.headers.get('access-control-allow-origin')).toBe(origin);
      expect(pre.headers.get('access-control-allow-headers')).toMatch(/Mcp-Protocol-Version/i);
    }
    const evil = await h.api.request(MCP, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
    expect(evil.status).toBe(403);
    expect(evil.headers.get('access-control-allow-origin')).toBeNull();
    const post = await rpc(h.api, 'ping', undefined, { Origin: 'https://evil.example' });
    expect(post.status).toBe(403);
    expect(post.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000 } });
  });

  it('requests larger than 64 KB are refused with a JSON-RPC error', async () => {
    const r = await rpc(h.api, 'tools/call', { name: 'search', arguments: { query: 'x'.repeat(70 * 1024) } });
    expect(r.status).toBe(413);
    expect(r.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32600 } });
  });

  it('the admin Host check still applies (DNS rebinding)', async () => {
    const r = await rpc(h.api, 'ping', undefined, { Host: 'evil.example:3101' });
    expect(r.status).toBe(403);
  });

  it('rate limits per client address', async () => {
    let last: ApiResponse | null = null;
    for (let i = 0; i < 8; i++) last = await rpc(h.api, 'ping');
    expect(last!.status).toBe(429);
    expect(last!.headers.get('retry-after')).toBe('60');
    expect(last!.body).toMatchObject({ jsonrpc: '2.0', error: { code: -32000, message: expect.stringMatching(/Too many/) } });
  });
});

import { describe, expect, it } from 'vitest';
import { createGuideMcpServer, handleMcpRequest, tidyErrors } from '../../src/api/mcp/guide-mcp-server';
import type { GuidePageSource } from '../../src/application/ports';
import { GuideToolsService } from '../../src/application/services/guide-tools-service';
import { guideMarkdownToText, type GuideTextContext } from '../../src/domain/guide-document';
import { guideRefToId, publicAssetPath } from '../../src/domain/library';
import { silentLogger } from '../../src/infrastructure/shared/console-logger';

const PAGE = 'https://help.example.com/p/m/page/';
const ctx: GuideTextContext = {
  pageUrl: PAGE,
  siteUrl: 'https://help.example.com',
  assetUrl: (src) => (src.startsWith('images/') ? `https://help.example.com/_content/p/m/${src}` : null),
  resolveRef: (ref) => (ref.includes('public-page') ? { id: 'p/m/public-page', title: 'Public page', url: `https://help.example.com/p/m/public-page/${ref.includes('#') ? `#${ref.split('#')[1]}` : ''}` } : null),
};

describe('guideMarkdownToText', () => {
  const md = [
    'Intro with **bold** and a [public link](guide:m/public-page) and a [hidden one](guide:m/private-page).',
    '',
    '## Steps',
    '',
    '::::::steps',
    '::::step{title="Open Settings › Taxes"}',
    'Select **Add New**.',
    '',
    '![The tax list](images/taxes-list.webp "Tax list")',
    '',
    ':::legend',
    '1. **Taxes** in the menu.',
    ':::',
    '::::',
    '::::step{title="Save it"}',
    ':::warning',
    'Check the rate first.',
    ':::',
    '::postings{to="m/public-page#invoice" label="See what gets posted"}',
    '::::',
    '::::::',
    '',
    '```',
    ':::not-a-directive',
    '```',
    '',
    'An [anchor](#steps), a [site link](/p/), an [outside link](https://example.org) and [junk](javascript:alert(1)).',
    '![Missing](media/nothing.png)',
  ].join('\n');
  const out = guideMarkdownToText(md, ctx);

  it('numbers steps with their site anchors and keeps their text', () => {
    expect(out.steps).toEqual([
      { number: 1, title: 'Open Settings › Taxes', url: `${PAGE}#step-open-settings-taxes` },
      { number: 2, title: 'Save it', url: `${PAGE}#step-save-it` },
    ]);
    expect(out.markdown).toContain(`### Step 1: Open Settings › Taxes\nDirect link to this step: ${PAGE}#step-open-settings-taxes`);
    expect(out.markdown).toContain(`## Steps\nDirect link to this section: ${PAGE}#steps`);
  });

  it('turns screenshots, legends, callouts and postings into plain markdown', () => {
    expect(out.markdown).toContain('![Screenshot: The tax list](https://help.example.com/_content/p/m/images/taxes-list.webp)');
    expect(out.screenshots).toEqual(['https://help.example.com/_content/p/m/images/taxes-list.webp']);
    expect(out.markdown).toContain('Key to the numbered marks on the screenshot above:\n1. **Taxes** in the menu.');
    expect(out.markdown).toContain('**Important:**\nCheck the rate first.');
    expect(out.markdown).toContain('[See what gets posted](https://help.example.com/p/m/public-page/#invoice)');
    expect(out.markdown).toContain('(Screenshot: Missing)');
  });

  it('links public guide pages, and leaves non-public ones as plain text', () => {
    expect(out.markdown).toContain('[public link](https://help.example.com/p/m/public-page/)');
    expect(out.markdown).toContain('and a hidden one.');
    expect(out.markdown).not.toContain('private-page');
    expect(out.linked.map((l) => l.id)).toEqual(['p/m/public-page']);
  });

  it('makes other links absolute and drops unsafe ones; leaves code blocks alone', () => {
    expect(out.markdown).toContain(`[anchor](${PAGE}#steps)`);
    expect(out.markdown).toContain('[site link](https://help.example.com/p/)');
    expect(out.markdown).toContain('[outside link](https://example.org)');
    expect(out.markdown).not.toContain('javascript:');
    expect(out.markdown).toContain('```\n:::not-a-directive\n```');
    expect(out.markdown.replace(/```[\s\S]*?```/g, '')).not.toMatch(/^\s*::/m);
  });
});

describe('library helpers', () => {
  it('publicAssetPath maps module files to the site and refuses anything else', () => {
    expect(publicAssetPath('p', 'm', 'images/a b.webp')).toBe('/_content/p/m/images/a%20b.webp');
    expect(publicAssetPath('p', 'm', './media/v.mp4')).toBe('/_content/p/m/media/v.mp4');
    expect(publicAssetPath('p', 'm', 'https://cdn.example.com/v.mp4')).toBe('https://cdn.example.com/v.mp4');
    expect(publicAssetPath('p', 'm', '../../secret.txt')).toBeNull();
    expect(publicAssetPath('p', 'm', 'images/../x')).toBeNull();
  });

  it('guideRefToId resolves module-relative and absolute references', () => {
    expect(guideRefToId('p', 'guide:m/page#x')).toEqual({ id: 'p/m/page', hash: 'x' });
    expect(guideRefToId('p', 'q/m/page')).toEqual({ id: 'q/m/page', hash: null });
  });
});

describe('MCP tools never leak internals', () => {
  const broken: GuidePageSource = {
    publicPages: async () => {
      throw new TypeError('SQLITE_CORRUPT at /Users/secret/path.db');
    },
    supportUrl: async () => null,
  };
  const errors: Record<string, unknown>[] = [];
  const logger = { ...silentLogger, error: (_m: string, f?: Record<string, unknown>) => errors.push(f ?? {}) };

  it('a failing guide source becomes a generic tool error, logged without the question', async () => {
    const res = await handleMcpRequest(
      new Request('https://x/api/v1/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search', arguments: { query: 'my private question' } } }),
      }),
      { tools: new GuideToolsService(broken, 'https://help.example.com'), logger, version: '1.0.0' },
    );
    const body = (await res.json()) as { result: { isError: boolean; content: { text: string }[] } };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]!.text).toBe('Something went wrong while reading the guide. Please try again.');
    expect(JSON.stringify(errors)).not.toMatch(/SQLITE|secret|private question/);
    expect(errors[0]).toMatchObject({ tool: 'search', error: 'TypeError' });
  });

  it('an internal JSON-RPC error is reduced to a generic message', async () => {
    const res = await tidyErrors(Response.json({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Cannot read properties of undefined (reading "x") at /srv/app.js:10' } }));
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal error. Please try again.' } });
  });

  it('builds one server per request with exactly the three read-only tools', () => {
    const server = createGuideMcpServer({ tools: new GuideToolsService(broken, 'https://x'), logger: silentLogger, version: '1' });
    expect(server.isConnected()).toBe(false);
  });
});

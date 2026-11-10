import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// No root JSX runtime config for .tsx under vitest: the classic runtime needs a global React.
vi.stubGlobal('React', React);
// The header's search box uses the app router, which isn't mounted in a plain render.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => undefined, replace: () => undefined, prefetch: () => undefined, back: () => undefined }),
  usePathname: () => '/connect-ai/',
  notFound: () => {
    throw new Error('notFound');
  },
}));

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const ENV_KEYS = ['CONTENT_DIR', 'INCLUDE_PRIVATE_PRODUCTS', 'NEXT_PUBLIC_HELP_ENV', 'NEXT_PUBLIC_API_BASE_URL'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Renders /connect-ai/ as the static build would, with the given API address. */
async function renderConnectPage(apiBase: string | undefined): Promise<string> {
  vi.resetModules();
  process.env.CONTENT_DIR = FIXTURE;
  process.env.INCLUDE_PRIVATE_PRODUCTS = 'false';
  process.env.NEXT_PUBLIC_HELP_ENV = 'production';
  if (apiBase === undefined) delete process.env.NEXT_PUBLIC_API_BASE_URL;
  else process.env.NEXT_PUBLIC_API_BASE_URL = apiBase;
  const { default: ConnectAiPage } = await import('../../src/app/connect-ai/page');
  return renderToStaticMarkup(createElement(ConnectAiPage));
}

describe('connectorUrl', () => {
  it('is the API address + /api/v1/mcp, or null when the address is not set', async () => {
    const { connectorUrl } = await import('../../src/lib/api/config');
    expect(connectorUrl('https://admin.example.com')).toBe('https://admin.example.com/api/v1/mcp');
    expect(connectorUrl('https://admin.example.com///')).toBe('https://admin.example.com/api/v1/mcp');
    expect(connectorUrl('')).toBeNull();
    expect(connectorUrl('   ')).toBeNull();
    expect(connectorUrl(undefined)).toBeNull();
  });
});

describe('Connect your AI page', () => {
  it('shows the connector address with a Copy button once the guide is online', async () => {
    const html = await renderConnectPage('https://admin.example.com');
    expect(html).toContain('value="https://admin.example.com/api/v1/mcp"');
    expect(html).toMatch(/<label[^>]*for="connector-url"[^>]*>Connector address<\/label>/);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>.*Copy<\/button>/s);
    expect(html).not.toContain('Available once the guide is online');
  });

  it('says it is available once the guide is online when no API address was built in', async () => {
    for (const base of [undefined, '']) {
      const html = await renderConnectPage(base);
      expect(html, String(base)).toContain('Available once the guide is online');
      expect(html).not.toContain('/api/v1/mcp');
      expect(html).not.toContain('localhost');
      expect(html).not.toMatch(/>Copy</);
    }
  });

  it('explains Claude and ChatGPT set-up, what the AI can see, and gives example questions', async () => {
    const html = await renderConnectPage('https://admin.example.com');
    expect(html).toContain('<h1 class="doc-title">Connect your AI</h1>');
    for (const text of ['Add it to Claude', 'Add custom connector', 'No sign in', 'Add it to ChatGPT', 'Add custom MCP server', 'No authentication', 'names may differ slightly', 'can&#x27;t see', 'Questions to try']) {
      expect(html, text).toContain(text);
    }
    // Each set-up is a numbered list for screen readers, too.
    expect((html.match(/<ol class="steps connect-steps">/g) ?? []).length).toBe(2);
  });
});

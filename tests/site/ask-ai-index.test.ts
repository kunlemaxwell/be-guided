import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const ENV_KEYS = ['CONTENT_DIR', 'INCLUDE_PRIVATE_PRODUCTS', 'NEXT_PUBLIC_HELP_ENV'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

interface IndexPage {
  id: string;
  productName?: string;
  productVisibility?: string;
  moduleTitle?: string;
  prerequisites?: unknown[];
  video?: unknown;
  body: string;
}

/**
 * /ask-ai/pages.json is what Ask AI and the "Connect your AI" (MCP)
 * connector read on Cloudflare: public pages only, with the names and
 * frontmatter the connector needs to build full pages.
 */
describe('/ask-ai/pages.json in a public build', () => {
  it('lists only published, public pages of public products, with display names', async () => {
    vi.resetModules();
    process.env.CONTENT_DIR = FIXTURE;
    process.env.INCLUDE_PRIVATE_PRODUCTS = 'false';
    process.env.NEXT_PUBLIC_HELP_ENV = 'production';
    const { GET } = await import('../../src/app/ask-ai/pages.json/route');
    const index = (await GET().json()) as { pages: IndexPage[] };
    expect(index.pages.map((p) => p.id).sort()).toEqual(['alpha/sales/open-page', 'alpha/sales/public-setup']);
    for (const p of index.pages) {
      expect(p).toMatchObject({ productName: 'Alpha', productVisibility: 'public' });
      expect(typeof p.moduleTitle).toBe('string');
      expect(Array.isArray(p.prerequisites)).toBe(true);
      expect(p.body.length).toBeGreaterThan(0);
    }
  });
});

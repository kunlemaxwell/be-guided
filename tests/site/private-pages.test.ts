import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

// There is no root vitest config (owned elsewhere), so .tsx compiles with the classic
// JSX runtime, which expects a global React.
vi.stubGlobal('React', React);

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const ENV_KEYS = ['CONTENT_DIR', 'INCLUDE_PRIVATE_PRODUCTS', 'NEXT_PUBLIC_HELP_ENV'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

/** Loads the content loader fresh, with config read from the given environment. */
async function loadWith(env: { includePrivate: boolean; helpEnv: 'local' | 'production' }) {
  vi.resetModules();
  process.env.CONTENT_DIR = FIXTURE;
  process.env.INCLUDE_PRIVATE_PRODUCTS = env.includePrivate ? 'true' : 'false';
  process.env.NEXT_PUBLIC_HELP_ENV = env.helpEnv;
  return import('../../src/lib/content/load');
}

async function renderPage(env: { includePrivate: boolean; helpEnv: 'local' | 'production' }): Promise<string> {
  const load = await loadWith(env);
  const { GuideMarkdown } = await import('../../src/components/guide/GuideMarkdown');
  const page = load.getPage('alpha', 'sales', 'open-page');
  if (!page) throw new Error('fixture page missing');
  return renderToStaticMarkup(createElement(GuideMarkdown, { page }));
}

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('private pages in a public build', () => {
  const PUBLIC = { includePrivate: false, helpEnv: 'production' } as const;

  it('leaves private pages, private products and drafts out of every listing', async () => {
    const load = await loadWith(PUBLIC);
    const ids = load.getAllPages().map((p) => p.id).sort();
    expect(ids).toEqual(['alpha/sales/open-page', 'alpha/sales/public-setup']);
    expect(load.getModule('alpha', 'sales')?.pages.map((p) => p.slug)).toEqual(['open-page', 'public-setup']);
    expect(load.getProducts().map((p) => p.slug)).toEqual(['alpha']);
    expect(load.getPage('alpha', 'sales', 'hidden-setup')).toBeUndefined();
  });

  it('does not resolve links to excluded pages, and marks them excluded (not broken)', async () => {
    const load = await loadWith(PUBLIC);
    expect(load.resolveGuideRef('alpha', 'sales/hidden-setup')).toBeNull();
    expect(load.isExcludedRef('alpha', 'sales/hidden-setup')).toBe(true);
    expect(load.isExcludedRef('alpha', 'guide:sales/hidden-setup#section')).toBe(true);
    expect(load.isExcludedRef('alpha', 'secret/stuff/inside')).toBe(true);
    expect(load.isExcludedRef('alpha', 'sales/draft-page')).toBe(true);
    expect(load.isExcludedRef('alpha', 'sales/does-not-exist')).toBe(false);
    expect(load.isExcludedRef('alpha', 'sales/public-setup')).toBe(false);
  });

  it('reports only genuinely missing pages as broken references', async () => {
    const load = await loadWith(PUBLIC);
    expect(load.findBrokenRefs()).toEqual([{ page: 'alpha/sales/open-page', ref: 'sales/does-not-exist' }]);
  });

  it('renders links to excluded pages as plain text, with no link, title or broken style', async () => {
    const html = await renderPage(PUBLIC);
    expect(html).toContain('the hidden setup');
    expect(html).toContain('a secret page');
    expect(html).toContain('a draft');
    expect(html).not.toMatch(/hidden-setup|secret\/stuff|draft-page/);
    expect(html).not.toContain('See hidden postings');
    // The public link still works; the missing page keeps its "broken" marker for authors.
    expect(html).toMatch(/<a class="glink" href="\/alpha\/sales\/public-setup\/\?/);
    expect((html.match(/glink--broken/g) ?? []).length).toBe(1);
    expect(html).toContain('a missing page');
  });
});

describe('private pages when private content is included', () => {
  const PRIVATE = { includePrivate: true, helpEnv: 'production' } as const;

  it('includes private pages and private products, but still not drafts in production', async () => {
    const load = await loadWith(PRIVATE);
    const ids = load.getAllPages().map((p) => p.id).sort();
    expect(ids).toEqual(['alpha/sales/hidden-setup', 'alpha/sales/open-page', 'alpha/sales/public-setup', 'secret/stuff/inside']);
    expect(load.resolveGuideRef('alpha', 'sales/hidden-setup')?.href).toBe('/alpha/sales/hidden-setup/');
    expect(load.isExcludedRef('alpha', 'sales/hidden-setup')).toBe(false);
  });

  it('links to the private page normally', async () => {
    const html = await renderPage(PRIVATE);
    expect(html).toMatch(/href="\/alpha\/sales\/hidden-setup\/\?/);
    expect(html).toContain('See hidden postings');
  });
});

describe('drafts while previewing locally', () => {
  it('shows drafts but still hides private pages', async () => {
    const load = await loadWith({ includePrivate: false, helpEnv: 'local' });
    const ids = load.getAllPages().map((p) => p.id).sort();
    expect(ids).toEqual(['alpha/sales/draft-page', 'alpha/sales/open-page', 'alpha/sales/public-setup']);
  });
});

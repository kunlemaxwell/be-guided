import path from 'node:path';
import * as React from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSearchDocuments, isSearchable, plainText, sectionsOf } from '../../src/lib/search/documents';
import { fromPagefind, loadFallback } from '../../src/lib/search/engine';
import { highlight, parseExcerpt, queryTerms, searchDocuments, snippetAround } from '../../src/lib/search/match';
import {
  actionForKey,
  chosenResult,
  initialSearchState,
  isSearchShortcut,
  searchReducer,
  type SearchAction,
  type SearchState,
} from '../../src/lib/search/state';
import type { SearchDoc, SearchResult } from '../../src/lib/search/types';

// .tsx compiles with the classic JSX runtime under vitest, which expects a global React.
vi.stubGlobal('React', React);

const FIXTURE = path.resolve(__dirname, 'fixtures/content');
const ENV_KEYS = ['CONTENT_DIR', 'INCLUDE_PRIVATE_PRODUCTS', 'NEXT_PUBLIC_HELP_ENV'] as const;
const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

async function loadWith(env: { includePrivate: boolean; helpEnv: 'local' | 'production' }) {
  vi.resetModules();
  process.env.CONTENT_DIR = FIXTURE;
  process.env.INCLUDE_PRIVATE_PRODUCTS = env.includePrivate ? 'true' : 'false';
  process.env.NEXT_PUBLIC_HELP_ENV = env.helpEnv;
  return import('../../src/lib/content/load');
}

const DOCS: SearchDoc[] = [
  {
    id: 'p/sales/create-an-invoice',
    href: '/p/sales/create-an-invoice/',
    title: 'Create an invoice',
    summary: 'Bill a customer for goods or services.',
    productName: 'Acme Books',
    moduleTitle: 'Sales',
    sections: [
      { anchor: null, heading: '', text: 'Invoices are how you bill customers.' },
      { anchor: 'step-fill-in-the-details', heading: 'Fill in the details', text: 'Choose the currency and the exchange rate for foreign invoices.' },
    ],
  },
  {
    id: 'p/settings/set-up-taxes',
    href: '/p/settings/set-up-taxes/',
    title: 'Set up taxes',
    summary: 'Add VAT and other taxes.',
    productName: 'Acme Books',
    moduleTitle: 'Settings',
    sections: [{ anchor: 'step-save', heading: 'Save', text: 'Select Save. The tax can now be added to an invoice.' }],
  },
];

describe('search index source', () => {
  it('keeps private pages, private products and drafts out, even in an internal preview build', async () => {
    const load = await loadWith({ includePrivate: true, helpEnv: 'local' });
    // The preview build shows them all…
    expect(load.getAllPages().map((p) => p.id).sort()).toEqual([
      'alpha/sales/draft-page',
      'alpha/sales/hidden-setup',
      'alpha/sales/open-page',
      'alpha/sales/public-setup',
      'secret/stuff/inside',
    ]);
    // …but search never indexes them.
    const docs = buildSearchDocuments(load.getProducts(), load.pageHref);
    expect(docs.map((d) => d.id).sort()).toEqual(['alpha/sales/open-page', 'alpha/sales/public-setup']);
    expect(JSON.stringify(docs)).not.toMatch(/Hidden body|Secret body|Draft body/);
  });

  it('indexes the public pages of a public build with title, crumb and link', async () => {
    const load = await loadWith({ includePrivate: false, helpEnv: 'production' });
    const docs = buildSearchDocuments(load.getProducts(), load.pageHref);
    expect(docs.find((d) => d.id === 'alpha/sales/public-setup')).toMatchObject({
      href: '/alpha/sales/public-setup/',
      title: 'Public setup',
      productName: 'Alpha',
      sections: [{ anchor: null, heading: '', text: 'Public body.' }],
    });
  });

  it('isSearchable needs a public product, a public page and published status', () => {
    expect(isSearchable({ visibility: 'public' }, { visibility: 'public', status: 'published' })).toBe(true);
    expect(isSearchable({ visibility: 'private' }, { visibility: 'public', status: 'published' })).toBe(false);
    expect(isSearchable({ visibility: 'public' }, { visibility: 'private', status: 'published' })).toBe(false);
    expect(isSearchable({ visibility: 'public' }, { visibility: 'public', status: 'draft' })).toBe(false);
  });

  it('splits a page into sections with the anchors the page renders', () => {
    const body = [
      'Intro with a [link](guide:sales/x) and **bold**.',
      '',
      '## What it does',
      'Some text.',
      '::::::steps',
      '::::step{title="Open Sales › Invoices"}',
      'Select **Invoices**.',
      '![Screenshot](images/x.webp)',
      ':::legend',
      '1. **New Invoice**.',
      ':::',
      '::::',
      '::postings{to="accounting/x" label="See postings"}',
      '```',
      '## not a heading',
      '```',
      '| A | B |',
      '| --- | --- |',
      '| one | two |',
    ].join('\n');
    expect(sectionsOf(body)).toEqual([
      { anchor: null, heading: '', text: 'Intro with a link and bold.' },
      { anchor: 'what-it-does', heading: 'What it does', text: 'Some text.' },
      { anchor: 'step-open-sales-invoices', heading: 'Open Sales › Invoices', text: 'Select Invoices. New Invoice. A B one two' },
    ]);
  });

  it('plainText strips markdown, images and stray html', () => {
    expect(plainText('- See ![x](a.png) the <b>[Guide](guide:a/b)</b> `code`')).toBe('See the Guide code');
  });
});

describe('in-browser search (preview and backup)', () => {
  it('needs every word to match, and ranks title hits first', () => {
    expect(searchDocuments(DOCS, 'invoice').map((r) => r.title)).toEqual(['Create an invoice', 'Set up taxes']);
    expect(searchDocuments(DOCS, 'tax invoice').map((r) => r.title)).toEqual(['Set up taxes']);
    expect(searchDocuments(DOCS, 'nothing here')).toEqual([]);
    expect(searchDocuments(DOCS, '   ')).toEqual([]);
  });

  it('points at the step that matches, with a highlighted snippet and a crumb', () => {
    const [r] = searchDocuments(DOCS, 'exchange rate');
    expect(r).toMatchObject({ href: '/p/sales/create-an-invoice/#step-fill-in-the-details', crumb: 'Acme Books › Sales' });
    expect(r?.snippet.filter((p) => p.hit).map((p) => p.text)).toEqual(['exchange', 'rate']);
  });

  it('matches word starts only and ignores punctuation in the query', () => {
    expect(queryTerms('Exchange-rate, VAT!')).toEqual(['exchange', 'rate', 'vat']);
    expect(highlight('the tax and syntax', ['tax'])).toEqual([
      { text: 'the ', hit: false },
      { text: 'tax', hit: true },
      { text: ' and syntax', hit: false },
    ]);
  });

  it('trims long text around the first hit', () => {
    const text = `${'word '.repeat(60)}needle ${'more '.repeat(60)}`;
    const s = snippetAround(text.trim(), ['needle']);
    expect(s.startsWith('… ')).toBe(true);
    expect(s.endsWith(' …')).toBe(true);
    expect(s).toContain('needle');
    expect(s.length).toBeLessThan(180);
  });

  it('turns a Pagefind excerpt into text runs, never HTML', () => {
    expect(parseExcerpt('Set the <mark>exchange</mark> rate &amp; <img src=x onerror=alert(1)>save')).toEqual([
      { text: 'Set the ', hit: false },
      { text: 'exchange', hit: true },
      { text: ' rate & save', hit: false },
    ]);
  });

  it('maps a Pagefind result to the section that matched', () => {
    const r = fromPagefind(
      {
        url: '/p/sales/create-an-invoice/',
        excerpt: 'Bill a <mark>customer</mark>.',
        meta: { title: 'Create an invoice', product: 'Acme Books', module: 'Sales' },
        sub_results: [
          { url: '/p/sales/create-an-invoice/', excerpt: 'Bill a customer.' },
          { url: '/p/sales/create-an-invoice/#step-choose', excerpt: 'Choose the <mark>customer</mark>.' },
        ],
      },
      'abc',
    );
    expect(r).toEqual({
      id: 'abc#step-choose',
      href: '/p/sales/create-an-invoice/#step-choose',
      title: 'Create an invoice',
      crumb: 'Acme Books › Sales',
      snippet: [
        { text: 'Choose the ', hit: false },
        { text: 'customer', hit: true },
        { text: '.', hit: false },
      ],
    });
  });

  it('loads the backup index, and fails clearly when it is missing or malformed', async () => {
    const ok = vi.fn(async () => new Response(JSON.stringify({ docs: DOCS }), { status: 200 }));
    const engine = await loadFallback(ok as unknown as typeof fetch);
    expect((await engine.search('taxes')).map((r) => r.title)).toEqual(['Set up taxes']);
    expect(ok).toHaveBeenCalledWith('/search/index.json', expect.anything());

    const missing = vi.fn(async () => new Response('nope', { status: 404 }));
    await expect(loadFallback(missing as unknown as typeof fetch)).rejects.toThrow(/unavailable/);
    const bad = vi.fn(async () => new Response(JSON.stringify({ pages: [] }), { status: 200 }));
    await expect(loadFallback(bad as unknown as typeof fetch)).rejects.toThrow(/malformed/);
  });
});

const RESULTS: SearchResult[] = searchDocuments(DOCS, 'invoice');

function run(actions: SearchAction[], from: SearchState = initialSearchState): SearchState {
  return actions.reduce(searchReducer, from);
}

describe('search box behaviour', () => {
  it('goes idle → loading → results as you type, and highlights the first result', () => {
    const typing = run([{ type: 'type', query: 'i' }]);
    expect(typing).toMatchObject({ status: 'idle', open: true });
    const loading = run([{ type: 'type', query: 'invoice' }], typing);
    expect(loading.status).toBe('loading');
    const done = searchReducer(loading, { type: 'loaded', seq: loading.seq, results: RESULTS });
    expect(done).toMatchObject({ status: 'done', active: 0 });
  });

  it('drops answers to older queries', () => {
    const first = run([{ type: 'type', query: 'inv' }]);
    const second = searchReducer(first, { type: 'type', query: 'invoice' });
    expect(searchReducer(second, { type: 'loaded', seq: first.seq, results: RESULTS })).toBe(second);
    expect(searchReducer(second, { type: 'failed', seq: first.seq })).toBe(second);
    expect(searchReducer(second, { type: 'failed', seq: second.seq }).status).toBe('error');
  });

  it('moves with the arrow keys (wrapping) and Enter opens the highlighted result', () => {
    const loading = run([{ type: 'type', query: 'invoice' }]);
    let s = searchReducer(loading, { type: 'loaded', seq: loading.seq, results: RESULTS });
    expect(actionForKey('ArrowDown', s)).toEqual({ type: 'move', delta: 1 });
    s = searchReducer(s, { type: 'move', delta: 1 });
    expect(chosenResult(s)?.title).toBe('Set up taxes');
    s = searchReducer(s, { type: 'move', delta: 1 });
    expect(s.active).toBe(0);
    s = searchReducer(s, { type: 'move', delta: -1 });
    expect(s.active).toBe(1);
    expect(actionForKey('Enter', s)).toBe('go');
    expect(searchReducer(s, { type: 'activate', index: 0 }).active).toBe(0);
    expect(searchReducer(s, { type: 'activate', index: 9 })).toBe(s);
  });

  it('Escape closes the list first, then clears the box', () => {
    const loading = run([{ type: 'type', query: 'invoice' }]);
    let s = searchReducer(loading, { type: 'loaded', seq: loading.seq, results: RESULTS });
    const esc1 = actionForKey('Escape', s);
    expect(esc1).toEqual({ type: 'close' });
    s = searchReducer(s, esc1 as SearchAction);
    const esc2 = actionForKey('Escape', s);
    expect(esc2).toEqual({ type: 'clear' });
    s = searchReducer(s, esc2 as SearchAction);
    expect(s).toMatchObject({ query: '', results: [], status: 'idle' });
    expect(actionForKey('Enter', s)).toBeNull();
  });

  it('"/" and Ctrl/⌘ K jump to search, but "/" while typing elsewhere does not', () => {
    const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => ({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });
    expect(isSearchShortcut(key('/'), { tagName: 'BODY' })).toBe(true);
    expect(isSearchShortcut(key('/'), { tagName: 'INPUT' })).toBe(false);
    expect(isSearchShortcut(key('/'), { tagName: 'DIV', isContentEditable: true })).toBe(false);
    expect(isSearchShortcut(key('k', { ctrlKey: true }), { tagName: 'TEXTAREA' })).toBe(true);
    expect(isSearchShortcut(key('K', { metaKey: true }), null)).toBe(true);
    expect(isSearchShortcut(key('k'), null)).toBe(false);
  });
});

describe('search results drop-down', () => {
  async function render(state: SearchState): Promise<string> {
    const { SearchResults } = await import('../../src/components/search/SearchResults');
    return renderToStaticMarkup(
      createElement(SearchResults, { state, listboxId: 'lb', optionId: (i: number) => `opt-${i}`, onPick: () => undefined, onHover: () => undefined, onRetry: () => undefined }),
    );
  }
  const base: SearchState = { ...initialSearchState, open: true };

  it('loading: says it is searching, no options', async () => {
    const html = await render({ ...base, query: 'invoice', status: 'loading' });
    expect(html).toContain('Searching…');
    expect(html).not.toContain('role="option"');
    expect(html).toMatch(/role="status"/);
  });

  it('empty: says nothing matched and suggests Ask AI', async () => {
    const html = await render({ ...base, query: 'zzz', status: 'done', results: [] });
    expect(html).toContain('No guides match “zzz”');
    expect(html).toContain('Ask AI');
  });

  it('error: explains and offers Try again', async () => {
    const html = await render({ ...base, query: 'invoice', status: 'error' });
    expect(html).toContain('Search isn’t working right now.');
    expect(html).toContain('Try again');
  });

  it('success: a listbox of options with crumb, title, highlighted snippet and the active one selected', async () => {
    const html = await render({ ...base, query: 'invoice', status: 'done', results: RESULTS, active: 1 });
    expect(html).toContain('role="listbox"');
    expect(html.match(/role="option"/g)).toHaveLength(2);
    expect(html).toMatch(/id="opt-1"[^>]*aria-selected="true"/);
    expect(html).toMatch(/id="opt-0"[^>]*aria-selected="false"/);
    expect(html).toContain('Acme Books › Sales');
    expect(html).toContain('<mark>invoice</mark>');
    expect(html).toContain('href="/p/sales/create-an-invoice'); // next/link drops the trailing slash outside the app's trailingSlash config
  });

  it('shows snippet text as text, never as HTML', async () => {
    const evil: SearchResult = { id: 'x', href: '/x/', title: '<b>t</b>', crumb: 'A › B', snippet: [{ text: '<img src=x onerror=alert(1)>', hit: false }] };
    const html = await render({ ...base, query: 'x x', status: 'done', results: [evil], active: 0 });
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });

  it('idle: asks for more letters', async () => {
    expect(await render({ ...base, query: 'i', status: 'idle' })).toContain('Type at least 2 letters');
  });
});

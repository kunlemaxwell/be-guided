import { parseExcerpt, searchDocuments } from './match';
import { MAX_RESULTS, SEARCH_INDEX_PATH, type SearchDoc, type SearchResult } from './types';

/**
 * Where search results come from, chosen once per page load:
 * - the published site: the Pagefind index built into /pagefind/ after `next build`;
 * - previewing (`npm run dev`), or if that index can't load: /search/index.json,
 *   searched in the browser (see match.ts).
 * The search box only sees this interface, so swapping engines touches one file.
 */
export interface SearchEngine {
  search(query: string): Promise<SearchResult[]>;
}

/** The part of Pagefind's browser API this site uses (pagefind@1.5). */
interface PagefindSubResult {
  url: string;
  excerpt: string;
}
interface PagefindData {
  url: string;
  excerpt: string;
  meta: Record<string, string | undefined>;
  sub_results?: PagefindSubResult[];
}
interface PagefindModule {
  options?: (o: Record<string, unknown>) => Promise<void>;
  init?: () => Promise<void>;
  search: (q: string) => Promise<{ results: { id: string; data: () => Promise<PagefindData> }[] } | null>;
}

const PAGEFIND_URL = '/pagefind/pagefind.js';

function isPagefind(mod: unknown): mod is PagefindModule {
  return typeof mod === 'object' && mod !== null && typeof (mod as { search?: unknown }).search === 'function';
}

/** The best place on the page for a Pagefind hit: the first section whose excerpt has a highlight. */
function pickTarget(data: PagefindData): { url: string; excerpt: string } {
  const sub = data.sub_results?.find((s) => s.url.includes('#') && s.excerpt.includes('<mark>'));
  return sub ? { url: sub.url, excerpt: sub.excerpt } : { url: data.url, excerpt: data.excerpt };
}

export function fromPagefind(data: PagefindData, id: string): SearchResult {
  const target = pickTarget(data);
  const crumb = [data.meta.product, data.meta.module].filter(Boolean).join(' › ');
  return {
    id: target.url === data.url ? id : `${id}${target.url.slice(target.url.indexOf('#'))}`,
    href: target.url,
    title: data.meta.title ?? data.url,
    crumb,
    snippet: parseExcerpt(target.excerpt),
  };
}

async function loadPagefind(): Promise<SearchEngine> {
  const mod: unknown = await import(/* webpackIgnore: true */ PAGEFIND_URL);
  if (!isPagefind(mod)) throw new Error('Pagefind index is not usable');
  await mod.options?.({ excerptLength: 24 });
  await mod.init?.();
  return {
    async search(query) {
      const found = await mod.search(query);
      if (!found) return [];
      const top = found.results.slice(0, MAX_RESULTS);
      return Promise.all(top.map(async (r) => fromPagefind(await r.data(), r.id)));
    },
  };
}

function isDocList(v: unknown): v is { docs: SearchDoc[] } {
  return typeof v === 'object' && v !== null && Array.isArray((v as { docs?: unknown }).docs);
}

export async function loadFallback(fetchImpl: typeof fetch = fetch): Promise<SearchEngine> {
  const res = await fetchImpl(SEARCH_INDEX_PATH, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Search index unavailable (${res.status})`);
  const body: unknown = await res.json();
  if (!isDocList(body)) throw new Error('Search index is malformed');
  const docs = body.docs;
  return { search: async (query) => searchDocuments(docs, query) };
}

let pending: Promise<SearchEngine> | null = null;

/** Loads the engine once; a failed load is retried on the next call. */
export function getSearchEngine(): Promise<SearchEngine> {
  pending ??= (process.env.NODE_ENV === 'production' ? loadPagefind().catch(() => loadFallback()) : loadFallback()).catch(
    (err: unknown) => {
      pending = null;
      throw err;
    },
  );
  return pending;
}

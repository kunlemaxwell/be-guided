import { MAX_RESULTS, type SearchDoc, type SearchResult, type SnippetPart } from './types';

/**
 * The search used while previewing (no Pagefind index yet) and as a backup if
 * the index can't be loaded: every word of the query must appear in the page;
 * title and heading hits rank above body hits.
 */

const SNIPPET_CHARS = 160;

export function queryTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0))];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Splits text into plain and highlighted runs for the given terms (word starts only). */
export function highlight(text: string, terms: string[]): SnippetPart[] {
  if (terms.length === 0 || !text) return text ? [{ text, hit: false }] : [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(${terms.map(escapeRegExp).join('|')})`, 'giu');
  const parts: SnippetPart[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), hit: false });
    parts.push({ text: m[0], hit: true });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), hit: false });
  return parts;
}

/** About SNIPPET_CHARS of text around the first hit, cut at word boundaries. */
export function snippetAround(text: string, terms: string[]): string {
  if (text.length <= SNIPPET_CHARS) return text;
  const lower = text.toLowerCase();
  const first = Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0), Number.MAX_SAFE_INTEGER);
  const center = first === Number.MAX_SAFE_INTEGER ? 0 : first;
  let start = Math.max(0, center - 50);
  let end = Math.min(text.length, start + SNIPPET_CHARS);
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(' ', end) > start ? text.lastIndexOf(' ', end) : end;
  return `${start > 0 ? '… ' : ''}${text.slice(start, end).trim()}${end < text.length ? ' …' : ''}`;
}

function countHits(text: string, terms: string[]): number {
  const lower = text.toLowerCase();
  return terms.filter((t) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(t)}`, 'u').test(lower)).length;
}

export function searchDocuments(docs: SearchDoc[], query: string, limit = MAX_RESULTS): SearchResult[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];

  const scored: { score: number; result: SearchResult }[] = [];
  for (const doc of docs) {
    const all = [doc.title, doc.summary, ...doc.sections.flatMap((s) => [s.heading, s.text])].join(' ');
    if (countHits(all, terms) < terms.length) continue;

    // The part of the page that matches best decides the snippet and the anchor.
    let best = { anchor: null as string | null, text: doc.summary, score: countHits(doc.summary, terms) };
    for (const s of doc.sections) {
      const score = countHits(s.heading, terms) * 2 + countHits(s.text, terms);
      if (score > best.score) best = { anchor: s.anchor, text: s.text || s.heading, score };
    }
    const score = countHits(doc.title, terms) * 6 + countHits(doc.summary, terms) * 2 + best.score;
    const anchor = best.anchor && countHits(doc.title, terms) < terms.length ? best.anchor : null;
    scored.push({
      score,
      result: {
        id: anchor ? `${doc.id}#${anchor}` : doc.id,
        href: anchor ? `${doc.href}#${anchor}` : doc.href,
        title: doc.title,
        crumb: `${doc.productName} › ${doc.moduleTitle}`,
        snippet: highlight(snippetAround(best.text, terms), terms),
      },
    });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.result.title.localeCompare(b.result.title))
    .slice(0, limit)
    .map((s) => s.result);
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Pagefind returns excerpts as HTML with <mark> around hits. Turn that into
 * text runs so it renders as plain text (never as HTML).
 */
export function parseExcerpt(html: string): SnippetPart[] {
  const parts: SnippetPart[] = [];
  const re = /<mark>([\s\S]*?)<\/mark>/gi;
  let last = 0;
  const plain = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ''));
  for (const m of html.matchAll(re)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: plain(html.slice(last, start)), hit: false });
    parts.push({ text: plain(m[1] ?? ''), hit: true });
    last = start + m[0].length;
  }
  if (last < html.length) parts.push({ text: plain(html.slice(last)), hit: false });
  return parts.filter((p) => p.text.length > 0);
}

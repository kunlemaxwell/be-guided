/**
 * Keyword retrieval for Ask AI: scores guide pages by overlap with the
 * reader's question. Title matches weigh most, then summary, headings, body.
 * Pure and deterministic, so it is unit-tested and portable to any backend.
 * PROTOTYPE: keyword overlap only. Production: the site's search index (Pagefind)
 * or embeddings, still restricted to published, public pages.
 */
export interface SearchablePage {
  id: string;
  product: string;
  title: string;
  summary: string;
  headings: string[];
  body: string;
}

const STOP_WORDS = new Set(
  'a an and are as at be but by can do does for from get got have how i if in into is it its me my of on or our please so that the their them then there these this to up was we what when where which who why will with you your yours want need help'.split(' '),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().normalize('NFKD').match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Tiny suffix stemmer so "invoices"/"invoicing"/"invoice" meet. */
function stem(t: string): string {
  if (t.length > 5 && t.endsWith('ing')) return t.slice(0, -3);
  if (t.length > 4 && t.endsWith('ies')) return `${t.slice(0, -3)}y`;
  if (t.length > 4 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2);
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  if (t.length > 4 && t.endsWith('ed')) return t.slice(0, -2);
  if (t.length > 4 && t.endsWith('e')) return t.slice(0, -1);
  return t;
}

const WEIGHTS = { title: 6, summary: 3, headings: 2, body: 1 } as const;

export interface ScoredPage<T extends SearchablePage> {
  page: T;
  score: number;
}

export interface RankOptions {
  /** Product the reader is in: its pages get a boost. */
  product?: string;
  /** Page the reader is on: it gets a boost. */
  pageId?: string;
  limit?: number;
  /** Pages scoring below this are not relevant. */
  minScore?: number;
}

export function rankPages<T extends SearchablePage>(pages: T[], question: string, options: RankOptions = {}): ScoredPage<T>[] {
  const terms = [...new Set(tokenize(question))];
  if (terms.length === 0) return [];
  const scored = pages.map((page) => {
    const fields = {
      title: new Set(tokenize(page.title)),
      summary: new Set(tokenize(page.summary)),
      headings: new Set(tokenize(page.headings.join(' '))),
    };
    const bodyCounts = new Map<string, number>();
    for (const t of tokenize(page.body)) bodyCounts.set(t, (bodyCounts.get(t) ?? 0) + 1);
    let score = 0;
    let matched = 0;
    for (const term of terms) {
      let s = 0;
      if (fields.title.has(term)) s += WEIGHTS.title;
      if (fields.summary.has(term)) s += WEIGHTS.summary;
      if (fields.headings.has(term)) s += WEIGHTS.headings;
      const n = bodyCounts.get(term) ?? 0;
      if (n > 0) s += WEIGHTS.body * Math.min(3, 1 + Math.log2(n));
      if (s > 0) matched++;
      score += s;
    }
    // Reward pages that cover more of the question.
    score *= 0.5 + matched / terms.length / 2;
    if (score > 0 && options.product && page.product === options.product) score *= 1.25;
    if (score > 0 && options.pageId && page.id === options.pageId) score *= 1.5;
    return { page, score };
  });
  const min = options.minScore ?? 2;
  return scored
    .filter((s) => s.score >= min)
    .sort((a, b) => b.score - a.score || a.page.title.localeCompare(b.page.title))
    .slice(0, options.limit ?? 5);
}

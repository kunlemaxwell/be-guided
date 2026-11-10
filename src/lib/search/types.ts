/**
 * Search shapes shared by the build (index source) and the browser (search
 * box). No Node or React imports here, so both sides can use it.
 */

/** One part of a guide page that a result can point at: the lead, a `##` section or a step. */
export interface SearchSection {
  /** Heading id on the page, or null for the part before the first heading. */
  anchor: string | null;
  heading: string;
  /** Plain text of the part (no markdown). */
  text: string;
}

/** A published, public guide page as the search box sees it. */
export interface SearchDoc {
  id: string;
  href: string;
  title: string;
  summary: string;
  productName: string;
  moduleTitle: string;
  sections: SearchSection[];
}

/** A run of snippet text; `hit` runs are shown highlighted. */
export interface SnippetPart {
  text: string;
  hit: boolean;
}

export interface SearchResult {
  /** Stable key for the list (page id, plus the anchor when it points at a section). */
  id: string;
  href: string;
  title: string;
  /** "Product › Module" */
  crumb: string;
  snippet: SnippetPart[];
}

/** Address of the dev/fallback index (see src/app/search/index.json/route.ts). */
export const SEARCH_INDEX_PATH = '/search/index.json';

/** Queries shorter than this aren't searched. */
export const MIN_QUERY_LENGTH = 2;

/** Most results shown at once. */
export const MAX_RESULTS = 8;

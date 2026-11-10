import Link from 'next/link';
import type { MouseEvent } from 'react';
import type { SearchState } from '@/lib/search/state';
import type { SearchResult, SnippetPart } from '@/lib/search/types';
import { MIN_QUERY_LENGTH } from '@/lib/search/types';

interface Props {
  state: SearchState;
  listboxId: string;
  optionId: (index: number) => string;
  onPick: (result: SearchResult, e: MouseEvent) => void;
  onHover: (index: number) => void;
  onRetry: () => void;
}

function Snippet({ parts }: { parts: SnippetPart[] }) {
  return (
    <span className="search-opt__snippet">
      {parts.map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
    </span>
  );
}

/** Status line for screen readers and sighted users alike. */
export function statusMessage(state: SearchState): string {
  const q = state.query.trim();
  if (state.status === 'idle') return q ? `Type at least ${MIN_QUERY_LENGTH} letters to search.` : 'Search the guides by task, e.g. create an invoice.';
  if (state.status === 'loading') return 'Searching…';
  if (state.status === 'error') return 'Search isn’t working right now.';
  if (state.results.length === 0) return `No guides match “${q}”. Try fewer or different words, or Ask AI.`;
  return `${state.results.length} ${state.results.length === 1 ? 'guide' : 'guides'} found.`;
}

/**
 * The drop-down under the search box: a listbox of results, or a message
 * for the idle, loading, error and no-results states. Presentational only;
 * SiteSearch owns the state.
 */
export function SearchResults({ state, listboxId, optionId, onPick, onHover, onRetry }: Props) {
  const hasResults = state.status === 'done' && state.results.length > 0;
  return (
    <div className="search-pop" data-status={state.status}>
      <p className={hasResults ? 'sr-only' : 'search-pop__msg'} role="status" aria-live="polite">
        {statusMessage(state)}
        {state.status === 'error' ? (
          <button type="button" className="btn search-pop__retry" onMouseDown={(e) => e.preventDefault()} onClick={onRetry}>
            Try again
          </button>
        ) : null}
      </p>
      <ul id={listboxId} role="listbox" aria-label="Search results" className="search-pop__list" hidden={!hasResults}>
        {hasResults
          ? state.results.map((r, i) => (
              <li
                key={r.id}
                id={optionId(i)}
                role="option"
                aria-selected={i === state.active}
                className="search-opt"
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => (i === state.active ? undefined : onHover(i))}
              >
                <Link href={r.href} tabIndex={-1} onClick={(e) => onPick(r, e)}>
                  <span className="search-opt__crumb">{r.crumb}</span>
                  <span className="search-opt__title">{r.title}</span>
                  {r.snippet.length > 0 ? <Snippet parts={r.snippet} /> : null}
                </Link>
              </li>
            ))
          : null}
      </ul>
    </div>
  );
}

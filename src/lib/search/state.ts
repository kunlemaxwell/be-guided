import { MIN_QUERY_LENGTH, type SearchResult } from './types';

/**
 * The search box's state, as a pure reducer so the behaviour (typing,
 * results, arrow keys, Escape) is tested without a browser.
 */
export type SearchStatus = 'idle' | 'loading' | 'error' | 'done';

export interface SearchState {
  query: string;
  status: SearchStatus;
  results: SearchResult[];
  /** Highlighted option, or -1 for none. */
  active: number;
  open: boolean;
  /** Bumped on every query, so late answers to old queries are dropped. */
  seq: number;
}

export type SearchAction =
  | { type: 'type'; query: string }
  | { type: 'loaded'; seq: number; results: SearchResult[] }
  | { type: 'failed'; seq: number }
  | { type: 'move'; delta: 1 | -1 }
  | { type: 'activate'; index: number }
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'clear' };

export const initialSearchState: SearchState = { query: '', status: 'idle', results: [], active: -1, open: false, seq: 0 };

export function isQueryLongEnough(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case 'type': {
      const seq = state.seq + 1;
      if (!isQueryLongEnough(action.query)) return { ...state, query: action.query, status: 'idle', results: [], active: -1, seq, open: true };
      return { ...state, query: action.query, status: 'loading', active: -1, seq, open: true };
    }
    case 'loaded':
      if (action.seq !== state.seq) return state;
      return { ...state, status: 'done', results: action.results, active: action.results.length > 0 ? 0 : -1 };
    case 'failed':
      if (action.seq !== state.seq) return state;
      return { ...state, status: 'error', results: [], active: -1 };
    case 'move': {
      const n = state.results.length;
      if (!state.open) return { ...state, open: true };
      if (n === 0) return state;
      return { ...state, active: (state.active + action.delta + n) % n };
    }
    case 'activate':
      return action.index >= 0 && action.index < state.results.length ? { ...state, active: action.index } : state;
    case 'open':
      return { ...state, open: true };
    case 'close':
      return { ...state, open: false };
    case 'clear':
      return { ...initialSearchState, seq: state.seq + 1, open: true };
  }
}

/** What a key press in the search box does. Enter is handled by the caller (it navigates). */
export function actionForKey(key: string, state: SearchState): SearchAction | 'go' | null {
  switch (key) {
    case 'ArrowDown':
      return { type: 'move', delta: 1 };
    case 'ArrowUp':
      return { type: 'move', delta: -1 };
    case 'Enter':
      return state.open && state.results.length > 0 ? 'go' : null;
    case 'Escape':
      // First Escape closes the list; a second one clears the box.
      return state.open ? { type: 'close' } : state.query ? { type: 'clear' } : null;
    default:
      return null;
  }
}

/** The result Enter opens: the highlighted one, else the first. */
export function chosenResult(state: SearchState): SearchResult | null {
  return state.results[state.active >= 0 ? state.active : 0] ?? null;
}

/** True when "/" or Ctrl/⌘ K should jump to search (not while typing elsewhere). */
export function isSearchShortcut(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }, target: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') return true;
  if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return false;
  const tag = target?.tagName?.toUpperCase();
  return !(tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable);
}

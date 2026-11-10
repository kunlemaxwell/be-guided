'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useReducer, useRef, type KeyboardEvent, type MouseEvent } from 'react';
import { getSearchEngine } from '@/lib/search/engine';
import { actionForKey, chosenResult, initialSearchState, isSearchShortcut, searchReducer } from '@/lib/search/state';
import type { SearchResult } from '@/lib/search/types';
import { SearchIcon } from '../Icons';
import { SearchResults } from './SearchResults';

const DEBOUNCE_MS = 160;

/** Fired by other buttons (the home page's big search bar) to jump to the header search. */
export const OPEN_SEARCH_EVENT = 'pv:open-search';

/**
 * The header search box: results appear as you type. Keyboard: "/" or
 * Ctrl/⌘ K to jump here, ↑/↓ to move, Enter to open, Escape to close.
 * ARIA combobox with a listbox popup.
 */
export function SiteSearch() {
  const [state, dispatch] = useReducer(searchReducer, initialSearchState);
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const listboxId = `${uid}-results`;
  const optionId = useCallback((i: number) => `${uid}-opt-${i}`, [uid]);

  // Search after a short pause in typing; answers to older queries are dropped by the reducer.
  useEffect(() => {
    if (state.status !== 'loading') return;
    const seq = state.seq;
    const query = state.query;
    const timer = window.setTimeout(() => {
      getSearchEngine()
        .then((engine) => engine.search(query.trim()))
        .then(
          (results) => dispatch({ type: 'loaded', seq, results }),
          () => dispatch({ type: 'failed', seq }),
        );
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [state.status, state.seq, state.query]);

  // "/" and Ctrl/⌘ K from anywhere; the home page's search bar.
  useEffect(() => {
    const focus = () => {
      inputRef.current?.focus();
      dispatch({ type: 'open' });
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (!isSearchShortcut(e, e.target instanceof HTMLElement ? e.target : null)) return;
      e.preventDefault();
      focus();
    };
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_SEARCH_EVENT, focus);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_SEARCH_EVENT, focus);
    };
  }, []);

  // Close when clicking elsewhere.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && e.target instanceof Node && !rootRef.current.contains(e.target)) dispatch({ type: 'close' });
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, []);

  const go = (result: SearchResult) => {
    dispatch({ type: 'clear' });
    dispatch({ type: 'close' });
    inputRef.current?.blur();
    router.push(result.href);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const action = actionForKey(e.key, state);
    if (!action) return;
    e.preventDefault();
    if (action === 'go') {
      const result = chosenResult(state);
      if (result) go(result);
      return;
    }
    dispatch(action);
  };

  const onPick = (result: SearchResult, e: MouseEvent) => {
    // Let the browser handle new-tab clicks; a plain click navigates here.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    go(result);
  };

  const popupOpen = state.open && state.query.trim().length > 0;
  const active = popupOpen && state.status === 'done' && state.active >= 0 ? optionId(state.active) : undefined;

  return (
    <div className="site-search" ref={rootRef}>
      <div className="header-search">
        <SearchIcon size={15} />
        <input
          ref={inputRef}
          type="search"
          className="header-search__input"
          placeholder="Search the guide…"
          aria-label="Search the guide"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={popupOpen}
          aria-controls={listboxId}
          aria-activedescendant={active}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={state.query}
          onChange={(e) => dispatch({ type: 'type', query: e.target.value })}
          onFocus={() => {
            dispatch({ type: 'open' });
            void getSearchEngine().catch(() => undefined); // warm up while the reader types
          }}
          onKeyDown={onKeyDown}
        />
        {state.query ? null : <kbd aria-hidden="true">/</kbd>}
      </div>
      {popupOpen ? (
        <SearchResults
          state={state}
          listboxId={listboxId}
          optionId={optionId}
          onPick={onPick}
          onHover={(index) => dispatch({ type: 'activate', index })}
          onRetry={() => dispatch({ type: 'type', query: state.query })}
        />
      ) : null}
    </div>
  );
}

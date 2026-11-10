'use client';

import { SearchIcon } from '../Icons';
import { OPEN_SEARCH_EVENT } from './SiteSearch';

/** The home page's big search bar: jumps to the header search box. */
export function HeroSearchButton() {
  return (
    <button type="button" className="hero__search" aria-label="Search the guide" onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}>
      <SearchIcon size={18} />
      <span>Search guides, e.g. create an invoice</span>
      <kbd aria-hidden="true">/</kbd>
    </button>
  );
}

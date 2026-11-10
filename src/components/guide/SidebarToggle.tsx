'use client';

import { useEffect, useState } from 'react';
import { NAV_STORAGE_KEY, isNavState, type NavState } from '@/lib/nav-state';
import { SidebarIcon } from '../Icons';

interface Props {
  /** id of the element the button shows and hides. */
  controls: string;
}

/**
 * Collapses the article's left menu to a slim rail. The state lives on
 * <html data-nav>, set before first paint by the boot script in layout.tsx,
 * so the layout never jumps on load; this button flips it and remembers the
 * choice in this browser.
 */
export function SidebarToggle({ controls }: Props) {
  const [state, setState] = useState<NavState>('expanded');

  useEffect(() => {
    const current = document.documentElement.getAttribute('data-nav');
    if (isNavState(current)) setState(current);
  }, []);

  function toggle() {
    const next: NavState = state === 'collapsed' ? 'expanded' : 'collapsed';
    document.documentElement.setAttribute('data-nav', next);
    try {
      localStorage.setItem(NAV_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice still applies for this visit */
    }
    setState(next);
  }

  const expanded = state === 'expanded';
  return (
    <button
      type="button"
      className="doc-nav__toggle"
      onClick={toggle}
      aria-expanded={expanded}
      aria-controls={controls}
      title={expanded ? 'Hide the guide menu' : 'Show the guide menu'}
    >
      <SidebarIcon size={18} />
      <span className="doc-nav__toggle-text">Guide menu</span>
    </button>
  );
}

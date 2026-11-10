'use client';

import { useEffect, useState } from 'react';
import { MoonIcon, SunIcon } from './Icons';

type Mode = 'light' | 'dark';
const STORAGE_KEY = 'help-mode';

/** Reader's light/dark switch. The boot script in layout.tsx applies it before paint. */
export function ModeToggle() {
  const [mode, setMode] = useState<Mode>('light');

  useEffect(() => {
    setMode(document.documentElement.getAttribute('data-mode') === 'dark' ? 'dark' : 'light');
  }, []);

  function toggle() {
    const next: Mode = mode === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-mode', next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice still applies for this visit */
    }
    setMode(next);
  }

  const label = mode === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  return (
    <button type="button" className="icon-btn" onClick={toggle} aria-label={label} title={label}>
      {mode === 'dark' ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

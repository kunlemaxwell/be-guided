'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, DownloadIcon } from '../Icons';

interface Props {
  moduleTitle: string;
}

/** Copy link + Download menu (this page / whole module, PDF or Word). */
export function PageActions({ moduleTitle }: Props) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrap = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href.split('?')[0] ?? window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked: nothing to do */
    }
  }

  return (
    <div className="menu-wrap doc-actions" ref={wrap}>
      <button type="button" className="btn btn--quiet" onClick={copyLink}>
        {copied ? 'Copied' : 'Copy link'}
      </button>
      <button type="button" className="btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <DownloadIcon size={14} /> Download <ChevronDownIcon size={12} />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <span className="menu__label">This page</span>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); window.print(); }}>
            PDF <small>Print or save</small>
          </button>
          {/* PROTOTYPE: Word and module downloads are generated at publish time in step 2. */}
          <button type="button" role="menuitem" disabled>Word <small>Coming soon</small></button>
          <span className="menu__label">All of {moduleTitle}</span>
          <button type="button" role="menuitem" disabled>PDF <small>Coming soon</small></button>
          <button type="button" role="menuitem" disabled>Word <small>Coming soon</small></button>
        </div>
      ) : null}
    </div>
  );
}

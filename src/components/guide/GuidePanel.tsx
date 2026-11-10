'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, ExternalIcon } from '../Icons';

interface PanelTarget {
  href: string;
  title: string;
  /** Page the reader came from, for the "Back to …" link on the full page. */
  fromHref: string;
  fromTitle: string;
  /** Section to open at, e.g. "#invoice". */
  hash?: string;
}

interface PanelApi {
  open: (target: PanelTarget) => void;
}

const PanelContext = createContext<PanelApi | null>(null);

/** Lets any guide link open its target in a side panel over the current page. */
export function useGuidePanel(): PanelApi | null {
  return useContext(PanelContext);
}

export function fullPageHref(t: Pick<PanelTarget, 'href' | 'fromHref' | 'fromTitle' | 'hash'>): string {
  const q = new URLSearchParams({ from: t.fromHref, fromTitle: t.fromTitle });
  return `${t.href}?${q.toString()}${t.hash ?? ''}`;
}

export function GuidePanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<PanelTarget | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const closeBtn = useRef<HTMLButtonElement | null>(null);

  const open = useCallback((t: PanelTarget) => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setTarget(t);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
    returnFocus.current?.focus();
  }, []);

  useEffect(() => {
    if (!target) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [target, close]);

  const api = useMemo(() => ({ open }), [open]);

  return (
    <PanelContext.Provider value={api}>
      {children}
      {target ? (
        <>
          <div className="panel-backdrop" onClick={close} aria-hidden="true" />
          <div className="panel" role="dialog" aria-modal="true" aria-label={target.title}>
            <div className="panel__head">
              <span className="panel__title">{target.title}</span>
              <a className="btn btn--quiet" href={fullPageHref(target)}>
                <ExternalIcon size={14} /> Open full page
              </a>
              <button ref={closeBtn} type="button" className="btn btn--quiet" onClick={close} aria-label={`Close and go back to ${target.fromTitle}`}>
                <CloseIcon size={16} />
              </button>
            </div>
            <iframe title={target.title} src={`${target.href}?embed=1${target.hash ?? ''}`} />
          </div>
        </>
      ) : null}
    </PanelContext.Provider>
  );
}

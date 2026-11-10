'use client';

import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { fullPageHref, useGuidePanel } from './GuidePanel';

interface Props {
  href: string;
  title: string;
  summary: string;
  /** Title of the page this link sits on, for "Back to …". */
  fromTitle: string;
  /** Section of the target page, e.g. "#invoice"; opens the page scrolled to it. */
  hash?: string;
  /**
   * Content shown on hover instead of the page summary (for example the
   * expected postings table, read from the postings page itself).
   */
  preview?: ReactNode;
  /** Visual variant: "postings" renders as a small pill link. */
  variant?: 'postings';
  children: ReactNode;
}

const HOVER_DELAY_MS = 300;

/**
 * Link to another guide page. Hover/focus shows a short preview; a plain
 * click opens the page in a side panel so the reader keeps their place.
 * Ctrl/Cmd/middle-click still open a normal new tab.
 */
export function GuideLink({ href, title, summary, fromTitle, hash, preview, variant, children }: Props) {
  const panel = useGuidePanel();
  const pathname = usePathname();
  const tipId = useId();
  const [showTip, setShowTip] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const target = { href, title, fromHref: pathname, fromTitle, hash };

  function onClick(e: MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    setShowTip(false);
    // Inside the side panel itself, follow the link within the panel.
    if (document.documentElement.hasAttribute('data-embed')) {
      window.location.href = `${href}?embed=1${hash ?? ''}`;
      return;
    }
    panel?.open(target);
  }

  function enter() {
    timer.current = setTimeout(() => setShowTip(true), HOVER_DELAY_MS);
  }
  function leave() {
    if (timer.current) clearTimeout(timer.current);
    setShowTip(false);
  }

  return (
    <a
      className={variant === 'postings' ? 'glink glink--postings' : 'glink'}
      href={fullPageHref(target)}
      onClick={onClick}
      onMouseEnter={enter}
      onMouseLeave={leave}
      onFocus={(e) => {
        // Keyboard focus only; a mouse click shouldn't pop the preview.
        if (e.currentTarget.matches(':focus-visible')) enter();
      }}
      onBlur={leave}
      aria-describedby={showTip ? tipId : undefined}
    >
      {children}
      {showTip ? (
        preview ? (
          // Block content (a table), so a <div>; postings links are never inside a paragraph.
          <div id={tipId} role="tooltip" className="glink-tip glink-tip--wide">
            <strong>{title}</strong>
            {preview}
            <em>Click to open the full explanation beside this page</em>
          </div>
        ) : (
          <span id={tipId} role="tooltip" className="glink-tip">
            <strong>{title}</strong>
            {summary}
            <em>Click to open beside this page</em>
          </span>
        )
      ) : null}
    </a>
  );
}

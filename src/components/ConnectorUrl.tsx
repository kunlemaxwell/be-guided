'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

/**
 * The "Connect your AI" address with a Copy button. When the guide isn't
 * online yet (no address), says so instead of showing anything to copy.
 */
export function ConnectorUrl({ url }: { url: string | null }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  if (!url) {
    return (
      <div className="connector connector--pending" role="note">
        <span className="connector__label">Connector address</span>
        <p className="connector__pending">Available once the guide is online. This page will show the address to copy.</p>
      </div>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      // Clipboard blocked (older browser, no permission): select the text so the reader can copy it by hand.
      field.current?.select();
      setCopied('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  };

  return (
    <div className="connector">
      <label className="connector__label" htmlFor="connector-url">Connector address</label>
      <div className="connector__row">
        <input id="connector-url" ref={field} className="connector__url" type="text" value={url} readOnly spellCheck={false} onFocus={(e) => e.currentTarget.select()} />
        <button type="button" className="btn btn--primary connector__copy" onClick={copy}>
          {copied === 'yes' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
          {copied === 'yes' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="connector__status" aria-live="polite">
        {copied === 'yes' ? 'Copied. Now paste it into Claude or ChatGPT.' : copied === 'failed' ? 'Copying was blocked. The address is selected: press Ctrl+C (Cmd+C on a Mac).' : ''}
      </p>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { chatGptUrl, claudeUrl } from '@/lib/ask-elsewhere';
import { ExternalIcon } from '../Icons';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/$/, '');

/** "Ask in Claude" / "Ask in ChatGPT": opens the reader's own assistant with the question ready. */
export function AskElsewhere({ question = '', compact = false }: { question?: string; compact?: boolean }) {
  const site = SITE_URL || (typeof window !== 'undefined' ? window.location.origin : '');
  return (
    <div className={compact ? 'ask-elsewhere ask-elsewhere--compact' : 'ask-elsewhere'}>
      <a className="btn ask-elsewhere__btn" href={claudeUrl(question, site)} target="_blank" rel="noopener noreferrer">
        Ask in Claude <ExternalIcon size={12} />
      </a>
      <a className="btn ask-elsewhere__btn" href={chatGptUrl(question, site)} target="_blank" rel="noopener noreferrer">
        Ask in ChatGPT <ExternalIcon size={12} />
      </a>
      <Link className="ask-elsewhere__help" href="/connect-ai/">First time? Add the guide to your AI</Link>
    </div>
  );
}

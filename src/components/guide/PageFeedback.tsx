'use client';

import { useEffect, useId, useState } from 'react';
import { API_BASE_URL, API_VERSION } from '@/lib/api/config';

const VISITOR_KEY = 'pv-visitor';
const VOTED_KEY = 'pv-votes';
const FEEDBACK_URL = `${API_BASE_URL}/api/${API_VERSION}/chat/feedback`;

/** A random id this browser keeps, so changing a vote replaces it (nothing personal). */
function visitorId(): string {
  try {
    let id = localStorage.getItem(VISITOR_KEY);
    if (!id || !/^[A-Za-z0-9-]{8,64}$/.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(VISITOR_KEY, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function rememberedVote(pageId: string): boolean | null {
  try {
    const all = JSON.parse(localStorage.getItem(VOTED_KEY) ?? '{}') as Record<string, boolean>;
    return typeof all[pageId] === 'boolean' ? all[pageId]! : null;
  } catch {
    return null;
  }
}

function rememberVote(pageId: string, helpful: boolean): void {
  try {
    const all = JSON.parse(localStorage.getItem(VOTED_KEY) ?? '{}') as Record<string, boolean>;
    all[pageId] = helpful;
    localStorage.setItem(VOTED_KEY, JSON.stringify(all));
  } catch {
    // Private window: the vote still counts, it just isn't remembered here.
  }
}

type Phase = 'ask' | 'more' | 'sending' | 'thanks' | 'error';

/**
 * "Was this page helpful?" Thumbs up or down goes straight to the guide API;
 * the reader may then add a comment and, if they want a reply, an email.
 * The owner sees every vote in the admin (Reader feedback).
 */
export function PageFeedback({ pageId }: { pageId: string }) {
  const [vote, setVote] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>('ask');
  const [comment, setComment] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const commentId = useId();
  const emailId = useId();

  useEffect(() => {
    const v = rememberedVote(pageId);
    if (v !== null) {
      setVote(v);
      setPhase('thanks');
    }
  }, [pageId]);

  async function send(helpful: boolean, extra: { comment?: string; email?: string } = {}): Promise<boolean> {
    try {
      const res = await fetch(FEEDBACK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, helpful, visitor: visitorId(), ...extra }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(res.status === 422 && extra.email ? 'Check the email address.' : body?.message ?? 'Your feedback could not be sent. Please try again.');
        return false;
      }
      rememberVote(pageId, helpful);
      return true;
    } catch {
      setError('Your feedback could not be sent. Check your connection and try again.');
      return false;
    }
  }

  async function choose(helpful: boolean) {
    setVote(helpful);
    setError('');
    setPhase('sending');
    setPhase((await send(helpful)) ? 'more' : 'error');
  }

  async function submitMore(e: React.FormEvent) {
    e.preventDefault();
    if (vote === null) return;
    const c = comment.trim();
    const m = email.trim();
    if (!c && !m) {
      setPhase('thanks');
      return;
    }
    setError('');
    setPhase('sending');
    setPhase((await send(vote, { ...(c ? { comment: c } : {}), ...(m ? { email: m } : {}) })) ? 'thanks' : 'more');
  }

  return (
    <div className="feedback" data-pagefind-ignore="all" aria-live="polite">
      {phase === 'thanks' ? (
        <>
          <span>Thanks for your feedback{vote === false ? '. We will use it to improve this page.' : '.'}</span>
          <button type="button" className="btn btn--quiet" onClick={() => setPhase('ask')}>Change my answer</button>
        </>
      ) : phase === 'more' ? (
        <form className="feedback__more" onSubmit={submitMore}>
          <p className="feedback__q">{vote ? 'Glad it helped. Anything we could add?' : 'Sorry about that. What was missing or wrong?'}</p>
          <label htmlFor={commentId} className="sr-only">Comment</label>
          <textarea id={commentId} maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Optional" />
          <label htmlFor={emailId}>Email, only if you would like a reply (optional)</label>
          <input id={emailId} type="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
          {error ? <p className="feedback__error" role="alert">{error}</p> : null}
          <div>
            <button type="button" className="btn btn--quiet" onClick={() => setPhase('thanks')}>Skip</button>
            <button type="submit" className="btn">Send</button>
          </div>
        </form>
      ) : (
        <>
          <span>Was this page helpful?</span>
          <div>
            <button type="button" className="btn" aria-pressed={vote === true} disabled={phase === 'sending'} onClick={() => void choose(true)}>
              <span aria-hidden="true">👍</span> Yes
            </button>
            <button type="button" className="btn" aria-pressed={vote === false} disabled={phase === 'sending'} onClick={() => void choose(false)}>
              <span aria-hidden="true">👎</span> No
            </button>
          </div>
          {phase === 'error' ? <p className="feedback__error" role="alert">{error}</p> : null}
        </>
      )}
    </div>
  );
}

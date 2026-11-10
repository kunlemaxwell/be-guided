'use client';

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CHAT_ERROR_MESSAGES, MAX_QUESTION_LENGTH, safeSourceHref, type ChatSource } from '@/lib/api/chat';
import { CloseIcon, ExternalIcon, SendIcon, SparkIcon, TrashIcon } from '../Icons';
import type { ChatMessage, ChatSession } from './use-chat-session';
import { useFocusTrap } from './use-focus-trap';
import { AskElsewhere } from './AskElsewhere';

interface Props {
  session: ChatSession;
  onClose: () => void;
  /** Opens a guide page (same-site path) beside the current page. */
  onOpenSource: (href: string, title: string) => void;
}

const MOBILE_QUERY = '(max-width: 640px)';

function isPlainClick(e: MouseEvent): boolean {
  return !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0);
}

/** A link from an answer or its sources: guide pages open beside the page, others in a new tab. */
function AnswerLink({ href, children, onOpenSource, title }: { href: string; children: ReactNode; title: string; onOpenSource: Props['onOpenSource'] }) {
  const safe = safeSourceHref(href);
  if (!safe) return <span>{children}</span>;
  if (safe.kind === 'external') {
    return (
      <a href={safe.href} target="_blank" rel="noopener noreferrer">
        {children}
        <ExternalIcon size={12} className="chat__ext" />
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return (
    <a
      href={safe.href}
      onClick={(e) => {
        if (!isPlainClick(e)) return;
        e.preventDefault();
        onOpenSource(safe.href, title);
      }}
    >
      {children}
    </a>
  );
}

function Sources({ sources, onOpenSource }: { sources: ChatSource[]; onOpenSource: Props['onOpenSource'] }) {
  if (sources.length === 0) return null;
  return (
    <div className="chat__sources">
      <span className="chat__sources-label">Sources</span>
      <ul>
        {sources.map((s) => (
          <li key={s.id}>
            <AnswerLink href={s.href} title={s.title} onOpenSource={onOpenSource}>{s.title}</AnswerLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Message({ message, onOpenSource }: { message: ChatMessage; onOpenSource: Props['onOpenSource'] }) {
  if (message.role === 'user') {
    return (
      <li className="chat__msg chat__msg--user">
        <span className="sr-only">You: </span>
        {message.content}
      </li>
    );
  }
  // Answers are markdown. react-markdown never renders raw HTML, and its
  // default URL filter drops javascript: and other unsafe links.
  const components: Components = {
    a: ({ href = '', children }) => (
      <AnswerLink href={href} title={typeof children === 'string' ? children : 'Guide page'} onOpenSource={onOpenSource}>{children}</AnswerLink>
    ),
    img: ({ alt }) => <span>{alt}</span>,
  };
  return (
    <li className="chat__msg chat__msg--assistant">
      <span className="sr-only">Ask AI: </span>
      <div className="chat__answer">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{message.content}</ReactMarkdown>
      </div>
      {message.sources ? <Sources sources={message.sources} onOpenSource={onOpenSource} /> : null}
    </li>
  );
}

/**
 * The Ask AI chat panel: a floating card at the bottom right on desktop, a
 * full-height sheet on phones. Modal while open: focus stays inside, Esc
 * closes it, and the provider puts focus back where it was.
 */
export function ChatPanel({ session, onClose, onOpenSource }: Props) {
  const { messages, status, error, send, retry, clear } = session;
  const [draft, setDraft] = useState('');
  const panel = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const list = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const hintId = useId();
  const thinking = status === 'thinking';

  useFocusTrap(panel, true, onClose);

  useEffect(() => {
    input.current?.focus();
    // Phones: the sheet covers the page, so the page behind shouldn't scroll.
    if (!window.matchMedia(MOBILE_QUERY).matches) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, thinking, error]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || thinking) return;
    send(text);
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  function onClear() {
    clear();
    setDraft('');
    input.current?.focus();
  }

  return (
    <>
      <div className="chat-backdrop" onClick={onClose} aria-hidden="true" />
      <div ref={panel} className="chat" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="chat__head">
          <span className="chat__badge" aria-hidden="true"><SparkIcon size={16} /></span>
          <div className="chat__heading">
            <h2 id={titleId} className="chat__title">Ask AI</h2>
            <span className="chat__subtitle">Answers come from these guides</span>
          </div>
          <button type="button" className="chat__icon-btn" onClick={onClear} disabled={messages.length === 0 && !error && !thinking} aria-label="Clear conversation" title="Clear conversation">
            <TrashIcon size={16} />
          </button>
          <button type="button" className="chat__icon-btn" onClick={onClose} aria-label="Close Ask AI" title="Close (Esc)">
            <CloseIcon size={18} />
          </button>
        </div>

        <div ref={list} className="chat__body">
          {messages.length === 0 && !thinking && !error ? (
            <div className="chat__empty">
              <p><strong>Ask a question about using the product.</strong></p>
              <p>For example: &ldquo;How do I create an invoice?&rdquo; Answers link to the guide pages they come from.</p>
              <p className="chat__or">Or ask in your own AI, with the guide&apos;s screenshots:</p>
              <AskElsewhere question={draft} compact />
            </div>
          ) : null}
          <ol className="chat__list" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
            {messages.map((m) => (
              <Message key={m.id} message={m} onOpenSource={onOpenSource} />
            ))}
          </ol>
          {thinking ? (
            <div className="chat__thinking" role="status">
              <span className="chat__dots" aria-hidden="true"><span /><span /><span /></span>
              Thinking…
            </div>
          ) : null}
          {error ? (
            <div className="chat__error" role="alert">
              <p>{CHAT_ERROR_MESSAGES[error]}</p>
              {error === 'NOT_CONFIGURED' ? (
                <>
                  <p>You can ask the same question in your own AI:</p>
                  <AskElsewhere question={[...messages].reverse().find((m) => m.role === 'user')?.content ?? draft} compact />
                </>
              ) : null}
              {error !== 'NOT_CONFIGURED' && error !== 'INVALID' && error !== 'FORBIDDEN' ? (
                <button type="button" className="btn" onClick={retry}>Try again</button>
              ) : null}
            </div>
          ) : null}
        </div>

        <form className="chat__form" onSubmit={submit}>
          <label className="sr-only" htmlFor={`${titleId}-input`}>Your question</label>
          <textarea
            id={`${titleId}-input`}
            ref={input}
            className="chat__input"
            rows={2}
            value={draft}
            maxLength={MAX_QUESTION_LENGTH}
            placeholder="Ask about the guides…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby={hintId}
          />
          <button type="submit" className="chat__send" disabled={thinking || draft.trim().length === 0} aria-label="Send question">
            <SendIcon size={18} />
          </button>
          <p id={hintId} className="chat__hint">Enter to send, Shift+Enter for a new line. AI answers can be wrong, so check the linked guide.</p>
        </form>
      </div>
    </>
  );
}

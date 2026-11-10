import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

export type NoticeTone = 'success' | 'error' | 'info';

interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
  link?: { href: string; label: string };
}

interface NoticeApi {
  notify: (tone: NoticeTone, message: string, link?: Notice['link']) => void;
}

const NoticeContext = createContext<NoticeApi | null>(null);

/** Small messages in the corner ("Saved — refresh the site to see it"). */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setNotices((all) => all.filter((n) => n.id !== id)), []);

  const notify = useCallback<NoticeApi['notify']>(
    (tone, message, link) => {
      const id = nextId.current++;
      setNotices((all) => [...all.slice(-2), { id, tone, message, link }]);
      window.setTimeout(() => dismiss(id), tone === 'error' ? 9000 : 6000);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <div className="notices" role="status" aria-live="polite">
        {notices.map((n) => (
          <div key={n.id} className={`notice notice--${n.tone}`}>
            <span>{n.message}</span>
            {n.link ? (
              <a href={n.link.href} target="_blank" rel="noreferrer">
                {n.link.label}
              </a>
            ) : null}
            <button type="button" className="notice__close" aria-label="Dismiss message" onClick={() => dismiss(n.id)}>
              ×
            </button>
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  );
}

/** Show a short message to the owner. */
export function useNotice(): NoticeApi {
  const ctx = useContext(NoticeContext);
  if (!ctx) throw new Error('useNotice must be used inside NoticeProvider');
  return ctx;
}

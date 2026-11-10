'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { guideContextFromPath } from '@/lib/api/chat';
import { useGuidePanel } from '../guide/GuidePanel';
import { ChatIcon } from '../Icons';
import { useChatSession } from './use-chat-session';

interface ChatApi {
  isOpen: boolean;
  open: () => void;
}

const ChatContext = createContext<ChatApi | null>(null);

/** Opens the Ask AI panel from anywhere (header button, launcher). */
export function useChat(): ChatApi | null {
  return useContext(ChatContext);
}

// The panel (and its markdown renderer) loads the first time it opens, so
// pages that never use Ask AI don't pay for it.
const ChatPanel = dynamic(() => import('./ChatPanel').then((m) => m.ChatPanel), {
  ssr: false,
  loading: () => (
    <div className="chat chat--loading" role="status">
      <span className="chat__thinking">Opening Ask AI…</span>
    </div>
  ),
});

/**
 * Owns the Ask AI conversation and renders the bottom-right launcher and the
 * chat panel. Hidden inside the side panel (?embed=1) by CSS, so it never
 * flashes there before hydration.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const opener = useRef<HTMLElement | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const guidePanel = useGuidePanel();

  const context = useCallback(() => guideContextFromPath(pathRef.current ?? '/'), []);
  const session = useChatSession(context);

  const open = useCallback(() => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    const back = opener.current && document.contains(opener.current) ? opener.current : launcher.current;
    // After the panel unmounts, so focus lands on a visible element.
    requestAnimationFrame(() => back?.focus());
  }, []);

  const openSource = useCallback(
    (href: string, title: string) => {
      // The guide opens beside the page; the conversation is kept, and the
      // launcher (focused on close) reopens it.
      // Close synchronously so the launcher is visible again and can take
      // focus; the side panel then returns focus to it when it closes.
      flushSync(() => setIsOpen(false));
      opener.current = launcher.current;
      launcher.current?.focus();
      const [path = href, hash] = href.split('#');
      const pagePath = path.split('?')[0] ?? path;
      if (!guidePanel) {
        window.location.href = href;
        return;
      }
      guidePanel.open({
        href: pagePath,
        title,
        fromHref: pathRef.current ?? '/',
        fromTitle: document.title.split(' · ')[0] ?? document.title,
        hash: hash ? `#${hash}` : undefined,
      });
    },
    [guidePanel],
  );

  const api = useMemo(() => ({ isOpen, open }), [isOpen, open]);

  return (
    <ChatContext.Provider value={api}>
      {children}
      <button
        ref={launcher}
        type="button"
        className="chat-launcher"
        onClick={open}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        hidden={isOpen}
      >
        <ChatIcon size={20} />
        <span>Ask AI</span>
      </button>
      {isOpen ? <ChatPanel session={session} onClose={close} onOpenSource={openSource} /> : null}
    </ChatContext.Provider>
  );
}

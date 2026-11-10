'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { ChatError, askGuide, buildChatRequest, type ChatErrorCode, type ChatSource } from '@/lib/api/chat';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

export type ChatStatus = 'idle' | 'thinking';

export interface ChatSession {
  messages: ChatMessage[];
  status: ChatStatus;
  /** Last request's failure, shown under the conversation with "Try again". */
  error: ChatErrorCode | null;
  send: (text: string) => void;
  retry: () => void;
  clear: () => void;
}

const STORAGE_KEY = 'help-chat';
const storedSchema = z.array(
  z.object({
    id: z.string(),
    role: z.enum(['user', 'assistant']),
    content: z.string(),
    sources: z.array(z.object({ id: z.string(), title: z.string(), href: z.string() })).optional(),
  }),
);

function readStored(): ChatMessage[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = storedSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) return [];
    // A question left without an answer (page closed mid-request, or it
    // failed) would sit there with no way to retry, so it is dropped.
    const messages = parsed.data;
    while (messages.at(-1)?.role === 'user') messages.pop();
    return messages;
  } catch {
    return [];
  }
}

function writeStored(messages: ChatMessage[]): void {
  try {
    if (messages.length === 0) sessionStorage.removeItem(STORAGE_KEY);
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    /* storage blocked: the conversation still works for this page */
  }
}

let counter = 0;
function newId(): string {
  counter += 1;
  return `${Date.now().toString(36)}-${counter}`;
}

/**
 * The Ask AI conversation: messages, the "thinking" state, errors and retry.
 * Kept for the browser tab (sessionStorage), so it survives moving between
 * guide pages. `context` is read when a question is sent, so answers are
 * about the page the reader is on at that moment.
 */
export function useChatSession(context: () => { product?: string; page?: string }): ChatSession {
  // Read straight away in the browser: nothing the server renders depends on
  // the conversation (the panel only renders once opened), so this can't
  // cause a hydration mismatch.
  const [messages, setMessages] = useState<ChatMessage[]>(() => (typeof window === 'undefined' ? [] : readStored()));
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<ChatErrorCode | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  useEffect(() => {
    writeStored(messages);
  }, [messages]);

  const request = useCallback(
    async (history: ChatMessage[]) => {
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setStatus('thinking');
      setError(null);
      try {
        const result = await askGuide(buildChatRequest(history, context()), { signal: controller.signal });
        if (controller.signal.aborted) return;
        setMessages((prev) => [...prev, { id: newId(), role: 'assistant', content: result.answer, sources: result.sources }]);
      } catch (err) {
        if (controller.signal.aborted) return;
        const code: ChatErrorCode = err instanceof ChatError ? err.code : 'SERVER';
        if (!(err instanceof ChatError)) console.error('Ask AI request failed', err);
        setError(code);
      } finally {
        if (inFlight.current === controller) {
          inFlight.current = null;
          setStatus('idle');
        }
      }
    },
    [context],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || inFlight.current) return;
      const next = [...messages, { id: newId(), role: 'user' as const, content }];
      setMessages(next);
      void request(next);
    },
    [messages, request],
  );

  const retry = useCallback(() => {
    if (inFlight.current || messages.length === 0) return;
    void request(messages);
  }, [messages, request]);

  const clear = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setStatus('idle');
    setError(null);
    setMessages([]);
  }, []);

  return { messages, status, error, send, retry, clear };
}

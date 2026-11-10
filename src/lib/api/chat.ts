import { z } from 'zod';
import { API_BASE_URL, API_VERSION, CHAT_TIMEOUT_MS } from './config';

/**
 * Typed client for the guide API's Ask AI endpoint. The only place the site
 * talks to the chat backend; components use `askGuide` and `ChatError`.
 *
 *   POST {API_BASE_URL}/api/v1/chat
 *   { messages: {role, content}[], product?, page? }
 *   → { success: true, message, data: { answer, sources: {id, title, href}[] } }
 *   | { success: false, code, message }
 */

export type ChatRole = 'user' | 'assistant';

export interface ChatTurn {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatTurn[];
  /** Product slug the reader is in, e.g. "acme-books". */
  product?: string;
  /** Page id the reader is on: "product/module/page". */
  page?: string;
}

export interface ChatSource {
  id: string;
  title: string;
  href: string;
}

export interface ChatAnswer {
  answer: string;
  sources: ChatSource[];
}

/** Error codes the backend documents, plus the ones the client itself raises. */
export const CHAT_ERROR_CODES = [
  'NOT_CONFIGURED',
  'RATE_LIMITED',
  'INVALID',
  'FORBIDDEN',
  'NETWORK',
  'TIMEOUT',
  'SERVER',
  'BAD_RESPONSE',
] as const;
export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

/** A failed request, with a code the UI branches on (never the message text). */
export class ChatError extends Error {
  readonly code: ChatErrorCode;
  readonly status: number | null;

  constructor(code: ChatErrorCode, status: number | null = null, detail?: string) {
    super(detail ?? code);
    this.name = 'ChatError';
    this.code = code;
    this.status = status;
  }
}

/** What the reader sees for each failure. */
export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  NOT_CONFIGURED: "Ask AI isn't switched on yet. Please use the guides or contact support for now.",
  RATE_LIMITED: "You've asked a lot of questions in a short time. Please wait a minute and try again.",
  INVALID: "That question couldn't be sent. Try a shorter question, or clear the conversation and start again.",
  FORBIDDEN: "Ask AI isn't available on this copy of the guide. Please use the guides or contact support.",
  NETWORK: "Ask AI can't be reached right now. Check your connection and try again.",
  TIMEOUT: 'The answer took too long. Please try again.',
  SERVER: 'Something went wrong on our side. Please try again in a moment.',
  BAD_RESPONSE: 'The answer came back in a form we could not read. Please try again.',
};

/** Longest question the site sends; the backend may reject longer ones as INVALID. */
export const MAX_QUESTION_LENGTH = 2000;
/** Most recent turns sent with each question, so long conversations stay small. */
export const MAX_HISTORY_TURNS = 12;

const sourceSchema = z.object({ id: z.string(), title: z.string(), href: z.string() });
const successSchema = z.object({
  success: z.literal(true),
  message: z.string().optional(),
  data: z.object({ answer: z.string(), sources: z.array(sourceSchema).default([]) }),
});
const failureSchema = z.object({ success: z.literal(false), code: z.string().optional(), message: z.string().optional() });

const KNOWN_BACKEND_CODES: ReadonlySet<string> = new Set(['NOT_CONFIGURED', 'RATE_LIMITED', 'INVALID']);

/** Maps an HTTP status and backend code to one of our codes. */
export function toErrorCode(status: number, backendCode: string | undefined): ChatErrorCode {
  if (backendCode && KNOWN_BACKEND_CODES.has(backendCode)) return backendCode as ChatErrorCode;
  if (status === 401 || status === 403) return 'FORBIDDEN';
  if (status === 503) return 'NOT_CONFIGURED';
  if (status === 429) return 'RATE_LIMITED';
  if (status === 400 || status === 413 || status === 422) return 'INVALID';
  return 'SERVER';
}

/** Trims history to what the backend needs: the last few turns, no empty messages. */
export function buildChatRequest(turns: ChatTurn[], context: { product?: string; page?: string }): ChatRequest {
  const messages = turns
    .filter((t) => t.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((t) => ({ role: t.role, content: t.content.slice(0, MAX_QUESTION_LENGTH * 4) }));
  return {
    messages,
    ...(context.product ? { product: context.product } : {}),
    ...(context.page ? { page: context.page } : {}),
  };
}

interface AskOptions {
  signal?: AbortSignal;
  /** For tests. */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  timeoutMs?: number;
}

/**
 * Sends the conversation and returns the answer with its sources.
 * Throws `ChatError` for every failure; rethrows an `AbortError` when the
 * caller cancelled (so the UI can ignore it).
 */
export async function askGuide(request: ChatRequest, opts: AskOptions = {}): Promise<ChatAnswer> {
  const doFetch = opts.fetchImpl ?? fetch;
  const url = `${opts.baseUrl ?? API_BASE_URL}/api/${API_VERSION}/chat`;
  const timeout = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    timeout.abort();
  }, opts.timeoutMs ?? CHAT_TIMEOUT_MS);
  const onCallerAbort = () => timeout.abort();
  opts.signal?.addEventListener('abort', onCallerAbort, { once: true });

  let res: Response;
  try {
    res = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
      signal: timeout.signal,
      credentials: 'omit',
    });
  } catch (err) {
    if (opts.signal?.aborted) throw err;
    if (timedOut) throw new ChatError('TIMEOUT');
    throw new ChatError('NETWORK', null, err instanceof Error ? err.message : undefined);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onCallerAbort);
  }

  let payload: unknown = null;
  try {
    payload = (await res.json()) as unknown;
  } catch {
    payload = null;
  }

  if (!res.ok) {
    const failure = failureSchema.safeParse(payload);
    throw new ChatError(toErrorCode(res.status, failure.success ? failure.data.code : undefined), res.status);
  }
  const failure = failureSchema.safeParse(payload);
  if (failure.success) throw new ChatError(toErrorCode(res.status, failure.data.code), res.status);

  const ok = successSchema.safeParse(payload);
  if (!ok.success) throw new ChatError('BAD_RESPONSE', res.status);
  return { answer: ok.data.data.answer, sources: ok.data.data.sources };
}

/**
 * Where a source link may go. Only same-site paths ("/…", opened in the side
 * panel) and http(s) addresses are allowed; anything else (javascript:,
 * protocol-relative "//…") is shown as plain text.
 */
export type SafeHref = { kind: 'guide'; href: string } | { kind: 'external'; href: string };

export function safeSourceHref(href: string): SafeHref | null {
  const h = href.trim();
  if (h.startsWith('/') && !h.startsWith('//') && !h.startsWith('/\\')) return { kind: 'guide', href: h };
  try {
    const url = new URL(h);
    if (url.protocol === 'https:' || url.protocol === 'http:') return { kind: 'external', href: url.toString() };
  } catch {
    /* not an absolute URL */
  }
  return null;
}

/**
 * Product slug and page id from a site path: "/p/" → product p;
 * "/p/m/pg/" → product p, page "p/m/pg". Other paths give no context.
 */
export function guideContextFromPath(pathname: string): { product?: string; page?: string } {
  const parts = pathname.split(/[?#]/)[0]?.split('/').filter(Boolean) ?? [];
  const [product, mod, page] = parts;
  if (!product || product === 'changelog' || product.startsWith('_')) return {};
  if (parts.length === 3 && mod && page) return { product, page: `${product}/${mod}/${page}` };
  return { product };
}

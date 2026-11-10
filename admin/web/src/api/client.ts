import type { ApiErrorCode, FieldIssue } from '../../../shared/api-types';
import { adminCall, IN_CHAT } from '../widget/host';

/** Codes the browser adds on top of the server's. */
export type ClientErrorCode = ApiErrorCode | 'OFFLINE' | 'BAD_RESPONSE';

/** Every failed API call becomes an ApiError with a typed code; screens branch on `code`, never on text. */
export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly issues: FieldIssue[] = [],
    readonly status = 0,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** 401: not signed in (cloud) — the session must be renewed. */
  get isUnauthenticated(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }

  /** 403: signed in but not allowed. */
  get isForbidden(): boolean {
    return this.code === 'FORBIDDEN';
  }
}

export const API_BASE = '/api/v1';

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
  form?: FormData;
  signal?: AbortSignal;
}

interface Envelope {
  success: boolean;
  message?: string;
  data?: unknown;
  code?: ApiErrorCode;
  issues?: FieldIssue[];
}

function isEnvelope(value: unknown): value is Envelope {
  return Boolean(value) && typeof value === 'object' && typeof (value as { success?: unknown }).success === 'boolean';
}

type UnauthorizedListener = () => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** The auth provider subscribes here so any 401 anywhere resets the session in one place. */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

/**
 * The only place the admin app talks to its server. Unwraps the
 * `{ success, message, data }` envelope and turns failures into typed
 * ApiErrors. Locally there is no token (the API only answers this computer);
 * in the cloud, Cloudflare Access adds the identity to every request, so no
 * token is ever handled in the browser.
 */
export async function apiRequestWithMessage<T>(path: string, options: RequestOptions = {}): Promise<{ data: T; message: string }> {
  let res: Response;
  if (IN_CHAT) {
    // The admin inside the chat: the same request, carried by the chat (see widget/host.ts).
    try {
      const a = await adminCall(options.method ?? 'GET', path, options.body, options.form);
      res = new Response(JSON.stringify(a.envelope), { status: a.status || 200, headers: { 'content-type': 'application/json' } });
    } catch (error) {
      throw new ApiError('OFFLINE', error instanceof Error ? error.message : 'The chat did not pass this on. Try again.');
    }
  } else try {
    res = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
      signal: options.signal,
      credentials: 'same-origin',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('OFFLINE', 'The admin has stopped running. Double-click “Open Be Guided Admin” to start it again.');
  }
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    throw new ApiError('BAD_RESPONSE', 'The admin sent back something unexpected. Try again.', [], res.status);
  }
  if (!isEnvelope(payload)) throw new ApiError('BAD_RESPONSE', 'The admin sent back something unexpected. Try again.', [], res.status);
  if (!payload.success) {
    const error = new ApiError(payload.code ?? 'SERVER_ERROR', payload.message ?? 'Something went wrong. Try again.', payload.issues ?? [], res.status);
    if (error.isUnauthenticated) unauthorizedListeners.forEach((l) => l());
    throw error;
  }
  return { data: payload.data as T, message: payload.message ?? '' };
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return (await apiRequestWithMessage<T>(path, options)).data;
}

/** A sentence the owner can act on, for any error. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Something went wrong. Try again.';
}

/** The message for one form field from a validation error, if any. */
export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.issues.find((i) => i.field === field || i.field.startsWith(`${field}.`))?.message : undefined;
}

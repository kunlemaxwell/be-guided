import type { Actor } from '../../domain/actor';
import { AppError } from '../../domain/errors';

/**
 * Lets the in-chat admin (an MCP App) make the same /api/v1 calls the web
 * admin makes, as the person who owns the connector key. Each call gets a
 * fresh random pass that exists only while that call runs and is known only
 * to this process, so nothing outside can claim an identity with it.
 */
export const INTERNAL_PASS_HEADER = 'x-pv-internal-pass';
const passes = new Map<string, Actor>();

export function actorForPass(headers: Headers): Actor | null {
  const pass = headers.get(INTERNAL_PASS_HEADER);
  return pass ? (passes.get(pass) ?? null) : null;
}

export interface AdminCall {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Path under /api/v1, e.g. /pages?product=acme-books */
  path: string;
  body?: unknown;
  /** A file upload: the form's text fields plus one file sent as base64. */
  form?: { fields?: Record<string, string>; file?: { field: string; name: string; type: string; base64: string } };
}

export interface AdminCallResult {
  status: number;
  /** The usual { success, message, data } envelope, for JSON answers. */
  envelope?: unknown;
  /** Pictures and other files come back as base64. */
  file?: { contentType: string; base64: string };
}

/** Paths the in-chat admin may not reach: the connectors themselves and the public endpoints. */
const BLOCKED = [/^\/editor(\/|$)/, /^\/mcp(\/|$)/, /^\/chat(\/|$)/, /^\/automation\/call(\/|$)/];
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const bin = atob(text);
  const bytes = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

export async function callAdmin(fetcher: (request: Request) => Promise<Response>, origin: string, actor: Actor, call: AdminCall): Promise<AdminCallResult> {
  const path = call.path.startsWith('/') ? call.path : `/${call.path}`;
  const url = new URL(`/api/v1${path}`, origin);
  if (url.origin !== new URL(origin).origin || !url.pathname.startsWith('/api/v1/') || url.pathname.includes('..')) {
    throw new AppError('INVALID', 'That address is not part of the admin.');
  }
  const rest = url.pathname.slice('/api/v1'.length);
  if (BLOCKED.some((re) => re.test(rest))) throw new AppError('FORBIDDEN', 'The admin in the chat cannot use that part of the server.');

  const pass = crypto.randomUUID();
  const headers = new Headers({ [INTERNAL_PASS_HEADER]: pass, accept: 'application/json' });
  let body: BodyInit | undefined;
  if (call.form) {
    const form = new FormData();
    for (const [k, v] of Object.entries(call.form.fields ?? {})) form.set(k, v);
    if (call.form.file) {
      const f = call.form.file;
      form.set(f.field, new File([fromBase64(f.base64)], f.name, { type: f.type || 'application/octet-stream' }));
    }
    const encoded = new Response(form);
    headers.set('content-type', encoded.headers.get('content-type') ?? 'multipart/form-data');
    const bytes = new Uint8Array(await encoded.arrayBuffer());
    headers.set('content-length', String(bytes.byteLength));
    body = bytes;
  } else if (call.body !== undefined) {
    const text = JSON.stringify(call.body);
    headers.set('content-type', 'application/json');
    headers.set('content-length', String(new TextEncoder().encode(text).byteLength));
    body = text;
  }

  passes.set(pass, actor);
  try {
    const res = await fetcher(new Request(url, { method: call.method, headers, body }));
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return { status: res.status, envelope: await res.json() };
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > MAX_FILE_BYTES) throw new AppError('FILE_TOO_LARGE', 'That file is too big to show in the chat. Open it in the web admin.');
    return { status: res.status, file: { contentType: type || 'application/octet-stream', base64: toBase64(bytes) } };
  } finally {
    passes.delete(pass);
  }
}

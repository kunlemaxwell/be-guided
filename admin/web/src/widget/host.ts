/**
 * The admin inside Claude or ChatGPT (MCP Apps). Built by
 * scripts/build-admin-app.mjs with VITE_WIDGET=1: the same screens as the
 * web admin, but every server call goes to the chat host as a tools/call of
 * the connector's admin_api tool (signed in as the key's person) instead of fetch.
 */
export const IN_CHAT = import.meta.env.VITE_WIDGET === '1';

/** Errors that mean the chat did not pass the call on, so trying again may help. */
const CHANNEL = /IPC|not available for MCP|did not answer in time|transport|not connected/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Json = Record<string, unknown>;
interface ToolResult {
  content?: { type: string; text?: string }[];
  structuredContent?: Json;
  isError?: boolean;
}

let rpcId = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
let ready: Promise<void> | null = null;
let adminUrl = '';
/** 'inline' (in the chat), 'fullscreen' or 'pip'. The chat only passes calls on from the inline view. */
let displayMode = 'inline';
const screenListeners = new Set<(screen: string) => void>();

function post(msg: Json) {
  window.parent.postMessage({ jsonrpc: '2.0', ...msg }, '*');
}

function request(method: string, params: unknown, timeoutMs = 90_000): Promise<unknown> {
  const id = ++rpcId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({ id, method, params });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error('The chat did not answer in time. Try again.'));
    }, timeoutMs);
  });
}

function applyHostContext(ctx: Json | null | undefined) {
  if (!ctx) return;
  applyTheme(ctx.theme);
  if (typeof ctx.displayMode === 'string') displayMode = ctx.displayMode;
}

/** Asks the chat to put the admin back in the chat (out of the expanded view). */
async function returnToChat(): Promise<boolean> {
  if (displayMode === 'inline') return false;
  try {
    const r = (await request('ui/request-display-mode', { mode: 'inline' }, 5_000)) as Json | null;
    if (typeof r?.mode === 'string') displayMode = r.mode;
    else displayMode = 'inline';
    return displayMode === 'inline';
  } catch {
    return false;
  }
}

function applyTheme(theme: unknown) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
}

function onMessage(ev: MessageEvent) {
  if (ev.source !== window.parent) return;
  const m = ev.data as Json & { id?: number; method?: string; params?: Json; result?: unknown; error?: { message?: string } };
  if (!m || m.jsonrpc !== '2.0') return;
  if (m.id != null && pending.has(m.id) && (m.result !== undefined || m.error)) {
    const p = pending.get(m.id)!;
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message || 'The chat refused that.'));
    else p.resolve(m.result);
    return;
  }
  if (m.method === 'ui/notifications/tool-input') {
    const a = (m.params?.arguments as Json | undefined) ?? {};
    // open_be_guided_admin names a screen; open_be_guided_studio may name a Studio tab.
    const screen = typeof a.screen === 'string' ? a.screen : a.tab === 'feedback' ? 'feedback' : typeof a.tab === 'string' ? 'automation' : null;
    if (screen) screenListeners.forEach((l) => l(screen));
  }
  if (m.method === 'ui/notifications/tool-result') {
    const sc = m.params?.structuredContent as Json | undefined;
    if (typeof sc?.adminUrl === 'string') adminUrl = sc.adminUrl;
  }
  if (m.method === 'ui/notifications/host-context-changed') applyHostContext(m.params);
  if (m.id != null && m.method) post({ id: m.id, result: {} }); // e.g. ui/resource-teardown
}

/** The chat window's height for the admin: it scrolls inside, like a browser tab. */
const FRAME_HEIGHT = 860;

export function connect(): Promise<void> {
  if (ready) return ready;
  window.addEventListener('message', onMessage);
  ready = (async () => {
    try {
      const r = (await request('ui/initialize', { appInfo: { name: 'be-guided-admin', version: '1.0.0' }, appCapabilities: {}, protocolVersion: '2026-01-26' }, 15_000)) as Json | null;
      applyHostContext(r?.hostContext as Json | undefined);
    } catch {
      /* Some hosts skip the handshake; calls still go through. */
    }
    post({ method: 'ui/notifications/initialized', params: {} });
    post({ method: 'ui/notifications/size-changed', params: { width: document.documentElement.scrollWidth, height: FRAME_HEIGHT } });
  })();
  return ready;
}

export function onScreenRequested(listener: (screen: string) => void): () => void {
  screenListeners.add(listener);
  return () => screenListeners.delete(listener);
}

/** Calls one connector tool through the chat, retrying when the chat drops the call. */
export async function callTool(name: string, args: Json): Promise<ToolResult> {
  await connect();
  for (let attempt = 0; ; attempt++) {
    let r: ToolResult;
    try {
      r = (await request('tools/call', { name, arguments: args })) as ToolResult;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!CHANNEL.test(msg) || attempt >= 2) throw new Error(friendly(msg));
      if (attempt === 0) await returnToChat();
      await sleep(400 * (attempt + 1));
      continue;
    }
    const text = r?.isError ? (r.content ?? []).map((c) => c.text ?? '').join(' ') : '';
    if (r?.isError && CHANNEL.test(text) && attempt < 2) {
      if (attempt === 0) await returnToChat();
      await sleep(400 * (attempt + 1));
      continue;
    }
    if (r?.isError) throw new Error(friendly(text || 'That did not work.'));
    return r;
  }
}

function friendly(message: string): string {
  return CHANNEL.test(message)
    ? displayMode === 'inline'
      ? 'Claude did not pass this on. Try again.'
      : 'Claude does not pass requests on from the expanded view. Close the expanded view, use the admin inside the chat, and try again.'
    : message;
}

export interface AdminAnswer {
  status: number;
  envelope: unknown;
  file: { contentType: string; base64: string } | null;
}

async function fileToBase64(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}

/** One /api/v1 request through the chat. */
export async function adminCall(method: string, path: string, body?: unknown, form?: FormData): Promise<AdminAnswer> {
  const args: Json = { method, path };
  if (body !== undefined) args.body = body;
  if (form) {
    const fields: Record<string, string> = {};
    let file: Json | undefined;
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') fields[k] = v;
      else file = { field: k, name: v.name, type: v.type, base64: await fileToBase64(v) };
    }
    args.form = file ? { fields, file } : { fields };
  }
  const r = await callTool('admin_api', args);
  const sc = r.structuredContent as unknown as AdminAnswer | undefined;
  if (!sc) throw new Error('The chat sent back something unexpected. Try again.');
  return sc;
}

// ── Pictures and links ────────────────────────────────────────────────────
// Screens point <img> and <a> at /api/v1/files?path=…, which the chat frame
// cannot reach. Pictures are fetched through the chat and shown from memory;
// links to them and to other sites open in the browser.
const FILES = '/api/v1/files';
const blobs = new Map<string, Promise<string>>();

function blobFor(src: string): Promise<string> {
  let p = blobs.get(src);
  if (!p) {
    p = adminCall('GET', src.slice('/api/v1'.length)).then((a) => {
      if (!a.file) throw new Error('not a file');
      const bin = atob(a.file.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([bytes], { type: a.file.contentType }));
    });
    p.catch(() => blobs.delete(src));
    blobs.set(src, p);
  }
  return p;
}

function fixImage(img: HTMLImageElement) {
  const src = img.getAttribute('src');
  if (!src || !src.startsWith(FILES)) return;
  img.dataset.pvSrc = src;
  img.removeAttribute('src');
  void blobFor(src).then(
    (url) => {
      if (img.dataset.pvSrc === src) img.src = url;
    },
    () => undefined,
  );
}

function scan(root: ParentNode) {
  root.querySelectorAll?.<HTMLImageElement>(`img[src^="${FILES}"]`).forEach(fixImage);
}

function openLink(url: string) {
  request('ui/open-link', { url }, 15_000).catch(() => window.open(url, '_blank', 'noopener'));
}

export function installPageFixes() {
  scan(document);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'attributes' && r.target instanceof HTMLImageElement) fixImage(r.target);
      r.addedNodes.forEach((n) => {
        if (n instanceof HTMLImageElement) fixImage(n);
        else if (n instanceof Element) scan(n);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });

  document.addEventListener(
    'click',
    (ev) => {
      const a = (ev.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a) return;
      const href = a.getAttribute('href') ?? '';
      if (/^https?:\/\//i.test(href)) {
        ev.preventDefault();
        openLink(href);
      } else if (href.startsWith('/api/')) {
        ev.preventDefault();
        if (adminUrl) openLink(`${adminUrl}${href}`);
      }
    },
    true,
  );
}

// ── The Studio screens (Automatic checks, Reader feedback) ────────────────
// The Studio runs in a frame inside this page with ?transport=parent; its
// tool calls come here and go on to the chat.
export function relayStudio(frame: HTMLIFrameElement, onHeight: (h: number) => void): () => void {
  const listener = async (ev: MessageEvent) => {
    if (ev.source !== frame.contentWindow) return;
    const m = ev.data as { pvStudio?: string; id?: number; tool?: string; args?: Json; height?: number; url?: string };
    if (m?.pvStudio === 'size' && typeof m.height === 'number') onHeight(m.height);
    if (m?.pvStudio === 'open' && typeof m.url === 'string') openLink(m.url);
    if (m?.pvStudio === 'call' && m.tool) {
      try {
        const r = await callTool(m.tool, m.args ?? {});
        let data: unknown = r.structuredContent;
        if (data && typeof data === 'object' && Object.keys(data).length === 1 && 'result' in (data as Json)) data = (data as Json).result;
        if (data === undefined) {
          try {
            data = JSON.parse((r.content?.[0]?.text ?? '').split('\n').slice(1).join('\n'));
          } catch {
            data = null;
          }
        }
        frame.contentWindow?.postMessage({ pvStudio: 'answer', id: m.id, data }, '*');
      } catch (e) {
        frame.contentWindow?.postMessage({ pvStudio: 'answer', id: m.id, error: e instanceof Error ? e.message : 'That did not work.' }, '*');
      }
    }
  };
  window.addEventListener('message', listener);
  return () => window.removeEventListener('message', listener);
}

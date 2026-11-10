import { describe, expect, it, vi } from 'vitest';
import {
  CHAT_ERROR_CODES,
  CHAT_ERROR_MESSAGES,
  ChatError,
  MAX_HISTORY_TURNS,
  askGuide,
  buildChatRequest,
  guideContextFromPath,
  safeSourceHref,
  toErrorCode,
  type ChatErrorCode,
} from '../../src/lib/api/chat';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const REQUEST = { messages: [{ role: 'user' as const, content: 'How do I create an invoice?' }], product: 'acme-books' };

async function codeOf(promise: Promise<unknown>): Promise<ChatErrorCode | 'no error'> {
  try {
    await promise;
    return 'no error';
  } catch (err) {
    if (err instanceof ChatError) return err.code;
    throw err;
  }
}

describe('askGuide', () => {
  it('posts the conversation as JSON to /api/v1/chat and returns answer and sources', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse(200, {
        success: true,
        message: 'OK',
        data: { answer: 'Open **Sales**.', sources: [{ id: 'acme-books/sales/create-an-invoice', title: 'Create an invoice', href: '/acme-books/sales/create-an-invoice/' }] },
      }),
    );
    const result = await askGuide(REQUEST, { fetchImpl, baseUrl: 'http://api.test' });
    expect(result.answer).toBe('Open **Sales**.');
    expect(result.sources).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://api.test/api/v1/chat');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('omit');
    expect(JSON.parse(String(init.body))).toEqual(REQUEST);
  });

  it('treats missing sources as none', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, data: { answer: 'Hi' } }));
    expect((await askGuide(REQUEST, { fetchImpl })).sources).toEqual([]);
  });

  it.each<[number, string, ChatErrorCode]>([
    [503, 'NOT_CONFIGURED', 'NOT_CONFIGURED'],
    [429, 'RATE_LIMITED', 'RATE_LIMITED'],
    [422, 'INVALID', 'INVALID'],
    [403, 'FORBIDDEN_ORIGIN', 'FORBIDDEN'],
    [401, 'UNAUTHENTICATED', 'FORBIDDEN'],
    [500, 'SOMETHING_ELSE', 'SERVER'],
  ])('turns HTTP %i with code %s into %s', async (status, code, expected) => {
    const fetchImpl = vi.fn(async () => jsonResponse(status, { success: false, code, message: 'nope' }));
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe(expected);
  });

  it('uses the status when the error body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>Too many</html>', { status: 429 }));
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe('RATE_LIMITED');
  });

  it('honours success:false even on HTTP 200', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: false, code: 'NOT_CONFIGURED', message: 'off' }));
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe('NOT_CONFIGURED');
  });

  it('rejects a success envelope without an answer as BAD_RESPONSE', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(200, { success: true, data: { text: 'wrong shape' } }));
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe('BAD_RESPONSE');
  });

  it('rejects a non-JSON 200 as BAD_RESPONSE', async () => {
    const fetchImpl = vi.fn(async () => new Response('hello', { status: 200 }));
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe('BAD_RESPONSE');
  });

  it('reports NETWORK when the API cannot be reached', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await codeOf(askGuide(REQUEST, { fetchImpl }))).toBe('NETWORK');
  });

  it('reports TIMEOUT when the answer takes too long', async () => {
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    expect(await codeOf(askGuide(REQUEST, { fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 }))).toBe('TIMEOUT');
  });

  it('rethrows the abort (not a ChatError) when the caller cancels', async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const pending = askGuide(REQUEST, { fetchImpl: fetchImpl as unknown as typeof fetch, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('toErrorCode', () => {
  it('prefers the documented backend code over the status', () => {
    expect(toErrorCode(400, 'RATE_LIMITED')).toBe('RATE_LIMITED');
  });
  it('falls back on the status for unknown codes', () => {
    expect(toErrorCode(503, undefined)).toBe('NOT_CONFIGURED');
    expect(toErrorCode(400, 'WHATEVER')).toBe('INVALID');
    expect(toErrorCode(502, undefined)).toBe('SERVER');
  });
});

describe('error messages', () => {
  it('has a specific, non-empty message for every code', () => {
    for (const code of CHAT_ERROR_CODES) expect(CHAT_ERROR_MESSAGES[code].length).toBeGreaterThan(10);
    expect(CHAT_ERROR_MESSAGES.NOT_CONFIGURED).toContain("Ask AI isn't switched on yet");
    expect(new Set(Object.values(CHAT_ERROR_MESSAGES)).size).toBe(CHAT_ERROR_CODES.length);
  });
});

describe('buildChatRequest', () => {
  it('keeps the last turns only, drops empty ones and adds the page context', () => {
    const turns = Array.from({ length: MAX_HISTORY_TURNS + 5 }, (_, i) => ({ role: i % 2 ? ('assistant' as const) : ('user' as const), content: `m${i}` }));
    turns.push({ role: 'user', content: '   ' });
    const req = buildChatRequest(turns, { product: 'acme-books', page: 'acme-books/sales/create-an-invoice' });
    expect(req.messages).toHaveLength(MAX_HISTORY_TURNS);
    expect(req.messages.at(-1)?.content).toBe(`m${MAX_HISTORY_TURNS + 4}`);
    expect(req.product).toBe('acme-books');
    expect(req.page).toBe('acme-books/sales/create-an-invoice');
  });

  it('leaves product and page out when unknown', () => {
    const req = buildChatRequest([{ role: 'user', content: 'hi' }], {});
    expect(req).toEqual({ messages: [{ role: 'user', content: 'hi' }] });
  });
});

describe('guideContextFromPath', () => {
  it.each<[string, { product?: string; page?: string }]>([
    ['/', {}],
    ['/changelog/', {}],
    ['/acme-books/', { product: 'acme-books' }],
    ['/acme-books/sales/', { product: 'acme-books' }],
    ['/acme-books/sales/create-an-invoice/', { product: 'acme-books', page: 'acme-books/sales/create-an-invoice' }],
    ['/acme-books/sales/create-an-invoice', { product: 'acme-books', page: 'acme-books/sales/create-an-invoice' }],
    ['/acme-books/sales/create-an-invoice/?from=/x#step', { product: 'acme-books', page: 'acme-books/sales/create-an-invoice' }],
  ])('%s', (path, expected) => {
    expect(guideContextFromPath(path)).toEqual(expected);
  });
});

describe('safeSourceHref', () => {
  it('opens same-site paths as guide pages', () => {
    expect(safeSourceHref('/acme-books/sales/create-an-invoice/')).toEqual({ kind: 'guide', href: '/acme-books/sales/create-an-invoice/' });
  });
  it('allows http(s) addresses as external links', () => {
    expect(safeSourceHref('https://example.com/a')).toEqual({ kind: 'external', href: 'https://example.com/a' });
  });
  it.each(['javascript:alert(1)', '//evil.example/x', '/\\evil.example', 'data:text/html,hi', 'mailto:x@example.com', 'relative/path', ''])(
    'refuses %s',
    (href) => {
      expect(safeSourceHref(href)).toBeNull();
    },
  );
});

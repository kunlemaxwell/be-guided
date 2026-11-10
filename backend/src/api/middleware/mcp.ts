import type { Context, MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import type { McpEnv } from '../context';

export const MCP_PATH = '/api/v1/mcp';

/** One MCP request is a small JSON-RPC message; nothing real comes near this. */
export const MCP_BODY_LIMIT = 64 * 1024;

/** JSON-RPC 2.0 error codes used at the HTTP layer (before a message reaches the MCP server). */
export const JSONRPC_ERROR = { serverError: -32000, invalidRequest: -32600 } as const;

const ALLOW_HEADERS = 'Content-Type, Accept, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID, X-Correlation-Id';
const EXPOSE_HEADERS = 'Mcp-Session-Id, Mcp-Protocol-Version, X-Correlation-Id';

/** A JSON-RPC error response that MCP clients can show (MCP errors are JSON-RPC, not the API envelope). */
export function jsonRpcError(c: Context<McpEnv>, status: 400 | 403 | 405 | 413 | 429 | 503, code: number, message: string, headers: Record<string, string> = {}): Response {
  return c.json({ jsonrpc: '2.0' as const, error: { code, message }, id: null }, status, { ...corsHeaders(c), ...headers });
}

/** The request's Origin; an empty header counts as none (non-browser clients). */
function originOf(c: Context<McpEnv>): string | undefined {
  return c.req.header('origin') || undefined;
}

function corsHeaders(c: Context<McpEnv>): Record<string, string> {
  const origin = originOf(c);
  if (!origin || !c.get('services').config.mcpOrigins.includes(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Expose-Headers': EXPOSE_HEADERS, Vary: 'Origin' };
}

/**
 * CORS + Origin check for the MCP endpoint. Claude and ChatGPT call from
 * their servers without an Origin header: always allowed. Browser-based
 * clients (e.g. an MCP inspector) must be on MCP_ALLOWED_ORIGINS. A request
 * with any other Origin is refused (403), as the MCP spec asks (DNS
 * rebinding). No credentials are ever accepted or needed.
 */
export const mcpCors: MiddlewareHandler<McpEnv> = async (c, next) => {
  const origin = originOf(c);
  const permitted = origin !== undefined && c.get('services').config.mcpOrigins.includes(origin);
  if (c.req.method === 'OPTIONS') {
    if (!permitted) return c.body(null, 403);
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (origin !== undefined && !permitted) return jsonRpcError(c, 403, JSONRPC_ERROR.serverError, 'This guide connector does not accept requests from that website.');
  await next();
  for (const [k, v] of Object.entries(corsHeaders(c))) c.header(k, v);
};

/** Per-client-address limit (like Ask AI). */
export const mcpRateLimit: MiddlewareHandler<McpEnv> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const s = c.get('services');
  if (!s.mcpLimiter.take(s.clientIp(c.req.raw, c.env))) {
    return jsonRpcError(c, 429, JSONRPC_ERROR.serverError, 'Too many guide requests in a short time. Wait a minute, then try again.', { 'Retry-After': '60' });
  }
  return next();
};

export const mcpBodyLimit: MiddlewareHandler<McpEnv> = bodyLimit({
  maxSize: MCP_BODY_LIMIT,
  onError: (c) => jsonRpcError(c as Context<McpEnv>, 413, JSONRPC_ERROR.invalidRequest, 'That request is too large.'),
});

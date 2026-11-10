import type { OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { jsonRpcResponseSchema } from '../../../../admin/shared/api-types';
import type { McpEnv } from '../context';
import { handleMcpRequest } from '../mcp/guide-mcp-server';
import { JSONRPC_ERROR, jsonRpcError, MCP_PATH } from '../middleware/mcp';
import { defineRoute } from '../route';

const jsonRpc = (description: string) => ({ description, content: { 'application/json': { schema: jsonRpcResponseSchema } } }) as const;

const DESCRIPTION = [
  '"Connect your AI": a remote MCP server (Model Context Protocol, Streamable HTTP transport) for Claude custom connectors and ChatGPT.',
  'Stateless (no Mcp-Session-Id), JSON responses (no SSE), read-only, no sign-in. Send one JSON-RPC 2.0 message per POST with',
  '`Content-Type: application/json` and `Accept: application/json, text/event-stream`; after `initialize`, send `MCP-Protocol-Version`.',
  'Methods: initialize, notifications/initialized (202), ping, tools/list, tools/call. Tools: search {query}, fetch {id}, list_guides {product?, module?}.',
  'Only published, public pages of public products. Errors are JSON-RPC errors (not the API envelope): -32700 parse error, -32600 invalid request,',
  '-32601 method not found, -32602 invalid params, -32000 rate limited / too large / origin refused. A tool that fails returns a result with isError: true.',
  'CORS: requests without Origin (Claude/ChatGPT servers) are allowed; browser Origins must be on MCP_ALLOWED_ORIGINS. Rate limited per client address. Body ≤ 64 KB.',
].join(' ');

/**
 * Registers /api/v1/mcp. The body is not declared to the OpenAPI validator on
 * purpose: a JSON-RPC client must get JSON-RPC errors (handled by the MCP
 * SDK), not the API's 422 envelope.
 */
export function registerMcp<E extends McpEnv>(app: OpenAPIHono<E>): void {
  app.openapi(
    defineRoute('public', {
      method: 'post',
      path: MCP_PATH,
      tags: ['Connect your AI (MCP)'],
      summary: 'MCP endpoint (JSON-RPC 2.0 over Streamable HTTP) for Claude and ChatGPT connectors.',
      description: DESCRIPTION,
      responses: {
        200: jsonRpc('The JSON-RPC response (a result, or an error object)'),
        202: { description: 'Notification accepted (no body)' },
        400: jsonRpc('Malformed JSON-RPC (-32700 / -32600) or unsupported MCP-Protocol-Version'),
        403: jsonRpc('Browser Origin not allowed'),
        406: jsonRpc('Accept header must allow application/json and text/event-stream'),
        413: jsonRpc('Body larger than 64 KB'),
        415: jsonRpc('Content-Type must be application/json'),
        429: jsonRpc('Rate limited (Retry-After: 60)'),
      },
    }),
    // The SDK builds the HTTP response itself; zod-openapi's typed-response helpers don't model JSON-RPC.
    (async (c: Context<E>) => {
      const s = c.get('services');
      return handleMcpRequest(c.req.raw, { tools: s.guideTools, logger: s.logger, version: s.config.version, correlationId: c.get('correlationId') });
    }) as never,
  );

  for (const method of ['get', 'delete'] as const) {
    app.openapi(
      defineRoute('public', {
        method,
        path: MCP_PATH,
        tags: ['Connect your AI (MCP)'],
        summary: method === 'get' ? 'Not offered: this server sends no server-initiated messages (no SSE stream).' : 'Not offered: the server is stateless, so there is no session to end.',
        responses: { 405: jsonRpc('Method not allowed (Allow: POST, OPTIONS)') },
      }),
      ((c: Context<E>) =>
        jsonRpcError(c as unknown as Context<McpEnv>, 405, JSONRPC_ERROR.serverError, 'Method not allowed. Send MCP messages with POST.', { Allow: 'POST, OPTIONS' })) as never,
    );
  }
}

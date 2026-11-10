import { z, type OpenAPIHono } from '@hono/zod-openapi';
import type { Context } from 'hono';
import {
  connectorKeySchema,
  createdConnectorKeySchema,
  decideChangeSchema,
  jsonRpcResponseSchema,
  newConnectorKeySchema,
  pendingChangeDetailSchema,
  pendingChangeSchema,
  PENDING_STATUSES,
  uploadResultSchema,
} from '../../../../admin/shared/api-types';
import { AppError } from '../../domain/errors';
import type { AppEnv } from '../context';
import { handleEditorMcpRequest } from '../mcp/editor-mcp-server';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { idParam, requestContext } from './util';

/** The editor connector address (Claude Code / Codex). Signed in with a personal key, not Cloudflare Access. */
export const EDITOR_PATH = '/api/v1/editor';

const jsonRpc = (description: string) => ({ description, content: { 'application/json': { schema: jsonRpcResponseSchema } } }) as const;

export function registerEditor(app: OpenAPIHono<AppEnv>): void {
  // ── The connector itself ────────────────────────────────────────────────
  app.openapi(
    defineRoute('public', {
      method: 'post',
      path: EDITOR_PATH,
      tags: ['Editor connector (MCP)'],
      summary: 'Editor MCP endpoint for Claude Code / Codex (content-only edits). Requires Authorization: Bearer bgk_… (a personal connector key).',
      description:
        'Stateless MCP (JSON-RPC 2.0 over Streamable HTTP, JSON responses). Tools: get_writing_standard, list_products, read_page, save_page, get_upload_link, upload_screenshot, request_video, request_new_product, my_changes. ' +
        'Keys are created by owners in the admin (Settings › Connector keys); each key is tied to one person (editor or owner) and optionally to some products. ' +
        'Without a valid key the answer is 401 with a JSON-RPC error.',
      responses: { 200: jsonRpc('The JSON-RPC response'), 202: { description: 'Notification accepted' }, 401: jsonRpc('Missing, wrong or switched-off key') },
    }),
    (async (c: Context<AppEnv>) => {
      const s = c.get('services');
      try {
        const session = await s.editor.authenticate(c.req.header('authorization') ?? null, c.get('correlationId'));
        return await handleEditorMcpRequest(c.req.raw, { editor: s.editor, automation: s.automation, feedback: s.feedback, session, logger: s.logger, version: s.config.version, correlationId: c.get('correlationId'), uploadBase: `${new URL(c.req.url).origin}${EDITOR_PATH}`, siteUrl: s.config.siteUrl, adminFetch: async (req) => app.fetch(req, c.env) });
      } catch (error) {
        if (error instanceof AppError && error.code === 'UNAUTHENTICATED') {
          return c.json({ jsonrpc: '2.0' as const, error: { code: -32001, message: error.message }, id: null }, 401, { 'WWW-Authenticate': 'Bearer realm="be-guided-editor"' });
        }
        throw error;
      }
    }) as never,
  );

  // ── One-time upload links (the AI sends a file with curl) ───────────────
  app.openapi(
    defineRoute('public', {
      method: 'post',
      path: `${EDITOR_PATH}/upload/{token}`,
      tags: ['Editor connector (MCP)'],
      summary: 'Send one screenshot or video to a one-time upload link from get_upload_link (multipart field "file"). The link works once, for 15 minutes.',
      request: {
        params: z.object({ token: z.string().min(20).max(100) }),
        body: { required: true, content: { 'multipart/form-data': { schema: z.object({ file: z.any().openapi({ type: 'string', format: 'binary' }) }) } } },
      },
      responses: { 201: okResponse(uploadResultSchema, 'The saved file: use src in the page'), ...errorResponses(400, 401, 404, 409, 413, 415, 422) },
    }),
    async (c) => {
      const form = c.req.valid('form');
      const file: unknown = form.file;
      if (!(file instanceof File)) throw new AppError('INVALID', 'Send the file as the multipart field "file" (curl -F "file=@path").', [{ field: 'file', message: 'File is required' }]);
      const r = await c.get('services').editor.receiveUpload(c.req.valid('param').token, { name: file.name, size: file.size, bytes: async () => new Uint8Array(await file.arrayBuffer()) }, c.get('correlationId'));
      return c.json(ok(r, `Uploaded. Use it in the page as ${r.src}.`), 201);
    },
  );

  // ── Keys (owners) ───────────────────────────────────────────────────────
  app.openapi(
    defineRoute('people:manage', {
      method: 'get',
      path: '/api/v1/connector-keys',
      tags: ['Editor connector (MCP)'],
      summary: 'Connector keys (never the keys themselves)',
      responses: { 200: okResponse(z.array(connectorKeySchema), 'Every key, active first') },
    }),
    async (c) => c.json(ok(await c.get('services').editor.listKeys()), 200),
  );

  app.openapi(
    defineRoute('people:manage', {
      method: 'post',
      path: '/api/v1/connector-keys',
      tags: ['Editor connector (MCP)'],
      summary: 'Create a key for a person (shown once)',
      request: { body: { required: true, content: { 'application/json': { schema: newConnectorKeySchema } } } },
      responses: { 201: okResponse(createdConnectorKeySchema, 'The new key, with the full key value (shown only now)'), ...errorResponses(404, 422) },
    }),
    async (c) => {
      const origin = new URL(c.req.url).origin;
      const created = await c.get('services').editor.createKey(requestContext(c), c.req.valid('json'), `${origin}${EDITOR_PATH}`);
      return c.json(ok(created, 'Key created. Copy it now: it is not shown again.'), 201);
    },
  );

  app.openapi(
    defineRoute('people:manage', {
      method: 'delete',
      path: '/api/v1/connector-keys/{id}',
      tags: ['Editor connector (MCP)'],
      summary: 'Switch a key off (it stops working at once)',
      request: { params: idParam },
      responses: { 200: okResponse(connectorKeySchema, 'The key, now switched off'), ...errorResponses(404) },
    }),
    async (c) => c.json(ok(await c.get('services').editor.revokeKey(requestContext(c), c.req.valid('param').id), 'Key switched off.'), 200),
  );

  // ── Approvals (owners) ──────────────────────────────────────────────────
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/changes',
      tags: ['Editor connector (MCP)'],
      summary: 'Changes sent through the connector (waiting, approved, rejected)',
      request: { query: z.object({ status: z.enum(PENDING_STATUSES).optional() }) },
      responses: { 200: okResponse(z.array(pendingChangeSchema), 'Newest first') },
    }),
    async (c) => c.json(ok(await c.get('services').editor.listChanges(c.req.valid('query').status)), 200),
  );

  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/changes/{id}',
      tags: ['Editor connector (MCP)'],
      summary: 'One change, with the proposed text and the live text to compare',
      request: { params: idParam },
      responses: { 200: okResponse(pendingChangeDetailSchema, 'The change'), ...errorResponses(404) },
    }),
    async (c) => c.json(ok(await c.get('services').editor.getChange(c.req.valid('param').id)), 200),
  );

  for (const decision of ['approve', 'reject'] as const) {
    app.openapi(
      defineRoute('publish', {
        method: 'post',
        path: `/api/v1/changes/{id}/${decision}`,
        tags: ['Editor connector (MCP)'],
        summary: decision === 'approve' ? 'Approve: the change is saved and goes live' : 'Reject: nothing changes on the site',
        request: { params: idParam, body: { required: false, content: { 'application/json': { schema: decideChangeSchema } } } },
        responses: { 200: okResponse(pendingChangeSchema, 'The decided change'), ...errorResponses(404, 409, 422) },
      }),
      async (c) => {
        const body = (c.req.valid('json') ?? {}) as { note?: string };
        const r = await c.get('services').editor.decide(requestContext(c), c.req.valid('param').id, decision === 'approve' ? 'approved' : 'rejected', body.note);
        return c.json(ok(r, decision === 'approve' ? 'Approved. The site updates in about 2 minutes.' : 'Rejected.'), 200);
      },
    );
  }
}

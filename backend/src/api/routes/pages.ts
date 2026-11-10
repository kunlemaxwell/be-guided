import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { pageDetailSchema, pagedSchema, pageQuerySchema, revisionDetailSchema, revisionSummarySchema, savePageInputSchema, savePageResultSchema } from '../../../../admin/shared/api-types';
import { checkSlug } from '../../domain/slugs';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { pageParams, requestContext } from './util';

function pageId(p: { product: string; module: string; page: string }): string {
  return `${checkSlug(p.product, 'product')}/${checkSlug(p.module, 'module')}/${checkSlug(p.page, 'page')}`;
}

export function registerPages(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/pages/{product}/{module}/{page}',
      tags: ['Pages'],
      summary: 'One page for the editor: frontmatter, markdown body, module images and media',
      request: { params: pageParams },
      responses: { 200: okResponse(pageDetailSchema, 'The page'), ...errorResponses(400, 404) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').content.getPage(p.product, p.module, p.page)), 200);
    },
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'put',
      path: '/api/v1/pages/{product}/{module}/{page}',
      tags: ['Pages'],
      summary: 'Save a page (records a version and an audit entry)',
      request: { params: pageParams, body: { required: true, content: { 'application/json': { schema: savePageInputSchema } } } },
      responses: { 200: okResponse(savePageResultSchema, 'Saved'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').content.savePage(requestContext(c), p.product, p.module, p.page, c.req.valid('json')), 'Saved.'), 200);
    },
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/pages/{product}/{module}/{page}/draft',
      tags: ['Pages'],
      summary: '"Remove from the site": makes the page a draft (never deletes)',
      request: { params: pageParams },
      responses: { 200: okResponse(savePageResultSchema, 'Now a draft'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').content.markDraft(requestContext(c), p.product, p.module, p.page), 'The page is now a draft.'), 200);
    },
  );

  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/pages/{product}/{module}/{page}/revisions',
      tags: ['Version history'],
      summary: 'Version history of a page, newest first (paginated)',
      request: { params: pageParams, query: pageQuerySchema },
      responses: { 200: okResponse(pagedSchema(revisionSummarySchema), 'One page of revisions'), ...errorResponses(400, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').activity.listRevisions(pageId(c.req.valid('param')), c.req.valid('query'))), 200),
  );

  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/pages/{product}/{module}/{page}/revisions/{revisionId}',
      tags: ['Version history'],
      summary: 'One revision: changed fields (before/after) and the line diff of the text',
      request: { params: pageParams.extend({ revisionId: z.string().max(80).openapi({ param: { name: 'revisionId', in: 'path' } }) }) },
      responses: { 200: okResponse(revisionDetailSchema, 'The revision'), ...errorResponses(400, 404) },
    }),
    async (c) => {
      const p = c.req.valid('param');
      return c.json(ok(await c.get('services').activity.getRevision(pageId(p), p.revisionId)), 200);
    },
  );
}

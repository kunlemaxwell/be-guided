import type { OpenAPIHono } from '@hono/zod-openapi';
import { jsonObjectSchema } from '../../../../admin/shared/api-types';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { requestContext } from './util';

export function registerSite(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/site',
      tags: ['Settings'],
      summary: 'Site settings (content/site.json): theme, light/dark default, video display, theme customizer',
      responses: { 200: okResponse(jsonObjectSchema, 'site.json') },
    }),
    async (c) => c.json(ok(await c.get('services').content.getSite()), 200),
  );

  app.openapi(
    defineRoute('settings:manage', {
      method: 'put',
      path: '/api/v1/site',
      tags: ['Settings'],
      summary: 'Save site settings (validated with the site schema)',
      request: { body: { required: true, content: { 'application/json': { schema: jsonObjectSchema } } } },
      responses: { 200: okResponse(jsonObjectSchema, 'Saved site.json'), ...errorResponses(422) },
    }),
    async (c) => c.json(ok(await c.get('services').content.saveSite(requestContext(c), c.req.valid('json')), 'Saved.'), 200),
  );
}

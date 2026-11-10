import type { OpenAPIHono } from '@hono/zod-openapi';
import { publishResultSchema, publishStatusSchema } from '../../../../admin/shared/api-types';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { requestContext } from './util';

export function registerPublish(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/publish',
      tags: ['Publish'],
      summary: 'Can the guide be published now, and what will happen',
      responses: { 200: okResponse(publishStatusSchema, 'Status') },
    }),
    async (c) => c.json(ok(await c.get('services').publish.status()), 200),
  );

  app.openapi(
    defineRoute('publish', {
      method: 'post',
      path: '/api/v1/publish',
      tags: ['Publish'],
      summary: 'Publish the guide (local: git commit + push of content/; cloud: Pages deploy hook)',
      responses: { 200: okResponse(publishResultSchema, 'Published'), ...errorResponses(405, 409, 503) },
    }),
    async (c) => {
      const r = await c.get('services').publish.publish(requestContext(c));
      return c.json(ok(r, r.message), 200);
    },
  );
}

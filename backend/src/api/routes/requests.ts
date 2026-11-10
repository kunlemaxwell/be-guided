import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { approveInputSchema, guideRequestSchema, newRequestSchema, requestDtoSchema } from '../../../../admin/shared/api-types';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { idParam, requestContext } from './util';

export function registerRequests(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/requests',
      tags: ['Updates & requests'],
      summary: 'The request queue for Claude, newest first, with suggested changes',
      responses: { 200: okResponse(z.array(requestDtoSchema), 'All requests') },
    }),
    async (c) => c.json(ok(await c.get('services').requests.list()), 200),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/requests',
      tags: ['Updates & requests'],
      summary: 'Queue a request (content mode is required)',
      request: { body: { required: true, content: { 'application/json': { schema: newRequestSchema } } } },
      responses: { 201: okResponse(guideRequestSchema, 'Queued'), ...errorResponses(422) },
    }),
    async (c) => c.json(ok(await c.get('services').requests.create(requestContext(c), c.req.valid('json')), 'Added to the request list.'), 201),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/requests/{id}/cancel',
      tags: ['Updates & requests'],
      summary: 'Cancel a waiting request',
      request: { params: idParam },
      responses: { 200: okResponse(guideRequestSchema, 'Cancelled'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').requests.cancel(requestContext(c), c.req.valid('param').id), 'Cancelled.'), 200),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/requests/{id}/dismiss',
      tags: ['Updates & requests'],
      summary: 'Take a done or cancelled request off the list',
      request: { params: idParam },
      responses: { 200: okResponse(z.object({ removed: z.boolean() }), 'Removed'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').requests.dismiss(requestContext(c), c.req.valid('param').id), 'Removed from the list.'), 200),
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/requests/{id}/approve',
      tags: ['Updates & requests'],
      summary: 'Approve some of the suggested changes',
      request: { params: idParam, body: { required: true, content: { 'application/json': { schema: approveInputSchema } } } },
      responses: { 200: okResponse(requestDtoSchema, 'Approved'), ...errorResponses(400, 404, 422) },
    }),
    async (c) => c.json(ok(await c.get('services').requests.approve(requestContext(c), c.req.valid('param').id, c.req.valid('json').approved), 'Saved your choices.'), 200),
  );

  app.openapi(
    defineRoute('settings:manage', {
      method: 'post',
      path: '/api/v1/requests/{id}/create',
      tags: ['Updates & requests'],
      summary: 'Approve a new-product or new-module request and create it (owners)',
      request: { params: idParam },
      responses: { 200: okResponse(requestDtoSchema, 'Created'), ...errorResponses(400, 403, 404, 409, 422) },
    }),
    async (c) => {
      const r = await c.get('services').requests.approveCreate(requestContext(c), c.req.valid('param').id);
      return c.json(ok(r, `Created “${r.create?.name ?? 'it'}”. It starts private and coming soon.`), 200);
    },
  );
}

import type { OpenAPIHono } from '@hono/zod-openapi';
import { auditEntrySchema, auditQuerySchema, pagedSchema } from '../../../../admin/shared/api-types';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { idParam } from './util';

export function registerAudit(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/audit-log',
      tags: ['Audit log'],
      summary: 'Every change: who, when, area, what (newest first, paginated; filter by area, person, dates, text)',
      request: { query: auditQuerySchema },
      responses: { 200: okResponse(pagedSchema(auditEntrySchema), 'One page of entries'), ...errorResponses(422) },
    }),
    async (c) => c.json(ok(await c.get('services').activity.queryAudit(c.req.valid('query'))), 200),
  );

  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/audit-log/{id}',
      tags: ['Audit log'],
      summary: 'One audit entry with its details',
      request: { params: idParam },
      responses: { 200: okResponse(auditEntrySchema, 'The entry'), ...errorResponses(404) },
    }),
    async (c) => c.json(ok(await c.get('services').activity.getAudit(c.req.valid('param').id)), 200),
  );
}

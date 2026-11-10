import { z, type OpenAPIHono } from '@hono/zod-openapi';
import type { AppEnv } from '../context';
import { errorResponses } from '../responses';
import { defineRoute } from '../route';

export function registerFiles(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/files',
      tags: ['Uploads'],
      summary: 'A module picture or video (binary), e.g. path=products/acme-books/sales/images/x.webp',
      request: { query: z.object({ path: z.string().min(1).max(600) }) },
      responses: {
        200: { description: 'The file', content: { 'application/octet-stream': { schema: z.any().openapi({ type: 'string', format: 'binary' }) } } },
        ...errorResponses(400, 404, 422),
      },
    }),
    async (c) => {
      const { file, type } = await c.get('services').content.getFile(c.req.valid('query').path);
      return c.body(file.body as ReadableStream, 200, {
        'Content-Type': type,
        'Content-Length': String(file.size),
        'Cache-Control': 'private, no-cache',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
    },
  );
}

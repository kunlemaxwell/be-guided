import type { OpenAPIHono } from '@hono/zod-openapi';
import { chatAnswerSchema, chatInputSchema } from '../../../../admin/shared/api-types';
import type { ChatEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';

export function registerChat<E extends ChatEnv>(app: OpenAPIHono<E>): void {
  app.openapi(
    defineRoute('public', {
      method: 'post',
      path: '/api/v1/chat',
      tags: ['Ask AI'],
      summary: 'Ask AI for the public site. Answers only from published, public guide pages. CORS: CHAT_ALLOWED_ORIGINS only; rate limited per address.',
      request: { body: { required: true, content: { 'application/json': { schema: chatInputSchema } } } },
      responses: { 200: okResponse(chatAnswerSchema, 'The answer and the pages it used'), ...errorResponses(403, 422, 429, 503) },
    }),
    async (c) => c.json(ok(await c.get('services').chat.ask(c.req.valid('json'))), 200),
  );
}

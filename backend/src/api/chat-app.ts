import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { AppError, issuesFromZod } from '../domain/errors';
import type { ChatEnv, ChatServices } from './context';
import { chatCors, chatRateLimit } from './middleware/cors';
import { correlationId } from './middleware/correlation';
import { notFound, onError } from './middleware/errors';
import { securityHeaders } from './middleware/security-headers';
import { registerChat } from './routes/chat';

/** Ask AI questions are a few kilobytes; anything near this is not a real question. */
const CHAT_BODY_LIMIT = 64 * 1024;

/**
 * POST /api/v1/chat on its own, for Cloudflare: it needs only the Ask AI
 * settings (Claude key, site origin, rate limit), so Ask AI can be switched
 * on before GitHub and Access are set up. Same route, CORS, rate limit and
 * error envelope as the full API in api/app.ts.
 */
export function createChatApi(services: ChatServices): OpenAPIHono<ChatEnv> {
  const app = new OpenAPIHono<ChatEnv>({
    defaultHook: (result) => {
      if (!result.success) {
        const issues = issuesFromZod(result.error);
        throw new AppError('INVALID', `This can't be sent yet: ${issues.map((i) => i.message).join('; ')}.`, issues);
      }
    },
  });

  app.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });
  app.use('*', correlationId);
  app.use('*', securityHeaders);
  app.use('/api/v1/chat', chatCors, chatRateLimit);
  app.use('/api/v1/chat', bodyLimit({ maxSize: CHAT_BODY_LIMIT, onError: (c) => c.json({ success: false as const, code: 'FILE_TOO_LARGE' as const, message: 'That is too long to send.' }, 413) }));

  registerChat(app);

  app.onError(onError);
  app.notFound(notFound);
  return app;
}

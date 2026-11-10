import type { MiddlewareHandler } from 'hono';
import { AppError } from '../../domain/errors';
import type { ChatEnv } from '../context';

/**
 * CORS for the public Ask AI endpoint: only the public site's own origin(s)
 * (CHAT_ALLOWED_ORIGINS) may call it from a browser. No credentials.
 */
export const chatCors: MiddlewareHandler<ChatEnv> = async (c, next) => {
  const origin = c.req.header('origin');
  const allowed = c.get('services').config.chatOrigins;
  const permitted = origin !== undefined && allowed.includes(origin);
  if (c.req.method === 'OPTIONS') {
    if (!permitted) return c.body(null, 403);
    return c.body(null, 204, {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Correlation-Id',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    });
  }
  if (origin !== undefined && !permitted) throw new AppError('FORBIDDEN_ORIGIN', 'Ask AI can only be used from the guide site.');
  await next();
  if (permitted) {
    c.header('Access-Control-Allow-Origin', origin);
    c.header('Access-Control-Expose-Headers', 'X-Correlation-Id');
    c.header('Vary', 'Origin');
  }
};

/** Per-client-address limit on Ask AI (expensive endpoint). */
export const chatRateLimit: MiddlewareHandler<ChatEnv> = async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const s = c.get('services');
  if (!s.chatLimiter.take(s.clientIp(c.req.raw, c.env))) {
    const origin = c.req.header('origin');
    const cors: Record<string, string> = origin && s.config.chatOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    return c.json(
      { success: false as const, code: 'RATE_LIMITED' as const, message: 'You have asked a lot of questions in a short time. Wait a minute, then try again.' },
      429,
      { 'Retry-After': '60', ...cors },
    );
  }
  return next();
};

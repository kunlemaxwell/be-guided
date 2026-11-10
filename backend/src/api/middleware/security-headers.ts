import type { MiddlewareHandler } from 'hono';
import type { BaseEnv } from '../context';

/** Baseline security headers on every API response. */
export const securityHeaders: MiddlewareHandler<BaseEnv> = async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  if (c.req.path !== '/api/v1/chat' && c.req.path !== '/api/v1/mcp') c.header('Cross-Origin-Resource-Policy', 'same-origin');
  if (!c.res.headers.has('Content-Security-Policy')) c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
  if (c.get('services').config.mode === 'cloud') c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
};

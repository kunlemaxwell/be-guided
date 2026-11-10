import type { MiddlewareHandler } from 'hono';
import type { BaseEnv } from '../context';

const VALID = /^[A-Za-z0-9._-]{8,80}$/;

/** Every request gets a correlation id (caller's X-Correlation-Id if well-formed); echoed on the response and stored in the audit log. */
export const correlationId: MiddlewareHandler<BaseEnv> = async (c, next) => {
  const incoming = c.req.header('x-correlation-id');
  const id = incoming && VALID.test(incoming) ? incoming : crypto.randomUUID();
  c.set('correlationId', id);
  await next();
  c.header('X-Correlation-Id', id);
};

import type { MiddlewareHandler } from 'hono';
import { AppError } from '../../domain/errors';
import type { AppEnv } from '../context';
import { MCP_PATH } from './mcp';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

/**
 * Admin API guard (CSRF / DNS rebinding). Local: the Host must be this
 * computer's admin address. Both modes: a state-changing request carrying an
 * Origin must come from the admin itself, and its body must be JSON or a
 * file upload. The public Ask AI and MCP endpoints have their own CORS
 * allowlists instead (MCP keeps the local Host check against DNS rebinding).
 */
export const originCheck: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (c.req.path === '/api/v1/chat' || c.req.path === '/api/v1/chat/feedback') return next();
  const { config } = c.get('services');
  const url = new URL(c.req.url);
  const host = c.req.header('host') ?? url.host;
  if (config.mode === 'local' && !config.localHosts.includes(host)) {
    throw new AppError('FORBIDDEN_ORIGIN', 'Open the admin from this computer only.');
  }
  if (c.req.path === MCP_PATH) return next();
  if (SAFE.has(c.req.method)) return next();
  const origin = c.req.header('origin');
  if (origin) {
    const allowed = config.mode === 'local' ? config.localHosts : [host];
    const oh = hostOf(origin);
    if (!oh || !allowed.includes(oh)) throw new AppError('FORBIDDEN_ORIGIN', 'Open the admin from this computer only.');
  }
  const type = (c.req.header('content-type') ?? '').toLowerCase();
  // A request has a body only if it says so (Content-Length > 0 or chunked). Some runtimes give an empty
  // stream for body-less requests (e.g. DELETE), which must not count as "something unreadable".
  const length = c.req.header('content-length');
  const hasBody = length !== undefined ? length !== '0' : c.req.header('transfer-encoding') !== undefined;
  if (hasBody && !type.startsWith('application/json') && !type.startsWith('multipart/form-data')) {
    throw new AppError('INVALID', "The app sent something the server couldn't read.");
  }
  return next();
};

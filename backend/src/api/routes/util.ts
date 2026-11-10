import type { Context } from 'hono';
import { z } from '@hono/zod-openapi';
import type { RequestContext } from '../../domain/actor';
import type { AppEnv } from '../context';

export function requestContext(c: Context<AppEnv>): RequestContext {
  return { actor: c.get('actor'), correlationId: c.get('correlationId') };
}

/** Path parameters. Not validated as slugs here: services return BAD_PATH for unsafe names (e.g. "../x"). */
export const productParam = z.object({ product: z.string().openapi({ param: { name: 'product', in: 'path' }, example: 'acme-books' }) });
export const moduleParams = productParam.extend({ module: z.string().openapi({ param: { name: 'module', in: 'path' }, example: 'sales' }) });
export const pageParams = moduleParams.extend({ page: z.string().openapi({ param: { name: 'page', in: 'path' }, example: 'create-an-invoice' }) });
export const idParam = z.object({ id: z.string().max(120).openapi({ param: { name: 'id', in: 'path' } }) });

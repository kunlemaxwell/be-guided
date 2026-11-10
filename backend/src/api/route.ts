import { createRoute, type RouteConfig } from '@hono/zod-openapi';
import type { Policy } from '../domain/policies';
import { authorize } from './middleware/authorize';
import { errorResponses } from './responses';

/**
 * The only way routes are declared. A route cannot exist without a Policy:
 * the policy becomes both the enforcing middleware and the `x-policy`
 * field in docs/openapi.json (a contract test checks every operation has one).
 */
export function defineRoute<const R extends Omit<RouteConfig, 'middleware'>>(policy: Policy, config: R) {
  return createRoute({
    ...config,
    responses: {
      ...config.responses,
      ...(policy === 'public' ? {} : errorResponses(401, 403)),
      ...errorResponses(500),
    },
    middleware: [authorize(policy)] as const,
    security: policy === 'public' ? [] : [{ cloudflareAccess: [] }],
    'x-policy': policy,
  });
}

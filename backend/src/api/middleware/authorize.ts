import type { MiddlewareHandler } from 'hono';
import { AppError } from '../../domain/errors';
import { roleAllows, type Policy } from '../../domain/policies';
import type { AppEnv } from '../context';
import { actorForPass } from '../internal/admin-bridge';

/**
 * The one place authorization happens for HTTP. Every route passes its
 * declared Policy here (see api/route.ts). Order: identity (401) → person
 * (403 if unknown/inactive) → permission (403). Denials are logged with ids only.
 */
export function authorize(policy: Policy): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (policy === 'public') return next();
    const services = c.get('services');
    // The in-chat admin (see internal/admin-bridge.ts) arrives with a one-call pass for the key's person.
    let actor = actorForPass(c.req.raw.headers);
    if (!actor) {
      const identity = await services.identity.identify(c.req.raw.headers);
      if (!identity) throw new AppError('UNAUTHENTICATED', 'Sign in to use Be Guided.');
      actor = await services.people.resolveActor(identity);
    }
    if (policy !== 'authenticated' && !roleAllows(actor.role, policy)) {
      services.logger.warn('authz.denied', { correlationId: c.get('correlationId'), personId: actor.personId, role: actor.role, policy, path: c.req.routePath });
      throw new AppError('FORBIDDEN', "Your role doesn't allow this. Ask an owner if you need it.");
    }
    c.set('actor', actor);
    return next();
  };
}

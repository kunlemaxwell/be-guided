import type { Role } from '../../../admin/shared/api-types';

/** Who is behind a request. Resolved once per request by the IdentityProvider. */
export interface Actor {
  /** People table id; null only locally before "who is using this computer" is chosen. */
  personId: string | null;
  name: string;
  email: string | null;
  role: Role;
}

/** Ambient data every mutating service call receives (for history and the audit log). */
export interface RequestContext {
  actor: Actor;
  correlationId: string;
}

export const UNNAMED_LOCAL_ACTOR_NAME = 'This computer (no person chosen)';

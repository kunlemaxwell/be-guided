import { PERMISSIONS, ROLES, type Permission, type Role } from '../../../admin/shared/api-types';

/**
 * Authorization model. Every API route declares one Policy:
 *  - 'public'        no identity needed (health, Ask AI, the API contract)
 *  - 'authenticated' any known, active person (who am I, capabilities)
 *  - a Permission    the caller's role must grant it
 *
 * viewer = read; editor = pages, products, modules, requests, uploads;
 * owner = everything, including people, settings and publishing.
 */
export type Policy = 'public' | 'authenticated' | Permission;

const GRANTS: Record<Role, readonly Permission[]> = {
  viewer: ['content:read'],
  editor: ['content:read', 'content:write'],
  owner: PERMISSIONS,
};

export function permissionsFor(role: Role): Permission[] {
  return [...GRANTS[role]];
}

export function roleAllows(role: Role, permission: Permission): boolean {
  return GRANTS[role].includes(permission);
}

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/**
 * Names that must never be given to a person: they read like authority and
 * could mislead someone reading the audit log. Authority always comes from
 * the server-owned `role`, never from a name.
 */
export const RESERVED_PERSON_NAMES = ['admin', 'administrator', 'superuser', 'super user', 'root', 'system', 'owner', 'anthropic', 'claude code'];

export function isReservedName(name: string): boolean {
  const n = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return RESERVED_PERSON_NAMES.includes(n);
}

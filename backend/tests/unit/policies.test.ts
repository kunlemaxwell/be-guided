import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '../../../admin/shared/api-types';
import { isReservedName, permissionsFor, roleAllows } from '../../src/domain/policies';
import { authorDisplayName } from '../../src/domain/authors';
import { isPubliclyVisible } from '../../src/domain/visibility';

describe('role → permission matrix', () => {
  const matrix: Record<string, Record<string, boolean>> = {
    viewer: { 'content:read': true, 'content:write': false, 'settings:manage': false, 'people:manage': false, publish: false },
    editor: { 'content:read': true, 'content:write': true, 'settings:manage': false, 'people:manage': false, publish: false },
    owner: { 'content:read': true, 'content:write': true, 'settings:manage': true, 'people:manage': true, publish: true },
  };
  for (const [role, perms] of Object.entries(matrix)) {
    for (const p of PERMISSIONS) {
      it(`${role} ${perms[p] ? 'may' : 'may not'} ${p}`, () => {
        expect(roleAllows(role as 'viewer', p)).toBe(perms[p]);
      });
    }
  }
  it('lists permissions per role', () => {
    expect(permissionsFor('viewer')).toEqual(['content:read']);
    expect(permissionsFor('owner')).toEqual([...PERMISSIONS]);
  });
});

describe('reserved names', () => {
  it.each(['Admin', ' administrator ', 'SuperUser', 'super   user', 'ROOT', 'Owner', 'System'])('refuses %s', (n) => expect(isReservedName(n)).toBe(true));
  it.each(['Site Owner', 'Claude', 'Ada Admina'])('allows %s', (n) => expect(isReservedName(n)).toBe(false));
});

describe('authors', () => {
  it('maps legacy values', () => {
    expect(authorDisplayName('claude')).toBe('Claude');
    expect(authorDisplayName('human')).toBe('Not set');
    expect(authorDisplayName('Site Owner')).toBe('Site Owner');
    expect(authorDisplayName(undefined)).toBe('Not set');
  });
});

describe('public visibility', () => {
  it('needs a public product, a published page and a public page', () => {
    expect(isPubliclyVisible({ visibility: 'public' }, { status: 'published', visibility: 'public' })).toBe(true);
    expect(isPubliclyVisible({ visibility: 'public' }, {})).toBe(true);
    expect(isPubliclyVisible({ visibility: 'private' }, { status: 'published' })).toBe(false);
    expect(isPubliclyVisible({ visibility: 'public' }, { status: 'draft' })).toBe(false);
    expect(isPubliclyVisible({ visibility: 'public' }, { status: 'published', visibility: 'private' })).toBe(false);
    expect(isPubliclyVisible({ visibility: 'public', status: 'coming-soon' }, { status: 'published' })).toBe(false);
  });
});

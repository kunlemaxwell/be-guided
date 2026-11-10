import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MeDto, PersonDto } from '../../../admin/shared/api-types';
import { dataOf, IN_PROCESS, localHarness, type Harness } from './harness';

let h: Harness;
beforeAll(async () => {
  h = await localHarness();
});
afterAll(() => h.cleanup());

describe('people', () => {
  it('starts with the owner (who is using this computer) and Claude', async () => {
    const people = dataOf<PersonDto[]>(await h.api.get('/api/v1/people'));
    expect(people.map((p) => [p.name, p.role])).toEqual([
      ['Claude', 'editor'],
      ['Site Owner', 'owner'],
    ]);
    const me = dataOf<MeDto>(await h.api.get('/api/v1/me'));
    expect(me.person?.name).toBe('Site Owner');
  });

  it('adds a person and refuses duplicates, reserved names and bad input', async () => {
    const r = await h.api.post('/api/v1/people', { name: 'Ada Lovelace', email: 'Ada@Example.com', role: 'editor' });
    expect(r.status).toBe(201);
    expect(dataOf<PersonDto>(r)).toMatchObject({ name: 'Ada Lovelace', email: 'ada@example.com', role: 'editor', active: true });
    expect((await h.api.post('/api/v1/people', { name: 'Ada Again', email: 'ADA@example.com', role: 'viewer' })).status).toBe(409);
    const reserved = await h.api.post('/api/v1/people', { name: 'Administrator', role: 'owner' });
    expect(reserved.status).toBe(422);
    expect(reserved.body.issues?.[0]?.field).toBe('name');
    expect((await h.api.post('/api/v1/people', { name: 'X', role: 'superuser' })).status).toBe(422);
    expect((await h.api.post('/api/v1/people', { name: '', role: 'viewer' })).status).toBe(422);
    expect((await h.api.post('/api/v1/people', { name: 'Y', email: 'not-an-email', role: 'viewer' })).status).toBe(422);
  });

  it('changes a person, and always keeps one active owner', async () => {
    const people = dataOf<PersonDto[]>(await h.api.get('/api/v1/people'));
    const owner = people.find((p) => p.role === 'owner')!;
    const demote = await h.api.put(`/api/v1/people/${owner.id}`, { name: owner.name, email: '', role: 'editor', active: true });
    expect(demote.status).toBe(409);
    expect(demote.body.code).toBe('CONFLICT');
    const off = await h.api.put(`/api/v1/people/${owner.id}`, { name: owner.name, role: 'owner', active: false });
    expect(off.status).toBe(409);
    const ada = people.find((p) => p.name === 'Ada Lovelace')!;
    const r = await h.api.put(`/api/v1/people/${ada.id}`, { name: 'Ada King', email: 'ada@example.com', role: 'viewer', active: false });
    expect(dataOf<PersonDto>(r)).toMatchObject({ name: 'Ada King', role: 'viewer', active: false });
    expect((await h.api.put('/api/v1/people/unknown-id', { name: 'Z', role: 'viewer', active: true })).status).toBe(404);
  });

  it.runIf(IN_PROCESS)('sets who is using this computer; refuses inactive or unknown people', async () => {
    const people = dataOf<PersonDto[]>(await h.api.get('/api/v1/people'));
    const claude = people.find((p) => p.name === 'Claude')!;
    const me = dataOf<MeDto>(await h.api.put('/api/v1/settings/current-person', { personId: claude.id }));
    // Locally the person at this computer always has the owner role.
    expect(me).toMatchObject({ displayName: 'Claude', role: 'owner' });
    const inactive = people.find((p) => !p.active)!;
    expect((await h.api.put('/api/v1/settings/current-person', { personId: inactive.id })).status).toBe(422);
    expect((await h.api.put('/api/v1/settings/current-person', { personId: 'nobody' })).status).toBe(404);
    const cleared = dataOf<MeDto>(await h.api.put('/api/v1/settings/current-person', { personId: null }));
    expect(cleared.person).toBeNull();
    const siteOwner = people.find((p) => p.name === 'Site Owner')!;
    await h.api.put('/api/v1/settings/current-person', { personId: siteOwner.id });
  });
});

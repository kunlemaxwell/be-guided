import type { AppMode, MeDto, NewPersonInput, PersonDto, UpdatePersonInput } from '../../../../admin/shared/api-types';
import { UNNAMED_LOCAL_ACTOR_NAME, type Actor, type RequestContext } from '../../domain/actor';
import { diffFields } from '../../domain/diff';
import { AppError } from '../../domain/errors';
import { isReservedName, permissionsFor } from '../../domain/policies';
import type { AppSettingsRepository, Clock, Identity, PeopleRepository, SignInList } from '../ports';

/** What happened to the sign-in list after a change in People. */
export type SignInSync = 'updated' | 'not-needed' | 'not-set-up' | 'failed';
import type { ActivityService } from './activity-service';

const LOCAL_PERSON_KEY = 'local.currentPersonId';

/**
 * People who write and publish, their roles, and turning a verified
 * identity into an Actor. Authority always comes from the server-owned
 * `role` column, never from a name the person typed.
 */
export class PeopleService {
  constructor(
    private readonly people: PeopleRepository,
    private readonly settings: AppSettingsRepository,
    private readonly activity: ActivityService,
    private readonly clock: Clock,
    private readonly newId: () => string,
    private readonly mode: AppMode,
    /** Cloud only: the email allowed to become the first owner while People is empty. */
    private readonly bootstrapOwnerEmail: string | null = null,
    /** Cloud: Cloudflare Access, kept in step with People. Null when not set up (or locally). */
    private readonly signIn: SignInList | null = null,
  ) {}

  /** Makes the sign-in list match the active people. Never fails the People change itself. */
  private async syncSignIn(ctx: RequestContext): Promise<SignInSync> {
    if (!this.signIn) return this.mode === 'local' ? 'not-needed' : 'not-set-up';
    const emails = (await this.people.list()).filter((p) => p.active && p.email).map((p) => p.email!);
    try {
      await this.signIn.sync(emails);
      return 'updated';
    } catch (e) {
      await this.activity.record(ctx, {
        area: 'people',
        action: 'people.sign-in.failed',
        target: 'sign-in list',
        summary: 'Could not update who can sign in',
        details: { reason: e instanceof Error ? e.message : 'unknown' },
      });
      return 'failed';
    }
  }

  /** Re-applies the People list to the sign-in list (owners, e.g. after setting up the Cloudflare token). */
  async resyncSignIn(ctx: RequestContext): Promise<SignInSync> {
    return this.syncSignIn(ctx);
  }

  list(): Promise<PersonDto[]> {
    return this.people.list();
  }

  /**
   * Identity → Actor. Locally: the person chosen as "who is using this
   * computer", always with the owner role. Cloud: the active person with that
   * verified email; anyone else is refused (403).
   */
  async resolveActor(identity: Identity): Promise<Actor> {
    if (identity.kind === 'local') {
      const id = await this.settings.get(LOCAL_PERSON_KEY);
      const person = id ? await this.people.get(id) : null;
      if (person && person.active) return { personId: person.id, name: person.name, email: person.email, role: 'owner' };
      return { personId: null, name: UNNAMED_LOCAL_ACTOR_NAME, email: null, role: 'owner' };
    }
    let person = await this.people.findByEmail(identity.email);
    if (!person && this.bootstrapOwnerEmail && identity.email === this.bootstrapOwnerEmail.toLowerCase() && (await this.people.count()) === 0) {
      // First sign-in on a fresh cloud install: the configured owner becomes the first person.
      person = await this.insert({ name: identity.email.split('@')[0] ?? 'Owner', email: identity.email, role: 'owner', active: true });
    }
    if (!person || !person.active) throw new AppError('FORBIDDEN', 'You are signed in, but you have not been added to Be Guided. Ask the owner to add you in Settings › People.');
    return { personId: person.id, name: person.name, email: person.email, role: person.role };
  }

  async me(actor: Actor): Promise<MeDto> {
    const person = actor.personId ? await this.people.get(actor.personId) : null;
    return { mode: this.mode, person, displayName: actor.name, role: actor.role, permissions: permissionsFor(actor.role) };
  }

  private async insert(input: { name: string; email: string | null; role: PersonDto['role']; active: boolean }): Promise<PersonDto> {
    const at = this.clock.now().toISOString();
    const person: PersonDto = { id: this.newId(), name: input.name, email: input.email, role: input.role, active: input.active, createdAt: at, updatedAt: at };
    await this.people.insert(person);
    return person;
  }

  private async checkName(name: string): Promise<void> {
    if (isReservedName(name)) {
      throw new AppError('INVALID', `“${name.trim()}” can't be used as a name. Use the person's real name.`, [{ field: 'name', message: 'Name is reserved; use the person’s real name' }]);
    }
  }

  private async checkEmail(email: string | null, selfId: string | null): Promise<void> {
    if (!email) return;
    const other = await this.people.findByEmail(email);
    if (other && other.id !== selfId) throw new AppError('ALREADY_EXISTS', 'Someone in People already has that email address.', [{ field: 'email', message: 'Email is already used by someone else' }]);
  }

  async create(ctx: RequestContext, input: NewPersonInput): Promise<{ person: PersonDto; signIn: SignInSync }> {
    const name = input.name.trim();
    const email = input.email?.trim().toLowerCase() || null;
    await this.checkName(name);
    await this.checkEmail(email, null);
    const person = await this.insert({ name, email, role: input.role, active: true });
    await this.activity.record(ctx, { area: 'people', action: 'person.create', target: person.id, summary: `Added ${person.name} as ${person.role}`, details: { after: { name, email, role: person.role } } });
    return { person, signIn: await this.syncSignIn(ctx) };
  }

  async update(ctx: RequestContext, id: string, input: UpdatePersonInput): Promise<{ person: PersonDto; signIn: SignInSync }> {
    const before = await this.people.get(id);
    if (!before) throw new AppError('NOT_FOUND', 'That person is no longer in the list.');
    const name = input.name.trim();
    const email = input.email?.trim().toLowerCase() || null;
    if (name !== before.name) await this.checkName(name);
    await this.checkEmail(email, id);
    const losesOwner = before.role === 'owner' && before.active && (input.role !== 'owner' || !input.active);
    if (losesOwner) {
      const owners = (await this.people.list()).filter((p) => p.role === 'owner' && p.active && p.id !== id);
      if (owners.length === 0) throw new AppError('CONFLICT', 'There must always be at least one active owner. Make someone else an owner first.');
    }
    const next: PersonDto = { ...before, name, email, role: input.role, active: input.active, updatedAt: this.clock.now().toISOString() };
    await this.people.update(next);
    const changes = diffFields({ name: before.name, email: before.email, role: before.role, active: before.active }, { name, email, role: input.role, active: input.active });
    await this.activity.record(ctx, {
      area: 'people',
      action: 'person.update',
      target: id,
      summary: changes.length ? `Changed ${next.name}: ${changes.map((c) => c.field).join(', ')}` : `Saved ${next.name} (no changes)`,
      details: { changes },
    });
    const access = changes.some((c) => c.field === 'email' || c.field === 'active') ? await this.syncSignIn(ctx) : 'not-needed';
    return { person: next, signIn: access };
  }

  /** Local only: who is using this computer. Null clears the choice. */
  async setCurrentPerson(ctx: RequestContext, personId: string | null): Promise<Actor> {
    if (this.mode !== 'local') throw new AppError('NOT_SUPPORTED', 'Online, everyone signs in as themselves.');
    let person: PersonDto | null = null;
    if (personId) {
      person = await this.people.get(personId);
      if (!person) throw new AppError('NOT_FOUND', 'That person is no longer in the list.');
      if (!person.active) throw new AppError('INVALID', `${person.name} is switched off. Switch them on first.`, [{ field: 'personId', message: 'Person is not active' }]);
    }
    await this.settings.set(LOCAL_PERSON_KEY, person?.id ?? null, this.clock.now().toISOString());
    const actor: Actor = person ? { personId: person.id, name: person.name, email: person.email, role: 'owner' } : { personId: null, name: UNNAMED_LOCAL_ACTOR_NAME, email: null, role: 'owner' };
    await this.activity.record(
      { ...ctx, actor },
      { area: 'settings', action: 'settings.current-person', target: 'this computer', summary: person ? `${person.name} is now using this computer` : 'Cleared who is using this computer', details: { before: ctx.actor.name, after: actor.name } },
    );
    return actor;
  }

  /**
   * First local start: add the owner and Claude, and make the owner "who is using this computer".
   * PROTOTYPE: seed names come from config (ADMIN_OWNER_NAME). Production (cloud) uses BOOTSTRAP_OWNER_EMAIL instead.
   */
  async seedLocal(owner: { name: string }): Promise<void> {
    if ((await this.people.count()) > 0) return;
    const o = await this.insert({ name: owner.name, email: null, role: 'owner', active: true });
    await this.insert({ name: 'Claude', email: null, role: 'editor', active: true });
    await this.settings.set(LOCAL_PERSON_KEY, o.id, this.clock.now().toISOString());
  }
}

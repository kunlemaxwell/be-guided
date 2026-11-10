import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { newPersonSchema, personSchema, updatePersonSchema } from '../../../../admin/shared/api-types';
import type { SignInSync } from '../../application/services/people-service';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { idParam, requestContext } from './util';

export function registerPeople(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'get',
      path: '/api/v1/people',
      tags: ['People'],
      summary: 'People who write and publish (authors are picked from this list)',
      responses: { 200: okResponse(z.array(personSchema), 'Everyone, active first') },
    }),
    async (c) => c.json(ok(await c.get('services').people.list()), 200),
  );

  app.openapi(
    defineRoute('people:manage', {
      method: 'post',
      path: '/api/v1/people',
      tags: ['People'],
      summary: 'Add a person',
      request: { body: { required: true, content: { 'application/json': { schema: newPersonSchema } } } },
      responses: { 201: okResponse(personSchema, 'The new person'), ...errorResponses(409, 422) },
    }),
    async (c) => {
      const r = await c.get('services').people.create(requestContext(c), c.req.valid('json'));
      return c.json(ok(r.person, `Person added.${signInNote(r.signIn, r.person.email)}`), 201);
    },
  );

  app.openapi(
    defineRoute('people:manage', {
      method: 'put',
      path: '/api/v1/people/{id}',
      tags: ['People'],
      summary: 'Change a person (name, email, role, active). There is always at least one active owner.',
      request: { params: idParam, body: { required: true, content: { 'application/json': { schema: updatePersonSchema } } } },
      responses: { 200: okResponse(personSchema, 'The person'), ...errorResponses(404, 409, 422) },
    }),
    async (c) => {
      const r = await c.get('services').people.update(requestContext(c), c.req.valid('param').id, c.req.valid('json'));
      return c.json(ok(r.person, `Saved.${r.signIn === 'updated' || r.signIn === 'not-needed' ? '' : signInNote(r.signIn, r.person.email)}`), 200);
    },
  );
}

export function registerSignInSync(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('people:manage', {
      method: 'post',
      path: '/api/v1/people/sign-in/sync',
      tags: ['People'],
      summary: 'Make the sign-in list (Cloudflare Access) match the active people',
      responses: { 200: okResponse(z.object({ signIn: z.enum(['updated', 'not-needed', 'not-set-up', 'failed']) }), 'What happened') },
    }),
    async (c) => {
      const signIn = await c.get('services').people.resyncSignIn(requestContext(c));
      const msg = signIn === 'updated' || signIn === 'not-needed' ? 'Everyone in People can now sign in.' : signIn === 'not-set-up' ? 'Automatic sign-in access is not set up yet.' : 'Cloudflare did not accept the update. Try again later.';
      return c.json(ok({ signIn }, msg), 200);
    },
  );
}

/** What the owner is told about signing in after a People change. */
function signInNote(state: SignInSync, email: string | null): string {
  if (state === 'not-needed') return '';
  if (state === 'failed') return ' Their sign-in could not be switched on right now; it is retried with the next change in People.';
  if (state === 'not-set-up') return ' Automatic sign-in access is not set up yet, so add their email in Cloudflare Access too.';
  return email ? ` They can now sign in with ${email} (they get a code by email).` : '';
}

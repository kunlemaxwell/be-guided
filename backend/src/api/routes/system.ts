import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { capabilitiesSchema, currentPersonInputSchema, folderChoiceSchema, healthSchema, meSchema } from '../../../../admin/shared/api-types';
import { AppError } from '../../domain/errors';
import { allowedExtensions } from '../../domain/files';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { requestContext } from './util';

export function registerSystem(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('public', {
      method: 'get',
      path: '/api/v1/health',
      tags: ['System'],
      summary: 'Liveness check',
      responses: { 200: okResponse(healthSchema, 'The API is running') },
    }),
    (c) => {
      const { config } = c.get('services');
      return c.json(ok({ status: 'ok' as const, mode: config.mode, version: config.version }), 200);
    },
  );

  app.openapi(
    defineRoute('authenticated', {
      method: 'get',
      path: '/api/v1/me',
      tags: ['System'],
      summary: 'Who is calling: person, role and permissions',
      responses: { 200: okResponse(meSchema, 'The caller') },
    }),
    async (c) => c.json(ok(await c.get('services').people.me(c.get('actor'))), 200),
  );

  app.openapi(
    defineRoute('authenticated', {
      method: 'get',
      path: '/api/v1/capabilities',
      tags: ['System'],
      summary: 'What this installation can do (folder picker, Ask AI, upload limits)',
      responses: { 200: okResponse(capabilitiesSchema, 'Capabilities') },
    }),
    (c) => {
      const s = c.get('services');
      return c.json(
        ok({
          mode: s.config.mode,
          folderPicker: s.folderPicker !== null,
          chat: s.chat.available,
          uploads: {
            imageMaxBytes: s.uploads.limits.imageMaxBytes,
            videoMaxBytes: s.uploads.limits.videoMaxBytes,
            imageExtensions: [...allowedExtensions('image')],
            videoExtensions: [...allowedExtensions('video')],
          },
          siteUrl: s.config.siteUrl,
        }),
        200,
      );
    },
  );

  app.openapi(
    defineRoute('content:write', {
      method: 'post',
      path: '/api/v1/system/choose-folder',
      tags: ['System'],
      summary: 'Open the Mac "Choose folder…" dialog (local Mac only); path is null when cancelled',
      responses: { 200: okResponse(folderChoiceSchema, 'The chosen folder'), ...errorResponses(501) },
    }),
    async (c) => {
      const picker = c.get('services').folderPicker;
      if (!picker) throw new AppError('NOT_SUPPORTED', 'Choosing a folder works only in the admin on the Mac.');
      return c.json(ok({ path: await picker.chooseFolder() }), 200);
    },
  );

  app.openapi(
    defineRoute('settings:manage', {
      method: 'put',
      path: '/api/v1/settings/current-person',
      tags: ['People'],
      summary: 'Set who is using this computer (local only)',
      request: { body: { required: true, content: { 'application/json': { schema: currentPersonInputSchema } } } },
      responses: { 200: okResponse(meSchema, 'The caller after the change'), ...errorResponses(404, 422, 501) },
    }),
    async (c) => {
      const s = c.get('services');
      const actor = await s.people.setCurrentPerson(requestContext(c), c.req.valid('json').personId);
      return c.json(ok(await s.people.me(actor), 'Saved.'), 200);
    },
  );

  // Keep zod-openapi's z referenced for consumers that extend schemas here.
  void z;
}

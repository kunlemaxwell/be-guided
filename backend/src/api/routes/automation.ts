import { z, type OpenAPIHono } from '@hono/zod-openapi';
import { automationCallSchema, voteInputSchema } from '../../../../admin/shared/automation-types';
import { runAutomationTool } from '../../application/automation-tools';
import type { AppEnv } from '../context';
import { errorResponses, ok, okResponse } from '../responses';
import { defineRoute } from '../route';
import { requestContext } from './util';

/** Public address for readers' votes. It sits under /api/v1/chat so the same sign-in bypass and CORS rules apply. */
export const FEEDBACK_PATH = '/api/v1/chat/feedback';

export function registerAutomation(app: OpenAPIHono<AppEnv>): void {
  app.openapi(
    defineRoute('content:read', {
      method: 'post',
      path: '/api/v1/automation/call',
      tags: ['Automatic checks and skills'],
      summary: 'Run one automatic-checks tool (the same tools as the editor connector), e.g. automation_overview, save_update_plan, decide_update_check, save_skill, feedback_summary',
      description: 'Each tool has its own level: read (anyone), write (editors and owners) or manage (owners). Arguments are validated per tool.',
      request: { body: { required: true, content: { 'application/json': { schema: automationCallSchema } } } },
      responses: { 200: okResponse(z.any(), 'The tool result'), ...errorResponses(404, 409, 422) },
    }),
    async (c) => {
      const s = c.get('services');
      const { tool, args } = c.req.valid('json');
      const r = await runAutomationTool({ automation: s.automation, feedback: s.feedback, ctx: requestContext(c), scope: null }, tool, args);
      return c.json(ok(r.data, r.message), 200);
    },
  );

  app.openapi(
    defineRoute('public', {
      method: 'post',
      path: FEEDBACK_PATH,
      tags: ['Ask AI'],
      summary: 'A reader\'s "Was this helpful?" vote on a guide page (optional comment and email). One vote per page per browser; voting again replaces it. CORS: CHAT_ALLOWED_ORIGINS only; rate limited per address.',
      request: { body: { required: true, content: { 'application/json': { schema: voteInputSchema } } } },
      responses: { 200: okResponse(z.object({ saved: z.literal(true) }), 'Saved'), ...errorResponses(403, 422, 429) },
    }),
    async (c) => {
      const s = c.get('services');
      return c.json(ok(await s.feedback.vote(c.req.valid('json'), c.req.header('cf-ipcountry') ?? null), 'Thanks for your feedback.'), 200);
    },
  );
}

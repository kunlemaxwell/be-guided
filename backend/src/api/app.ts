import { OpenAPIHono } from '@hono/zod-openapi';
import { bodyLimit } from 'hono/body-limit';
import { API_ERROR_STATUS } from '../../../admin/shared/api-types';
import { AppError, issuesFromZod } from '../domain/errors';
import type { AppEnv, Services } from './context';
import { chatCors, chatRateLimit } from './middleware/cors';
import { correlationId } from './middleware/correlation';
import { MCP_PATH, mcpBodyLimit, mcpCors, mcpRateLimit } from './middleware/mcp';
import { notFound, onError } from './middleware/errors';
import { originCheck } from './middleware/origin';
import { securityHeaders } from './middleware/security-headers';
import { registerAudit } from './routes/audit';
import { FEEDBACK_PATH, registerAutomation } from './routes/automation';
import { registerChat } from './routes/chat';
import { EDITOR_PATH, registerEditor } from './routes/editor';
import { registerFiles } from './routes/files';
import { registerLibrary } from './routes/library';
import { registerMcp } from './routes/mcp';
import { registerPages } from './routes/pages';
import { registerPeople, registerSignInSync } from './routes/people';
import { registerPublish } from './routes/publish';
import { registerRequests } from './routes/requests';
import { registerSite } from './routes/site';
import { registerSystem } from './routes/system';

const JSON_BODY_LIMIT = 5 * 1024 * 1024;
/** The editor connector carries base64 screenshots. */
const EDITOR_BODY_LIMIT = 14 * 1024 * 1024;

/**
 * The Be Guided HTTP API (/api/v1). Runtime-neutral: the same app runs
 * under Node (backend/src/node.ts) and Cloudflare Workers (backend/src/worker.ts);
 * only the Services passed in differ.
 */
export function createApi(services: Services): OpenAPIHono<AppEnv> {
  const app = new OpenAPIHono<AppEnv>({
    // Validation failures become INVALID (422) with one issue per field.
    defaultHook: (result) => {
      if (!result.success) {
        const issues = issuesFromZod(result.error);
        throw new AppError('INVALID', `This can't be saved yet: ${issues.map((i) => i.message).join('; ')}.`, issues);
      }
    },
  });

  app.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });
  app.use('*', correlationId);
  app.use('*', securityHeaders);
  app.use('/api/*', originCheck);
  app.use('/api/v1/chat', chatCors, chatRateLimit);
  app.use(FEEDBACK_PATH, chatCors, chatRateLimit);
  app.use(MCP_PATH, mcpCors, mcpRateLimit, mcpBodyLimit);

  const uploadLimit = Math.max(services.uploads.limits.imageMaxBytes, services.uploads.limits.videoMaxBytes) + 1024 * 1024;
  const tooLarge = { success: false as const, code: 'FILE_TOO_LARGE' as const, message: 'That is too big to send in one go.' };
  const uploadBody = bodyLimit({ maxSize: uploadLimit, onError: (c) => c.json(tooLarge, 413) });
  const jsonBody = bodyLimit({ maxSize: JSON_BODY_LIMIT, onError: (c) => c.json(tooLarge, 413) });
  const editorBody = bodyLimit({ maxSize: EDITOR_BODY_LIMIT, onError: (c) => c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'That is too big to send in one go (pictures up to about 10 MB).' }, id: null }, 413) });
  app.use('/api/*', (c, next) =>
    c.req.path === MCP_PATH ? next() : c.req.path === EDITOR_PATH ? editorBody(c, next) : c.req.path.endsWith('/uploads') || c.req.path.startsWith(`${EDITOR_PATH}/upload/`) ? uploadBody(c, next) : jsonBody(c, next),
  );

  registerSystem(app);
  registerSite(app);
  registerLibrary(app);
  registerPages(app);
  registerFiles(app);
  registerPeople(app);
  registerSignInSync(app);
  registerAudit(app);
  registerRequests(app);
  registerPublish(app);
  registerChat(app);
  registerMcp(app);
  registerEditor(app);
  registerAutomation(app);

  app.openAPIRegistry.registerComponent('securitySchemes', 'cloudflareAccess', {
    type: 'apiKey',
    in: 'header',
    name: 'Cf-Access-Jwt-Assertion',
    description: 'Cloud mode: the signed Cloudflare Access JWT. Local mode: no header; the API listens on 127.0.0.1 only and the person is "who is using this computer".',
  });

  app.get('/api/v1/openapi.json', (c) => c.json(openApiDocument(app, services.config.version)));

  app.onError(onError);
  app.notFound(notFound);
  return app;
}

/** OpenAPI 3 document generated from the zod route definitions (also written to docs/openapi.json). */
export function openApiDocument(app: OpenAPIHono<AppEnv>, version: string) {
  const doc = app.getOpenAPIDocument({
    openapi: '3.0.3',
    info: {
      title: 'Be Guided API',
      version,
      description: [
        'Backend for the Be Guided admin, the public Ask AI widget and the "Connect your AI" MCP connector (/api/v1/mcp, JSON-RPC).',
        'Every response uses the envelope `{ success, message, data }`; errors are `{ success: false, code, message, issues? }`.',
        'Each operation lists its authorization policy in `x-policy`: public | authenticated | content:read | content:write | settings:manage | people:manage | publish.',
        'Roles: viewer = content:read; editor = + content:write; owner = everything.',
      ].join('\n\n'),
    },
    servers: [{ url: '/' }],
  });
  return { ...doc, 'x-error-codes': API_ERROR_STATUS };
}

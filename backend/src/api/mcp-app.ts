import { OpenAPIHono } from '@hono/zod-openapi';
import type { McpEnv, McpServices } from './context';
import { correlationId } from './middleware/correlation';
import { notFound, onError } from './middleware/errors';
import { MCP_PATH, mcpBodyLimit, mcpCors, mcpRateLimit } from './middleware/mcp';
import { securityHeaders } from './middleware/security-headers';
import { registerMcp } from './routes/mcp';

/**
 * /api/v1/mcp on its own, for Cloudflare: it needs only the connector's
 * settings (site address, guide index, CORS, rate limit), so "Connect your
 * AI" works before GitHub, Access or a Claude key are set up. Same route,
 * CORS, rate limit and body limit as the full API in api/app.ts.
 */
export function createMcpApi(services: McpServices): OpenAPIHono<McpEnv> {
  const app = new OpenAPIHono<McpEnv>();
  app.use('*', async (c, next) => {
    c.set('services', services);
    await next();
  });
  app.use('*', correlationId);
  app.use('*', securityHeaders);
  app.use(MCP_PATH, mcpCors, mcpRateLimit, mcpBodyLimit);

  registerMcp(app);

  app.onError(onError);
  app.notFound(notFound);
  return app;
}

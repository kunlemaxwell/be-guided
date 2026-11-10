import type { OpenAPIHono } from '@hono/zod-openapi';
import type { McpEnv } from './api/context';
import { createMcpApi } from './api/mcp-app';
import { GuideToolsService } from './application/services/guide-tools-service';
import { API_VERSION, loadConfig, mcpConfigSchema, mcpOrigins } from './config';
import { consoleLogger } from './infrastructure/shared/console-logger';
import { MemoryRateLimiter } from './infrastructure/shared/memory-rate-limiter';
import { SiteIndexGuideSource } from './infrastructure/shared/site-index-guide-source';

export { MCP_PATH } from './api/middleware/mcp';

/** Test seam: a fake fetch instead of the live site. */
export interface McpWorkerOverrides {
  fetch?: typeof fetch;
}

/**
 * The MCP connector on Cloudflare, built from its own settings alone (see
 * mcpConfigSchema). Pages come from the published site's index
 * (/ask-ai/pages.json), the same GuidePageSource Ask AI uses, so neither
 * GitHub, Access nor a Claude key is needed. Throws if those settings are invalid.
 */
export function buildMcpApp(env: Record<string, unknown>, overrides: McpWorkerOverrides = {}): OpenAPIHono<McpEnv> {
  const config = loadConfig(mcpConfigSchema, env);
  const site = config.SITE_URL.replace(/\/+$/, '');
  const guide = new SiteIndexGuideSource({ url: config.MCP_CONTENT_URL ?? config.CHAT_CONTENT_URL ?? `${site}/ask-ai/pages.json`, fetch: overrides.fetch, logger: consoleLogger });
  return createMcpApi({
    config: { mode: 'cloud', localHosts: [], chatOrigins: [], mcpOrigins: mcpOrigins(config.MCP_ALLOWED_ORIGINS, site), siteUrl: site, version: API_VERSION },
    guideTools: new GuideToolsService(guide, site),
    mcpLimiter: new MemoryRateLimiter(config.MCP_RATE_LIMIT_PER_MINUTE, 60_000),
    logger: consoleLogger,
    clientIp: (req) => req.headers.get('cf-connecting-ip') ?? 'unknown',
  });
}

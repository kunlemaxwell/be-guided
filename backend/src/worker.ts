import type { OpenAPIHono } from '@hono/zod-openapi';
import initSql from '../migrations/0001_init.sql';
import editorSql from '../migrations/0002_editor_connector.sql';
import revisionsSql from '../migrations/0003_change_revisions.sql';
import ticketsSql from '../migrations/0004_upload_tickets.sql';
import automationSql from '../migrations/0005_automation.sql';
import { createApi } from './api/app';
import type { AppEnv, ChatEnv, McpEnv } from './api/context';
import { buildChatApp, CHAT_PATH } from './chat-worker';
import { buildMcpApp, MCP_PATH } from './mcp-worker';
import { composeServices } from './compose';
import { API_VERSION, cloudConfigSchema, loadConfig, mcpOrigins, megabytes } from './config';
import { AccessIdentityProvider } from './infrastructure/cloudflare/access-identity';
import type { WorkerEnv } from './infrastructure/cloudflare/bindings';
import { D1Database } from './infrastructure/cloudflare/d1-database';
import { DeployHookPublisher } from './infrastructure/cloudflare/deploy-hook-publisher';
import { GitHubContentRepository } from './infrastructure/cloudflare/github-content-repository';
import { CloudflareAccessSignInList } from './infrastructure/cloudflare/access-sign-in-list';
import { GitHubMediaStore } from './infrastructure/cloudflare/github-media-store';
import { R2MediaStore } from './infrastructure/cloudflare/r2-media-store';
import { AnthropicChatModel } from './infrastructure/shared/anthropic-chat-model';
import { consoleLogger } from './infrastructure/shared/console-logger';
import { MemoryRateLimiter } from './infrastructure/shared/memory-rate-limiter';
import { migrate } from './infrastructure/shared/migrator';
import { SqlRequestRepository } from './infrastructure/shared/sql-request-repository';

/**
 * Cloudflare Workers entry point. /api/* is the API; everything else is the
 * admin web app (built by `npm run build:admin`, served from the ASSETS
 * binding). /api/v1/chat runs from chat-worker.ts with the Ask AI settings
 * only, and /api/v1/mcp ("Connect your AI") from mcp-worker.ts with the
 * connector settings only, so both work before GitHub and Access are
 * configured. Cloudflare Access sits in front of the whole hostname except
 * /api/v1/chat, /api/v1/mcp and /api/v1/health (bypass policy), see docs/DEPLOY.md.
 */

let cached: { app: OpenAPIHono<AppEnv>; ready: Promise<unknown>; services: ReturnType<typeof composeServices> } | null = null;
let chatCached: OpenAPIHono<ChatEnv> | null = null;
let mcpCached: OpenAPIHono<McpEnv> | null = null;

function build(env: WorkerEnv): { app: OpenAPIHono<AppEnv>; ready: Promise<unknown>; services: ReturnType<typeof composeServices> } {
  const config = loadConfig(cloudConfigSchema, env);
  const db = new D1Database(env.DB);
  const content = new GitHubContentRepository({
    repo: config.GITHUB_REPO,
    branch: config.GITHUB_BRANCH,
    token: config.GITHUB_TOKEN,
    contentDir: config.GITHUB_CONTENT_DIR,
    committer: { name: config.GITHUB_COMMITTER_NAME, email: config.GITHUB_COMMITTER_EMAIL },
  });
  const r2 = env.MEDIA ? new R2MediaStore(env.MEDIA) : null;
  const services = composeServices({
    config: {
      mode: 'cloud',
      localHosts: [],
      chatOrigins: config.CHAT_ALLOWED_ORIGINS,
      mcpOrigins: mcpOrigins(config.MCP_ALLOWED_ORIGINS, config.SITE_URL),
      siteUrl: config.SITE_URL.replace(/\/$/, ''),
      version: API_VERSION,
    },
    content,
    // Pictures and videos live in GitHub next to the pages, so the site build has them.
    // R2 (if bound) is still read for files uploaded there before.
    media: new GitHubMediaStore(content, r2, r2 && config.R2_PUBLIC_URL ? { store: r2, publicBase: config.R2_PUBLIC_URL } : null),
    db,
    identity: new AccessIdentityProvider({ teamDomain: config.CF_ACCESS_TEAM_DOMAIN, audience: config.CF_ACCESS_AUD }),
    publisher: new DeployHookPublisher(config.PAGES_DEPLOY_HOOK_URL),
    requests: new SqlRequestRepository(db),
    folderPicker: null,
    chatModel: config.ANTHROPIC_API_KEY ? new AnthropicChatModel({ apiKey: config.ANTHROPIC_API_KEY, model: config.CHAT_MODEL, logger: consoleLogger }) : null,
    chatLimiter: new MemoryRateLimiter(config.CHAT_RATE_LIMIT_PER_MINUTE, 60_000),
    mcpLimiter: new MemoryRateLimiter(config.MCP_RATE_LIMIT_PER_MINUTE, 60_000),
    logger: consoleLogger,
    uploadLimits: { imageMaxBytes: megabytes(config.UPLOAD_IMAGE_MAX_MB), videoMaxBytes: megabytes(Math.min(config.UPLOAD_VIDEO_MAX_MB, r2 && config.R2_PUBLIC_URL ? 60 : 24)) /* Pages serves files up to 25 MiB; bigger videos (up to 60 MB, Worker memory) go to R2 */ },
    clientIp: (req) => req.headers.get('cf-connecting-ip') ?? 'unknown',
    bootstrapOwnerEmail: config.BOOTSTRAP_OWNER_EMAIL,
    signIn:
      config.CF_API_TOKEN && config.CF_ACCOUNT_ID
        ? new CloudflareAccessSignInList({ accountId: config.CF_ACCOUNT_ID, apiToken: config.CF_API_TOKEN, audience: config.CF_ACCESS_AUD })
        : null,
  });
  const ready = migrate(db, [{ name: '0001_init', sql: initSql }, { name: '0002_editor_connector', sql: editorSql }, { name: '0003_change_revisions', sql: revisionsSql }, { name: '0004_upload_tickets', sql: ticketsSql }, { name: '0005_automation', sql: automationSql }]);
  return { app: createApi(services), ready, services };
}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) {
      if (env.ASSETS) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }
    // Ask AI needs only its own settings; every other route needs the full config.
    if (url.pathname === CHAT_PATH) {
      try {
        chatCached ??= buildChatApp(env);
      } catch (error) {
        consoleLogger.error('worker.chat_start_failed', { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
        return Response.json({ success: false, code: 'NOT_CONFIGURED', message: 'Ask AI is not switched on yet. Please use the guide pages or contact support.' }, { status: 503 });
      }
      return chatCached.fetch(request, env, ctx as never);
    }
    // The MCP connector likewise needs only its own settings.
    if (url.pathname === MCP_PATH) {
      try {
        mcpCached ??= buildMcpApp(env);
      } catch (error) {
        consoleLogger.error('worker.mcp_start_failed', { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
        return Response.json({ jsonrpc: '2.0', error: { code: -32000, message: 'The guide connector is not switched on yet.' }, id: null }, { status: 503 });
      }
      return mcpCached.fetch(request, env, ctx as never);
    }
    try {
      cached ??= build(env);
      await cached.ready;
    } catch (error) {
      cached = null;
      consoleLogger.error('worker.start_failed', { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
      return Response.json({ success: false, code: 'NOT_CONFIGURED', message: 'The admin is not set up correctly yet.' }, { status: 503 });
    }
    return cached.app.fetch(request, env, ctx as never);
  },

  /** Cron trigger (wrangler.toml [triggers]): queues the automatic checks whose time has come. */
  async scheduled(_event: unknown, env: WorkerEnv): Promise<void> {
    try {
      cached ??= build(env);
      await cached.ready;
      const queued = await cached.services.automation.tick();
      consoleLogger.info('worker.automation_tick', { queued: queued.length });
    } catch (error) {
      consoleLogger.error('worker.automation_tick_failed', { error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' });
    }
  },
};

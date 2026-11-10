import fs from 'node:fs';
import path from 'node:path';
import type { OpenAPIHono } from '@hono/zod-openapi';
import { createApi } from './api/app';
import type { AppEnv, Services } from './api/context';
import type { ChatModel, IdentityProvider, Logger, Publisher } from './application/ports';
import { composeServices } from './compose';
import { API_VERSION, mcpOrigins, megabytes, type NodeConfig } from './config';
import { FsContentRepository } from './infrastructure/node/fs-content-repository';
import { FsMediaStore } from './infrastructure/node/fs-media-store';
import { GitPublisher } from './infrastructure/node/git-publisher';
import { JsonRequestRepository } from './infrastructure/node/json-request-repository';
import { LocalIdentityProvider } from './infrastructure/node/local-identity';
import { MacFolderPicker, macFolderPickerAvailable } from './infrastructure/node/mac-folder-picker';
import { SqliteDatabase } from './infrastructure/node/sqlite-database';
import { AnthropicChatModel } from './infrastructure/shared/anthropic-chat-model';
import { consoleLogger } from './infrastructure/shared/console-logger';
import { MemoryRateLimiter } from './infrastructure/shared/memory-rate-limiter';
import { migrate, type Migration } from './infrastructure/shared/migrator';

export const MIGRATIONS_DIR = path.resolve(__dirname, '..', 'migrations');

export function readMigrations(dir = MIGRATIONS_DIR): Migration[] {
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((f) => ({ name: f.replace(/\.sql$/, ''), sql: fs.readFileSync(path.join(dir, f), 'utf8') }));
}

export interface LocalOptions {
  config: NodeConfig;
  /** Project root (git repo for publishing). */
  repoRoot: string;
  /** Absolute content folder. */
  contentDir: string;
  /** Absolute .admin folder (request queue, proposals, database). */
  stateDir: string;
  /** Absolute SQLite file, or ':memory:'. */
  dbFile: string;
  logger?: Logger;
  /** Overrides for tests. */
  identity?: IdentityProvider;
  publisher?: Publisher;
  chatModel?: ChatModel | null;
  folderPicker?: Services['folderPicker'];
  clock?: () => Date;
  /** Seed the first owner + Claude when People is empty (default true). */
  seed?: boolean;
}

export interface LocalApp {
  app: OpenAPIHono<AppEnv>;
  services: Services;
  db: SqliteDatabase;
}

/** Builds the local (Node) API: filesystem content, SQLite, git publishing, the Mac folder picker. */
export async function buildLocalApp(o: LocalOptions): Promise<LocalApp> {
  const logger = o.logger ?? consoleLogger;
  if (o.dbFile !== ':memory:') fs.mkdirSync(path.dirname(o.dbFile), { recursive: true });
  const db = new SqliteDatabase(o.dbFile);
  const applied = await migrate(db, readMigrations());
  if (applied.length) logger.info('db.migrated', { applied });
  const requests = new JsonRequestRepository(o.stateDir);
  requests.ensure();
  const port = o.config.ADMIN_PORT;
  const chatModel =
    o.chatModel !== undefined ? o.chatModel : o.config.ANTHROPIC_API_KEY ? new AnthropicChatModel({ apiKey: o.config.ANTHROPIC_API_KEY, model: o.config.CHAT_MODEL, logger }) : null;
  const services = composeServices({
    config: {
      mode: 'local',
      localHosts: [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`],
      chatOrigins: o.config.CHAT_ALLOWED_ORIGINS,
      mcpOrigins: mcpOrigins(o.config.MCP_ALLOWED_ORIGINS, o.config.ADMIN_SITE_URL),
      siteUrl: o.config.ADMIN_SITE_URL.replace(/\/$/, ''),
      version: API_VERSION,
    },
    content: new FsContentRepository(o.contentDir),
    media: new FsMediaStore(o.contentDir),
    db,
    identity: o.identity ?? new LocalIdentityProvider(),
    publisher: o.publisher ?? new GitPublisher(o.repoRoot),
    requests,
    folderPicker: o.folderPicker !== undefined ? o.folderPicker : macFolderPickerAvailable() ? new MacFolderPicker() : null,
    chatModel,
    chatLimiter: new MemoryRateLimiter(o.config.CHAT_RATE_LIMIT_PER_MINUTE, 60_000),
    mcpLimiter: new MemoryRateLimiter(o.config.MCP_RATE_LIMIT_PER_MINUTE, 60_000),
    logger,
    uploadLimits: { imageMaxBytes: megabytes(o.config.UPLOAD_IMAGE_MAX_MB), videoMaxBytes: megabytes(o.config.UPLOAD_VIDEO_MAX_MB) },
    clientIp: (_req, env) => (env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming?.socket?.remoteAddress ?? 'local',
    clock: o.clock ? { now: o.clock } : undefined,
  });
  if (o.seed !== false) await services.people.seedLocal({ name: o.config.ADMIN_OWNER_NAME });
  return { app: createApi(services), services, db };
}

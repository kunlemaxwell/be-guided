import http from 'node:http';
import path from 'node:path';
import { getRequestListener } from '@hono/node-server';
import { loadConfig, nodeConfigSchema } from './config';
import { buildLocalApp } from './local';
import { consoleLogger } from './infrastructure/shared/console-logger';

/**
 * Local entry point (the owner's Mac): `npm run admin` / "Open Be Guided
 * Admin.command". One process on 127.0.0.1:3101 — the JSON API under /api,
 * and the admin web app (served by Vite) for everything else.
 */
process.env.VITE_CJS_IGNORE_WARNING = 'true';

const repoRoot = path.resolve(__dirname, '..', '..');

/** Reads .env.local (git-ignored) if present, without overriding real environment variables. */
function loadLocalEnv(): void {
  for (const name of ['.env.local', '.env']) {
    try {
      process.loadEnvFile(path.join(repoRoot, name));
    } catch {
      // No such file: fine.
    }
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  const config = loadConfig(nodeConfigSchema, process.env);
  const { app, services } = await buildLocalApp({
    config,
    repoRoot,
    contentDir: path.resolve(repoRoot, config.CONTENT_DIR),
    stateDir: path.resolve(repoRoot, config.ADMIN_STATE_DIR),
    dbFile: path.resolve(repoRoot, config.ADMIN_DB_FILE),
  });
  const api = getRequestListener(app.fetch);

  const { createServer } = await import('vite');
  const server = http.createServer();
  const vite = await createServer({
    configFile: path.join(repoRoot, 'admin', 'web', 'vite.config.ts'),
    clearScreen: false,
    logLevel: 'warn',
    define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(config.ADMIN_SITE_URL) },
    server: { middlewareMode: true, hmr: { server }, fs: { allow: [repoRoot] } },
  });

  server.on('request', (req, res) => {
    if ((req.url ?? '').startsWith('/api/')) {
      void api(req, res);
      return;
    }
    vite.middlewares(req, res);
  });

  server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`The admin is already open in another window (port ${config.ADMIN_PORT} is in use). Close that window, then try again.`);
    } else {
      console.error('The admin could not start:', error.message);
    }
    process.exit(1);
  });

  // Local only: never listen on the network.
  server.listen(config.ADMIN_PORT, '127.0.0.1', () => {
    console.log(`Be Guided admin is running: http://localhost:${config.ADMIN_PORT}`);
    consoleLogger.info('admin.started', { port: config.ADMIN_PORT, chat: Boolean(config.ANTHROPIC_API_KEY) });
  });

  // Automatic checks: every 5 minutes, queue the checks whose time has come.
  const tick = () =>
    services.automation
      .tick()
      .then((queued) => queued.length && consoleLogger.info('automation.tick', { queued: queued.length }))
      .catch((error: unknown) => consoleLogger.error('automation.tick_failed', { error: error instanceof Error ? error.message : 'unknown' }));
  const timer = setInterval(tick, 5 * 60_000);
  setTimeout(tick, 10_000);

  const stop = () => {
    clearInterval(timer);
    void vite.close().finally(() => server.close(() => process.exit(0)));
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch((error: unknown) => {
  console.error('The admin could not start:', error instanceof Error ? error.message : error);
  process.exit(1);
});

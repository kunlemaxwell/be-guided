/**
 * A throw-away Be Guided API for end-to-end checks (Studio package, admin
 * screens in a browser). Temporary copy of content/, in-memory database,
 * port 3199 by default. Prints an owner connector key for the run; it dies
 * with the process. Never points at real data.
 *   npx tsx backend/tests/e2e-server.ts
 */
import fs from 'node:fs';
import { getRequestListener } from '@hono/node-server';
import http from 'node:http';
import { tempWorkspace, testConfig } from './helpers';
import { buildLocalApp } from '../src/local';
import { silentLogger } from '../src/infrastructure/shared/console-logger';

const port = Number(process.env.E2E_PORT ?? 3199);

async function main(): Promise<void> {
  const ws = tempWorkspace();
  const { app, services } = await buildLocalApp({
    config: testConfig({ ADMIN_PORT: String(port), CHAT_ALLOWED_ORIGINS: 'http://localhost:3100' }),
    repoRoot: ws.root,
    contentDir: ws.contentDir,
    stateDir: ws.stateDir,
    dbFile: ':memory:',
    logger: silentLogger,
    chatModel: null,
    folderPicker: null,
  });
  const ctx = { actor: { personId: null, name: 'E2E', email: null, role: 'owner' as const }, correlationId: 'e2e-setup' };
  const owner = (await services.people.list()).find((p) => p.role === 'owner')!;
  const created = await services.editor.createKey(ctx, { personId: owner.id, label: 'E2E run', products: null }, `http://localhost:${port}/api/v1/editor`);
  if (process.env.E2E_KEY_FILE) fs.writeFileSync(process.env.E2E_KEY_FILE, created.key, { mode: 0o600 });
  const listener = getRequestListener(app.fetch);
  // Static pages for browser checks: the Studio (admin transport) and a minimal MCP Apps host.
  const page = (file: string) => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
  http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/studio.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page('../../admin/web/public/studio.html'));
    }
    if (url.startsWith('/mcp-host.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(page('./e2e-mcp-host.html').replace('__E2E_KEY__', created.key));
    }
    void listener(req, res);
  }).listen(port, '127.0.0.1', () => {
    console.log(`E2E API on http://localhost:${port} (temporary data in ${ws.root})`);
  });
  const stop = () => { ws.cleanup(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

}

void main();

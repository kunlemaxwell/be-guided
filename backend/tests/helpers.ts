import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { nodeConfigSchema, type NodeConfig } from '../src/config';
import { buildLocalApp, type LocalApp, type LocalOptions } from '../src/local';
import type { RequestContext } from '../src/domain/actor';
import { silentLogger } from '../src/infrastructure/shared/console-logger';

export const SOURCE_CONTENT = path.resolve(__dirname, 'fixtures/content');

/**
 * A throw-away copy of content/ for tests. Videos (media/) and capture specs
 * are left out on purpose, so results never depend on which large files
 * happen to exist on this computer.
 */
export function tempWorkspace(): { root: string; contentDir: string; stateDir: string; cleanup: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pv-test-'));
  const contentDir = path.join(root, 'content');
  fs.cpSync(SOURCE_CONTENT, contentDir, {
    recursive: true,
    filter: (src) => {
      const parts = src.split(path.sep);
      return !parts.includes('_capture') && !parts.includes('media');
    },
  });
  const stateDir = path.join(root, '.admin');
  return { root, contentDir, stateDir, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

export function testConfig(overrides: Partial<Record<string, string>> = {}): NodeConfig {
  return nodeConfigSchema.parse({ ADMIN_PORT: '3101', UPLOAD_IMAGE_MAX_MB: '1', UPLOAD_VIDEO_MAX_MB: '2', ...overrides });
}

export async function localApp(ws: ReturnType<typeof tempWorkspace>, options: Partial<LocalOptions> = {}): Promise<LocalApp> {
  return buildLocalApp({
    config: testConfig(),
    repoRoot: ws.root,
    contentDir: ws.contentDir,
    stateDir: ws.stateDir,
    dbFile: ':memory:',
    logger: silentLogger,
    chatModel: null,
    folderPicker: null,
    ...options,
  });
}

export const TEST_CTX: RequestContext = { actor: { personId: null, name: 'Test runner', email: null, role: 'owner' }, correlationId: 'test-correlation-id' };

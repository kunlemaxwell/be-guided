import fs from 'node:fs';
import path from 'node:path';
import { openApiDocument } from '../src/api/app';
import { localApp, tempWorkspace } from '../tests/helpers';

/**
 * `npm run api:contract`: writes the OpenAPI 3 contract generated from the
 * zod route definitions to docs/openapi.json. A contract test fails when the
 * file is out of date.
 */
async function main(): Promise<void> {
  const ws = tempWorkspace();
  try {
    const { app, services } = await localApp(ws);
    const doc = openApiDocument(app, services.config.version);
    const out = path.resolve(__dirname, '..', '..', 'docs', 'openapi.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`Wrote ${path.relative(process.cwd(), out)} (${Object.keys(doc.paths ?? {}).length} paths)`);
  } finally {
    ws.cleanup();
  }
}

void main();

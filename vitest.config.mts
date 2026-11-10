import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * One test run for the whole project: site tests (tests/site/**), admin tests
 * (admin/tests/**) and backend unit + contract tests (backend/tests/**).
 * Discovery stays the vitest default; only build output and backups are excluded.
 */
export default defineConfig({
  // The Worker imports its migration as text (wrangler [[rules]]); do the same in tests.
  plugins: [{ name: 'sql-as-text', transform: (code, id) => (id.endsWith('.sql') ? `export default ${JSON.stringify(code)};` : undefined) }],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    exclude: ['**/node_modules/**', '**/.next/**', '**/out/**', '**/dist/**', '_to_delete/**', '.admin/**', '.wrangler/**'],
    testTimeout: 20_000,
  },
});

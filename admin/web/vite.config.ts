import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Admin web app. Used by the local server (Vite middleware, backend/src/node.ts)
 * and by `npm run build:admin` (static files for Cloudflare, served by the Worker's assets).
 */
const root = __dirname;
const repoRoot = path.resolve(root, '..', '..');

/** The live guide site (wrangler.toml SITE_URL), so the built admin's "Open the site" goes to the website, not localhost. */
function liveSiteUrl(): string | undefined {
  try {
    return /^SITE_URL\s*=\s*"([^"]+)"/m.exec(fs.readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8'))?.[1];
  } catch {
    return undefined;
  }
}

export default defineConfig(({ command }) => ({
  root,
  define: command === 'build' && !process.env.VITE_SITE_URL && liveSiteUrl() ? { 'import.meta.env.VITE_SITE_URL': JSON.stringify(liveSiteUrl()) } : {},
  appType: 'spa',
  plugins: [react()],
  resolve: { alias: { '@': path.join(repoRoot, 'src') } },
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, sourcemap: false },
  optimizeDeps: {
    include: [
      'react',
      'react-dom/client',
      'react/jsx-runtime',
      'react-router-dom',
      '@tanstack/react-query',
      '@tiptap/react',
      '@tiptap/core',
      '@tiptap/starter-kit',
      '@tiptap/extension-link',
      '@tiptap/extension-table',
      '@tiptap/extension-table-row',
      '@tiptap/extension-table-header',
      '@tiptap/extension-table-cell',
      'unified',
      'remark-parse',
      'remark-gfm',
      'remark-directive',
      'remark-stringify',
      'zod',
    ],
  },
}));

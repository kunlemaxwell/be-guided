# Be Guided: notes for AI coding agents

This file is for Claude Code, Codex and other agents working on this repository. To write or update guide content, use the editor connector instead (see README, "Use it with your AI").

## Layout

- `src/`: guide site (Next.js 15 App Router, `output: 'export'`, TypeScript strict). Content schemas in `src/types/content.ts`, loader in `src/lib/content/load.ts`.
- `content/`: the guides. `site.json`, then `products/<product>/product.json`, `<module>/module.json`, `<page>.md`, with `images/` and `media/` per module.
- `admin/`: admin web app (React + Vite) and shared types. `admin/web/src`.
- `backend/`: API (Hono + OpenAPI). `backend/src/worker.ts` is the Cloudflare entry, `backend/src/node.ts` the local one. Migrations in `backend/migrations/`.
- `backend/src/api/mcp/`: reader connector (`guide-mcp-server.ts`, `/api/v1/mcp`) and editor connector (`editor-mcp-server.ts`, `/api/v1/editor`, writing standard included).
- `packages/be-guided-studio/`: the Studio (local MCP server and UI for scheduled update checks).
- `scripts/cloudflare/`: `npm run setup` and helpers. `wrangler.toml` holds REPLACE placeholders that setup fills in.

## Checks before you finish

```bash
npm run typecheck && npm run admin:typecheck && npm test
```

Tests run against the sample content in `backend/tests/fixtures/content` (product "Acme Books"), not `content/`.

## Rules

- Never commit secrets, real account ids or personal emails. `wrangler.toml` keeps placeholders in the repository.
- After changing `studio/index.html` or the admin, run `node scripts/build-studio.mjs` and `node scripts/build-admin-app.mjs`; they regenerate `backend/src/ui/*.generated.ts` and the `_headers` hash.
- Guide copy: short sentences, bold for on-screen labels, no em dashes (the editor connector rejects them).

## User journeys

- Each product can have `content/products/<product>/journeys.json`: ordered lists of guides for one kind of user. Schema `journeySchema` in `src/types/content.ts`, loader `src/lib/content/journeys.ts`.
- Reader side: a "Which user are you?" card on the product page (not a pop-up; choice kept in the browser, key `pv-journeys:<product>`), a merged reading order, "step N of M" bars on guide pages, and `/<product>/journeys/` plus one map page per journey. "Everyone" is the whole guide and nothing is ever hidden.
- User types are not fixed: read the app's real roles or user types first; if there are none, infer them from what the product does and set `"inferred": true`. The writing standard and update-check steps say the same. Keep journeys in step whenever pages are added, renamed or removed.
- Not built yet: an admin screen or connector tool to edit journeys (edit the JSON file for now).

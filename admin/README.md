# Be Guided admin

The admin app for the Be Guided guide: pages (rich-text editor with
lossless markdown, version history), products, people, the audit log, updates
& requests for Claude, the theme customizer, uploads and publishing.

**Start (owner):** double-click `Open Be Guided Admin.command`. It starts the
site on http://localhost:3100 and the admin on http://localhost:3101.
**Developers:** `npm run admin` (same thing; `ADMIN_PORT=3111 npm run admin` for a second copy).

## How it fits together

- `../backend/` — the API (TypeScript, Hono). Locally one Node process serves the
  JSON API under `/api/v1` and this web app through Vite middleware, on
  127.0.0.1 only. The same API runs on Cloudflare Workers. See `../docs/ARCHITECTURE.md`
  and `../docs/ARCHITECTURE.md`.
- `shared/api-types.ts` — every DTO and error code, declared once (zod).
- `shared/markdown/`, `shared/editor/` — guide markdown ⇄ TipTap JSON via mdast.
  Anything without an editor block is kept as a raw-markdown block.
- `web/src/` — React app: `api/` (the only network code), `auth/` (who is using
  the admin, permission gating — UX only, the API enforces), `components/`
  (shared components, see its README and the **Components** screen),
  `features/` (one folder per screen).
- `.admin/` (repo root, git-ignored) — `requests.json` + `proposals/` (the queue
  Claude processes on "run the guide queue") and `be-guided.db` (people,
  history, audit log).

## Screens

Pages · page editor (History drawer, author picker, "Show on the public site",
Choose file… for video and cover) · Products (public switch, Choose folder… for a
repo's local code) · Updates & requests (product dropdown with search) · Audit log
(filters, details drawer) · Settings (theme, customizer with live preview, light/dark,
video display — all saved together with Save/Discard; People; who is using this
computer) · Components (the component catalogue).

## Environment

See `../.env.example` (every variable) and `../docs/ARCHITECTURE.md` §3.

## Checks

`npm run admin:typecheck` · `npm run test` · `npm run api:contract` after changing routes.

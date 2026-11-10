# Architecture — Be Guided API and admin

## Folders

```
backend/
  migrations/0001_init.sql        SQLite / D1 schema (one migrator for both)
  scripts/write-openapi.ts        npm run api:contract → docs/openapi.json
  src/
    api/                          HTTP only — thin
      app.ts                      createApi(services): middleware order, routes, OpenAPI doc
      route.ts                    defineRoute(policy, config): every route MUST name a policy
      context.ts                  Services + AppEnv (per-request actor, correlation id)
      responses.ts                ok(), okResponse(), errorResponses()
      chat-app.ts / mcp-app.ts    Ask AI / MCP connector alone (Cloudflare, own settings only)
      mcp/guide-mcp-server.ts     "Connect your AI": MCP server (official SDK, Web-standard transport), tools
      middleware/                 correlation, security-headers, origin (CSRF/DNS rebinding),
                                  authorize (401/403), cors + rate limit (Ask AI), mcp (CORS, rate
                                  limit, body limit, JSON-RPC errors), errors (→ envelope)
      routes/                     system, site, library, pages, files, people, audit, requests, publish, chat, mcp
    application/                  use cases; depends only on domain + ports
      ports.ts                    ContentRepository, MediaStore, SqlDatabase, IdentityProvider,
                                  Publisher, RequestRepository, FolderPicker, ChatModel, RateLimiter,
                                  PeopleRepository, AppSettingsRepository, ActivityRepository
      services/                   content, people, activity (audit + history), request, upload, publish, chat,
                                  guide-tools (search / fetch / list for the MCP connector)
    domain/                       pure, framework-free, unit-tested
      diff.ts                     Myers line diff, hunks, field diffs, human summaries
      policies.ts                 roles → permissions, reserved names
      guide-document.ts           guide markdown → clean markdown for AI (steps, legends, absolute links)
      visibility.ts, authors.ts, slugs.ts, files.ts (magic bytes), library.ts, retrieval.ts,
      page-file.ts (frontmatter round trip), errors.ts (AppError + codes), actor.ts
    infrastructure/
      node/                       fs content + media, node:sqlite, JSON request queue, git publisher,
                                  macOS folder picker (execFile osascript, no shell), local identity
      cloudflare/                 GitHub contents API, D1, R2, Access JWT (jose), Pages deploy hook
      shared/                     SQL repositories (same SQL for SQLite and D1), migrator,
                                  Claude chat model (official SDK), rate limiter, logger
    compose.ts                    composeServices(adapters) — the only wiring
    local.ts / node.ts            Mac entry: buildLocalApp + Vite middleware, 127.0.0.1:3101
    worker.ts                     Cloudflare entry: /api/v1/chat → chat-worker, /api/v1/mcp → mcp-worker,
                                  other /api/* → API, else static admin assets
    chat-worker.ts, mcp-worker.ts build the Ask AI / MCP apps from their own settings
    config.ts                     zod-validated env (node + cloud schemas)
  tests/unit, tests/contract      see docs/ARCHITECTURE.md §8
admin/
  shared/api-types.ts             THE contract: zod DTO schemas, error codes, roles/permissions
  shared/markdown, shared/editor  guide markdown ⇄ TipTap (unchanged)
  web/                            React 19 + React Query + React Router; Vite
    src/api/                      the only network code (client.ts unwraps the envelope)
    src/auth/AuthProvider.tsx     GET /me, Can, RequirePermission, cache reset on 401/person change
    src/components/               shared presentational components (README.md catalogue)
    src/features/*                pages, editor (+ history), products, requests, settings (+ theme customizer, people), audit, components
docs/openapi.json                 generated contract (checked by a test)
wrangler.toml                     Worker, D1, R2, vars, static assets
```

## Request pipeline

```
request
  → set services
  → correlation id (X-Correlation-Id in/out)
  → security headers (nosniff, DENY framing, no-referrer, CSP for JSON, HSTS in cloud)
  → origin check (local: Host must be localhost:<port>; changes: Origin must be the admin;
                  body must be JSON or multipart)            [skipped for /api/v1/chat; /api/v1/mcp
                                                              keeps only the local Host check]
  → /api/v1/chat only: CORS allowlist + per-address rate limit
  → /api/v1/mcp only: CORS (no Origin = allowed; browser Origins on MCP_ALLOWED_ORIGINS)
                      + per-address rate limit + 64 KB body limit, errors as JSON-RPC
  → body limit (5 MB JSON; upload limit for /uploads)
  → authorize(policy): identity → person → permission         (401 / 403)
  → zod validation of params/query/body                       (422 INVALID + issues)
  → handler → service (→ domain rules → ports → adapters)
  → { success:true, message, data }
errors anywhere → onError → { success:false, code, message, issues? } with the code's status
```

## Data

| Store | Local | Cloud | Holds |
| --- | --- | --- | --- |
| Content | `content/` files | GitHub repo (commit per save) | site.json, product.json, module.json, page .md |
| Media | `content/products/<p>/<m>/images|media` | R2 `products/<p>/<m>/…` | screenshots, videos, covers |
| SQL | `.admin/be-guided.db` (node:sqlite) | D1 | people, app_settings, audit_log, page_revisions, guide_requests |
| Request queue | `.admin/requests.json` + `proposals/` | D1 `guide_requests` | "Updates & requests" for Claude |

Writes to content are validated with the public site's own zod schemas
(`src/types/content.ts`) before they reach the repository, so the site never
receives a file it cannot build. Local writes are atomic (temp file + rename)
and confined to the content folder (`within()`); "remove" makes a page a draft.

## Version history and audit log

Every mutating service call ends with `ActivityService.record(ctx, event, revision?)`,
which inserts the audit entry and (for page create/save/draft) the page revision
in **one atomic batch**. A revision stores who/when, a human summary
("Changed title; 12 lines added, 3 removed"), the changed frontmatter fields
(before/after) and the line-diff hunks of the body (2 lines of context) — text
only; image and video files are never copied.

## Ask AI

`POST /api/v1/chat` → `ChatService`: rank published, public pages of public
products by keyword overlap (title > summary > headings > body, boosts for the
reader's product/page) → top 5 → Claude (`claude-opus-5-5`, effort low,
structured JSON output, server-side refusal fallback) answers only from those
pages and lists which it used → `{ answer, sources: [{ id, title, href }] }`.
No relevant page → a plain "couldn't find it" answer without calling the model.
No key → 503 `NOT_CONFIGURED`. Conversation text and keys are never logged.

Where the pages come from (`GuidePageSource` port): on the Mac, the content
folder (`contentGuideSource`). On Cloudflare, the published site's own index,
`/ask-ai/pages.json` (built by `src/app/ask-ai/pages.json/route.ts`), read by
`SiteIndexGuideSource` and cached for 5 minutes. The Worker sends
`/api/v1/chat` to a separate Ask AI-only app (`backend/src/chat-worker.ts`,
`api/chat-app.ts`) that loads only `chatConfigSchema` (Claude key, allowed
site origins, model, rate limit, optional `CHAT_CONTENT_URL`), so Ask AI
works as soon as the key is set, before GitHub and Access are configured.
Every other route still needs the full `cloudConfigSchema`.

## Connect your AI (MCP)

`/api/v1/mcp` lets readers add the guide to Claude (custom connector) or
ChatGPT (custom MCP server / connector). It is a **remote MCP server**:
Streamable HTTP transport, **stateless** (no `Mcp-Session-Id`), JSON responses
(no SSE stream; GET and DELETE answer 405), read-only, no sign-in.

```
Claude / ChatGPT servers ──POST JSON-RPC──▶ /api/v1/mcp
   mcpCors → mcpRateLimit → mcpBodyLimit (64 KB) → routes/mcp.ts
   → handleMcpRequest(): new McpServer + WebStandardStreamableHTTPServerTransport per request
       tools: search {query} · fetch {id} · list_guides {product?, module?}
   → GuideToolsService (application) → GuidePageSource port (same as Ask AI)
       Mac: content folder (contentGuideSource)   Cloudflare: site's /ask-ai/pages.json
   → domain: retrieval.rankPages (ranking), guide-document (markdown → text),
             library.publicAssetPath / guideRefToId; site's src/lib/search sectionsOf + snippetAround
```

- **Only public content.** The port returns published, public pages of public
  products only, so a private or draft id is indistinguishable from an unknown
  one ("no public guide page with the id …"). Links from a public page to a
  hidden one become plain text.
- **Tool shapes** follow OpenAI's connector contract, which Claude reads just
  as well: `search` → `{ results: [{ id, title, url, breadcrumb, product,
  module, snippet }] }` (up to 8, `url` may carry a `#step-…` anchor);
  `fetch` → `{ id, title, text, url, metadata }` where `text` is the page as
  markdown (summary, Before you start, video link, every step with its direct
  link, screenshot URL and legend, troubleshooting, related guides). Each is
  returned as `structuredContent` plus the same JSON in one text block.
  `list_guides` returns a readable outline (text) plus the structure.
- **Absolute links** use the public site address (`ADMIN_SITE_URL` on the Mac,
  `SITE_URL` on Cloudflare); screenshots and videos are
  `<site>/_content/<product>/<module>/images|media/<file>` (scripts/sync-assets.mjs).
  Step anchors use the site's own `stepAnchor()` (src/lib/content/headings.ts).
- **Errors.** JSON-RPC: -32700 parse, -32600 invalid request / too large,
  -32601 unknown method, -32602 invalid params, -32000 rate limited /
  origin refused / method not allowed. Tool argument problems and "not found"
  are tool results with `isError: true` (MCP spec: the model can correct
  itself). A failing guide source becomes a generic tool error; logs carry the
  tool name and error type only, never the question.
- **Cloudflare.** `worker.ts` sends `/api/v1/mcp` to `mcp-worker.ts`, which
  loads only `mcpConfigSchema` (`SITE_URL`, `MCP_ALLOWED_ORIGINS`,
  `MCP_RATE_LIMIT_PER_MINUTE`, optional `MCP_CONTENT_URL`), so the connector
  works before GitHub, Access or a Claude key exist. Access must bypass
  `/api/v1/mcp` (scripts/cloudflare/setup.sh, docs/DEPLOY.md 4.3).
- **Site page.** `src/app/connect-ai/page.tsx` shows
  `NEXT_PUBLIC_API_BASE_URL + /api/v1/mcp` with a Copy button
  (`src/components/ConnectorUrl.tsx`), or "Available once the guide is
  online" when the site was built without that address.

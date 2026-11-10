# Be Guided

**User guides for your apps, written and kept up to date with the AI you already use.**

Be Guided gives you a public guide site, a private admin, and connectors so Claude, ChatGPT and Codex can both **read** your guides and **write** them. You host it on your own Cloudflare account, free for most teams. You don't need an AI API key: you use your own Claude or ChatGPT subscription.

> **See it working:** the Be Guided user guide is built with Be Guided itself.
> Live demo: [be-guided.pages.dev](https://be-guided.pages.dev) (Be Guided's own user guide, written with Be Guided)

---

## What you get

| Part | What it does | Who uses it |
| --- | --- | --- |
| **Guide site** | Step-by-step guides with screenshots, numbered marks, videos, search and a "Configuration center" that orders setup tasks. Every product has its own link. | Your customers |
| **Admin** | Edit pages in a rich-text editor, manage products and modules, people and roles, version history, audit log, approvals, reader feedback. | You and your team (sign-in only) |
| **Reader connector** | Readers add your guide to Claude or ChatGPT and ask questions there. No key, no cost. | Your customers |
| **Editor connector** | Claude Code, Codex or Claude Desktop update guides for you: read your app's code, take screenshots, write pages, upload pictures and videos. Changes can wait for your approval. | Your writers |
| **Be Guided Studio** | Schedules automatic "check for updates" runs: your AI compares the code with the guide and proposes changes. | Your writers |
| **Ask AI** (optional) | A chat box on the guide site. Needs a Claude API key; everything else works without one. | Your customers |

## How it fits together

```
 Your customers                 You and your team                Your AI (Claude, ChatGPT, Codex)
       │                               │                                      │
       ▼                               ▼                                      ▼
 Guide site  ◄── rebuilds ──  GitHub repo (content/)  ◄── saves ──  Admin + API  (Cloudflare Worker)
 (Cloudflare Pages)                                                 ├─ /api/v1/mcp     reader connector (open)
                                                                    ├─ /api/v1/editor  editor connector (personal key)
                                                                    └─ /api/v1/chat    Ask AI (optional)
```

Guides are plain Markdown files in `content/`, so they live in Git with full history.

---

## Quick start

### 1. What you need

- **Node.js 20 or newer** ([nodejs.org](https://nodejs.org))
- **Git**
- A free **Cloudflare** account ([dash.cloudflare.com](https://dash.cloudflare.com/sign-up))
- A free **GitHub** account (the cloud admin saves guides to a repository)
- macOS, Linux, or Windows with WSL or Git Bash (the setup is a bash script)

Optional:
- **Claude Code** or **Codex** to write guides with AI
- A **Claude API key** for Ask AI on the site

### 2. Get the code

Fork this repository on GitHub (so the admin can save your guides to it), then:

```bash
git clone https://github.com/<you>/be-guided.git
cd be-guided
npm install
```

### 3. Try it on your computer

```bash
npm run dev -- -p 3100
```

```bash
npm run admin
```

The guide site opens at http://localhost:3100 and the admin at http://localhost:3101. Locally the admin saves straight into `content/`.

### 4. Put it online

```bash
npm run setup
```

The setup walks you through every step in plain English and is safe to run again:

1. Signs you in to Cloudflare (in your browser)
2. Creates the database (people, history, audit log) and file storage
3. Puts the admin online
4. Puts the guide site online
5. Locks the admin to your email with Cloudflare Access (free for up to 50 people). You paste one Cloudflare token from a page that opens with the right boxes ticked
6. Connects the admin to your GitHub repository
7. Optionally switches on Ask AI
8. Checks everything and prints your addresses

At the end you get three addresses: your **guide site**, your **admin**, and your **AI connector**. Details for each step, costs and troubleshooting: [docs/DEPLOY.md](docs/DEPLOY.md).

### Or let your AI set it up

If you use **Claude Code** or **Codex**, copy this and paste it into a new chat:

```text
Set up Be Guided for me from https://github.com/kunlemaxwell/be-guided.
1. Check I have Node.js 20 or newer and Git. If not, tell me how to install them.
2. Ask me for my GitHub username, then tell me to fork the repository to my account first.
3. Clone my fork into a folder I choose, and run npm install.
4. Run the checks: npm run typecheck && npm test.
5. Tell me to run "npm run setup" in my own terminal (it asks me questions there),
   and help me with each step it shows, in plain English, one step at a time.
Never ask me to paste passwords, tokens or keys into this chat. Keys are typed
into the setup window or Cloudflare's own pages only.
When it finishes, give me my guide site, admin and AI connector addresses.
```

In **Claude** or **ChatGPT** on the web (no terminal), use the same text: the AI explains each step and you run the commands yourself.

---

## Use it with your AI

### Readers: ask questions in Claude or ChatGPT

Your guide site has a **Connect your AI** page with an **Add to Claude** button and step-by-step help for ChatGPT. The connector address is your admin address plus `/api/v1/mcp`. It only reads published, public pages.

### Writers: update guides from Claude Code or Codex

1. In the admin, open **Settings › Editor connector** and create a personal key (`bgk_…`).
2. The admin shows the exact command to add it:
   - **Claude Code:** `claude mcp add --scope user --transport http be-guided <address>/api/v1/editor --header "Authorization: Bearer <key>"`
   - **Codex:** an `[mcp_servers.be-guided]` block for `~/.codex/config.toml`
3. Ask your AI, for example: *"Using Be Guided, write a guide for adding a customer in my app. The code is in ~/code/my-app."*

The AI follows the house writing standard (`get_writing_standard`), saves pages, uploads screenshots and can record videos. Owners' changes go live at once. Editors' changes wait in **Updates & requests** until an owner approves them, if the product asks for approval.

### Automatic update checks: Be Guided Studio

Download `be-guided-studio.zip` from your guide site's `/editor-kit/` folder, unzip it and run `bash install.sh`. It adds the Studio to Claude Code and Codex. Then set a schedule (for example "every day at 8 AM") and your AI compares your app's code with the guide and proposes changes. See [packages/be-guided-studio/README.md](packages/be-guided-studio/README.md).

---

## Writing guides by hand

```
content/
├── site.json                       site name, theme, home page
└── products/
    └── my-app/
        ├── product.json            name, summary, public or private, code repositories
        └── sales/
            ├── module.json         title, summary, area, order
            ├── create-an-invoice.md
            └── images/
```

Each page is Markdown with a small header. Steps, numbered legends, notes and links between guides use simple blocks:

```markdown
::::::steps
::::step{title="Open Sales › Invoices"}
Select **Sales**, then **Invoices**.

![The invoice list](images/invoices-list.webp)

:::legend
1. **Sales** in the main menu.
:::
::::
::::::
```

The full writing standard is served to AI tools by the editor connector, and the admin's editor handles all of it visually.

---

## What it's built with

| Layer | Technology |
| --- | --- |
| Guide site | [Next.js 15](https://nextjs.org) (static export), React 19, Markdown with remark, [Pagefind](https://pagefind.app) search |
| Admin | React 19, [Vite](https://vitejs.dev), [TipTap](https://tiptap.dev) editor, TanStack Query, React Router |
| API | TypeScript, [Hono](https://hono.dev) with OpenAPI (`docs/openapi.json`), zod |
| AI connectors | [Model Context Protocol SDK](https://modelcontextprotocol.io) (Streamable HTTP) |
| Ask AI | [Anthropic SDK](https://docs.anthropic.com) (optional) |
| Hosting | Cloudflare Workers (admin + API), Pages (site), D1 (database), R2 (uploads), Access (sign-in) |
| Content storage | GitHub (the cloud admin commits each change) |
| Tests | Vitest (unit and API contract tests) |

### Dependencies

All of these install with `npm install`. Exact versions are pinned in `package-lock.json`.

**Runtime**

| Package | Used for |
| --- | --- |
| `next`, `react`, `react-dom` | Guide site and admin UI |
| `react-markdown`, `unified`, `remark-parse`, `remark-gfm`, `remark-directive`, `remark-stringify`, `unist-util-visit` | Reading and writing guide Markdown |
| `gray-matter`, `yaml` | Page headers and settings |
| `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-link`, `@tiptap/extension-table`, `-table-row`, `-table-cell`, `-table-header` | Rich-text editor in the admin |
| `@tanstack/react-query`, `react-router-dom` | Admin data loading and navigation |
| `hono`, `@hono/node-server`, `@hono/zod-openapi`, `zod` | API and validation |
| `@modelcontextprotocol/sdk` | Reader and editor connectors |
| `@anthropic-ai/sdk` | Ask AI |
| `jose` | Checking Cloudflare Access sign-in tokens |

**Development and build**

| Package | Used for |
| --- | --- |
| `typescript`, `tsx`, `@types/*` | TypeScript |
| `vite`, `@vitejs/plugin-react` | Building the admin |
| `wrangler`, `@cloudflare/workers-types` | Deploying to Cloudflare (no global install needed) |
| `pagefind` | Site search index |
| `sharp` | Screenshot markup (numbered marks, crops) |
| `vitest` | Tests |
| `eslint`, `eslint-config-next` | Linting |

**Not installed by npm**

| Tool | Needed for |
| --- | --- |
| Node.js 20+ and Git | Everything |
| Cloudflare and GitHub accounts | Hosting and saving guides |
| Claude Code, Codex or Claude Desktop | Writing guides with AI (optional) |
| ffmpeg and a browser automation tool (for example Playwright) | Recording click-through videos with AI (optional) |

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Put Be Guided on your Cloudflare (safe to run again) |
| `npm run setup -- --site-only` | Rebuild and republish just the guide site |
| `npm run dev -- -p 3100` | Guide site on your computer |
| `npm run admin` | Admin on your computer (http://localhost:3101) |
| `npm test` | All tests |
| `npm run typecheck` / `npm run admin:typecheck` | Type checks |
| `npm run build` | Static site in `out/` |
| `npm run cf:deploy` | Redeploy the admin after changing code |

## More

- [docs/DEPLOY.md](docs/DEPLOY.md): every setup step, Access, GitHub, custom domains, costs, rollback
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how the code is organised
- [admin/README.md](admin/README.md): the admin app

## License

[Apache License 2.0](LICENSE). Copyright 2026 Kunle Maxwell.

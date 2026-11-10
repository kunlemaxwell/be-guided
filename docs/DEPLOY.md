# Putting Be Guided on Cloudflare

This puts two things online:

| What | Where it runs | Who can open it |
| --- | --- | --- |
| **The guide site** (what customers read) | Cloudflare Pages | Everyone. Private products and pages are left out. |
| **The admin** (where guides are edited) and the API behind Ask AI and "Connect your AI" | A Cloudflare Worker | Only people you allow (Cloudflare Access). The Ask AI chat address and the AI connector address stay open so the site, Claude and ChatGPT can use them. |

The short version: **run `npm run setup`** in the project folder and follow it. It explains each step, waits for you, and is safe to run again. Anything already done is skipped. The rest of this page says what each step does and covers the parts done in Cloudflare's dashboard.

You need a Cloudflare account (free) and, for the admin to save guides in the cloud, a GitHub repository (section 5). The guide site can go online without GitHub.

---

## 1. What the setup does, step by step

| Step | What happens | What you do |
| --- | --- | --- |
| 1. Sign in | Your browser opens Cloudflare's sign-in page. | Sign in and select **Allow**. Your password goes to Cloudflare only. |
| 2. Database | Creates a database called `be-guided` for people, version history and the audit log, and sets up its tables. | Type **y** if asked "Ok to proceed?". |
| 3. Storage | Creates `be-guided-media` for pictures and videos uploaded in the admin. | If Cloudflare refuses, R2 storage isn't switched on yet. See section 7. |
| 4. Admin online | Builds the admin and uploads it as the Worker `be-guided-admin`. | The first time, Cloudflare may ask you to pick a workers.dev name for your account (for example *your-name*). |
| 5. Site online | Builds the guide site from this computer's `content/` folder and uploads it to Pages as `be-guided`. | Nothing. |
| 6. Connect | Tells the admin the site's address, so Ask AI on the site may use it. | Nothing. |
| 7. Who can open the admin | Saves your Cloudflare Access details. | Set up Access in the dashboard (section 4), then paste two values. |
| 8. GitHub | Saves which repository holds the guides, then asks for the GitHub access key. | Paste the key. It's hidden, and it goes straight to Cloudflare. |
| 9. Ask AI | Asks for a Claude API key (optional). | Paste it, or skip. |
| 10. Check | Checks both addresses and the AI connector answer, then prints them. | Note the addresses, including the **AI connector URL**. |

You can type **s** at any step to skip it and come back later. Details of anything that failed are saved in `.wrangler/setup-logs/`.

**After you change guides on this computer**, run `npm run setup -- --site-only`. It republishes the site and skips everything else.

## 2. Where your keys go

The script never sees or stores your passwords or keys:

- Cloudflare sign-in happens in your browser.
- Keys are typed into Cloudflare's own tool (`wrangler secret put`). Nothing appears on screen, and nothing is written to a file.

Only addresses and names, which aren't secret, go into `wrangler.toml` and `scripts/cloudflare/settings.env`.

| Secret | What it's for | Where to get it |
| --- | --- | --- |
| `GITHUB_TOKEN` | Lets the cloud admin read and save guide files | GitHub: Settings → Developer settings → Fine-grained tokens. Give it access to **that one repository** only, with **Contents: Read and write**. |
| `ANTHROPIC_API_KEY` | Lets Ask AI answer | console.anthropic.com → API keys |
| `PAGES_DEPLOY_HOOK_URL` | Lets **Publish** in the cloud admin rebuild the site | Section 5, stage 2 |

To change a key later, open a terminal in the project folder and run the same command again, for example `npx wrangler secret put ANTHROPIC_API_KEY`. To remove one, run `npx wrangler secret delete ANTHROPIC_API_KEY`.

## 3. Switching on Ask AI

1. Get a Claude API key from console.anthropic.com → **API keys**. Usage is billed by Anthropic, separately from Cloudflare.
2. Run the setup again and paste the key at step 9, or run `npx wrangler secret put ANTHROPIC_API_KEY`.
3. Open the guide site and ask a question. Until the key is set, the chat says *"Ask AI is not switched on yet."*

The admin's configuration must also be complete (sections 4 and 5), because Ask AI runs in the admin's Worker.

## 3b. Connect your AI (Claude and ChatGPT)

Readers can add the guide to Claude or ChatGPT and ask questions there. The guide site has a page for it, **Connect your AI** (`/connect-ai/`, linked in the footer and on the home page), with the address to copy and the steps for each assistant.

- **No key and no extra cost.** It only reads the published, public guide pages (the same ones anyone can open), so it works as soon as the site and the admin are online. Nothing to switch on.
- **The address** is the admin's address followed by `/api/v1/mcp`, for example `https://be-guided-admin.your-name.workers.dev/api/v1/mcp`. The setup prints it at the end, and the site's Connect your AI page shows it with a Copy button.
- **It must be left open in Access:** add the Bypass for `api/v1/mcp` (section 4.3). Without it, Claude and ChatGPT get a sign-in page and say they can't connect.
- **Try it yourself:** in Claude, open **Customize**, then **Connectors**, select **+ Add**, then **Add custom connector**, paste the address, choose **No sign in**, then **Add**. In a chat, switch it on under **+** › **Connectors** and ask "How do I set up taxes in Acme Books?".
- The site page says "Available once the guide is online" until the site is built with the admin's address (the setup does this automatically).

## 4. Choosing who can open the admin (Cloudflare Access)

The admin is protected by Cloudflare Access. People sign in with their email, receiving a one-time code, and the admin only lets in people who are also listed under **Settings → People**.

### 4.1 Switch Access on for the admin

1. Open **dash.cloudflare.com** and go to **Workers & Pages**, then **be-guided-admin**.
2. Go to **Settings**, then **Domains & Routes**. On the **workers.dev** row, turn on **Cloudflare Access**. If asked, choose the **Free** Zero Trust plan, which covers up to 50 users.
3. Select **Manage Cloudflare Access**. In the application's policy, under **Include**, choose **Emails** and add each person allowed in, starting with yourself.

### 4.2 Copy two values for the setup

- **Team domain:** under Zero Trust, go to **Settings** and then **Custom Pages**, or look at the top of the Access app. It looks like `https://yourteam.cloudflareaccess.com`.
- **Audience (AUD) tag:** open the Access application and go to **Overview**. It's a long string of letters and numbers.

Run the setup and paste both at step 7. It also asks for **your email**, and that person becomes the first owner of the cloud admin.

### 4.3 Leave five addresses open (Bypass)

The guide site's Ask AI, Claude and ChatGPT (Connect your AI) and Cloudflare's health check must reach these addresses without signing in. Everything else stays protected.

| Path | Why |
| --- | --- |
| `/api/v1/chat` | Ask AI on the public site |
| `/api/v1/mcp` | Connect your AI: Claude and ChatGPT read the public guide pages here |
| `/api/v1/editor` | Editor connector: Claude Code, Codex and the Studio update guides here. Every call still needs a personal key (`bgk_…`), so nothing changes without one. |
| `/api/v1/health` | Uptime check |
| `/api/v1/openapi.json` | The API contract the developers read (contains no data) |

In Zero Trust, go to **Access**, then **Applications**, then **Add an application**, and choose **Self-hosted**:

1. **Domain:** the admin's address without `https://`, for example `be-guided-admin.your-name.workers.dev`. **Path:** `api/v1/chat`.
2. **Policy:** Action **Bypass**, Include **Everyone**.
3. Repeat for `api/v1/mcp`, `api/v1/editor`, `api/v1/health` and `api/v1/openapi.json`, or add all five paths to one application.

Cloudflare applies the most specific path first, so these five stay open while the rest of the admin asks for sign-in. The admin still enforces its own rules on every request.

**Adding someone later:** add their email to the Access policy (4.1 step 3) **and** add them under **Settings → People** in the cloud admin with the right role (viewer, editor or owner). Removing them from either one locks them out.

## 5. GitHub: where the cloud admin saves guides

On this computer, the admin saves guides into the `content/` folder. In the cloud there is no folder, so the admin saves each change as a commit to a GitHub repository instead.

**Stage 1 (now):**
1. Create a **private** repository in your GitHub account, for example `your-name/be-guided`.
2. Upload this project to it. A developer can do this in a few minutes with `git init` and `git push`. The `.gitignore` already leaves out:
   - the admin's local data (`.admin/`)
   - raw, unblurred screen captures (`content/**/_capture/raw/`)
   - build output and keys
3. Create the fine-grained token (section 2) and run the setup. At step 8, enter `your-name/be-guided` and paste the token.

**Stage 2 (when the site should rebuild from GitHub):** today the site is uploaded from this computer (**direct upload**). Cloudflare can't switch a direct-upload site to GitHub builds, so stage 2 uses a new Pages project:

1. Go to **Workers & Pages**, then **Create**, then **Pages**, then **Connect to Git**, and pick the repository.
2. Set **Build command** to `npm run build` and **Output directory** to `out`.
3. Add these environment variables:
   - `NEXT_PUBLIC_HELP_ENV=production`
   - `NEXT_PUBLIC_SITE_URL=<site address>`
   - `NEXT_PUBLIC_API_BASE_URL=<admin address>`
   - `INCLUDE_PRIVATE_PRODUCTS=false`
4. In the new project, go to **Settings**, then **Builds**, then **Deploy hooks**, and create a hook. Then run `npx wrangler secret put PAGES_DEPLOY_HOOK_URL` and paste the hook's address. **Publish** in the cloud admin now rebuilds the site.
5. Move the custom domain (section 6) to the new project. Delete the old `be-guided` project when you're happy.

The local admin and the cloud admin keep separate lists of people, history and audit entries. History made locally stays on that computer.

## 6. Using your own address (optional)

To use an address like `help.example.com`:

1. In **Workers & Pages**, open **be-guided**, go to **Custom domains**, and add `help.example.com`. Follow Cloudflare's DNS instructions.
2. Open `scripts/cloudflare/settings.env` in TextEdit and change the `SITE_URL` line to `SITE_URL=https://help.example.com`. Add a line `CUSTOM_DOMAIN=help.example.com`.
3. Run the setup again. It rebuilds the site with the new address and lets Ask AI work from it.

## 7. If something goes wrong

| What you see | What to do |
| --- | --- |
| Storage (R2) step fails | In the dashboard, open **R2 Object Storage** and start using it. Cloudflare may ask for a card; the free allowance isn't charged. Then run the setup again. |
| The admin says "The admin is not set up correctly yet." | A setting is missing, usually GitHub (section 5) or Access (section 4). Run the setup again and don't skip those steps. |
| The admin says "Sign in to use Be Guided." even after signing in | The AUD tag or team domain is wrong. Copy them again (4.2) and run the setup. |
| The admin lets you sign in but says you don't have access | Your email isn't under **Settings → People**, or isn't the owner email you gave at step 7. |
| Ask AI says it isn't switched on | Section 3. |
| Ask AI doesn't respond at all on the site | The Bypass for `/api/v1/chat` is missing (4.3). |
| Claude or ChatGPT says it can't connect to the guide | The Bypass for `/api/v1/mcp` is missing (4.3), or the address was copied without `/api/v1/mcp` at the end. |
| The Connect your AI page says "Available once the guide is online" | The site was built without the admin's address. Run the setup again (it rebuilds the site with it). |
| The site build failed | Open `.wrangler/setup-logs/build-site.log`. The build refuses to upload if it finds a `localhost` address or raw captures, to keep them off the internet. |

## 8. Going back to an earlier version (rollback)

- **Site:** in **Workers & Pages**, open **be-guided** and then **Deployments**. On an earlier one, choose **⋯** and then **Rollback to this deployment**. This is instant.
- **Admin:** in **be-guided-admin**, open **Deployments** and pick an earlier version. Or in a terminal run `npx wrangler rollback`.
- **Admin data** (people, history, audit log): the database keeps a restorable history for 7 days on the free plan. A developer can run `npx wrangler d1 time-travel restore be-guided --timestamp=<time>`.
- **Guide text:** every change made in the cloud admin is a GitHub commit, so a developer can revert it there.

## 9. What it costs

Everything here fits in Cloudflare's free plan for a help site of this size. Check Cloudflare's pricing pages for current limits.

| Service | Free allowance | This project |
| --- | --- | --- |
| Pages (guide site) | Unlimited visits; up to 20,000 files of 25 MB each | about 170 files, 35 MB |
| Workers (admin + Ask AI + AI connector) | 100,000 requests a day | editing, chat questions, and 2 to 4 requests per question asked through Claude or ChatGPT |
| D1 (database) | 5 GB; 5 million reads and 100,000 writes a day | a few MB |
| R2 (uploads) | 10 GB a month, no download fees | pictures and short videos |
| Zero Trust Access | Up to 50 users | your editors |

Two things are not covered by Cloudflare:

- **Ask AI** usage, billed by Anthropic per question.
- **Videos larger than 25 MB.** Pages won't host them, so the setup stops and names the file. Keep walkthrough videos short, or host them in R2.

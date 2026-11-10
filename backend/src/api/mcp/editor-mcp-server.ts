import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';
import { z } from 'zod';
import type { Logger } from '../../application/ports';
import { AUTOMATION_TOOLS, runAutomationTool } from '../../application/automation-tools';
import type { AutomationService } from '../../application/services/automation-service';
import type { EditorService, EditorSession } from '../../application/services/editor-service';
import type { FeedbackService } from '../../application/services/feedback-service';
import { STUDIO_HTML } from '../../ui/studio-html.generated';
import { ADMIN_HTML } from '../../ui/admin-html.generated';
import { callAdmin } from '../internal/admin-bridge';
import { AppError } from '../../domain/errors';
import { tidyErrors } from './guide-mcp-server';

/**
 * The EDITOR connector: lets an authorised person's Claude Code or Codex
 * update the user guide. Content only (pages, screenshots, video requests),
 * through the same validation, history and audit as the admin. It can never
 * change the site's code, products, modules or settings.
 * Signed in with a personal key (Authorization: Bearer bgk_…).
 */

export const EDITOR_SERVER_NAME = 'be-guided-editor';

/** The house writing standard, handed to the AI before it writes. Kept short and concrete. */
export const WRITING_STANDARD = `# Be Guided: how to write a guide page

You are updating a user guide for real customers. Follow this exactly. Never change the structure, only the content.

## Before you write
0. If the product or module is missing, call request_new_product or request_new_module. For an owner it is created straight away; for an editor it goes to the owner for approval (keep working on other pages meanwhile).
1. Ask the person which CONTENT MODE they want: Text only, Text + screenshots, or Everything (text, screenshots and a walkthrough video). Never assume.
2. Ask which PRODUCT and MODULE (call list_products).
3. Read the existing page first (read_page) when updating. Keep what is still true.
4. Work from the real app or the real code. Never invent screens, fields, buttons or messages.

## Page file
- frontmatter (send as an object, not in the body):
  title (task, e.g. "Create an invoice"), summary (one sentence, what and why), status ("published" or "draft"),
  order (number), section (optional heading inside the module), prerequisites: [{ page: "module/page", why: "..." }] for EVERY setup the task depends on,
  appRoutes (optional list of app paths), audience (optional).
- body: markdown. Plain English, short sentences, one action per step, second person ("Select Save").

## Body structure (in this order)
1. A one-paragraph intro (what the task does and when to use it).
2. Steps block:
::::::steps
::::step{title="Open Invoices"}
In the menu, select **Sales**, then **Invoices**.

![Invoices list with the New button marked](images/invoices-list.webp)

:::legend
1. The Sales menu
2. New invoice
:::
::::
::::::
3. Optional callouts inside steps: :::note, :::tip, :::warning (each closed with :::).
4. "Troubleshooting" (## heading) with the real error messages in quotes and what to do.
5. "Related guides" with guide links: [Set up taxes](guide:settings/set-up-taxes).

## Rules
- Never use em dashes. Use commas, colons or full stops.
- Link every setup the task needs with guide: links and in prerequisites.
- Quote buttons and fields exactly as the app shows them, in **bold**.
- Use only sample data that is clearly fictional (e.g. "Sample Traders Ltd", billing@example.com).

## Screenshots (Text + screenshots, Everything)
- Real screens only, captured sharp (2x), PNG or WebP, the area of the task (not the whole desktop).
- Mark the parts the step talks about with numbered orange markers, matching the :::legend list. Use the house tool for this, never your own drawing:
  - If you have the skill "be-guided-screenshots", follow it.
  - If not, install it once: curl -fsSL {{SITE_URL}}/editor-kit/install.sh | BE_GUIDED_KIT_URL={{SITE_URL}}/editor-kit bash (needs Node 18+), then read ~/.claude/skills/be-guided-screenshots/SKILL.md (Codex: ~/.codex/skills/...) and follow it. You can also download {{SITE_URL}}/editor-kit/annotate.mjs and its instructions {{SITE_URL}}/editor-kit/SKILL.md directly.
- Do NOT blur anything. Screens come from the test environment, so all names, emails, numbers and amounts are test data and stay readable.
- Upload with get_upload_link (send the file with the curl command it returns), then reference it as images/<file name it returns>.
  (upload_screenshot with base64 also works, but only for small pictures.)

## Videos (Everything)
Videos are always REAL click-throughs of the running app (clicking, typing, saving), never a slideshow of screenshots.
1. First check which video tools you have:
   - If you have a video-making tool connected (for example Reeliant, with tools such as authoring_guide, capture_film, build_film, export_edit), use it. Read its guide first.
   - If you do not have one, make it with your own tools: drive the running app with a browser automation tool that can record video (for example Playwright with recordVideo), and join the clips with ffmpeg.
   - If you can do neither, call request_video for the page instead; the owner's video engine will build it. Tell the person.
2. The house recipe (both ways):
   - If the site has brand clips, start with {{SITE_URL}}/brand/opening.mp4 and end with {{SITE_URL}}/brand/ending.mp4. If those addresses do not exist, start on a title card instead.
   - After the logo: a silent title card with the page title. Then, on the app's home screen, one or two sentences on what the feature is for. Then show the navigation click by click (menu, then the item), then each step, then one closing line ("And that's how you ...").
   - Narrate in a calm, clear voice with captions; any music stays very quiet under the voice.
   - Never create real records in a live system: use the test environment. Do not blur anything; it is all test data.
   - Full HD MP4 (1920x1080), about 16 MB per minute, never over 60 MB. Files over 24 MB are stored separately and play from their own web address; that is automatic.
3. Upload it with get_upload_link (kind "video", name <page>-walkthrough.mp4) and a poster picture (kind "image", <page>-walkthrough-poster.jpg), then add to the page frontmatter:
   video: { src: "<the src the upload returned, e.g. media/<page>-walkthrough.mp4>", poster: "images/<page>-walkthrough-poster.jpg", length: "<N> s" }

## Modules and how they are grouped
Every product page groups its modules by business area (the module's "area"), never by role or by kind of work. Keep to these rules for every product:
- One area per business function, e.g. Accounting, Sales and purchasing, HR, Settings. Pass "area" when you call request_new_module, and reuse an area the product already has when the module belongs to it.
- Everything about one function sits in one area, whoever does it. Employee, manager and admin modules of the same function (for example My workspace, Managers and approvers, HR administration) all go in the same area.
- The product's core area comes first (for Acme Books, Accounting). The order of areas follows the order of their first module.
- An area with two or more modules gets its own "everything in one view" page automatically.

## Saving
- save_page validates the page. Fix every problem it reports and try again.
- Write the whole page first, then save. Approval only decides whether the finished page goes public; nobody has to approve before you start.
- If the product needs approval, the change waits for an owner in the admin; tell the person it is waiting. Owners' own changes publish straight away. They do not need to wait: they can keep working on other pages.
- Saving the same page again while it waits replaces the waiting version (the owner reviews the latest). read_page returns the waiting version to its author (see waitingForApproval).

## Skills (house style and QA)
- Before writing, call get_skills with the product. If it returns a writing skill, follow it on top of this standard (it wins where they differ, except the safety rules: no blurring is allowed, no em dashes, content mode always confirmed).
- If it returns a QA skill, use it while you test the product during an update check (what to click, what to compare, what counts as a defect).

## Automatic update checks
- Checks are queued by each product's update plan (or run_update_check). Take one with claim_update_check: the job lists the code repos, content mode, skills and steps.
- Compare the code and the running screens with the guide pages. Report every change with report_update_check (kind: screen-changed, label-changed, new-feature, removed, new-page, bug), each with the page id and the evidence (file and line, or the screen).
- If the answer says applyNow, update the selected changes in their content mode, save the pages, then call mark_changes_applied. Otherwise stop: a person picks which changes to apply in the admin's Automatic checks screen (open_be_guided_admin) and the chosen ones arrive as refresh-page requests.
- If you cannot finish, call fail_update_check with the reason.
`;

const INSTRUCTIONS = [
  'This server lets an authorised editor update the Be Guided user guide (content only).',
  'Always call get_writing_standard first and follow it exactly; ask the person for the content mode and the product before writing.',
  'Use list_products to find modules, page ids and where each product\'s code is (read that code on the person\'s computer; ask them for the folder if needed), read_page before changing a page, save_page to save, get_upload_link for screenshots and videos, request_video when you cannot make the video yourself, my_changes to see what is waiting for approval.',
  'Call get_skills for the product before writing and follow the writing skill it returns; use the QA skill while testing.',
  'When the person wants to open, see or use Be Guided, the admin or the Studio, open the full admin in the chat with open_be_guided_admin (it lands on Pages, like the web admin); for update plans, schedules, the check log, skills or readers\' feedback, use it instead of asking set-up questions in chat. To run a queued check: claim_update_check, then report_update_check, then apply and mark_changes_applied (or stop for approval).',
].join(' ');

/** The in-chat Studio app (MCP Apps). */
export const STUDIO_URI = 'ui://be-guided/studio.html';
const MCP_APP_MIME = 'text/html;profile=mcp-app';
/** The whole admin in the chat (MCP Apps): the same screens as the web admin. */
export const ADMIN_URI = 'ui://be-guided/admin.html';

const noSchemaValidation: jsonSchemaValidator = {
  getValidator: () => () => ({ valid: false, data: undefined, errorMessage: 'Schema validation is not used by this server.' }),
};

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

const json = (value: Record<string, unknown>, text?: string): ToolResult => ({ content: [{ type: 'text', text: text ?? JSON.stringify(value) }], structuredContent: value });
const problem = (text: string): ToolResult => ({ content: [{ type: 'text', text }], isError: true });

export interface EditorMcpDeps {
  editor: EditorService;
  automation: AutomationService;
  feedback: FeedbackService;
  session: EditorSession;
  logger: Logger;
  version: string;
  /** This connector's public address (…/api/v1/editor); upload links hang off it. */
  uploadBase: string;
  /** The public guide site, for links to brand files (opening and ending logos). */
  siteUrl: string;
  correlationId?: string;
  /** Runs one admin API request inside this server (the in-chat admin uses it). */
  adminFetch?: (request: Request) => Promise<Response>;
}

async function guarded(deps: EditorMcpDeps, tool: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError) {
      const details = error.issues?.length ? ` ${error.issues.map((i) => `${i.field}: ${i.message}`).join('; ')}` : '';
      return problem(`${error.message}${details && !error.message.includes(details.trim()) ? details : ''}`);
    }
    deps.logger.error('editor_mcp.tool_failed', { correlationId: deps.correlationId, tool, personId: deps.session.ctx.actor.personId, error: error instanceof Error ? error.name : 'unknown' });
    return problem('Something went wrong on the server. Please try again.');
  }
}

const slug = z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'use lowercase letters, numbers and single dashes').max(80);
const pageId = z.string().trim().regex(/^[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+$/, 'give the page id as product/module/page');

export function createEditorMcpServer(deps: EditorMcpDeps): McpServer {
  const { editor, session } = deps;
  const server = new McpServer(
    { name: EDITOR_SERVER_NAME, title: 'Be Guided editor', version: deps.version },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: noSchemaValidation, maxToolInputElements: 20 },
  );

  server.registerTool(
    'get_writing_standard',
    {
      title: 'Get the writing standard',
      description: 'The house rules for guide pages: structure, steps blocks, screenshots (never blurred), links, tone. Call this before writing anything and follow it exactly.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => ({ content: [{ type: 'text', text: WRITING_STANDARD.replaceAll('{{SITE_URL}}', deps.siteUrl) }] }),
  );

  server.registerTool(
    'list_products',
    {
      title: 'List products, modules and pages you can edit',
      description: 'Products your key may edit, with their modules, page ids and whether changes need an owner\'s approval before they go live.',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => guarded(deps, 'list_products', async () => json({ products: await editor.listProducts(session) })),
  );

  server.registerTool(
    'read_page',
    {
      title: 'Read a page (source)',
      description: 'Read one page as it is stored: frontmatter object, markdown body (with steps blocks), and the pictures available in its module. Read before you change a page.',
      inputSchema: { page_id: pageId.describe('product/module/page, e.g. acme-books/sales/create-an-invoice') },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ page_id }) =>
      guarded(deps, 'read_page', async () => {
        const [p, m, s] = page_id.split('/') as [string, string, string];
        return json(await editor.readPage(session, p, m, s));
      }),
  );

  server.registerTool(
    'save_page',
    {
      title: 'Create or update a page',
      description:
        'Save a guide page (creates it if the page name is new). Content is checked against the page rules (frontmatter fields, no em dashes, pictures from images/, no scripts). ' +
        'If the product needs approval, the change waits for an owner and goes live when approved; otherwise it is live in about 2 minutes. ' +
        'You cannot change products, modules, settings or the site itself.',
      inputSchema: {
        product: slug.describe('Product slug from list_products'),
        module: slug.describe('Module slug from list_products'),
        page: slug.describe('Page name for the address, e.g. create-an-invoice'),
        frontmatter: z.record(z.unknown()).describe('title, summary, status, order, section, prerequisites, appRoutes, video ...'),
        body: z.string().max(400_000, 'The page is too long.').describe('Markdown body following the writing standard'),
        note: z.string().max(1000).optional().describe('What changed and why (shown to the approver)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ product, module, page, frontmatter, body, note }) =>
      guarded(deps, 'save_page', async () => {
        const r = await editor.savePage(session, { product, module, slug: page, frontmatter, body, note });
        const text =
          r.status === 'published'
            ? `Saved. ${r.pageId} goes live in about 2 minutes: ${r.siteUrl}`
            : r.updatedExisting
              ? `Updated your change for ${r.pageId} that is waiting for approval (change ${r.changeId}). The owner will see this latest version. It goes live once approved.`
              : `Finished and sent for approval. An owner will review ${r.pageId} in the admin (change ${r.changeId}) and it goes live once approved. You can keep working meanwhile: saving this page again updates the same waiting change.`;
        return json({ ...r }, text);
      }),
  );

  server.registerTool(
    'upload_screenshot',
    {
      title: 'Upload a screenshot',
      description:
        'Upload a marked-up screenshot (PNG, WebP or JPEG, base64; not blurred) into a module\'s images folder. Returns the file name to use in the page as images/<name>. ' +
        'Existing pictures are never replaced; a new name is chosen if needed.',
      inputSchema: {
        product: slug,
        module: slug,
        file_name: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]*\.(png|webp|jpe?g)$/i, 'use a simple name ending in .png, .webp or .jpg').max(100),
        base64: z.string().min(16).max(13_500_000, 'Pictures can be up to about 10 MB.').describe('The image file as base64 (a data: URL is fine)'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ product, module, file_name, base64 }) =>
      guarded(deps, 'upload_screenshot', async () => {
        const r = await editor.uploadScreenshot(session, product, module, file_name, base64);
        return json({ ...r }, `Uploaded. Use it in the page as ![description](${r.src}).`);
      }),
  );

  server.registerTool(
    'get_upload_link',
    {
      title: 'Get a one-time upload link for a screenshot or video',
      description:
        'Best way to send screenshots and videos (no base64): returns a link that works once, for 15 minutes. Send the file with the curl command it returns ' +
        '(curl -F "file=@/path/to/file" <link>). The answer gives the src to use in the page (images/<name> or media/<name>). Existing files are never replaced.',
      inputSchema: {
        product: slug,
        module: slug,
        kind: z.enum(['image', 'video']).describe('image = screenshot (PNG/WebP/JPEG); video = MP4/WebM walkthrough'),
        file_name: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]*\.(png|webp|jpe?g|mp4|webm)$/i, 'use a simple lowercase name like invoice-lines.webp or create-an-invoice.mp4').max(100),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ product, module, kind, file_name }) =>
      guarded(deps, 'get_upload_link', async () => {
        const r = await editor.createUploadLink(session, product, module, kind, file_name, deps.uploadBase);
        return json({ ...r }, `Send the file within 15 minutes:\n${r.curl}`);
      }),
  );

  server.registerTool(
    'request_video',
    {
      title: 'Request a walkthrough video',
      description: 'Ask for a branded click-through video for a page. Videos are made by the owner\'s video engine, not by you; this adds the request to their queue.',
      inputSchema: { page_id: pageId, note: z.string().max(1000).optional().describe('What the video should show') },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ page_id, note }) =>
      guarded(deps, 'request_video', async () => {
        const r = await editor.requestVideo(session, page_id, note);
        return json({ ...r }, `Video requested for ${page_id} (request ${r.requestId}). The owner's video engine will build it.`);
      }),
  );

  server.registerTool(
    'request_new_product',
    {
      title: 'Add a new product',
      description:
        'Adds a product to the guide (name, one-line summary, and where its code is). ' +
        'Owners: it is created straight away, private and coming soon. Editors: it goes to the owner, who approves and creates it in the admin; once added to your key it appears in list_products.',
      inputSchema: {
        name: z.string().trim().min(2).max(80),
        summary: z.string().trim().min(5).max(300),
        slug: z.string().trim().max(60).optional().describe('Web address name, e.g. acme-marketing (made from the name if left out)'),
        repo: z.string().trim().max(300).optional().describe('Repository URL or name of the product code'),
        branch: z.string().trim().max(100).optional(),
        paths: z.array(z.string().trim().max(300)).max(20).optional().describe('Folders in the repo that hold the screens'),
        note: z.string().max(1000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) =>
      guarded(deps, 'request_new_product', async () => {
        const r = await editor.requestNewProduct(session, args);
        return json({ ...r }, r.message);
      }),
  );

  server.registerTool(
    'request_new_module',
    {
      title: 'Add a new module to a product',
      description:
        'Adds a module (a group of pages, e.g. "Companies and contacts") to a product. ' +
        'Owners: created straight away. Editors: goes to the owner for approval.',
      inputSchema: {
        product: z.string().trim().min(1).max(60),
        title: z.string().trim().min(2).max(80),
        summary: z.string().trim().min(5).max(300),
        slug: z.string().trim().max(60).optional().describe('Web address name (made from the title if left out)'),
        group: z.enum(['start', 'run', 'approve', 'administer']).optional().describe('start = getting started, run = daily work, approve = approvals, administer = settings'),
        area: z.string().trim().min(1).max(40).optional().describe('Business area the module is shown under on the product page, e.g. "Accounting", "HR", "Sales and purchasing". Use an area the product already has when the module belongs there (see the module grouping rule in the writing standard).'),
        note: z.string().max(1000).optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async (args) =>
      guarded(deps, 'request_new_module', async () => {
        const r = await editor.requestNewModule(session, args);
        return json({ ...r }, r.message);
      }),
  );

  server.registerTool(
    'my_changes',
    {
      title: 'My changes waiting for approval',
      description: 'Your recent connector changes and whether each is waiting, approved or rejected (with the owner\'s note).',
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async () => guarded(deps, 'my_changes', async () => json({ changes: await editor.myChanges(session) })),
  );

  // ── Automatic checks, skills and feedback (same tools as the admin's Studio) ──
  const toolDeps = { automation: deps.automation, feedback: deps.feedback, ctx: session.ctx, scope: session.products };
  for (const t of AUTOMATION_TOOLS) {
    server.registerTool(
      t.name,
      {
        title: t.title,
        description: t.description,
        inputSchema: t.input.shape,
        annotations: { readOnlyHint: t.readOnly, destructiveHint: t.name.startsWith('delete_') || t.name === 'cancel_update_check', idempotentHint: t.readOnly, openWorldHint: false },
        // No resourceUri here on purpose: with one, the chat drew the whole admin under every result of
        // claim_update_check, report_update_check and the rest. Those copies were not the visible app, so
        // the chat refused their calls and each showed "Claude did not pass this on". Only the open_*
        // tools carry the app; the app still reaches these tools (visibility 'app').
        _meta: { ui: { visibility: t.appOnly ? ['app'] : ['model', 'app'] } },
      },
      async (args: Record<string, unknown>) =>
        guarded(deps, t.name, async () => {
          const r = await runAutomationTool(toolDeps, t.name, args);
          const data = r.data && typeof r.data === 'object' && !Array.isArray(r.data) ? (r.data as Record<string, unknown>) : { result: r.data };
          return json(data, `${r.message}\n${JSON.stringify(r.data)}`);
        }),
    );
  }

  server.registerTool(
    'open_be_guided_studio',
    {
      title: 'Open Be Guided Studio',
      description:
        'Shows the full Be Guided admin in the chat (the same as open_be_guided_admin): Pages, Products, Updates & requests, Automatic checks, Reader feedback, Audit log, Settings and Components. Leave tab out so it opens on Pages like the web admin; give tab only when the person asks for that screen (plans, checks or skills open Automatic checks; feedback opens Reader feedback).',
      inputSchema: { tab: z.enum(['plans', 'checks', 'skills', 'feedback']).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: ADMIN_URI, visibility: ['model', 'app'] }, 'ui/resourceUri': ADMIN_URI },
    },
    async ({ tab }) =>
      guarded(deps, 'open_be_guided_studio', async () => {
        // A snapshot travels with the result, so the app can show it even when the chat app will not
        // pass the app's own tool calls on (Claude answers "IPC not available" in some views).
        const take = async (name: string, args: Record<string, unknown>) => {
          try {
            return (await runAutomationTool(toolDeps, name, args)).data;
          } catch {
            return null;
          }
        };
        const [overview, checks, feedback] = await Promise.all([
          take('automation_overview', {}),
          take('list_update_checks', { limit: 50 }),
          take('feedback_summary', { limit: 100 }),
        ]);
        const adminUrl = new URL(deps.uploadBase).origin;
        return json(
          { opened: true, tab: tab ?? null, screen: tab ? (tab === 'feedback' ? 'feedback' : 'automation') : 'pages', snapshot: { takenAt: new Date().toISOString(), adminUrl, overview, checks, feedback } },
          'Be Guided Studio is open in the chat.',
        );
      }),
  );

  // ── The whole admin in the chat ─────────────────────────────────────────
  server.registerTool(
    'open_be_guided_admin',
    {
      title: 'Open Be Guided Admin',
      description:
        'Shows the full Be Guided admin in the chat, exactly as on the web: Pages, Products, Updates & requests, Automatic checks, Reader feedback, Audit log, Settings (all tabs) and Components. Use it whenever the person wants to open, see or use the admin, the Studio or Be Guided itself.',
      inputSchema: { screen: z.enum(['pages', 'products', 'requests', 'automation', 'feedback', 'audit', 'settings', 'components']).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: ADMIN_URI, visibility: ['model', 'app'] }, 'ui/resourceUri': ADMIN_URI },
    },
    async ({ screen }) =>
      guarded(deps, 'open_be_guided_admin', async () =>
        json({ opened: true, screen: screen ?? 'pages', adminUrl: new URL(deps.uploadBase).origin, person: session.ctx.actor.name }, 'The Be Guided admin is open in the chat.'),
      ),
  );

  server.registerTool(
    'admin_api',
    {
      title: 'Admin request',
      description: 'Used by the in-chat admin only: one request to the admin API as the key\'s person, with the same permissions as the web admin.',
      inputSchema: {
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
        path: z.string().min(1).max(2000),
        body: z.unknown().optional(),
        form: z
          .object({
            fields: z.record(z.string(), z.string()).optional(),
            file: z.object({ field: z.string().max(40), name: z.string().max(200), type: z.string().max(100), base64: z.string() }).optional(),
          })
          .optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      _meta: { ui: { resourceUri: ADMIN_URI, visibility: ['app'] } },
    },
    async (args) =>
      guarded(deps, 'admin_api', async () => {
        if (!deps.adminFetch) return problem('The admin is not available from this connector.');
        if (session.products) return problem('This key is limited to some products, so it cannot open the whole admin. Ask an owner for a key without limits, or use the web admin.');
        const r = await callAdmin(deps.adminFetch, new URL(deps.uploadBase).origin, session.ctx.actor, args as never);
        return json({ status: r.status, envelope: r.envelope ?? null, file: r.file ?? null }, r.envelope ? JSON.stringify(r.envelope).slice(0, 4000) : `File (${r.file?.contentType})`);
      }),
  );

  server.registerResource(
    'be-guided-admin',
    ADMIN_URI,
    { title: 'Be Guided Admin', description: 'The full admin: pages, products, requests, automatic checks, feedback, audit log, settings.', mimeType: MCP_APP_MIME },
    async () => ({ contents: [{ uri: ADMIN_URI, mimeType: MCP_APP_MIME, text: ADMIN_HTML, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } } }] }),
  );

  server.registerResource(
    'be-guided-studio',
    STUDIO_URI,
    { title: 'Be Guided Studio', description: 'Update plans, check log, skills and feedback.', mimeType: MCP_APP_MIME },
    async () => ({ contents: [{ uri: STUDIO_URI, mimeType: MCP_APP_MIME, text: STUDIO_HTML, _meta: { ui: { prefersBorder: false, csp: { connectDomains: [], resourceDomains: [] } } } }] }),
  );

  return server;
}

/** One stateless MCP request for an already signed-in editor. */
export async function handleEditorMcpRequest(request: Request, deps: EditorMcpDeps): Promise<Response> {
  const server = createEditorMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await tidyErrors(await transport.handleRequest(request));
  } finally {
    await server.close();
  }
}

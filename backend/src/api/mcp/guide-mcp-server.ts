import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import type { jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';
import { z } from 'zod';
import type { Logger } from '../../application/ports';
import type { GuideListing, GuideToolsService } from '../../application/services/guide-tools-service';
import { AppError } from '../../domain/errors';

/**
 * "Connect your AI": the guide as a remote MCP server (Streamable HTTP,
 * stateless, JSON responses, read-only, no sign-in). Built on the official
 * @modelcontextprotocol/sdk with its Web-standard (Request → Response)
 * transport, so the same code runs under Node and Cloudflare Workers.
 *
 * Every request gets a fresh server + transport (the SDK's stateless
 * pattern): no session, nothing kept between requests.
 *
 * Tool shapes follow OpenAI's connector contract (search → { results:
 * [{ id, title, url, … }] }, fetch → { id, title, text, url, metadata }),
 * returned both as structuredContent and as a JSON text block, which Claude
 * reads just as well.
 */

export const MCP_SERVER_NAME = 'be-guided';

const INSTRUCTIONS = [
  'This server is the public user guide of Be Guided (step-by-step how-to pages for the products it documents).',
  'To answer a question: call `search` with the question in plain words, then `fetch` the best result id to read the whole page, and answer from that page.',
  'Quote the steps as written and always give the page link (url) so the reader can open it; step links point at the exact step.',
  'Use `list_guides` to see every product, module and page.',
  'Only published, public pages are available. If nothing matches, say the guide does not cover it rather than guessing.',
].join(' ');

/** Never evaluated: the tools have no output schemas and the server never asks the client for input (elicitation). Avoids Ajv, whose code generation Workers forbid. */
const noSchemaValidation: jsonSchemaValidator = {
  getValidator: () => () => ({ valid: false, data: undefined, errorMessage: 'Schema validation is not used by this server.' }),
};

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

type ToolResult = { content: { type: 'text'; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

function json(value: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function problem(text: string): ToolResult {
  return { content: [{ type: 'text', text }], isError: true };
}

function listingText(listing: GuideListing): string {
  const out: string[] = [];
  for (const p of listing.products) {
    out.push(`# ${p.name} (product: ${p.product})`);
    for (const m of p.modules) {
      out.push('', `## ${m.title} (module: ${m.module})`);
      for (const page of m.pages) out.push(`- ${page.title} | id: ${page.id} | ${page.url}`);
    }
    out.push('');
  }
  return out.join('\n').trim();
}

export interface GuideMcpDeps {
  tools: GuideToolsService;
  logger: Logger;
  version: string;
  correlationId?: string;
}

/** Runs a tool body; any failure becomes a friendly tool error that never includes internals. */
async function guarded(deps: GuideMcpDeps, tool: string, run: () => Promise<ToolResult>): Promise<ToolResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof AppError && error.code === 'NOT_CONFIGURED') {
      return problem("The guide can't be read right now. Please try again in a few minutes.");
    }
    // Tool name and error type only: never the question or page text.
    deps.logger.error('mcp.tool_failed', { correlationId: deps.correlationId, tool, error: error instanceof Error ? error.name : 'unknown' });
    return problem('Something went wrong while reading the guide. Please try again.');
  }
}

export function createGuideMcpServer(deps: GuideMcpDeps): McpServer {
  const server = new McpServer(
    { name: MCP_SERVER_NAME, title: 'Be Guided guide', version: deps.version },
    { instructions: INSTRUCTIONS, jsonSchemaValidator: noSchemaValidation, maxToolInputElements: 10 },
  );

  server.registerTool(
    'search',
    {
      title: 'Search the guide',
      description:
        'Search the Be Guided user guide (how-to pages for the products it documents). Use it for any "how do I…", "where is…" or "what does … mean" question about these products. ' +
        'Pass the question or its key words in plain language, e.g. "set up taxes" or "create an invoice for a customer". ' +
        'Returns up to 8 pages, best first: id (give it to `fetch` to read the full page), title, url (link to the page, or to the matching step), breadcrumb (Product › Module) and a short snippet. ' +
        'An empty list means the guide does not cover it.',
      inputSchema: { query: z.string().trim().min(1, 'Give a few words to search for.').max(200, 'Use at most 200 characters.').describe('What to look for, in plain words.') },
      annotations: { title: 'Search the guide', ...READ_ONLY },
    },
    async ({ query }) => guarded(deps, 'search', async () => json({ results: await deps.tools.search(query) })),
  );

  server.registerTool(
    'fetch',
    {
      title: 'Read a guide page',
      description:
        'Read one whole page of the user guide by its id (from `search` or `list_guides`, e.g. "acme-books/settings/set-up-taxes"). ' +
        'Returns id, title, url, metadata and text: the page as markdown with the summary, "Before you start" prerequisites, the walkthrough video link, every numbered step (each with a direct link and its screenshot), the key to the numbered marks on each screenshot, troubleshooting, and related guides. ' +
        'Answer from this text and give the reader the url.',
      inputSchema: { id: z.string().trim().min(1, 'Give a page id.').max(200, 'Page ids are shorter than that.').describe('Page id, e.g. acme-books/sales/create-an-invoice') },
      annotations: { title: 'Read a guide page', ...READ_ONLY },
    },
    async ({ id }) =>
      guarded(deps, 'fetch', async () => {
        const doc = await deps.tools.fetch(id);
        if (!doc) return problem(`There is no public guide page with the id "${id}". Use \`search\` or \`list_guides\` to find the right id.`);
        return json({ ...doc });
      }),
  );

  server.registerTool(
    'list_guides',
    {
      title: 'List the guides',
      description:
        'List what the user guide covers: every product, its modules (for example Sales, Procurement, Settings) and the page titles with their ids and links. ' +
        'Optionally narrow it to one product and/or one module, by name or slug (e.g. product "Acme Books", module "sales"). Use `fetch` with an id to read a page.',
      inputSchema: {
        product: z.string().trim().max(80).optional().describe('Product name or slug, e.g. Acme Books'),
        module: z.string().trim().max(80).optional().describe('Module name or slug, e.g. Sales'),
      },
      annotations: { title: 'List the guides', ...READ_ONLY },
    },
    async ({ product, module }) =>
      guarded(deps, 'list_guides', async () => {
        const listing = await deps.tools.list({ product, module });
        if (listing.products.length === 0) {
          const names = await deps.tools.productNames();
          return {
            content: [{ type: 'text', text: `Nothing in the guide matches that product or module. Products in the guide: ${names.join(', ') || 'none yet'}.` }],
            structuredContent: { ...listing },
          };
        }
        return { content: [{ type: 'text', text: listingText(listing) }], structuredContent: { ...listing } };
      }),
  );

  return server;
}

/**
 * Answers one MCP HTTP request (POST: JSON-RPC message(s)). Stateless: a new
 * server and transport per request, closed when the answer is ready.
 */
export async function handleMcpRequest(request: Request, deps: GuideMcpDeps): Promise<Response> {
  const server = createGuideMcpServer(deps);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await tidyErrors(await transport.handleRequest(request));
  } finally {
    await server.close();
  }
}

const INTERNAL_ERROR = -32603;
const INVALID_PARAMS = -32602;

interface JsonRpcMessage {
  error?: { code?: unknown; message?: unknown };
  [key: string]: unknown;
}

/**
 * The SDK answers a request whose params don't match the MCP schema (e.g.
 * tools/call without a name) with -32603 "internal error" and the raw
 * validation dump. Clients should get -32602 "invalid params" with a short
 * reason instead; any other internal error is reduced to a generic message
 * so nothing internal leaves the server.
 */
export async function tidyErrors(res: Response): Promise<Response> {
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return res;
  const text = await res.clone().text();
  if (!text.includes(String(INTERNAL_ERROR))) return res;
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return res;
  }
  const fix = (m: unknown): unknown => {
    const msg = m as JsonRpcMessage;
    if (!msg || typeof msg !== 'object' || msg.error?.code !== INTERNAL_ERROR) return m;
    return { ...msg, error: tidyInternal(typeof msg.error.message === 'string' ? msg.error.message : '') };
  };
  const next = Array.isArray(body) ? body.map(fix) : fix(body);
  return new Response(JSON.stringify(next), { status: res.status, headers: res.headers });
}

function tidyInternal(message: string): { code: number; message: string } {
  try {
    const issues = JSON.parse(message) as unknown;
    if (Array.isArray(issues) && issues.length > 0) {
      const reasons = issues
        .slice(0, 5)
        .map((i: { path?: unknown[]; message?: unknown }) => `${Array.isArray(i.path) && i.path.length ? i.path.join('.') : 'params'}: ${typeof i.message === 'string' ? i.message : 'invalid'}`)
        .join('; ');
      return { code: INVALID_PARAMS, message: `Invalid params. ${reasons}`.slice(0, 400) };
    }
  } catch {
    // Not a validation dump.
  }
  return { code: INTERNAL_ERROR, message: 'Internal error. Please try again.' };
}

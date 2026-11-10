import { z } from 'zod';

/**
 * Typed configuration, validated once at start-up (fail fast with a clear
 * message). Every variable is listed in .env.example. No secrets have
 * defaults; secrets are never logged.
 */

export const API_VERSION = '1.0.0';

const csv = (fallback: string) =>
  z
    .string()
    .default(fallback)
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim().replace(/\/$/, ''))
        .filter(Boolean),
    );

const intIn = (min: number, max: number, fallback: number) => z.coerce.number().int().min(min).max(max).default(fallback);
const optionalSecret = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : null));

const shared = {
  /** Origins of the public site allowed to call Ask AI from a browser. */
  CHAT_ALLOWED_ORIGINS: csv('http://localhost:3100'),
  /** Claude API key for Ask AI. Without it Ask AI answers NOT_CONFIGURED (503). */
  ANTHROPIC_API_KEY: optionalSecret,
  CHAT_MODEL: z.string().min(1).default('claude-opus-5-5'),
  /** Ask AI questions per client address per minute. */
  CHAT_RATE_LIMIT_PER_MINUTE: intIn(1, 600, 10),
  /**
   * Browser origins allowed to call the MCP connector (/api/v1/mcp). Claude
   * and ChatGPT call from their servers without an Origin, which is always
   * allowed; the public site's own origin is added automatically.
   */
  MCP_ALLOWED_ORIGINS: csv('https://claude.ai,https://chatgpt.com'),
  /**
   * MCP requests per client address per minute. Many people's assistants can
   * share one Claude/ChatGPT server address, so this is higher than Ask AI's.
   */
  MCP_RATE_LIMIT_PER_MINUTE: intIn(1, 6000, 120),
  UPLOAD_IMAGE_MAX_MB: intIn(1, 100, 15),
  UPLOAD_VIDEO_MAX_MB: intIn(1, 2000, 200),
};

/**
 * Cloudflare, Ask AI only: everything POST /api/v1/chat needs, so Ask AI
 * works as soon as the Claude key is set, before GitHub and Access exist.
 */
export const chatConfigSchema = z.object({
  CHAT_ALLOWED_ORIGINS: shared.CHAT_ALLOWED_ORIGINS,
  ANTHROPIC_API_KEY: shared.ANTHROPIC_API_KEY,
  CHAT_MODEL: shared.CHAT_MODEL,
  CHAT_RATE_LIMIT_PER_MINUTE: shared.CHAT_RATE_LIMIT_PER_MINUTE,
  /** The published site's page index. Default: the first CHAT_ALLOWED_ORIGINS address + /ask-ai/pages.json. */
  CHAT_CONTENT_URL: z.string().url().optional(),
});
export type ChatConfig = z.infer<typeof chatConfigSchema>;

/**
 * Cloudflare, MCP connector only: everything /api/v1/mcp needs (site
 * address, where the guide index is, CORS and rate limit), so the connector
 * works before GitHub, Access or a Claude key exist.
 */
export const mcpConfigSchema = z.object({
  /** Public site address: the guide links the AI gets point here. */
  SITE_URL: z.string().url(),
  MCP_ALLOWED_ORIGINS: shared.MCP_ALLOWED_ORIGINS,
  MCP_RATE_LIMIT_PER_MINUTE: shared.MCP_RATE_LIMIT_PER_MINUTE,
  /** The published site's page index. Default: CHAT_CONTENT_URL if set, else SITE_URL + /ask-ai/pages.json. */
  MCP_CONTENT_URL: z.string().url().optional(),
  CHAT_CONTENT_URL: z.string().url().optional(),
});
export type McpConfig = z.infer<typeof mcpConfigSchema>;

/** Origins for /api/v1/mcp CORS: the configured list plus the public site's own origin. */
export function mcpOrigins(configured: string[], siteUrl: string): string[] {
  let site: string | null = null;
  try {
    site = new URL(siteUrl).origin;
  } catch {
    site = null;
  }
  return [...new Set([...configured, ...(site ? [site] : [])])];
}

export const nodeConfigSchema = z.object({
  ...shared,
  ADMIN_PORT: intIn(1, 65535, 3101),
  /** Guide content folder (relative to the project root). */
  CONTENT_DIR: z.string().min(1).default('./content'),
  /** Where the public site runs locally (links and "View on site"). */
  ADMIN_SITE_URL: z.string().url().default('http://localhost:3100'),
  /** Request queue + proposals folder that Claude reads (git-ignored). */
  ADMIN_STATE_DIR: z.string().min(1).default('.admin'),
  /** SQLite file for people, history and the audit log (git-ignored). */
  ADMIN_DB_FILE: z.string().min(1).default('.admin/be-guided.db'),
  /** Name of the first owner added on first start. */
  ADMIN_OWNER_NAME: z.string().trim().min(1).max(120).default('Site Owner'),
});
export type NodeConfig = z.infer<typeof nodeConfigSchema>;

export const cloudConfigSchema = z.object({
  ...shared,
  /** Cloudflare Access team domain, e.g. https://your-team.cloudflareaccess.com */
  CF_ACCESS_TEAM_DOMAIN: z.string().url(),
  /** The Access application's Audience (AUD) tag. */
  CF_ACCESS_AUD: z.string().min(10),
  /** "owner/repo" holding content/. */
  GITHUB_REPO: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'must look like owner/repo'),
  GITHUB_BRANCH: z.string().min(1).default('main'),
  GITHUB_CONTENT_DIR: z.string().default('content'),
  /** Fine-grained token with Contents read/write on GITHUB_REPO (secret). */
  GITHUB_TOKEN: z.string().min(10),
  GITHUB_COMMITTER_NAME: z.string().default('Be Guided Admin'),
  GITHUB_COMMITTER_EMAIL: z.string().email().default('admin@beguided.invalid'),
  /** Cloudflare Pages deploy hook URL (secret). Without it Publish explains it isn't set up. */
  PAGES_DEPLOY_HOOK_URL: optionalSecret,
  /** Public site address (links in the admin). */
  SITE_URL: z.string().url(),
  /** Public address of the R2 bucket (e.g. https://pub-xxxx.r2.dev). With it, videos over 24 MB go to R2 and play from there. */
  R2_PUBLIC_URL: z.string().url().optional(),
  /** Cloudflare account id; with CF_API_TOKEN, adding someone in People lets them sign in. */
  CF_ACCOUNT_ID: z.string().regex(/^[a-f0-9]{32}$/, 'must be the 32-character account id').optional(),
  /** Cloudflare API token with "Access: Apps and Policies: Edit" (secret). Optional. */
  CF_API_TOKEN: optionalSecret,
  /** The email that becomes the first owner while People is empty. */
  BOOTSTRAP_OWNER_EMAIL: z
    .string()
    .email()
    .optional()
    .transform((v) => v?.toLowerCase() ?? null),
});
export type CloudConfig = z.infer<typeof cloudConfigSchema>;

/** Parses env vars, or throws one readable error listing every problem (never echoing values). */
export function loadConfig<T extends z.ZodTypeAny>(schema: T, env: Record<string, unknown>): z.infer<T> {
  const r = schema.safeParse(env);
  if (!r.success) {
    const problems = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuration problem: ${problems}. See .env.example.`);
  }
  return r.data as z.infer<T>;
}

export function megabytes(n: number): number {
  return n * 1024 * 1024;
}

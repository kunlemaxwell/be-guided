/**
 * Browser-safe API settings, baked in at build time. Nothing secret belongs
 * here: NEXT_PUBLIC_* values ship in the public bundle.
 *
 * Kept apart from `src/lib/config.ts`, which uses Node APIs and only runs at
 * build time.
 */
const DEFAULT_API_BASE_URL = 'http://localhost:3101';

/** Base address of the guide API, without a trailing slash. */
export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

/** API version the site is built against. */
export const API_VERSION = 'v1';

/** How long the site waits for an answer before giving up. */
export const CHAT_TIMEOUT_MS = 60_000;

/** Path of the "Connect your AI" MCP endpoint on the guide API. */
export const MCP_PATH = `/api/${API_VERSION}/mcp`;

/**
 * The connector address readers paste into Claude or ChatGPT, built from
 * NEXT_PUBLIC_API_BASE_URL. Null when the site was built without it (the
 * guide isn't online yet): AI assistants connect from the internet, so the
 * local default address would never work for them.
 */
export function connectorUrl(base: string | undefined = process.env.NEXT_PUBLIC_API_BASE_URL): string | null {
  const clean = (base ?? '').trim().replace(/\/+$/, '');
  return clean ? `${clean}${MCP_PATH}` : null;
}

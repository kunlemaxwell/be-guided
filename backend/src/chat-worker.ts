import type { OpenAPIHono } from '@hono/zod-openapi';
import { createChatApi } from './api/chat-app';
import type { ChatEnv } from './api/context';
import type { ChatModel } from './application/ports';
import { ChatService } from './application/services/chat-service';
import { API_VERSION, chatConfigSchema, loadConfig } from './config';
import { AnthropicChatModel } from './infrastructure/shared/anthropic-chat-model';
import { consoleLogger } from './infrastructure/shared/console-logger';
import { MemoryRateLimiter } from './infrastructure/shared/memory-rate-limiter';
import { SiteIndexGuideSource } from './infrastructure/shared/site-index-guide-source';

export const CHAT_PATH = '/api/v1/chat';

/** Test seams: a fake model and fetch instead of the Claude API and the live site. */
export interface ChatWorkerOverrides {
  chatModel?: ChatModel | null;
  fetch?: typeof fetch;
}

/**
 * Ask AI on Cloudflare, built from the Ask AI settings alone (see
 * chatConfigSchema). Pages come from the published site's index, so neither
 * GitHub nor Access settings are needed. Throws if those settings are invalid.
 */
export function buildChatApp(env: Record<string, unknown>, overrides: ChatWorkerOverrides = {}): OpenAPIHono<ChatEnv> {
  const config = loadConfig(chatConfigSchema, env);
  const site = config.CHAT_ALLOWED_ORIGINS[0] ?? '';
  const chatModel =
    overrides.chatModel !== undefined
      ? overrides.chatModel
      : config.ANTHROPIC_API_KEY
        ? new AnthropicChatModel({ apiKey: config.ANTHROPIC_API_KEY, model: config.CHAT_MODEL, logger: consoleLogger })
        : null;
  const guide = new SiteIndexGuideSource({ url: config.CHAT_CONTENT_URL ?? `${site}/ask-ai/pages.json`, fetch: overrides.fetch, logger: consoleLogger });
  return createChatApi({
    config: { mode: 'cloud', localHosts: [], chatOrigins: config.CHAT_ALLOWED_ORIGINS, mcpOrigins: [], siteUrl: site, version: API_VERSION },
    chat: new ChatService(guide, chatModel),
    chatLimiter: new MemoryRateLimiter(config.CHAT_RATE_LIMIT_PER_MINUTE, 60_000),
    logger: consoleLogger,
    clientIp: (req) => req.headers.get('cf-connecting-ip') ?? 'unknown',
  });
}

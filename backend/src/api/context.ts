import type { EditorService } from '../application/services/editor-service';
import type { AutomationService } from '../application/services/automation-service';
import type { FeedbackService } from '../application/services/feedback-service';
import type { AppMode } from '../../../admin/shared/api-types';
import type { ActivityService } from '../application/services/activity-service';
import type { ChatService } from '../application/services/chat-service';
import type { GuideToolsService } from '../application/services/guide-tools-service';
import type { ContentService } from '../application/services/content-service';
import type { PeopleService } from '../application/services/people-service';
import type { PublishService } from '../application/services/publish-service';
import type { RequestService } from '../application/services/request-service';
import type { UploadService } from '../application/services/upload-service';
import type { FolderPicker, IdentityProvider, Logger, RateLimiter } from '../application/ports';
import type { Actor } from '../domain/actor';

/** Settings the HTTP layer needs (validated config, see backend/src/config.ts). */
export interface ApiConfig {
  mode: AppMode;
  /**
   * Local mode: the only Host values accepted (localhost/127.0.0.1/[::1] on the
   * admin port) — blocks DNS rebinding. Empty in cloud mode (same-origin check instead).
   */
  localHosts: string[];
  /** Origins allowed to call POST /api/v1/chat from a browser (the public site). */
  chatOrigins: string[];
  /**
   * Origins allowed to call /api/v1/mcp from a browser. Claude and ChatGPT
   * call from their servers (no Origin header), which is always allowed.
   */
  mcpOrigins: string[];
  /** Public site address, e.g. http://localhost:3100 */
  siteUrl: string;
  version: string;
}

/** Everything a route handler can use: application services plus a few HTTP-level ports. */
export interface Services {
  config: ApiConfig;
  content: ContentService;
  /** Update plans, check runs and skills. */
  automation: AutomationService;
  /** Readers' "Was this helpful?" votes. */
  feedback: FeedbackService;
  people: PeopleService;
  activity: ActivityService;
  requests: RequestService;
  uploads: UploadService;
  publish: PublishService;
  /** Editor connector (Claude Code / Codex): keys, content-only edits, approvals. */
  editor: EditorService;
  chat: ChatService;
  /** The guide as AI tools (search / fetch / list) for the MCP connector. */
  guideTools: GuideToolsService;
  identity: IdentityProvider;
  folderPicker: FolderPicker | null;
  chatLimiter: RateLimiter;
  /** Per-client limit on /api/v1/mcp. */
  mcpLimiter: RateLimiter;
  logger: Logger;
  /** Best-known client address (for rate limiting only; never logged in full). */
  clientIp(request: Request, env: unknown): string;
}

/** What the shared middleware (correlation id, security headers, error envelope) needs. */
export interface BaseEnv {
  Variables: {
    services: Pick<Services, 'config' | 'logger'>;
    correlationId: string;
  };
}

/** The part of Services that Ask AI uses; enough to run POST /api/v1/chat on its own. */
export type ChatServices = Pick<Services, 'config' | 'chat' | 'chatLimiter' | 'logger' | 'clientIp'>;

/** Hono env of the Ask AI-only app (backend/src/api/chat-app.ts). AppEnv satisfies it too. */
export interface ChatEnv {
  Variables: {
    services: ChatServices;
    correlationId: string;
  };
}

/** The part of Services the MCP connector uses; enough to run /api/v1/mcp on its own. */
export type McpServices = Pick<Services, 'config' | 'guideTools' | 'mcpLimiter' | 'logger' | 'clientIp'>;

/** Hono env of the MCP-only app (backend/src/api/mcp-app.ts). AppEnv satisfies it too. */
export interface McpEnv {
  Variables: {
    services: McpServices;
    correlationId: string;
  };
}

export interface AppEnv {
  Variables: {
    services: Services;
    correlationId: string;
    /** Set by the authorize middleware on every non-public route. */
    actor: Actor;
  };
}

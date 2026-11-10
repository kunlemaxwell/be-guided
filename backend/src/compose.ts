import type { AppMode } from '../../admin/shared/api-types';
import { ActivityService } from './application/services/activity-service';
import { ChatService } from './application/services/chat-service';
import { GuideToolsService } from './application/services/guide-tools-service';
import { ContentService } from './application/services/content-service';
import { PeopleService } from './application/services/people-service';
import { PublishService } from './application/services/publish-service';
import { RequestService } from './application/services/request-service';
import { UploadService, type UploadLimits } from './application/services/upload-service';
import { EditorService } from './application/services/editor-service';
import { AutomationService } from './application/services/automation-service';
import { FeedbackService } from './application/services/feedback-service';
import { SqlCheckRepository, SqlPlanRepository, SqlSkillRepository, SqlVoteRepository } from './infrastructure/shared/sql-automation-repositories';
import { SqlConnectorKeyRepository, SqlPendingChangeRepository, SqlUploadTicketRepository } from './infrastructure/shared/sql-editor-repositories';
import type {
  ChatModel,
  Clock,
  ContentRepository,
  FolderPicker,
  GuidePageSource,
  IdentityProvider,
  Logger,
  MediaStore,
  Publisher,
  RateLimiter,
  RequestRepository,
  SignInList,
  SqlDatabase,
} from './application/ports';
import type { ApiConfig, Services } from './api/context';
import { SqlActivityRepository, SqlAppSettingsRepository, SqlPeopleRepository } from './infrastructure/shared/sql-repositories';

/** Adapters chosen by an entry point (node.ts or worker.ts). */
export interface Adapters {
  config: ApiConfig;
  content: ContentRepository;
  media: MediaStore;
  db: SqlDatabase;
  identity: IdentityProvider;
  publisher: Publisher;
  requests: RequestRepository;
  folderPicker: FolderPicker | null;
  chatModel: ChatModel | null;
  /** Where Ask AI and the MCP connector read pages from. Defaults to the content store. */
  guide?: GuidePageSource;
  chatLimiter: RateLimiter;
  mcpLimiter: RateLimiter;
  logger: Logger;
  uploadLimits: UploadLimits;
  clientIp: Services['clientIp'];
  bootstrapOwnerEmail?: string | null;
  /** Cloud: who may get past the sign-in page, kept in step with People. */
  signIn?: SignInList | null;
  clock?: Clock;
  newId?: () => string;
}

function randomHex(): string {
  const b = new Uint8Array(2);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Ask AI and the MCP connector reading straight from the content store (local admin, tests). */
export function contentGuideSource(content: ContentService): GuidePageSource {
  return {
    publicPages: () => content.publicPages(),
    supportUrl: async () => (await content.siteParsed()).supportUrl ?? null,
  };
}

/** Wires application services onto the adapters. The same wiring for every runtime. */
export function composeServices(a: Adapters): Services {
  const clock: Clock = a.clock ?? { now: () => new Date() };
  const newId = a.newId ?? (() => crypto.randomUUID());
  const mode: AppMode = a.config.mode;
  const activity = new ActivityService(new SqlActivityRepository(a.db), clock, newId);
  const content = new ContentService(a.content, a.media, activity, clock, a.config.siteUrl);
  const guide = a.guide ?? contentGuideSource(content);
  const peopleRepo = new SqlPeopleRepository(a.db);
  const people = new PeopleService(peopleRepo, new SqlAppSettingsRepository(a.db), activity, clock, newId, mode, a.bootstrapOwnerEmail ?? null, a.signIn ?? null);
  const requests = new RequestService(a.requests, activity, clock, randomHex, content);
  const uploads = new UploadService(a.content, a.media, activity, a.uploadLimits);
  const editor = new EditorService(new SqlConnectorKeyRepository(a.db), new SqlPendingChangeRepository(a.db), peopleRepo, content, uploads, requests, activity, clock, newId, new SqlUploadTicketRepository(a.db));
  const automation = new AutomationService(new SqlPlanRepository(a.db), new SqlCheckRepository(a.db), new SqlSkillRepository(a.db), content, requests, activity, clock, newId);
  const feedback = new FeedbackService(new SqlVoteRepository(a.db), guide, clock, newId);
  return {
    config: a.config,
    content,
    automation,
    feedback,
    people,
    activity,
    requests,
    uploads,
    editor,
    publish: new PublishService(a.publisher, activity),
    chat: new ChatService(guide, a.chatModel),
    guideTools: new GuideToolsService(guide, a.config.siteUrl),
    identity: a.identity,
    folderPicker: a.folderPicker,
    chatLimiter: a.chatLimiter,
    mcpLimiter: a.mcpLimiter,
    logger: a.logger,
    clientIp: a.clientIp,
  };
}

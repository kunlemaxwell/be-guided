import type {
  AuditEntryDto,
  AuditQuery,
  ChatSource,
  PageQuery,
  Paged,
  PersonDto,
  RevisionDetailDto,
  RevisionSummaryDto,
  GuideRequest,
  Proposal,
  PublishResultDto,
  PublishStatusDto,
} from '../../../admin/shared/api-types';
import type { Actor } from '../domain/actor';
import type { PublicPage } from '../domain/library';

/**
 * Ports: everything the application needs from the outside world. Each has
 * a Node adapter (infrastructure/node, the owner's Mac) and a Cloudflare
 * adapter (infrastructure/cloudflare). Services depend only on these.
 */

/** Guide content: site.json, product.json, module.json and page .md files. Slugs are validated before they get here. */
export interface ContentRepository {
  readSite(): Promise<unknown>;
  writeSite(value: Record<string, unknown>, message: string): Promise<void>;
  listProducts(): Promise<string[]>;
  readProduct(product: string): Promise<unknown | null>;
  writeProduct(product: string, value: Record<string, unknown>, message: string): Promise<void>;
  listModules(product: string): Promise<string[]>;
  readModule(product: string, module: string): Promise<unknown | null>;
  writeModule(product: string, module: string, value: Record<string, unknown>, message: string): Promise<void>;
  listPages(product: string, module: string): Promise<string[]>;
  /** Raw page text (frontmatter + markdown), or null when the page doesn't exist. */
  readPage(product: string, module: string, page: string): Promise<string | null>;
  writePage(product: string, module: string, page: string, text: string, message: string): Promise<void>;
  /** True if anything (file or folder) already uses this product/module slug. */
  exists(product: string, module?: string): Promise<boolean>;
}

export type MediaFolder = 'images' | 'media';

export interface StoredFile {
  body: ReadableStream<Uint8Array> | Uint8Array;
  size: number;
}

/**
 * Who may get past the sign-in page (Cloud: Cloudflare Access). Kept equal to
 * the active people with an email, so adding someone in People is the invite.
 */
export interface SignInList {
  sync(emails: string[]): Promise<void>;
}

/** Screenshots (images/) and videos (media/) of a module. */
export interface MediaStore {
  list(product: string, module: string, folder: MediaFolder): Promise<string[]>;
  exists(product: string, module: string, folder: MediaFolder, name: string): Promise<boolean>;
  /** Writes a new file; must never replace an existing one (returns false if it exists). */
  putNew(product: string, module: string, folder: MediaFolder, name: string, data: Uint8Array, contentType: string): Promise<boolean>;
  get(product: string, module: string, folder: MediaFolder, name: string): Promise<StoredFile | null>;
  /** A full public web address when the file is served from somewhere other than the site (big videos); null otherwise. */
  publicUrl?(product: string, module: string, folder: MediaFolder, name: string): Promise<string | null>;
}

export interface SqlStatement {
  sql: string;
  params?: SqlValue[];
}
export type SqlValue = string | number | null;

/** Relational storage: node:sqlite locally, D1 on Cloudflare. Always parameterised. */
export interface SqlDatabase {
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, params?: SqlValue[]): Promise<T | null>;
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  /** Runs all statements atomically (all or nothing). */
  batch(statements: SqlStatement[]): Promise<void>;
}

/** What an identity provider proved about the caller (before mapping to a person). */
export type Identity =
  /** Local admin: the person chosen as "who is using this computer" (always owner). */
  | { kind: 'local' }
  /** Cloud: a verified Cloudflare Access identity. */
  | { kind: 'verified-email'; email: string };

export interface IdentityProvider {
  /** Null = no identity (→ 401). Throws AppError('UNAUTHENTICATED') for a bad token. */
  identify(headers: Headers): Promise<Identity | null>;
}

export interface Publisher {
  status(): Promise<PublishStatusDto>;
  publish(): Promise<PublishResultDto>;
}

/** The "Updates & requests" queue (local: .admin/requests.json + proposals; cloud: D1). */
export interface RequestRepository {
  list(): Promise<GuideRequest[]>;
  get(id: string): Promise<GuideRequest | null>;
  save(request: GuideRequest): Promise<void>;
  remove(id: string): Promise<void>;
  getProposal(id: string): Promise<Proposal | null>;
  saveProposal(id: string, proposal: Proposal): Promise<void>;
}

/** The macOS "Choose folder…" dialog (local Mac only). */
export interface FolderPicker {
  /** Absolute folder path, or null when the person pressed Cancel. */
  chooseFolder(): Promise<string | null>;
}

/**
 * Where Ask AI reads the guide from. Local: the content folder. Cloud: the
 * published site's own page index, so Ask AI answers from exactly what is
 * live and needs no GitHub or Access settings.
 */
export interface GuidePageSource {
  /** Published, public pages of public products, with their text. */
  publicPages(): Promise<PublicPage[]>;
  /** The site's support address, if it has one. */
  supportUrl(): Promise<string | null>;
}

export interface ChatContextPage {
  id: string;
  title: string;
  href: string;
  text: string;
}

/** The language model behind Ask AI. */
export interface ChatModel {
  answer(input: {
    messages: { role: 'user' | 'assistant'; content: string }[];
    pages: ChatContextPage[];
    supportUrl: string | null;
  }): Promise<{ answer: string; usedPageIds: string[] }>;
}

export interface RateLimiter {
  /** True if allowed; false when the key is over its limit. */
  take(key: string): boolean;
}

export interface Clock {
  now(): Date;
}

export interface Logger {
  info(message: string, fields?: Record<string, unknown>): void;
  warn(message: string, fields?: Record<string, unknown>): void;
  error(message: string, fields?: Record<string, unknown>): void;
}

/** People who write and publish (SQL). */
export interface PeopleRepository {
  list(): Promise<PersonDto[]>;
  get(id: string): Promise<PersonDto | null>;
  /** Email is matched case-insensitively (stored lower-case). */
  findByEmail(email: string): Promise<PersonDto | null>;
  insert(person: PersonDto): Promise<void>;
  update(person: PersonDto): Promise<void>;
  count(): Promise<number>;
}

/** Small server-owned key/value settings (SQL), e.g. who is using this computer. */
export interface AppSettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string | null, at: string): Promise<void>;
}

/** Audit log + page version history (SQL). One `record` call is atomic. */
export interface ActivityRepository {
  record(entry: AuditEntryDto, revision?: RevisionDetailDto): Promise<void>;
  queryAudit(query: AuditQuery): Promise<Paged<AuditEntryDto>>;
  getAudit(id: string): Promise<AuditEntryDto | null>;
  listRevisions(pageId: string, query: PageQuery): Promise<Paged<RevisionSummaryDto>>;
  getRevision(pageId: string, id: string): Promise<RevisionDetailDto | null>;
}

/** A stored connector key (the key itself is never stored, only its SHA-256 hash). */
export interface ConnectorKeyRecord {
  id: string;
  personId: string;
  label: string;
  prefix: string;
  hash: string;
  products: string[] | null;
  createdAt: string;
  createdBy: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export interface ConnectorKeyRepository {
  list(): Promise<ConnectorKeyRecord[]>;
  get(id: string): Promise<ConnectorKeyRecord | null>;
  findByHash(hash: string): Promise<ConnectorKeyRecord | null>;
  insert(key: ConnectorKeyRecord): Promise<void>;
  revoke(id: string, at: string): Promise<void>;
  touch(id: string, at: string): Promise<void>;
}

/** A one-time link the connector hands out for sending one screenshot or video file. */
export interface UploadTicketRecord {
  id: string;
  tokenHash: string;
  keyId: string;
  personId: string;
  product: string;
  module: string;
  kind: 'image' | 'video';
  fileName: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

export interface UploadTicketRepository {
  insert(t: UploadTicketRecord): Promise<void>;
  findByHash(hash: string): Promise<UploadTicketRecord | null>;
  /** Marks the ticket used; false when it was already used (each link works once). */
  use(id: string, at: string): Promise<boolean>;
}

/** A page change from the connector waiting for an owner's decision. */
export interface PendingChangeRecord {
  id: string;
  kind: 'create' | 'save';
  product: string;
  module: string;
  slug: string;
  frontmatter: Record<string, unknown>;
  body: string;
  note: string;
  authorId: string | null;
  authorName: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  /** 1 when sent once; +1 each time the editor sent a newer version while it waited. */
  revisions: number;
}

export interface PendingChangeRepository {
  list(status?: PendingChangeRecord['status']): Promise<PendingChangeRecord[]>;
  get(id: string): Promise<PendingChangeRecord | null>;
  insert(change: PendingChangeRecord): Promise<void>;
  decide(id: string, status: 'approved' | 'rejected', by: string, at: string, note: string | null): Promise<boolean>;
  /** Replaces a still-pending change with the editor's newer version; false when it was decided meanwhile. */
  revise(id: string, next: { frontmatter: Record<string, unknown>; body: string; note: string; at: string }): Promise<boolean>;
}

export type { Actor, ChatSource };

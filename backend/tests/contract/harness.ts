import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import type { Role } from '../../../admin/shared/api-types';
import type { ChatModel } from '../../src/application/ports';
import { AccessIdentityProvider } from '../../src/infrastructure/cloudflare/access-identity';
import type { LocalApp, LocalOptions } from '../../src/local';
import { localApp, tempWorkspace } from '../helpers';

/**
 * Contract-test harness. By default the API runs in-process (app.request).
 * Set API_BASE_URL to run the same suite against any running server — e.g. a
 * future C# implementation — to prove parity. Tests that need in-process
 * control (fake AI model, temp files, signed tokens) are skipped then; role
 * tests use API_TOKEN_OWNER / API_TOKEN_EDITOR / API_TOKEN_VIEWER (values for
 * the Cf-Access-Jwt-Assertion header) when provided.
 */
export const EXTERNAL_BASE = process.env.API_BASE_URL?.replace(/\/$/, '') ?? null;
export const IN_PROCESS = EXTERNAL_BASE === null;
export const ADMIN_ORIGIN = 'http://localhost:3101';

export interface ApiResponse {
  status: number;
  headers: Headers;
  /** Parsed JSON body (unknown shape until asserted). */
  body: Record<string, unknown> & { success?: boolean; code?: string; message?: string; data?: unknown; issues?: { field: string; message: string }[] };
}

export interface RequestOptions {
  method?: string;
  json?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
  /** Raw body (for content-type tests). */
  raw?: { body: string; type: string };
}

export interface Api {
  request(path: string, options?: RequestOptions): Promise<ApiResponse>;
  get(path: string, headers?: Record<string, string>): Promise<ApiResponse>;
  post(path: string, json?: unknown, headers?: Record<string, string>): Promise<ApiResponse>;
  put(path: string, json?: unknown, headers?: Record<string, string>): Promise<ApiResponse>;
}

function makeApi(send: (url: string, init: RequestInit) => Promise<Response>, defaults: Record<string, string> = {}): Api {
  const request = async (path: string, o: RequestOptions = {}): Promise<ApiResponse> => {
    const headers: Record<string, string> = { ...defaults, ...o.headers };
    let body: BodyInit | undefined;
    if (o.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(o.json);
    } else if (o.form) {
      body = o.form;
    } else if (o.raw) {
      headers['Content-Type'] = o.raw.type;
      body = o.raw.body;
    }
    const method = o.method ?? (body !== undefined ? 'POST' : 'GET');
    if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS' && !('Origin' in headers) && !('origin' in headers)) headers.Origin = ADMIN_ORIGIN;
    const res = await send(path, { method, headers, body });
    const text = await res.text();
    let parsed: ApiResponse['body'] = {};
    try {
      parsed = text ? (JSON.parse(text) as ApiResponse['body']) : {};
    } catch {
      parsed = { raw: text };
    }
    return { status: res.status, headers: res.headers, body: parsed };
  };
  return {
    request,
    get: (path, headers) => request(path, { headers }),
    post: (path, json, headers) => request(path, { method: 'POST', json: json ?? {}, headers }),
    put: (path, json, headers) => request(path, { method: 'PUT', json, headers }),
  };
}

export interface Harness {
  /** The local owner ("who is using this computer"). */
  api: Api;
  local?: LocalApp;
  workspace?: ReturnType<typeof tempWorkspace>;
  cleanup(): void;
}

/** Local-mode API (identity = this computer, role owner). */
export async function localHarness(options: Partial<LocalOptions> = {}): Promise<Harness> {
  if (!IN_PROCESS) {
    return { api: makeApi((p, init) => fetch(`${EXTERNAL_BASE}${p}`, init), process.env.API_TOKEN_OWNER ? { 'Cf-Access-Jwt-Assertion': process.env.API_TOKEN_OWNER } : {}), cleanup: () => undefined };
  }
  const workspace = tempWorkspace();
  const local = await localApp(workspace, options);
  const api = makeApi(async (p, init) => local.app.request(`${ADMIN_ORIGIN}${p}`, init));
  return { api, local, workspace, cleanup: () => workspace.cleanup() };
}

const TEAM = 'https://test-team.cloudflareaccess.com';
const AUD = 'test-audience-tag-0123456789';

export interface RoleHarness extends Harness {
  as(role: Role | 'unknown' | 'inactive'): Api;
  anonymous: Api;
  forged: Api;
  expired: Api;
  wrongAudience: Api;
}

/**
 * Cloud-style identity (Cloudflare Access JWT, verified with jose against a
 * local key set) over the local storage adapters, with one person per role.
 */
export async function roleHarness(): Promise<RoleHarness> {
  if (!IN_PROCESS) {
    const base = (h: Record<string, string>) => makeApi((p, init) => fetch(`${EXTERNAL_BASE}${p}`, init), h);
    const tokenFor = (role: string) => process.env[`API_TOKEN_${role.toUpperCase()}`];
    const as = (role: string) => {
      const t = tokenFor(role);
      return base(t ? { 'Cf-Access-Jwt-Assertion': t } : {});
    };
    return {
      api: as('owner'),
      as,
      anonymous: base({}),
      forged: base({ 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJSUzI1NiJ9.eyJlbWFpbCI6Im93bmVyQGV4YW1wbGUuY29tIn0.AAAA' }),
      expired: base({ 'Cf-Access-Jwt-Assertion': 'invalid' }),
      wrongAudience: base({ 'Cf-Access-Jwt-Assertion': 'invalid' }),
      cleanup: () => undefined,
    };
  }
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const { privateKey: otherKey } = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const workspace = tempWorkspace();
  const local = await localApp(workspace, { identity: new AccessIdentityProvider({ teamDomain: TEAM, audience: AUD, keys }), seed: false });

  const people = local.services.people;
  const ctx = { actor: { personId: null, name: 'Setup', email: null, role: 'owner' as const }, correlationId: 'setup-0000' };
  await people.create(ctx, { name: 'Olive Owner', email: 'owner@example.com', role: 'owner' });
  await people.create(ctx, { name: 'Eddie Editor', email: 'editor@example.com', role: 'editor' });
  await people.create(ctx, { name: 'Vera Viewer', email: 'viewer@example.com', role: 'viewer' });
  const { person: inactive } = await people.create(ctx, { name: 'Ina Inactive', email: 'inactive@example.com', role: 'owner' });
  await people.update(ctx, inactive.id, { name: inactive.name, email: 'inactive@example.com', role: 'editor', active: false });

  const sign = async (email: string, o: { key?: CryptoKey; aud?: string; exp?: number } = {}) =>
    new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
      .setIssuer(TEAM)
      .setAudience(o.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(o.exp ?? Math.floor(Date.now() / 1000) + 600)
      .sign(o.key ?? privateKey);

  const send = async (p: string, init: RequestInit) => local.app.request(`${ADMIN_ORIGIN}${p}`, init);
  const tokens = {
    owner: await sign('owner@example.com'),
    editor: await sign('EDITOR@example.com'),
    viewer: await sign('viewer@example.com'),
    unknown: await sign('stranger@example.com'),
    inactive: await sign('inactive@example.com'),
  };
  const withToken = (t: string) => makeApi(send, { 'Cf-Access-Jwt-Assertion': t });
  return {
    api: withToken(tokens.owner),
    as: (role) => withToken(tokens[role]),
    anonymous: makeApi(send),
    forged: withToken(await sign('owner@example.com', { key: otherKey })),
    expired: withToken(await sign('owner@example.com', { exp: Math.floor(Date.now() / 1000) - 3600 })),
    wrongAudience: withToken(await sign('owner@example.com', { aud: 'someone-else' })),
    local,
    workspace,
    cleanup: () => workspace.cleanup(),
  };
}

/** A fake Ask AI model: answers from the first page it was given, and records what it saw. */
export function fakeChatModel(): ChatModel & { calls: Parameters<ChatModel['answer']>[0][] } {
  const calls: Parameters<ChatModel['answer']>[0][] = [];
  return {
    calls,
    async answer(input) {
      calls.push(input);
      const first = input.pages[0];
      return { answer: first ? `1. Open ${first.title}.` : 'Not in the guide.', usedPageIds: first ? [first.id] : [] };
    },
  };
}

/** Asserts the success envelope and returns `data`. */
export function dataOf<T>(r: ApiResponse): T {
  if (r.body.success !== true || typeof r.body.message !== 'string' || !('data' in r.body)) {
    throw new Error(`Expected a success envelope, got ${r.status}: ${JSON.stringify(r.body).slice(0, 300)}`);
  }
  return r.body.data as T;
}

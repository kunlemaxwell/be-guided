import type { SignInList } from '../../application/ports';
import { AppError } from '../../domain/errors';

export interface AccessSignInListConfig {
  accountId: string;
  /** Cloudflare API token with "Access: Apps and Policies: Edit" on this account (secret). */
  apiToken: string;
  /** The admin's Access application (its Audience tag), so the right app gets the policy. */
  audience: string;
  /** Name of the policy this list owns. Other policies on the app are never touched. */
  policyName?: string;
  fetch?: typeof fetch;
  apiBase?: string;
}

interface CfResponse<T> {
  success: boolean;
  result: T;
  errors?: { message: string }[];
}

interface AccessApp {
  id: string;
  aud?: string;
  policies?: { id: string; precedence?: number }[];
  [key: string]: unknown;
}

interface AccessPolicy {
  id: string;
  name: string;
}

const DEFAULT_POLICY = 'Be Guided people (managed by the admin)';

/**
 * Keeps Cloudflare Access in step with the People list: one reusable "allow"
 * policy, owned by the admin and attached to the admin's Access app, lists the
 * email of every active person. Adding someone in People lets them sign in
 * (email + one-time code); switching them off takes them out again.
 */
export class CloudflareAccessSignInList implements SignInList {
  private readonly fetcher: typeof fetch;
  private readonly api: string;
  private readonly policyName: string;

  constructor(private readonly cfg: AccessSignInListConfig) {
    this.fetcher = cfg.fetch ?? ((input, init) => fetch(input, init));
    this.api = `${(cfg.apiBase ?? 'https://api.cloudflare.com/client/v4').replace(/\/$/, '')}/accounts/${cfg.accountId}/access`;
    this.policyName = cfg.policyName ?? DEFAULT_POLICY;
  }

  private async call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.fetcher(`${this.api}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${this.cfg.apiToken}`, 'Content-Type': 'application/json' },
    });
    const json = (await res.json().catch(() => null)) as CfResponse<T> | null;
    if (res.status === 401 || res.status === 403) throw new AppError('NOT_CONFIGURED', 'The Cloudflare sign-in token is missing permissions (it needs Access: Apps and Policies: Edit).');
    if (!res.ok || !json?.success) {
      const why = json?.errors?.[0]?.message ? `: ${json.errors[0].message}` : '';
      throw new AppError('SERVER_ERROR', `Cloudflare did not accept the sign-in list update (${res.status}${why}). Token check: ${await this.tokenCheck()}.`);
    }
    return json.result;
  }

  /** Says whether Cloudflare recognises the token at all (never reveals it). */
  private async tokenCheck(): Promise<string> {
    const base = this.api.replace(/\/access$/, '');
    const root = base.replace(/\/accounts\/[^/]+$/, '');
    const out: string[] = [];
    for (const [label, url] of [['account token', `${base}/tokens/verify`], ['user token', `${root}/user/tokens/verify`]] as const) {
      try {
        const r = await this.fetcher(url, { headers: { Authorization: `Bearer ${this.cfg.apiToken}` } });
        const j = (await r.json().catch(() => null)) as CfResponse<{ status?: string }> | null;
        out.push(`${label} ${j?.success ? (j.result?.status ?? 'ok') : `no (${r.status})`}`);
      } catch {
        out.push(`${label} unknown`);
      }
    }
    return `${out.join(', ')}; length ${this.cfg.apiToken.length}`;
  }

  async sync(emails: string[]): Promise<void> {
    const unique = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))].sort();
    if (unique.length === 0) return; // never leave an empty allow rule
    const body = JSON.stringify({ name: this.policyName, decision: 'allow', include: unique.map((email) => ({ email: { email } })), exclude: [], require: [] });

    const policies = await this.call<AccessPolicy[]>('/policies?per_page=1000');
    let policy = policies.find((p) => p.name === this.policyName);
    policy = policy ? await this.call<AccessPolicy>(`/policies/${policy.id}`, { method: 'PUT', body }) : await this.call<AccessPolicy>('/policies', { method: 'POST', body });

    const apps = await this.call<AccessApp[]>('/apps?per_page=1000');
    const listed = apps.find((a) => a.aud === this.cfg.audience);
    if (!listed) throw new AppError('NOT_CONFIGURED', "The admin's Cloudflare Access app was not found (check CF_ACCESS_AUD).");
    const app = await this.call<AccessApp>(`/apps/${listed.id}`);
    const current = (app.policies ?? []).map((p, i) => ({ id: p.id, precedence: p.precedence ?? i + 1 }));
    if (current.some((p) => p.id === policy.id)) return;
    const next = [...current, { id: policy.id, precedence: Math.max(0, ...current.map((p) => p.precedence)) + 1 }];
    await this.call<AccessApp>(`/apps/${listed.id}`, { method: 'PUT', body: JSON.stringify({ ...app, policies: next }) });
  }
}

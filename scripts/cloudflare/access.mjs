#!/usr/bin/env node
// Locks the admin with Cloudflare Access, the same way every time.
// Used by `npm run setup`. Safe to run again: it reuses what already exists.
//
// Input (environment):
//   CF_ACCESS_SETUP_TOKEN  API token with "Access: Apps and Policies: Edit" and
//                          "Access: Organizations, Identity Providers, and Groups: Edit"
//   CF_ACCOUNT_ID          Cloudflare account id
//   ADMIN_HOST             e.g. be-guided-admin.your-name.workers.dev
//   OWNER_EMAILS           comma-separated emails allowed into the admin
//   BYPASS_PATHS           comma-separated paths left open (the AI connectors etc.)
// Output: one line of JSON on stdout: {"team":"https://….cloudflareaccess.com","aud":"…"}
// Messages go to stderr. Exit codes: 0 ok, 2 Zero Trust not switched on,
// 3 token can't manage Access, 1 anything else.

const API = 'https://api.cloudflare.com/client/v4';
const env = (k) => {
  const v = (process.env[k] ?? '').trim();
  if (!v) fail(1, `Missing ${k}.`);
  return v;
};
function fail(code, message) {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

const token = env('CF_ACCESS_SETUP_TOKEN');
const account = env('CF_ACCOUNT_ID');
const host = env('ADMIN_HOST').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
const owners = env('OWNER_EMAILS').split(',').map((e) => e.trim()).filter(Boolean);
const bypass = env('BYPASS_PATHS').split(',').map((p) => p.trim().replace(/^\//, '')).filter(Boolean);
const base = `${API}/accounts/${account}/access`;

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try { data = await res.json(); } catch { data = { success: false, errors: [{ message: `HTTP ${res.status}` }] }; }
  return { status: res.status, ...data };
}
const errText = (r) => (r.errors ?? []).map((e) => `${e.code ?? ''} ${e.message ?? ''}`.trim()).join('; ') || `HTTP ${r.status}`;
const isAuthError = (r) => r.status === 401 || r.status === 403 || (r.errors ?? []).some((e) => e.code === 10000 || /auth/i.test(e.message ?? ''));

// 1. Zero Trust organisation (gives the team domain).
let org = await call('GET', '/organizations');
if (isAuthError(org)) fail(3, `This token can't manage Cloudflare Access (${errText(org)}).`);
if (!org.success || !org.result?.auth_domain) {
  fail(2, 'Cloudflare Zero Trust is not switched on for this account yet.');
}
const team = `https://${org.result.auth_domain}`;
process.stderr.write(`Team: ${team}\n`);

// 2. A way to sign in: a one-time code sent by email.
const idps = await call('GET', '/identity_providers');
if (!idps.success) fail(isAuthError(idps) ? 3 : 1, `Couldn't read sign-in methods (${errText(idps)}).`);
if (!(idps.result ?? []).some((i) => i.type === 'onetimepin')) {
  const r = await call('POST', '/identity_providers', { name: 'Email code', type: 'onetimepin', config: {} });
  if (!r.success) fail(1, `Couldn't add email-code sign-in (${errText(r)}).`);
  process.stderr.write('Added sign-in by email code\n');
}

// 3. The two applications: open paths first, then the admin itself.
const apps = await call('GET', '/apps');
if (!apps.success) fail(isAuthError(apps) ? 3 : 1, `Couldn't read Access applications (${errText(apps)}).`);
const existing = apps.result ?? [];
const covers = (app, domain) => app.domain === domain || (app.self_hosted_domains ?? []).includes(domain);

async function ensure(name, domains, body) {
  const found = existing.find((a) => a.name === name) ?? existing.find((a) => covers(a, domains[0]));
  if (found) {
    process.stderr.write(`Already there: ${found.name}\n`);
    return found;
  }
  const r = await call('POST', '/apps', { name, type: 'self_hosted', domain: domains[0], self_hosted_domains: domains, ...body });
  if (!r.success) fail(1, `Couldn't create "${name}" (${errText(r)}).`);
  process.stderr.write(`Created: ${name}\n`);
  return r.result;
}

await ensure('Be Guided API (open)', bypass.map((p) => `${host}/${p}`), {
  policies: [{ name: 'Everyone', decision: 'bypass', include: [{ everyone: {} }], precedence: 1 }],
});
const admin = await ensure('Be Guided admin', [host], {
  session_duration: '24h',
  app_launcher_visible: true,
  policies: [{ name: 'Owners', decision: 'allow', include: owners.map((email) => ({ email: { email } })), precedence: 1 }],
});
if (!admin.aud) fail(1, 'Cloudflare did not return the admin application tag (AUD).');

process.stdout.write(`${JSON.stringify({ team, aud: admin.aud })}\n`);

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productSchema } from '@/types/content';
import { slugify } from '../../../../shared/slug';
import { HeroPicker } from './HeroPicker';
import type { ProductJson, ProductSummary } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { ApiError, describeError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { Icon } from '../../components/Icon';
import { Switch } from '../../components/Switch';
import { useNotice } from '../../hooks/useNotice';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { SITE_URL } from '../../lib/site';

const ENVIRONMENTS = [
  { key: 'local', label: 'On this computer', placeholder: 'http://localhost:3000' },
  { key: 'staging', label: 'Staging (test copy)', placeholder: 'https://staging.example.com' },
  { key: 'production', label: 'Live', placeholder: 'https://app.example.com' },
] as const;

interface RepoRow {
  key: number;
  url: string;
  branch: string;
  paths: string;
  /** Where this repository's code is on this computer (chosen with "Choose folder…"). */
  localPath: string;
}

interface FormState {
  name: string;
  summary: string;
  visibility: 'public' | 'private';
  /** Connector changes wait for an owner's approval (default on). */
  editorApproval: boolean;
  status: 'available' | 'coming-soon';
  order: string;
  repos: RepoRow[];
  envs: Record<(typeof ENVIRONMENTS)[number]['key'], string>;
  /** Hero pictures ("module/images/file"), main one first; empty = the first screenshots of its guides. */
  heroImages: string[];
}

let rowKey = 1;

function toForm(meta: ProductJson): FormState {
  const source = meta.source as { repos?: { url?: string; branch?: string; paths?: string[]; localPath?: string }[] } | undefined;
  const envs = (meta.environments ?? {}) as Record<string, { appUrl?: string } | undefined>;
  return {
    name: meta.name,
    summary: meta.summary,
    visibility: meta.visibility === 'private' ? 'private' : 'public',
    editorApproval: meta.editorApproval !== false,
    status: meta.status === 'coming-soon' ? 'coming-soon' : 'available',
    order: String(typeof meta.order === 'number' ? meta.order : 100),
    repos: (source?.repos ?? []).map((r) => ({ key: rowKey++, url: r.url ?? '', branch: r.branch ?? 'main', paths: (r.paths ?? []).join(', '), localPath: r.localPath ?? '' })),
    heroImages: ((meta.hero as { images?: string[] } | undefined)?.images ?? []).slice(0, 4),
    envs: {
      local: envs.local?.appUrl ?? '',
      staging: envs.staging?.appUrl ?? '',
      production: envs.production?.appUrl ?? '',
    },
  };
}

/** Builds product.json from the form, keeping any fields the form doesn't show. */
function fromForm(meta: ProductJson, f: FormState): Record<string, unknown> {
  const next: Record<string, unknown> = {
    ...meta,
    name: f.name.trim(),
    summary: f.summary.trim(),
    visibility: f.visibility,
    editorApproval: f.editorApproval,
    status: f.status,
    order: Number.parseInt(f.order, 10),
  };
  const repos = f.repos
    .filter((r) => r.url.trim())
    .map((r) => ({
      url: r.url.trim(),
      branch: r.branch.trim() || 'main',
      paths: r.paths.split(',').map((p) => p.trim()).filter(Boolean),
      ...(r.localPath.trim() ? { localPath: r.localPath.trim() } : {}),
    }));
  if (repos.length > 0 || meta.source !== undefined) next.source = { ...((meta.source as object | undefined) ?? {}), repos };
  const environments: Record<string, { appUrl: string }> = {};
  for (const e of ENVIRONMENTS) if (f.envs[e.key].trim()) environments[e.key] = { appUrl: f.envs[e.key].trim() };
  if (Object.keys(environments).length > 0 || meta.environments !== undefined) next.environments = environments;
  else delete next.environments;
  const heroRest = { ...((meta.hero as Record<string, unknown> | undefined) ?? {}) };
  delete heroRest.images;
  if (f.heroImages.length > 0) next.hero = { ...heroRest, images: f.heroImages };
  else if (Object.keys(heroRest).length > 0) next.hero = heroRest; // keeps a hero film or label
  else delete next.hero;
  return next;
}

function issuesFor(value: Record<string, unknown>): Record<string, string> {
  const r = productSchema.safeParse(value);
  const out: Record<string, string> = {};
  for (const i of r.success ? [] : r.error.issues) {
    const k = String(i.path[0] ?? '');
    if (k === 'name') out.name = 'Give the product a name.';
    else if (k === 'summary') out.summary = 'Add a one-line summary.';
    else if (k === 'order') out.order = 'Use a whole number.';
    else if (k === 'environments') out.environments = 'App addresses must be full web addresses, starting with http:// or https://';
    else if (k === 'source') out.source = 'Each repository needs an address.';
  }
  const repos = ((value.source as { repos?: { localPath?: unknown }[] } | undefined)?.repos ?? []);
  if (repos.some((r) => typeof r.localPath === 'string' && !r.localPath.startsWith('/'))) {
    out.source = 'A folder on this computer must be a full folder path (starting with /).';
  }
  return out;
}

/** "Choose folder…" (local Mac only): opens the macOS folder picker on this computer. */
function ChooseFolderButton({ onChosen }: { onChosen: (path: string) => void }) {
  const { notify } = useNotice();
  const caps = useQuery({ queryKey: queryKeys.capabilities, queryFn: ({ signal }) => api.getCapabilities(signal), staleTime: Number.POSITIVE_INFINITY });
  const choose = useMutation({
    mutationFn: api.chooseFolder,
    onSuccess: (r) => {
      if (r.path) onChosen(r.path);
    },
    onError: (e) => notify('error', describeError(e)),
  });
  if (!caps.data?.folderPicker) return null;
  return (
    <button type="button" className="btn btn--small" disabled={choose.isPending} onClick={() => choose.mutate()}>
      <Icon name="folder" size={16} /> {choose.isPending ? 'Waiting for the folder window…' : 'Choose folder…'}
    </button>
  );
}

/** The product's own address on the guide site, to open or copy and share. */
function ProductLink({ product }: { product: ProductSummary }) {
  const url = `${SITE_URL.replace(/\/+$/, '')}/${product.slug}/`;
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(null), 2500);
    return () => clearTimeout(t);
  }, [copied]);
  const live = product.meta.visibility !== 'private' && product.meta.status !== 'coming-soon';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      setCopied('failed');
    }
  };
  return (
    <div className="product-link stack" role="group" aria-label="Product link">
      <span className="field__label">Product link</span>
      <div className="product-link__row">
        <input className="product-link__url mono" type="text" value={url} readOnly spellCheck={false} aria-label={`Link to the ${product.meta.name} guide`} onFocus={(e) => e.currentTarget.select()} />
        <a className="btn" href={url} target="_blank" rel="noreferrer">Open</a>
        <button type="button" className="btn" onClick={copy}>{copied === 'yes' ? 'Copied' : 'Copy'}</button>
      </div>
      <p className="muted" aria-live="polite">
        {copied === 'failed'
          ? 'Copying was blocked. Select the link and press Cmd+C (Ctrl+C on Windows).'
          : live
            ? 'Opens this product’s guide directly. Share it with anyone who only needs this product.'
            : 'This link works once the product is public and Available, and the site is published.'}
      </p>
    </div>
  );
}

function ProductEditor({ product }: { product: ProductSummary }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const canWrite = useAuth().can('content:write');
  const [form, setForm] = useState<FormState>(() => toForm(product.meta));
  // Reset the form only when the saved product really changed (not on every refetch).
  const savedJson = JSON.stringify(product.meta);
  useEffect(() => setForm(toForm(JSON.parse(savedJson) as ProductJson)), [savedJson]);

  const next = useMemo(() => fromForm(product.meta, form), [product.meta, form]);
  const issues = issuesFor(next);
  const dirty = JSON.stringify(next) !== JSON.stringify(fromForm(product.meta, toForm(product.meta)));

  const save = useMutation({
    mutationFn: () => api.saveProduct(product.slug, next),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      notify('success', 'Saved — refresh the site to see it.', { href: SITE_URL, label: 'Open the site' });
    },
    onError: (e) => notify('error', describeError(e)),
  });

  const leaveGuard = useUnsavedChanges(dirty, 'your changes to this product');
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const setRepo = (key: number, patch: Partial<RepoRow>) =>
    setForm((f) => ({ ...f, repos: f.repos.map((r) => (r.key === key ? { ...r, ...patch } : r)) }));

  return (
    <form
      className="panel stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (Object.keys(issues).length === 0) save.mutate();
      }}
    >
      {leaveGuard}
      <fieldset className="stack plain-fieldset" disabled={!canWrite}>
      <legend className="visually-hidden">Product details</legend>
      <div className="panel__head">
        <h2>{product.meta.name}</h2>
        <span className="muted mono">/{product.slug}/</span>
      </div>
      <ProductLink product={product} />
      <Field label="Name" error={issues.name}>
        {(p) => <input {...p} value={form.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <Field label="Summary" hint="One line shown on the home page card." error={issues.summary}>
        {(p) => <textarea {...p} rows={2} value={form.summary} onChange={(e) => set('summary', e.target.value)} />}
      </Field>
      <Switch
        label="Show on the public site"
        checked={form.visibility === 'public'}
        onChange={(on) => {
          set('visibility', on ? 'public' : 'private');
          // Making a product public normally means "open it": switch Coming soon to Available too.
          if (on && form.status === 'coming-soon') set('status', 'available');
        }}
        hint={form.visibility === 'public' ? 'Public: on the website for everyone.' : 'Private: kept off the public site, Ask AI and search. Still editable here.'}
      />
      <Switch
        label="Approve connector changes before they go live"
        checked={form.editorApproval}
        onChange={(on) => set('editorApproval', on)}
        hint={
          form.editorApproval
            ? 'On: changes sent from Claude Code or Codex wait in Updates & requests until an owner approves them.'
            : 'Off: trusted editors with a key for this product publish straight away (it still checks every page against the rules).'
        }
      />
      <div className="grid-2">
        <fieldset className="radio-set">
          <legend>Availability</legend>
          <label>
            <input type="radio" name="status" checked={form.status === 'available'} onChange={() => set('status', 'available')} />
            Available
          </label>
          <label>
            <input type="radio" name="status" checked={form.status === 'coming-soon'} onChange={() => set('status', 'coming-soon')} />
            Coming soon
          </label>
          <p className="field__hint">
            {form.status === 'available'
              ? 'Available: readers can open the product and its guides.'
              : 'Coming soon: only the card shows on the home page. Its guides cannot be opened, searched or asked about until you choose Available.'}
          </p>
        </fieldset>
      </div>
      <HeroPicker product={product.slug} value={form.heroImages} onChange={(v) => set('heroImages', v)} />
      <Field label="Order" hint="Lower numbers are listed first." error={issues.order}>
        {(p) => <input {...p} className="input--short" inputMode="numeric" value={form.order} onChange={(e) => set('order', e.target.value)} />}
      </Field>

      <fieldset className="subsection">
        <legend>Where the app’s code lives</legend>
        <p className="muted">Claude reads these to keep the guide in step with the app.</p>
        {form.repos.length === 0 ? <p className="muted">No repositories yet.</p> : null}
        {form.repos.map((r, i) => (
          <div key={r.key} className="repo-row">
            <Field label={`Repository ${i + 1}`} hint="e.g. your-org/your-app">
              {(p) => <input {...p} value={r.url} onChange={(e) => setRepo(r.key, { url: e.target.value })} />}
            </Field>
            <Field label="Branch">
              {(p) => <input {...p} value={r.branch} onChange={(e) => setRepo(r.key, { branch: e.target.value })} />}
            </Field>
            <Field label="Folders with the screens" hint="Separate with commas, e.g. src/app">
              {(p) => <input {...p} value={r.paths} onChange={(e) => setRepo(r.key, { paths: e.target.value })} />}
            </Field>
            <div className="repo-row__local">
              <span className="file-picker__label">Code on this computer (optional)</span>
              <div className="file-picker__row">
                {r.localPath ? (
                  <span className="file-picker__file file-picker__file--plain mono" title={r.localPath}>
                    <Icon name="folder" size={16} />
                    {r.localPath}
                  </span>
                ) : (
                  <span className="muted small">No folder chosen.</span>
                )}
                <ChooseFolderButton onChosen={(path) => setRepo(r.key, { localPath: path })} />
                {r.localPath ? (
                  <button type="button" className="btn btn--small btn--ghost" onClick={() => setRepo(r.key, { localPath: '' })}>
                    Remove
                  </button>
                ) : null}
              </div>
            </div>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => set('repos', form.repos.filter((x) => x.key !== r.key))}>
              Take off the list
            </button>
          </div>
        ))}
        {issues.source ? <p className="field__error">{issues.source}</p> : null}
        <button
          type="button"
          className="btn btn--small"
          onClick={() => set('repos', [...form.repos, { key: rowKey++, url: '', branch: 'main', paths: '', localPath: '' }])}
        >
          + Add a repository
        </button>
      </fieldset>

      <fieldset className="subsection">
        <legend>App addresses</legend>
        <p className="muted">Where the running app can be opened, for screenshots and videos.</p>
        <div className="grid-3">
          {ENVIRONMENTS.map((env) => (
            <Field key={env.key} label={env.label}>
              {(p) => (
                <input
                  {...p}
                  placeholder={env.placeholder}
                  value={form.envs[env.key]}
                  onChange={(e) => set('envs', { ...form.envs, [env.key]: e.target.value })}
                />
              )}
            </Field>
          ))}
        </div>
        {issues.environments ? <p className="field__error">{issues.environments}</p> : null}
      </fieldset>

      </fieldset>
      <div className="form-actions">
        <button type="submit" className="btn btn--primary" disabled={!canWrite || !dirty || save.isPending || Object.keys(issues).length > 0}>
          {save.isPending ? 'Saving…' : 'Save product'}
        </button>
        {dirty ? (
          <button type="button" className="btn btn--ghost" onClick={() => setForm(toForm(product.meta))}>
            Undo changes
          </button>
        ) : (
          <span className="muted">All changes saved.</span>
        )}
      </div>
    </form>
  );
}

function NewProductDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (slug: string) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const finalSlug = slugTouched ? slug : slugify(name);
  const create = useMutation({
    mutationFn: () => api.createProduct({ name: name.trim(), summary: summary.trim(), slug: finalSlug }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      onCreated(finalSlug);
      setName('');
      setSummary('');
      setSlug('');
      setSlugTouched(false);
    },
  });
  const fieldError = (f: string) => (create.error instanceof ApiError ? create.error.issues.find((i) => i.field === f)?.message : undefined);
  return (
    <Dialog
      open={open}
      title="New product"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!name.trim() || !summary.trim() || !finalSlug || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Creating…' : 'Create product'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">New products start as private and “coming soon”, so nobody sees them until you’re ready.</p>
        <Field label="Name" error={fieldError('name')}>
          {(p) => <input {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Summary" hint="One line about what it does." error={fieldError('summary')}>
          {(p) => <input {...p} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <Field label="Web address name" hint={`The site address will be ${SITE_URL}/${finalSlug || '…'}/`} error={fieldError('slug')}>
          {(p) => (
            <input
              {...p}
              className="mono"
              value={finalSlug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          )}
        </Field>
        {create.isError && !(create.error instanceof ApiError && create.error.issues.length > 0) ? (
          <p className="field__error" role="alert">
            {describeError(create.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Products: list on the left, the chosen product's details on the right. */
export default function ProductsScreen() {
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const canCreate = useAuth().can('content:write');

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Products</h1>
          <p className="lede">Each product gets its own section of the guide.</p>
        </div>
        {canCreate ? (
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            + New product
          </button>
        ) : null}
      </header>
      <AsyncView query={library} isEmpty={(d) => d.products.length === 0} empty="No products yet. Select “New product” to add one.">
        {(data) => {
          const current = data.products.find((p) => p.slug === selected) ?? data.products[0];
          return (
            <div className="split">
              <ul className="product-list" aria-label="Products">
                {data.products.map((p) => {
                  const pages = p.modules.reduce((n, m) => n + m.pages.length, 0);
                  return (
                    <li key={p.slug}>
                      <button
                        type="button"
                        className={`product-item${current?.slug === p.slug ? ' product-item--on' : ''}`}
                        aria-current={current?.slug === p.slug}
                        onClick={() => setSelected(p.slug)}
                      >
                        <span className="product-item__name">{p.meta.name}</span>
                        <span className="product-item__meta">
                          {p.modules.length} modules · {pages} pages
                        </span>
                        <span className="product-item__badges">
                          <Badge tone={p.meta.visibility === 'private' ? 'neutral' : 'live'}>
                            {p.meta.visibility === 'private' ? 'Private' : 'Public'}
                          </Badge>
                          {p.meta.status === 'coming-soon' ? <Badge tone="draft">Coming soon</Badge> : null}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {current ? <ProductEditor key={current.slug} product={current} /> : null}
            </div>
          );
        }}
      </AsyncView>
      <NewProductDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(slug) => {
          setCreating(false);
          setSelected(slug);
        }}
      />
    </div>
  );
}

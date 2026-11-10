import type { ContentRepository } from '../../application/ports';
import { AppError } from '../../domain/errors';
import { isSlug } from '../../domain/slugs';

export interface GitHubContentConfig {
  /** "owner/repo" */
  repo: string;
  branch: string;
  token: string;
  /** Folder in the repo that holds site.json and products/, default "content". */
  contentDir: string;
  /** Committer shown on the commits. */
  committer: { name: string; email: string };
  /** For tests; defaults to global fetch. */
  fetch?: typeof fetch;
  apiBase?: string;
}

interface TreeEntry {
  path: string;
  type: 'blob' | 'tree';
}

function b64encode(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

function b64decode(b64: string): string {
  const bin = atob(b64.replace(/\n/g, ''));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Guide content in a GitHub repository (Cloudflare mode). Reads list the
 * repo tree once (cached briefly), files are read and written through the
 * contents API, and every save is a commit on the configured branch, so the
 * Pages build picks it up. Fetch-based, so it runs on Workers.
 */
// Reading the whole library (every product.json, module.json and page) would
// cost one contents-API call per file, which breaks the Workers limit of 50
// outgoing requests per call. So the first read after a tree refresh loads all
// .md/.json files under the content folder with batched GraphQL queries
// (BULK_CHUNK files each) and serves later reads from that snapshot.
const BULK_CHUNK = 60;
/** How long a content snapshot is reused (saves through this repository clear it at once). */
const SNAPSHOT_MS = 30_000;
export class GitHubContentRepository implements ContentRepository {
  private tree: { at: number; entries: TreeEntry[] } | null = null;
  private files: { at: number; map: Map<string, { text: string; sha: string }> } | null = null;
  private readonly fetcher: typeof fetch;
  private readonly api: string;

  constructor(private readonly cfg: GitHubContentConfig) {
    this.fetcher = cfg.fetch ?? ((input, init) => fetch(input, init));
    this.api = (cfg.apiBase ?? 'https://api.github.com').replace(/\/$/, '');
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'be-guided',
    };
  }

  private path(...parts: string[]): string {
    return [this.cfg.contentDir.replace(/^\/+|\/+$/g, ''), ...parts].filter(Boolean).join('/');
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetcher(url, { ...init, headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) } });
    if (res.status === 401 || res.status === 403) throw new AppError('NOT_CONFIGURED', 'The GitHub connection is not set up correctly (check the token and repository).');
    return res;
  }

  private async entries(): Promise<TreeEntry[]> {
    if (this.tree && Date.now() - this.tree.at < 5_000) return this.tree.entries;
    const res = await this.request(`${this.api}/repos/${this.cfg.repo}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`);
    if (!res.ok) throw new AppError('SERVER_ERROR', 'The guide content could not be read from GitHub. Try again.');
    const json = (await res.json()) as { tree?: TreeEntry[]; truncated?: boolean };
    const entries = json.tree ?? [];
    this.tree = { at: Date.now(), entries };
    return entries;
  }

  private async childDirs(prefix: string, marker: string): Promise<string[]> {
    const all = await this.entries();
    const blobs = new Set(all.filter((e) => e.type === 'blob').map((e) => e.path));
    const out = new Set<string>();
    for (const e of all) {
      if (e.type !== 'tree' || !e.path.startsWith(`${prefix}/`)) continue;
      const rest = e.path.slice(prefix.length + 1);
      if (rest.includes('/') || !isSlug(rest)) continue;
      if (blobs.has(`${e.path}/${marker}`)) out.add(rest);
    }
    return [...out];
  }

  /** Loads every .md/.json file under the content folder in a few GraphQL calls; null if that fails. */
  private async bulk(): Promise<Map<string, { text: string; sha: string }> | null> {
    let entries: TreeEntry[];
    try {
      entries = await this.entries();
    } catch (e) {
      if (e instanceof AppError && e.code === 'NOT_CONFIGURED') throw e;
      return null;
    }
    if (this.files && Date.now() - this.files.at < SNAPSHOT_MS) return this.files.map;
    // Only the files the library is built from: site.json, product.json,
    // module.json and the pages directly in a module folder.
    const root = this.cfg.contentDir.replace(/^\/+|\/+$/g, '');
    const wanted = new RegExp(`^${root.replace(/[^\w/-]/g, '\\$&')}/(site\\.json|products/[^/]+/product\\.json|products/[^/]+/[^/]+/(module\\.json|[^/]+\\.md))$`);
    const paths = entries.filter((e) => e.type === 'blob' && wanted.test(e.path)).map((e) => e.path);
    const [owner, name] = this.cfg.repo.split('/');
    const chunks: string[][] = [];
    for (let i = 0; i < paths.length; i += BULK_CHUNK) chunks.push(paths.slice(i, i + BULK_CHUNK));
    const out = new Map<string, { text: string; sha: string }>();
    try {
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const fields = chunk.map((p, j) => `f${j}: object(expression: ${JSON.stringify(`${this.cfg.branch}:${p}`)}) { ... on Blob { oid text isTruncated } }`).join('\n');
          const query = `query { repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) { ${fields} } }`;
          const res = await this.request(`${this.api}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
          if (!res.ok) return null;
          const json = (await res.json()) as { data?: { repository?: Record<string, { oid?: string; text?: string | null; isTruncated?: boolean } | null> } };
          return json.data?.repository ?? null;
        }),
      );
      for (const [i, repo] of results.entries()) {
        if (!repo) return null;
        chunks[i]!.forEach((p, j) => {
          const b = repo[`f${j}`];
          if (b && typeof b.oid === 'string' && typeof b.text === 'string' && !b.isTruncated) out.set(p, { text: b.text, sha: b.oid });
        });
      }
    } catch (e) {
      if (e instanceof AppError) throw e;
      return null;
    }
    this.files = { at: Date.now(), map: out };
    return out;
  }

  private async readFile(path: string): Promise<{ text: string; sha: string } | null> {
    const snapshot = await this.bulk();
    const hit = snapshot?.get(path);
    if (hit) return hit;
    const res = await this.request(`${this.api}/repos/${this.cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.cfg.branch)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new AppError('SERVER_ERROR', 'A guide file could not be read from GitHub. Try again.');
    const json = (await res.json()) as { content?: string; sha?: string; encoding?: string };
    if (typeof json.content !== 'string' || typeof json.sha !== 'string') return null;
    return { text: b64decode(json.content), sha: json.sha };
  }

  private async writeFile(path: string, text: string, message: string): Promise<void> {
    const current = await this.readFile(path);
    const res = await this.request(`${this.api}/repos/${this.cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        content: b64encode(text),
        branch: this.cfg.branch,
        committer: this.cfg.committer,
        ...(current ? { sha: current.sha } : {}),
      }),
    });
    if (res.status === 409 || res.status === 422) throw new AppError('CONFLICT', 'Someone else changed this file at the same moment. Reload and try again.');
    if (!res.ok) throw new AppError('SERVER_ERROR', 'The change could not be saved to GitHub. Nothing was changed. Try again.');
    this.tree = null;
    this.files = null;
  }

  // ── Binary files (screenshots, videos) ─────────────────────────────────
  // Kept in the same repository as the pages, so the site build (which runs
  // from GitHub) has every picture a page refers to.

  private repoPath(...parts: string[]): string {
    return this.path(...parts);
  }

  /** File names directly inside a folder under the content folder (from the cached tree). */
  async listBinary(...dir: string[]): Promise<string[]> {
    const prefix = `${this.repoPath(...dir)}/`;
    return (await this.entries())
      .filter((e) => e.type === 'blob' && e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes('/'))
      .map((e) => e.path.slice(prefix.length));
  }

  async hasBinary(...parts: string[]): Promise<boolean> {
    const path = this.repoPath(...parts);
    return (await this.entries()).some((e) => e.type === 'blob' && e.path === path);
  }

  async readBinary(...parts: string[]): Promise<Uint8Array | null> {
    const path = this.repoPath(...parts);
    const res = await this.request(`${this.api}/repos/${this.cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(this.cfg.branch)}`, {
      headers: { Accept: 'application/vnd.github.raw' },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new AppError('SERVER_ERROR', 'A picture could not be read from GitHub. Try again.');
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Commits a new binary file; false when a file with that name already exists (never replaces). */
  async createBinary(parts: string[], bytes: Uint8Array, message: string): Promise<boolean> {
    if (await this.hasBinary(...parts)) return false;
    const path = this.repoPath(...parts);
    const res = await this.request(`${this.api}/repos/${this.cfg.repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, content: bytesToB64(bytes), branch: this.cfg.branch, committer: this.cfg.committer }),
    });
    if (res.status === 422 || res.status === 409) return false;
    if (!res.ok) throw new AppError('SERVER_ERROR', 'The picture could not be saved to GitHub. Nothing was changed. Try again.');
    this.tree = null;
    return true;
  }

  private async readJson(path: string): Promise<unknown | null> {
    const f = await this.readFile(path);
    if (!f) return null;
    try {
      return JSON.parse(f.text) as unknown;
    } catch {
      throw new AppError('INVALID', `${path.split('/').pop() ?? 'A file'} is not valid JSON.`);
    }
  }

  private json(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
  }

  async readSite(): Promise<unknown> {
    return (await this.readJson(this.path('site.json'))) ?? {};
  }

  async writeSite(value: Record<string, unknown>, message: string): Promise<void> {
    await this.writeFile(this.path('site.json'), this.json(value), message);
  }

  async listProducts(): Promise<string[]> {
    return this.childDirs(this.path('products'), 'product.json');
  }

  async readProduct(product: string): Promise<unknown | null> {
    return this.readJson(this.path('products', product, 'product.json'));
  }

  async writeProduct(product: string, value: Record<string, unknown>, message: string): Promise<void> {
    await this.writeFile(this.path('products', product, 'product.json'), this.json(value), message);
  }

  async listModules(product: string): Promise<string[]> {
    return this.childDirs(this.path('products', product), 'module.json');
  }

  async readModule(product: string, module: string): Promise<unknown | null> {
    return this.readJson(this.path('products', product, module, 'module.json'));
  }

  async writeModule(product: string, module: string, value: Record<string, unknown>, message: string): Promise<void> {
    await this.writeFile(this.path('products', product, module, 'module.json'), this.json(value), message);
  }

  async listPages(product: string, module: string): Promise<string[]> {
    const prefix = `${this.path('products', product, module)}/`;
    return (await this.entries())
      .filter((e) => e.type === 'blob' && e.path.startsWith(prefix) && e.path.endsWith('.md') && !e.path.slice(prefix.length).includes('/'))
      .map((e) => e.path.slice(prefix.length, -3))
      .filter(isSlug);
  }

  async readPage(product: string, module: string, page: string): Promise<string | null> {
    return (await this.readFile(this.path('products', product, module, `${page}.md`)))?.text ?? null;
  }

  async writePage(product: string, module: string, page: string, text: string, message: string): Promise<void> {
    await this.writeFile(this.path('products', product, module, `${page}.md`), text, message);
  }

  async exists(product: string, module?: string): Promise<boolean> {
    const target = module ? this.path('products', product, module) : this.path('products', product);
    return (await this.entries()).some((e) => e.path === target || e.path.startsWith(`${target}/`));
  }
}

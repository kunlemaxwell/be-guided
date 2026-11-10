import type { MediaFolder, MediaStore, StoredFile } from '../../application/ports';
import { AppError } from '../../domain/errors';
import type { GitHubContentRepository } from './github-content-repository';

/** The site (Cloudflare Pages) serves files up to 25 MiB; anything bigger can't live in the repo. */
export const SITE_FILE_LIMIT = 24 * 1024 * 1024;

/** Where files too big for the site go: a store plus the public web address it is served from. */
export interface BigFileStore {
  store: MediaStore;
  /** e.g. https://pub-xxxx.r2.dev (no trailing slash) */
  publicBase: string;
}

/**
 * Screenshots and videos kept in the GitHub repository next to the pages
 * (content/products/<p>/<m>/images|media/<name>), so the site build, which
 * runs from GitHub, always has them. An optional older store (R2) is still
 * read, so files uploaded there earlier keep working; new files go to GitHub.
 */
export class GitHubMediaStore implements MediaStore {
  constructor(
    private readonly repo: GitHubContentRepository,
    private readonly older: MediaStore | null = null,
    /** Big videos (over SITE_FILE_LIMIT) go here and play from its public address. */
    private readonly big: BigFileStore | null = null,
  ) {}

  async list(product: string, module: string, folder: MediaFolder): Promise<string[]> {
    const names = new Set(
      (await this.repo.listBinary('products', product, module, folder)).filter((n) => !n.startsWith('.') && !n.startsWith('_')),
    );
    if (this.older) for (const n of await this.older.list(product, module, folder)) names.add(n);
    return [...names].sort();
  }

  async exists(product: string, module: string, folder: MediaFolder, name: string): Promise<boolean> {
    if (await this.repo.hasBinary('products', product, module, folder, name)) return true;
    return this.older ? this.older.exists(product, module, folder, name) : false;
  }

  async putNew(product: string, module: string, folder: MediaFolder, name: string, data: Uint8Array, contentType = 'application/octet-stream'): Promise<boolean> {
    if (this.older && (await this.older.exists(product, module, folder, name))) return false;
    if (data.byteLength > SITE_FILE_LIMIT) {
      if (!this.big) throw new AppError('FILE_TOO_LARGE', 'That file is too big for the site (up to 24 MB). Make the video shorter or smaller.');
      if (await this.repo.hasBinary('products', product, module, folder, name)) return false;
      return this.big.store.putNew(product, module, folder, name, data, contentType);
    }
    return this.repo.createBinary(['products', product, module, folder, name], data, `Add ${folder === 'images' ? 'screenshot' : 'video'} ${product}/${module}/${name}`);
  }

  async publicUrl(product: string, module: string, folder: MediaFolder, name: string): Promise<string | null> {
    if (!this.big || (await this.repo.hasBinary('products', product, module, folder, name))) return null;
    if (!(await this.big.store.exists(product, module, folder, name))) return null;
    return `${this.big.publicBase.replace(/\/$/, '')}/products/${product}/${module}/${folder}/${encodeURIComponent(name)}`;
  }

  async get(product: string, module: string, folder: MediaFolder, name: string): Promise<StoredFile | null> {
    const bytes = await this.repo.readBinary('products', product, module, folder, name);
    if (bytes) return { body: bytes, size: bytes.byteLength };
    return this.older ? this.older.get(product, module, folder, name) : null;
  }
}

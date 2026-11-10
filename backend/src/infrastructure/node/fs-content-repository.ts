import fs from 'node:fs';
import path from 'node:path';
import type { ContentRepository } from '../../application/ports';
import { AppError } from '../../domain/errors';
import { isSlug } from '../../domain/slugs';
import { isDir, isFile, readJsonFile, within, writeFileAtomic, writeJsonAtomic } from './fs-safe';

/**
 * Guide content on this computer, under content/. The public site
 * (npm run dev) reads the same folder directly, so a save shows on refresh.
 */
export class FsContentRepository implements ContentRepository {
  constructor(readonly root: string) {}

  private products(): string {
    return within(this.root, 'products');
  }

  private readJson(file: string): unknown | null {
    if (!isFile(file)) return null;
    try {
      return readJsonFile(file);
    } catch {
      throw new AppError('INVALID', `${path.basename(file)} is not valid JSON. Fix the file, then try again.`);
    }
  }

  private dirs(dir: string, marker: string): string[] {
    if (!isDir(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && isSlug(d.name) && isFile(path.join(dir, d.name, marker)))
      .map((d) => d.name);
  }

  async readSite(): Promise<unknown> {
    return this.readJson(within(this.root, 'site.json')) ?? {};
  }

  async writeSite(value: Record<string, unknown>): Promise<void> {
    writeJsonAtomic(within(this.root, 'site.json'), value);
  }

  async listProducts(): Promise<string[]> {
    return this.dirs(this.products(), 'product.json');
  }

  async readProduct(product: string): Promise<unknown | null> {
    return this.readJson(within(this.products(), product, 'product.json'));
  }

  async writeProduct(product: string, value: Record<string, unknown>): Promise<void> {
    writeJsonAtomic(within(this.products(), product, 'product.json'), value);
  }

  async listModules(product: string): Promise<string[]> {
    return this.dirs(within(this.products(), product), 'module.json');
  }

  async readModule(product: string, module: string): Promise<unknown | null> {
    return this.readJson(within(this.products(), product, module, 'module.json'));
  }

  async writeModule(product: string, module: string, value: Record<string, unknown>): Promise<void> {
    writeJsonAtomic(within(this.products(), product, module, 'module.json'), value);
  }

  async listPages(product: string, module: string): Promise<string[]> {
    const dir = within(this.products(), product, module);
    if (!isDir(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.md') && isSlug(f.slice(0, -3)))
      .map((f) => f.slice(0, -3));
  }

  async readPage(product: string, module: string, page: string): Promise<string | null> {
    const file = within(this.products(), product, module, `${page}.md`);
    return isFile(file) ? fs.readFileSync(file, 'utf8') : null;
  }

  async writePage(product: string, module: string, page: string, text: string): Promise<void> {
    writeFileAtomic(within(this.products(), product, module, `${page}.md`), text);
  }

  async exists(product: string, module?: string): Promise<boolean> {
    const p = module ? within(this.products(), product, module) : within(this.products(), product);
    return fs.existsSync(p);
  }
}

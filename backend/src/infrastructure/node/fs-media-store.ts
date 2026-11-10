import fs from 'node:fs';
import { Readable } from 'node:stream';
import type { MediaFolder, MediaStore, StoredFile } from '../../application/ports';
import { isDir, isFile, within, writeFileAtomic } from './fs-safe';

/** Screenshots and videos in content/products/<p>/<m>/images|media on this computer. */
export class FsMediaStore implements MediaStore {
  constructor(private readonly contentRoot: string) {}

  private dir(product: string, module: string, folder: MediaFolder): string {
    return within(this.contentRoot, 'products', product, module, folder);
  }

  async list(product: string, module: string, folder: MediaFolder): Promise<string[]> {
    const dir = this.dir(product, module, folder);
    if (!isDir(dir)) return [];
    return fs
      .readdirSync(dir)
      .filter((f) => !f.startsWith('.') && !f.startsWith('_') && isFile(within(dir, f)))
      .sort();
  }

  async exists(product: string, module: string, folder: MediaFolder, name: string): Promise<boolean> {
    return isFile(within(this.dir(product, module, folder), name));
  }

  async putNew(product: string, module: string, folder: MediaFolder, name: string, data: Uint8Array): Promise<boolean> {
    const file = within(this.dir(product, module, folder), name);
    if (fs.existsSync(file)) return false;
    writeFileAtomic(file, data);
    return true;
  }

  async get(product: string, module: string, folder: MediaFolder, name: string): Promise<StoredFile | null> {
    const file = within(this.dir(product, module, folder), name);
    if (!isFile(file)) return null;
    const size = fs.statSync(file).size;
    const body = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream<Uint8Array>;
    return { body, size };
  }
}

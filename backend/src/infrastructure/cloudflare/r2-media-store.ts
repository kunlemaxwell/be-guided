import type { MediaFolder, MediaStore, StoredFile } from '../../application/ports';
import type { R2BucketLike } from './bindings';

/** Screenshots and videos in an R2 bucket, keyed products/<p>/<m>/<images|media>/<name>. */
export class R2MediaStore implements MediaStore {
  constructor(private readonly bucket: R2BucketLike) {}

  private key(product: string, module: string, folder: MediaFolder, name = ''): string {
    return `products/${product}/${module}/${folder}/${name}`;
  }

  async list(product: string, module: string, folder: MediaFolder): Promise<string[]> {
    const prefix = this.key(product, module, folder);
    const names: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.bucket.list({ prefix, cursor, limit: 1000 });
      for (const o of page.objects) {
        const name = o.key.slice(prefix.length);
        if (name && !name.includes('/') && !name.startsWith('.') && !name.startsWith('_')) names.push(name);
      }
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return names.sort();
  }

  async exists(product: string, module: string, folder: MediaFolder, name: string): Promise<boolean> {
    return (await this.bucket.head(this.key(product, module, folder, name))) !== null;
  }

  async putNew(product: string, module: string, folder: MediaFolder, name: string, data: Uint8Array, contentType: string): Promise<boolean> {
    // onlyIf etagDoesNotMatch "*" = only create, never replace (returns null if it exists).
    const r = await this.bucket.put(this.key(product, module, folder, name), data, {
      httpMetadata: { contentType },
      onlyIf: { etagDoesNotMatch: '*' },
    });
    return r !== null;
  }

  async get(product: string, module: string, folder: MediaFolder, name: string): Promise<StoredFile | null> {
    const o = await this.bucket.get(this.key(product, module, folder, name));
    return o ? { body: o.body, size: o.size } : null;
  }
}

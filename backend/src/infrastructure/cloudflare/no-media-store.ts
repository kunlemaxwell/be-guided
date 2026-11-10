import type { MediaFolder, MediaStore, StoredFile } from '../../application/ports';
import { AppError } from '../../domain/errors';

/**
 * Used when the Worker has no R2 bucket bound (R2 not switched on for the
 * account yet). Reading finds nothing; uploading is refused with a clear
 * message, so the rest of the admin, Ask AI and the AI connector still work.
 */
export class NoMediaStore implements MediaStore {
  static readonly MESSAGE =
    'Uploading pictures and videos isn’t switched on yet. Switch on R2 storage in Cloudflare, then run “Set up Cloudflare” again.';

  async list(_product: string, _module: string, _folder: MediaFolder): Promise<string[]> {
    return [];
  }

  async exists(_product: string, _module: string, _folder: MediaFolder, _name: string): Promise<boolean> {
    return false;
  }

  async putNew(_product: string, _module: string, _folder: MediaFolder, _name: string, _data: Uint8Array, _contentType: string): Promise<boolean> {
    throw new AppError('NOT_ALLOWED', NoMediaStore.MESSAGE);
  }

  async get(_product: string, _module: string, _folder: MediaFolder, _name: string): Promise<StoredFile | null> {
    return null;
  }
}

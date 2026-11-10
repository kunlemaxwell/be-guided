import type { UploadKind, UploadResultDto } from '../../../../admin/shared/api-types';
import type { RequestContext } from '../../domain/actor';
import { AppError } from '../../domain/errors';
import { allowedExtensions, checkUpload, MODULE_FOLDER, SERVABLE_TYPES } from '../../domain/files';
import { checkSlug, safeBaseName } from '../../domain/slugs';
import type { ContentRepository, MediaStore } from '../ports';
import type { ActivityService } from './activity-service';
import { fileUrl } from './content-service';

export interface UploadLimits {
  imageMaxBytes: number;
  videoMaxBytes: number;
}

export interface UploadedFile {
  name: string;
  size: number;
  bytes(): Promise<Uint8Array>;
}

function mb(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

/**
 * "Choose file…" uploads into a module's images/ or media/ folder.
 * Extension AND content are checked, the name is made safe, and an existing
 * file is never replaced: the new one gets the next free name instead.
 */
export class UploadService {
  constructor(
    private readonly content: ContentRepository,
    private readonly media: MediaStore,
    private readonly activity: ActivityService,
    readonly limits: UploadLimits,
  ) {}

  /** Every picture in a product, as "module/images/file" (for choosing its hero pictures). */
  async listProductImages(product: string): Promise<string[]> {
    checkSlug(product, 'product');
    const modules = await this.content.listModules(product);
    const lists = await Promise.all(
      modules.map(async (m) => (await this.media.list(product, m, 'images')).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).map((f) => `${m}/images/${f}`)),
    );
    return lists.flat().sort();
  }

  maxBytes(kind: UploadKind): number {
    return kind === 'image' ? this.limits.imageMaxBytes : this.limits.videoMaxBytes;
  }

  async upload(ctx: RequestContext, product: string, module: string, kind: UploadKind, file: UploadedFile): Promise<UploadResultDto> {
    checkSlug(product, 'product');
    checkSlug(module, 'module');
    if ((await this.content.readModule(product, module)) === null) throw new AppError('NOT_FOUND', 'That module no longer exists.');
    const max = this.maxBytes(kind);
    if (file.size > max) throw new AppError('FILE_TOO_LARGE', `That file is too big. ${kind === 'image' ? 'Pictures' : 'Videos'} can be up to ${mb(max)}.`);
    if (file.size === 0) throw new AppError('INVALID', 'That file is empty.', [{ field: 'file', message: 'File is empty' }]);
    // PROTOTYPE: the whole file is held in memory (fine for screenshots and short clips).
    // Production: stream large videos straight to storage (R2 multipart upload / a temp file).
    const data = await file.bytes();
    if (data.byteLength > max) throw new AppError('FILE_TOO_LARGE', `That file is too big. ${kind === 'image' ? 'Pictures' : 'Videos'} can be up to ${mb(max)}.`);
    const check = checkUpload(kind, file.name, data.subarray(0, 16));
    if (!check.ok) {
      const allowed = allowedExtensions(kind).join(', ');
      throw new AppError(
        'UNSUPPORTED_FILE',
        check.reason === 'extension'
          ? `That kind of file can't be used here. Choose a ${kind === 'image' ? 'picture' : 'video'} (${allowed}).`
          : 'That file is not what its name says (its content does not match). Choose the original file.',
      );
    }
    const folder = MODULE_FOLDER[kind];
    const base = safeBaseName(file.name);
    const type = SERVABLE_TYPES[check.extension] ?? 'application/octet-stream';
    let name = `${base}${check.extension}`;
    let saved = false;
    for (let n = 1; n <= 50 && !saved; n++) {
      name = n === 1 ? `${base}${check.extension}` : `${base}-${n}${check.extension}`;
      saved = await this.media.putNew(product, module, folder, name, data, type);
    }
    if (!saved) throw new AppError('CONFLICT', 'There are already many files with that name. Rename the file and try again.');
    const renamed = name !== `${base}${check.extension}` || base !== file.name.replace(/\.[^.]*$/, '');
    // Big videos are served from their own public address (the site only serves files up to 25 MB).
    const src = (await this.media.publicUrl?.(product, module, folder, name)) ?? `${folder}/${name}`;
    await this.activity.record(ctx, {
      area: 'uploads',
      action: kind === 'image' ? 'upload.image' : 'upload.video',
      target: `${product}/${module}/${folder}/${name}`,
      summary: `Uploaded ${kind === 'image' ? 'picture' : 'video'} ${name} (${mb(data.byteLength) === '0 MB' ? `${Math.ceil(data.byteLength / 1024)} KB` : mb(data.byteLength)})`,
      details: { originalName: file.name, savedAs: name, size: data.byteLength },
    });
    return { src, name, url: src.startsWith('http') ? src : fileUrl(product, module, src), size: data.byteLength, renamed };
  }
}

import { slugSchema } from '../../../admin/shared/api-types';
import { AppError } from './errors';

/** Product/module/page names become folder and file names: only safe slugs pass. */
export function checkSlug(value: string, what: string): string {
  if (!slugSchema.safeParse(value).success) throw new AppError('BAD_PATH', `That ${what} name isn't valid.`);
  return value;
}

export function isSlug(value: string): boolean {
  return slugSchema.safeParse(value).success;
}

/** "Walkthrough Video (final).MP4" → "walkthrough-video-final" (no extension). */
export function safeBaseName(name: string): string {
  const file = name.split(/[\\/]/).pop() ?? '';
  const base = file.replace(/\.[^.]*$/, '');
  const slug = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug || 'file';
}

/** Today as YYYY-MM-DD in the server's local time zone. */
export function isoDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

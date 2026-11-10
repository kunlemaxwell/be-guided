import type { UploadKind } from '../../../admin/shared/api-types';

/**
 * Upload rules: allowed extensions per kind, and the "magic bytes" each
 * format starts with. A file passes only when its extension AND its content
 * agree, so a renamed .exe or an HTML page called .png is refused.
 * SVG is never accepted as an upload (it can carry script).
 */
export const IMAGE_EXTENSIONS = ['.webp', '.png', '.jpg', '.jpeg', '.gif'] as const;
export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v'] as const;

/** Types the admin may serve back (includes legacy .svg images already in content). */
export const SERVABLE_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/mp4',
};

export const MODULE_FOLDER: Record<UploadKind, 'images' | 'media'> = { image: 'images', video: 'media' };

export function extensionOf(name: string): string {
  const m = /\.[^./\\]+$/.exec(name);
  return m ? m[0].toLowerCase() : '';
}

export function allowedExtensions(kind: UploadKind): readonly string[] {
  return kind === 'image' ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
}

type Detected = 'png' | 'jpeg' | 'gif' | 'webp' | 'isobmff' | 'webm';

const EXT_FORMAT: Record<string, Detected> = {
  '.png': 'png',
  '.jpg': 'jpeg',
  '.jpeg': 'jpeg',
  '.gif': 'gif',
  '.webp': 'webp',
  '.mp4': 'isobmff',
  '.mov': 'isobmff',
  '.m4v': 'isobmff',
  '.webm': 'webm',
};

function startsWith(bytes: Uint8Array, sig: number[], at = 0): boolean {
  return sig.every((b, i) => bytes[at + i] === b);
}

function ascii(bytes: Uint8Array, at: number, len: number): string {
  return String.fromCharCode(...bytes.slice(at, at + len));
}

/** Recognises the file format from its first bytes (16 are enough). */
export function detectFormat(head: Uint8Array): Detected | null {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg';
  if (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a') return 'gif';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp';
  if (ascii(head, 4, 4) === 'ftyp') return 'isobmff';
  if (startsWith(head, [0x1a, 0x45, 0xdf, 0xa3])) return 'webm';
  return null;
}

export type UploadCheck = { ok: true; extension: string } | { ok: false; reason: 'extension' | 'content' };

/** Extension is allowed for the kind, and the bytes are really that format. */
export function checkUpload(kind: UploadKind, fileName: string, head: Uint8Array): UploadCheck {
  const ext = extensionOf(fileName);
  if (!allowedExtensions(kind).includes(ext)) return { ok: false, reason: 'extension' };
  const expected = EXT_FORMAT[ext];
  if (!expected || detectFormat(head) !== expected) return { ok: false, reason: 'content' };
  return { ok: true, extension: ext === '.jpeg' ? '.jpg' : ext };
}

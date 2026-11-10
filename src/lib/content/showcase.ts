import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';
import { firstImage } from './hero';
import type { GuidePage, Product } from '@/types/content';

export interface ShowcaseItem {
  page: GuidePage;
  productName: string;
  moduleTitle: string;
}

/**
 * Guides for the home page's "Real screens" strip, mixed across products.
 * Each product contributes its newest guides with a screenshot, one per module
 * before repeating a module; the products then take turns, so a new product
 * (or new guides) shows up without editing a list.
 */
export function mixedShowcase(products: Product[], count: number, hasImage: (p: GuidePage) => boolean): ShowcaseItem[] {
  const queues = products.map((product) => {
    const byModule = product.modules.map((m) =>
      m.pages
        .filter(hasImage)
        .sort((a, b) => String(b.updated ?? '').localeCompare(String(a.updated ?? '')))
        .map((page) => ({ page, productName: product.name, moduleTitle: m.title })),
    );
    // Newest module first, then take one guide from each module in turn.
    byModule.sort((a, b) => String(b[0]?.page.updated ?? '').localeCompare(String(a[0]?.page.updated ?? '')));
    const out: ShowcaseItem[] = [];
    for (let i = 0; byModule.some((q) => q[i]); i++) for (const q of byModule) if (q[i]) out.push(q[i]!);
    return out;
  });
  const mixed: ShowcaseItem[] = [];
  for (let i = 0; mixed.length < count && queues.some((q) => q[i]); i++) {
    for (const q of queues) if (q[i] && mixed.length < count) mixed.push(q[i]!);
  }
  return mixed;
}

/** Pixel width of a WebP/PNG guide image from its file header, or 0 if unknown. */
export function imageWidth(siteSrc: string): number {
  const rel = siteSrc.replace(/^\/_content\//, '');
  try {
    const buf = fs.readFileSync(path.join(config.contentDir, 'products', rel));
    if (buf.toString('ascii', 0, 4) === 'RIFF') {
      const kind = buf.toString('ascii', 12, 16);
      if (kind === 'VP8X') return 1 + buf.readUIntLE(24, 3);
      if (kind === 'VP8 ') return buf.readUInt16LE(26) & 0x3fff;
      if (kind === 'VP8L') return 1 + (((buf[22]! & 0x3f) << 8) | buf[21]!);
    }
    if (buf.readUInt32BE(0) === 0x89504e47) return buf.readUInt32BE(16);
  } catch {
    /* missing file: treat as unknown */
  }
  return 0;
}

/** True when the page's first screenshot is a full screen (wide enough for a showcase card). */
export function hasWideImage(page: GuidePage, minWidth = 1000): boolean {
  const src = firstImage(page);
  return !!src && imageWidth(src) >= minWidth;
}

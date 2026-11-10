/** Pure helpers for reading guide pages (shared by the admin library and Ask AI). */

/** Markdown image references to module images, e.g. ![x](images/a.webp "t"). */
export const IMAGE_REF = /!\[[^\]]*\]\(<?(images\/[^)\s>]+)>?(?:\s+"[^"]*")?\)/g;

export function imageRefs(body: string): string[] {
  return [...body.matchAll(IMAGE_REF)].map((m) => {
    const ref = m[1] ?? '';
    try {
      return decodeURI(ref);
    } catch {
      return ref;
    }
  });
}

/** A frontmatter file reference ("media/x.mp4") split into folder + name, or null if it isn't a module file. */
export function moduleFileRef(src: unknown): { folder: 'images' | 'media'; name: string } | null {
  if (typeof src !== 'string') return null;
  const m = /^(images|media)\/([^/\\]+)$/.exec(src.trim());
  if (!m || m[2] === '..' || m[2] === '.') return null;
  return { folder: m[1] as 'images' | 'media', name: m[2]! };
}

export function isRemoteUrl(src: string): boolean {
  return /^https?:\/\//i.test(src);
}

/** A page as Ask AI, search and the MCP connector see it: public pages only. */
export interface PublicPage {
  id: string;
  product: string;
  module: string;
  slug: string;
  title: string;
  summary: string;
  headings: string[];
  /** Plain text (no directives, images or link targets), for ranking and Ask AI. */
  body: string;
  /** Site path, e.g. /acme-books/sales/create-an-invoice/ */
  href: string;
  /** Display names (fall back to the slugs). */
  productName: string;
  moduleTitle: string;
  /** The page markdown as written (steps, legends, images, guide: links), for full-page views. */
  markdown: string;
  /** "Before you start" references ("module/page" or "product/module/page"). */
  prerequisites: { page: string; why?: string }[];
  /** Walkthrough video as written in the frontmatter (module-relative or https). */
  video: { src: string; poster?: string; length?: string } | null;
  /** YYYY-MM-DD of the last meaningful change, when known. */
  updated: string | null;
}

/**
 * Site path of a module file referenced from a page ("images/a.webp",
 * "media/v.mp4"), as the site serves it (scripts/sync-assets.mjs copies them
 * to /_content/<product>/<module>/…). Remote https URLs are returned as they
 * are; anything else (traversal, other folders) gives null.
 */
export function publicAssetPath(product: string, module: string, src: string): string | null {
  const s = src.trim().replace(/^\.\//, '');
  if (isRemoteUrl(s)) return s;
  const ref = moduleFileRef(s);
  if (!ref) return null;
  return `/_content/${product}/${module}/${ref.folder}/${encodeURIComponent(ref.name)}`;
}

/**
 * Guide reference ("module/page", "product/module/page", optional "guide:"
 * prefix and "#anchor") → page id and anchor. Same rule as the site's loader.
 */
export function guideRefToId(fromProduct: string, ref: string): { id: string; hash: string | null } {
  const [path = '', hash] = ref.replace(/^guide:/, '').split('#');
  const clean = path.replace(/^\/+|\/+$/g, '');
  return { id: clean.split('/').length === 2 ? `${fromProduct}/${clean}` : clean, hash: hash ? hash : null };
}

/** Section and step titles of a page body (for search and Ask AI). */
export function headingsOf(body: string): string[] {
  const out: string[] = [];
  for (const line of body.split('\n')) {
    const h = /^#{1,4}\s+(.+?)\s*#*$/.exec(line);
    if (h?.[1]) out.push(h[1]);
    const step = /^:{3,}step\{[^}]*title="([^"]+)"/.exec(line.trim());
    if (step?.[1]) out.push(step[1]);
  }
  return out;
}

/** Readable text from markdown with directives: drops ::: fences, image syntax and link targets. */
export function plainText(body: string): string {
  return body
    .split('\n')
    .filter((l) => !/^\s*:{2,}\w*/.test(l) || /title="/.test(l))
    .map((l) =>
      l
        .replace(/^\s*:{2,}\w+\{[^}]*title="([^"]+)"[^}]*\}\s*$/, '$1')
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

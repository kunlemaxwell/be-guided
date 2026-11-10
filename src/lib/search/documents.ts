// Relative imports (not '@/…') so this runs under vitest and in route handlers alike.
import type { GuidePage, Product } from '../../types/content';
import { slugifyHeading, stepAnchor } from '../content/headings';
import type { SearchDoc, SearchSection } from './types';

/**
 * True when a page may appear in search: published, public, in a public
 * product. The loader already leaves private pages out of a public build;
 * this is checked again so an internal build (INCLUDE_PRIVATE_PRODUCTS=true)
 * or a local preview with drafts never puts them in the index.
 */
export function isSearchable(product: Pick<Product, 'visibility'>, page: Pick<GuidePage, 'visibility' | 'status'>): boolean {
  return product.visibility === 'public' && page.visibility === 'public' && page.status === 'published';
}

const DIRECTIVE_ATTR = /\{([^}]*)\}/;

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(attrs);
  return m?.[1] ?? null;
}

/** Markdown inline syntax → plain words. */
export function plainText(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links → their text
    .replace(/<[^>]+>/g, ' ') // stray html
    .replace(/[*_`~]+/g, '')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, '') // list markers
    .replace(/^\s*>\s?/, '') // quotes
    .replace(/\|/g, ' ') // table cells
    .replace(/^\s*:?-{3,}:?(\s+:?-{3,}:?)*\s*$/, '') // table rule
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Splits a page body into searchable parts: the text before the first
 * heading, each `##` section and each step (`::::step{title="…"}`), with the
 * same anchors the page renders, so a result can open the right place.
 */
export function sectionsOf(body: string): SearchSection[] {
  const sections: SearchSection[] = [];
  let current: SearchSection = { anchor: null, heading: '', text: '' };
  let inFence = false;
  const push = () => {
    current.text = current.text.trim();
    if (current.heading || current.text) sections.push(current);
  };

  for (const raw of body.split('\n')) {
    const line = raw.trimEnd();
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    const step = /^:{3,}step(\{[^}]*\})?\s*$/.exec(line.trim());
    if (h2?.[1]) {
      push();
      const heading = plainText(h2[1]);
      current = { anchor: slugifyHeading(h2[1]), heading, text: '' };
      continue;
    }
    if (step) {
      push();
      const title = attr(DIRECTIVE_ATTR.exec(step[1] ?? '')?.[1] ?? '', 'title') ?? '';
      current = { anchor: title ? stepAnchor(title) : null, heading: title, text: '' };
      continue;
    }
    // Other directive fences and leaf directives (::postings{…}) carry no reader text.
    if (/^\s*:{2,}/.test(line)) continue;
    const text = plainText(line.replace(/^#{1,6}\s+/, ''));
    if (text) current.text += `${text} `;
  }
  push();
  return sections;
}

/** Every searchable page of the given products, as the search box indexes them. */
export function buildSearchDocuments(products: Product[], hrefOf: (page: GuidePage) => string): SearchDoc[] {
  return products.flatMap((product) =>
    product.modules.flatMap((mod) =>
      mod.pages
        .filter((page) => isSearchable(product, page))
        .map((page) => ({
          id: page.id,
          href: hrefOf(page),
          title: page.title,
          summary: page.summary,
          productName: product.name,
          moduleTitle: mod.title,
          sections: sectionsOf(page.body),
        })),
    ),
  );
}

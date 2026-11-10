import type { GuidePage, Product } from '@/types/content';

/** First screenshot of a page, as a site address (images live under /_content). */
export function firstImage(page: GuidePage): string | null {
  const m = page.body.match(/!\[[^\]]*\]\((images\/[^)\s]+\.(?:webp|png|jpg))/);
  return m ? `/_content/${page.productSlug}/${page.moduleSlug}/${m[1]}` : null;
}

export interface ProductHero {
  /** Up to two site addresses: [front, back]. Empty when the product has no screenshots yet. */
  images: string[];
  /** Short label for the window bar, e.g. "Performance". */
  label: string;
}

/**
 * The pictures for a product's own hero and its home-page slide: the ones
 * chosen in product.json (`hero.images`), else the first screenshots of its
 * guides (different modules first, so the two pictures differ).
 */
export function productHero(product: Product): ProductHero {
  const chosen = (product.hero?.images ?? []).map((src) => `/_content/${product.slug}/${src}`);
  if (chosen.length) return { images: chosen.slice(0, 2), label: product.hero?.label ?? product.name };
  const picked: { src: string; module: string; label: string }[] = [];
  for (const m of product.modules) {
    for (const pg of m.pages) {
      const src = firstImage(pg);
      if (!src) continue;
      if (picked.some((x) => x.module === m.slug)) continue;
      picked.push({ src, module: m.slug, label: m.title });
      break;
    }
    if (picked.length === 2) break;
  }
  if (picked.length < 2) {
    for (const pg of product.modules.flatMap((m) => m.pages)) {
      const src = firstImage(pg);
      if (src && !picked.some((x) => x.src === src)) picked.push({ src, module: pg.moduleSlug, label: product.name });
      if (picked.length === 2) break;
    }
  }
  return { images: picked.map((x) => x.src), label: product.hero?.label ?? picked[0]?.label ?? product.name };
}

/** The three floating labels on a product's hero picture. */
export function heroChips(product: Product, hero: ProductHero): string[] {
  const pages = product.modules.flatMap((m) => m.pages);
  return [
    hero.label !== product.name ? `Open ${hero.label}` : 'Follow the steps',
    pages.some((p) => p.video) ? '▶ Click-through videos' : `${pages.length} guides, real screens`,
    '✓ Set up in the right order',
  ];
}


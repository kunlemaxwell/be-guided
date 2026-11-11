import { describe, expect, it } from 'vitest';
import { productHero } from '@/lib/content/hero';
import { productSchema } from '@/types/content';

const base = { slug: 'acme', name: 'Acme', modules: [] } as const;

describe('productHero film', () => {
  it('turns the product.json film into site addresses', () => {
    const hero = productHero({ ...base, hero: { images: ['sales/images/a.webp'], video: { src: 'intro/media/film.mp4', poster: 'intro/media/film.webp' } } } as never);
    expect(hero.video).toEqual({ src: '/_content/acme/intro/media/film.mp4', poster: '/_content/acme/intro/media/film.webp' });
    expect(hero.images).toEqual(['/_content/acme/sales/images/a.webp']);
  });

  it('has no film when product.json names none', () => {
    expect(productHero({ ...base, hero: { images: ['sales/images/a.webp'] } } as never).video).toBeUndefined();
  });

  it('accepts a hero with only a film, and rejects a film outside media/', () => {
    const ok = productSchema.safeParse({ name: 'Acme', summary: 'x', visibility: 'public', hero: { video: { src: 'intro/media/film.mp4' } } });
    expect(ok.success && ok.data.hero?.images).toEqual([]);
    expect(productSchema.safeParse({ name: 'Acme', summary: 'x', visibility: 'public', hero: { video: { src: '../film.mp4' } } }).success).toBe(false);
  });
});

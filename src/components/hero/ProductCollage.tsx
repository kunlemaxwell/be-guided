import type { ProductHero } from '@/lib/content/hero';

/**
 * A product's own hero picture: two of its real screens layered, with floating
 * chips. Every product page gets one, built from that product's screenshots.
 */
export function ProductCollage({ hero, productName, chips }: { hero: ProductHero; productName: string; chips: string[] }) {
  const [front, back] = hero.images;
  if (!front) return null;
  return (
    <div className="hero-collage" aria-hidden="true">
      <div className="hero-collage__blob" />
      {back ? (
        <div className="hero-collage__back">
          <img src={back} alt="" />
        </div>
      ) : null}
      <div className={back ? 'hero-collage__front' : 'hero-collage__front hero-collage__front--solo'}>
        <div className="hero-collage__bar">
          <span className="hero-collage__dots"><i /><i /><i /></span>
          <span className="hero-collage__url">{productName} · {hero.label}</span>
        </div>
        <img src={front} alt="" />
      </div>
      {chips.slice(0, 3).map((c, i) => (
        <span key={c} className={`hero-chip hero-chip--${'abc'[i]}`}>
          {i === 0 ? <b>1</b> : null}
          {c}
        </span>
      ))}
    </div>
  );
}

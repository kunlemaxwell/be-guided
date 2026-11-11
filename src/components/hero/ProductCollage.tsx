import type { ProductHero } from '@/lib/content/hero';

/**
 * A product's own hero picture: two of its real screens layered, with floating
 * chips. Every product page gets one, built from that product's screenshots.
 * When the product has a hero film, it plays in the front window instead
 * (muted and looping, with controls so readers can turn the sound on).
 */
export function ProductCollage({ hero, productName, chips }: { hero: ProductHero; productName: string; chips: string[] }) {
  const [first, second] = hero.images;
  const video = hero.video;
  const front = video ? null : first;
  const back = video ? first : second;
  if (!front && !video) return null;
  return (
    <div className={video ? 'hero-collage hero-collage--video' : 'hero-collage'} aria-hidden={video ? undefined : true}>
      <div className="hero-collage__blob" aria-hidden="true" />
      {back ? (
        <div className="hero-collage__back" aria-hidden="true">
          <img src={back} alt="" />
        </div>
      ) : null}
      <div className={back ? 'hero-collage__front' : 'hero-collage__front hero-collage__front--solo'}>
        <div className="hero-collage__bar" aria-hidden="true">
          <span className="hero-collage__dots"><i /><i /><i /></span>
          <span className="hero-collage__url">{productName} · {hero.label}</span>
        </div>
        {video ? (
          <video
            className="hero-collage__video"
            src={video.src}
            poster={video.poster}
            autoPlay
            muted
            loop
            playsInline
            controls
            preload="metadata"
            aria-label={`${productName} launch film`}
          />
        ) : (
          <img src={front!} alt="" />
        )}
      </div>
      {video
        ? null
        : chips.slice(0, 3).map((c, i) => (
            <span key={c} className={`hero-chip hero-chip--${'abc'[i]}`}>
              {i === 0 ? <b>1</b> : null}
              {c}
            </span>
          ))}
    </div>
  );
}

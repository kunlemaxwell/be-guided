'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HeroIcon } from '@/components/Icons';
import type { HeroChip } from '@/lib/content/hero';

export interface StackSlide {
  slug: string;
  name: string;
  /** Site address of the product's main screen. */
  image: string;
  label: string;
}

/**
 * The home page's picture: product screens as windows layered behind each other.
 * Every few seconds the front window slides to the back and the next one
 * comes forward. Nothing rotates; the windows only drift a few pixels. Pauses
 * on hover and focus; with "reduce motion" nothing moves or changes.
 */
export function HeroStack({ slides, seconds, chips }: { slides: StackSlide[]; seconds: number; chips: HeroChip[] }) {
  const n = slides.length;
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (n < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => setActive((a) => (a + 1) % n), seconds * 1000);
    return () => window.clearInterval(t);
  }, [n, paused, seconds]);

  if (n === 0) return null;
  return (
    <div
      className="hstack"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="hstack__blob" aria-hidden="true" />
      <div className="hstack__stage">
        {slides.map((s, i) => {
          const pos = (i - active + n) % n;
          const bar = (
            <span className="hstack__bar">
              <span className="hero-collage__dots"><i /><i /><i /></span>
              <span className="hstack__url">{s.name} · {s.label}</span>
            </span>
          );
          const img = <img src={s.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} />;
          return (
            <div key={s.slug} className="hstack__slot" data-pos={Math.min(pos, 3)} aria-hidden={pos !== 0}>
              <div className="hstack__drift" style={{ animationDelay: `${-i * 1.7}s` }}>
                {pos === 0 ? (
                  <Link href={`/${s.slug}/`} className="hstack__win" aria-label={`Open the ${s.name} guide`}>{bar}{img}</Link>
                ) : (
                  <div className="hstack__win">{bar}{img}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {chips.slice(0, 2).map((c, i) => (
        <span key={c.text} className={`hero-chip hero-chip--${'abc'[i]}`} aria-hidden="true">
          <b><HeroIcon name={c.icon} size={14} /></b>
          {c.text}
        </span>
      ))}
    </div>
  );
}

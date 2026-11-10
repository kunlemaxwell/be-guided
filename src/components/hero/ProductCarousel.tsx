'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

export interface CarouselSlide {
  slug: string;
  name: string;
  summary: string;
  /** Site address of the product's main screen; null = no screenshots yet. */
  image: string | null;
  label: string;
  available: boolean;
}

/**
 * The home page's product showcase, on a 3D ring with a holographic sheen.
 *  - "slideshow": one product at the front; every few seconds the ring turns
 *    and the next product comes forward, then it rests.
 *  - "3d": an orbit of floating panels (six or more) that keeps turning, swaying and floating.
 * Both pause on hover/focus; with "reduce motion" nothing turns.
 */
export function ProductCarousel({ slides, mode, seconds }: { slides: CarouselSlide[]; mode: 'slideshow' | '3d'; seconds: number }) {
  const n = slides.length;
  const continuous = mode === '3d' && n > 0;
  // The orbit needs at least six panels so it reads round, not boxy: repeat the products to fill it.
  const orbit = n >= 6 ? n : n * Math.ceil(6 / Math.max(n, 1));
  const faces = continuous ? Array.from({ length: orbit }, (_, i) => slides[i % n]!) : slides;
  const f = faces.length;
  const [step, setStep] = useState(0);
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  const [radius, setRadius] = useState(320);
  const stage = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const panels = useRef<(HTMLElement | null)[]>([]);
  const angle = 360 / Math.max(f, 1);
  const active = continuous ? front : ((step % f) + f) % f;

  // Slideshow: turn one face, then rest.
  useEffect(() => {
    if (continuous || f < 2 || paused) return;
    const t = window.setInterval(() => setStep((s) => s + 1), seconds * 1000);
    return () => window.clearInterval(t);
  }, [continuous, f, paused, seconds]);

  // 3D: keep turning at one face per `seconds`, smoothly, frame by frame.
  const turned = useRef(0);
  useEffect(() => {
    if (!continuous) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!paused) turned.current += (angle / (seconds * 1000)) * dt;
      const t = now / 1000;
      // A slow sway and float, so the orbit feels alive rather than mechanical.
      const tilt = -9 + 3.5 * Math.sin(t / 2.7);
      const lift = 7 * Math.sin(t / 1.9);
      if (ring.current) ring.current.style.transform = `translateY(${lift}px) translateZ(${-radius}px) rotateX(${tilt}deg) rotateY(${-turned.current}deg)`;
      panels.current.forEach((el, i) => {
        if (!el) return;
        const rel = ((i * angle - turned.current) * Math.PI) / 180;
        const facing = Math.cos(rel); // 1 = facing the reader, -1 = at the back
        const bob = 6 * Math.sin(t * 1.3 + i * 1.7);
        el.style.transform = `rotateY(${i * angle}deg) translateZ(${radius}px) translateY(${bob}px) scale(${0.9 + 0.1 * Math.max(0, facing)})`;
        el.style.opacity = String(facing < 0 ? 0.1 + 0.15 * (1 + facing) : 0.25 + 0.75 * facing ** 1.5);
        el.style.filter = `brightness(${0.75 + 0.3 * Math.max(0, facing)}) saturate(${0.7 + 0.3 * Math.max(0, facing)})`;
      });
      const nextFront = ((Math.round(turned.current / angle) % f) + f) % f;
      setFront((cur) => (cur === nextFront ? cur : nextFront));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [continuous, paused, angle, seconds, radius, f]);

  // Ring size from the slide width, so neighbouring faces meet at the edges.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth * (continuous ? 0.6 : 0.78);
      const edge = f > 2 ? w / 2 / Math.tan(Math.PI / f) : w * 0.62;
      // Orbit: panels spaced apart (gaps between them), so it reads as a round carousel.
      setRadius(Math.round(continuous ? edge * 1.32 : Math.max(w * 0.55, edge + 24)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [f, continuous]);

  if (n === 0) return null;
  const current = faces[active]!;
  const goTo = (i: number) => {
    if (continuous) {
      turned.current += (((i - active) % n) + n) % n * angle;
      return;
    }
    setStep((st) => st + ((i - (active % n) + n) % n));
  };

  return (
    <div
      className={continuous ? 'holo holo--spin' : 'holo'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="holo__glow" aria-hidden="true" />
      {continuous ? <div className="holo__floor" aria-hidden="true" /> : null}
      <div className="holo__stage" ref={stage}>
        <div
          className="holo__ring"
          ref={ring}
          style={continuous ? { transform: `translateZ(${-radius}px) rotateX(-6deg)` } : { transform: `translateZ(${-radius}px) rotateY(${-step * angle}deg)` }}
        >
          {faces.map((s, i) => {
            const isFront = i === active;
            const inner = (
              <>
                <span className="holo__bar">
                  <span className="hero-collage__dots"><i /><i /><i /></span>
                  <span className="holo__url">{s.name} · {s.label}</span>
                </span>
                {s.image ? (
                  <img src={s.image} alt="" loading={i === 0 ? 'eager' : 'lazy'} />
                ) : (
                  <span className="holo__empty">
                    <span className="holo__empty-name">{s.name}</span>
                    <span className="holo__empty-note">{s.available ? 'Guides on the way' : 'Coming soon'}</span>
                  </span>
                )}
                <span className="holo__sheen" aria-hidden="true" />
              </>
            );
            const style = { transform: `rotateY(${i * angle}deg) translateZ(${radius}px)` };
            const cls = isFront ? 'holo__slide holo__slide--front' : 'holo__slide';
            return s.available && isFront ? (
              <Link key={`${s.slug}-${i}`} ref={(el) => { panels.current[i] = el; }} href={`/${s.slug}/`} className={cls} style={style} aria-label={`Open the ${s.name} guide`}>
                {inner}
              </Link>
            ) : (
              <div key={`${s.slug}-${i}`} ref={(el) => { panels.current[i] = el; }} className={cls} style={style} aria-hidden={!isFront}>
                {inner}
              </div>
            );
          })}
        </div>
      </div>
      <div className="holo__caption" aria-live={continuous ? 'off' : 'polite'}>
        <span className="holo__name">{current.name}</span>
        <span className="holo__summary">{current.summary}</span>
        {current.available ? <Link className="holo__open" href={`/${current.slug}/`}>Open the guide →</Link> : <span className="pill">Coming soon</span>}
      </div>
      {n > 1 ? (
        <div className="holo__dots" role="tablist" aria-label="Products">
          {slides.map((s, i) => (
            <button
              key={s.slug}
              type="button"
              role="tab"
              aria-selected={i === active % n}
              aria-label={s.name}
              className={i === active % n ? 'holo__dot holo__dot--on' : 'holo__dot'}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

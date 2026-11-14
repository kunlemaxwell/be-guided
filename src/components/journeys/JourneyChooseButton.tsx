'use client';

import { useEffect, useState } from 'react';
import { JOURNEY_EVENT, readChoice, writeChoice } from '@/lib/journeys/storage';

/** "This is my journey" toggle on a journey page: adds or removes it from the reader's choice. */
export function JourneyChooseButton({ product, slug, title }: { product: string; slug: string; title: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(readChoice(product).slugs.includes(slug));
    sync();
    window.addEventListener(JOURNEY_EVENT, sync);
    return () => window.removeEventListener(JOURNEY_EVENT, sync);
  }, [product, slug]);
  const toggle = () => {
    const cur = readChoice(product).slugs;
    writeChoice(product, { slugs: on ? cur.filter((s) => s !== slug) : [...cur, slug], decided: true });
  };
  return (
    <button type="button" className={on ? 'btn' : 'btn btn--primary'} aria-pressed={on} onClick={toggle}>
      {on ? `${title} is chosen: remove` : 'This is my journey'}
    </button>
  );
}

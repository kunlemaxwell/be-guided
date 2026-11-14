'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { JOURNEY_EVENT, readChoice } from '@/lib/journeys/storage';

export interface BarJourney {
  slug: string;
  title: string;
  steps: { id: string; title: string; href: string }[];
}

/**
 * On a guide page: when the reader has chosen a user journey that includes this
 * page, shows where they are in it with Previous and Next in that journey.
 * Shows nothing for "Everyone" or when the page is not in a chosen journey.
 */
export function ArticleJourneyBar({ product, pageId, journeys }: { product: string; pageId: string; journeys: BarJourney[] }) {
  const [slugs, setSlugs] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setSlugs(readChoice(product).slugs);
    sync();
    window.addEventListener(JOURNEY_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(JOURNEY_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [product]);

  const journey = journeys.find((j) => slugs.includes(j.slug));
  if (!journey) return null;
  const i = journey.steps.findIndex((s) => s.id === pageId);
  if (i < 0) return null;
  const prev = journey.steps[i - 1];
  const next = journey.steps[i + 1];
  return (
    <aside className="journey-bar" aria-label={`Your journey: ${journey.title}`} data-pagefind-ignore="all">
      <span className="journey-bar__where">
        <strong>{journey.title}</strong> journey, step {i + 1} of {journey.steps.length}
      </span>
      <span className="journey-bar__nav">
        {prev ? <Link href={prev.href} rel="prev">← {prev.title}</Link> : null}
        {next ? <Link href={next.href} rel="next">{next.title} →</Link> : <Link href={`/${product}/journeys/${journey.slug}/`}>Journey complete: see the map</Link>}
      </span>
    </aside>
  );
}

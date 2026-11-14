'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { JOURNEY_EVENT, readChoice, writeChoice, type JourneyChoice } from '@/lib/journeys/storage';
import { mergeJourneys, type PathJourney } from '@/lib/journeys/merge';

export interface PickerJourney extends PathJourney {
  summary: string;
  group?: string;
  inferred: boolean;
}

interface Props {
  product: string;
  productName: string;
  journeys: PickerJourney[];
}

const INITIAL_STEPS = 8;

/**
 * "Which user are you?" for a product's guide. Always visible on the product
 * page (never a pop-up): open the first time, then a slim bar that remembers
 * the choice in this browser. Pick one or several user journeys; the page then
 * shows the reading order for them. "Everyone" keeps the whole guide.
 */
export function JourneyPicker({ product, productName, journeys }: Props) {
  const [choice, setChoice] = useState<JourneyChoice | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    const sync = () => setChoice(readChoice(product));
    sync();
    window.addEventListener(JOURNEY_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(JOURNEY_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [product]);

  const known = useMemo(() => new Set(journeys.map((j) => j.slug)), [journeys]);
  const chosen = useMemo(() => (choice?.slugs ?? []).filter((s) => known.has(s)), [choice, known]);
  const groups = useMemo(() => {
    const by = new Map<string, PickerJourney[]>();
    for (const j of journeys) {
      const g = j.group ?? 'Other';
      by.set(g, [...(by.get(g) ?? []), j]);
    }
    return [...by.entries()];
  }, [journeys]);
  const path = useMemo(() => mergeJourneys(journeys.filter((j) => chosen.includes(j.slug))), [journeys, chosen]);

  if (journeys.length === 0) return null;
  // Before the browser has told us what was chosen, show the bar for "Everyone" so a returning reader never sees a flash of the big card.
  const open = choice ? editing || !choice.decided : false;

  const save = (slugs: string[], decided = true) => writeChoice(product, { slugs, decided });
  // Keep the card open while choosing, so more than one can be picked; "Show my journey" closes it.
  const toggle = (slug: string) => {
    setEditing(true);
    save(chosen.includes(slug) ? chosen.filter((s) => s !== slug) : [...chosen, slug]);
  };
  const names = chosen.map((s) => journeys.find((j) => j.slug === s)?.title ?? s);

  return (
    <section className="journeys" aria-labelledby="journeys-h" data-pagefind-ignore="all">
      {open ? (
        <div className="journeys__card">
          <div className="journeys__head">
            <h2 id="journeys-h" className="journeys__title">Which user are you?</h2>
            <p className="journeys__lead">Pick the ones that fit you and we will show you what you need, in a good order. You can pick more than one, and change this any time. The whole guide stays open.</p>
          </div>
          <div className="journeys__groups">
            {groups.map(([group, items]) => (
              <div key={group} className="journeys__group">
                <h3 className="journeys__group-title">{group}</h3>
                <div className="journeys__chips">
                  {items.map((j) => (
                    <button key={j.slug} type="button" className="journey-chip" aria-pressed={chosen.includes(j.slug)} onClick={() => toggle(j.slug)} title={j.summary}>
                      <span className="journey-chip__mark" aria-hidden="true">{chosen.includes(j.slug) ? '✓' : ''}</span>
                      {j.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="journeys__actions">
            <button type="button" className="btn btn--primary" onClick={() => { save(chosen); setEditing(false); }}>
              {chosen.length ? 'Show my journey' : 'Show everything'}
            </button>
            {chosen.length ? (
              <button type="button" className="btn" onClick={() => { save([]); setEditing(false); }}>Clear and show everything</button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="journeys__bar">
          <h2 id="journeys-h" className="journeys__bar-label">Viewing the {productName} guide as</h2>
          <span className="journeys__bar-value">{names.length ? names.join(', ') : 'Everyone (the whole guide)'}</span>
          <span className="journeys__bar-actions">
            <button type="button" className="btn" onClick={() => setEditing(true)} aria-expanded={false}>Change</button>
            <Link className="btn" href={`/${product}/journeys/`}>All user journeys</Link>
          </span>
        </div>
      )}

      {!open && path.length > 0 ? (
        <div className="journeys__path">
          <h3 className="journeys__path-title">Your journey: {path.length} {path.length === 1 ? 'guide' : 'guides'}, in this order</h3>
          <ol className="journey-steps">
            {(showAll ? path : path.slice(0, INITIAL_STEPS)).map((s, i) => (
              <li key={s.id} className="journey-step">
                <span className="journey-step__n" aria-hidden="true">{i + 1}</span>
                <div className="journey-step__body">
                  <Link className="journey-step__link" href={s.href}>{s.title}</Link>
                  <span className="journey-step__meta">{s.moduleTitle}{chosen.length > 1 ? ` · for ${s.for.join(', ')}` : ''}</span>
                  {s.why ? <span className="journey-step__why">{s.why}</span> : <span className="journey-step__why">{s.summary}</span>}
                </div>
              </li>
            ))}
          </ol>
          {path.length > INITIAL_STEPS ? (
            <button type="button" className="btn" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
              {showAll ? 'Show fewer' : `Show all ${path.length} guides`}
            </button>
          ) : null}
          {chosen.length === 1 ? (
            <Link className="journeys__more" href={`/${product}/journeys/${chosen[0]}/`}>Open this journey as a map →</Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import type { WhatsNewEntry } from '@/types/content';
import { VIEW_OPTIONS, countChanges, formatDate, groupEntries, type WhatsNewGroup, type WhatsNewView } from '@/lib/whats-new/group';

interface Props {
  entries: WhatsNewEntry[];
}

/**
 * What's new: what was released, grouped by date (the default), module, user,
 * or module and user. Every group is open to start with and can be folded.
 * An entry is a title and a one-line description; "More" opens a short longer
 * text and "How to use" goes to the guide page.
 */
export function WhatsNewView({ entries }: Props) {
  const [view, setView] = useState<WhatsNewView>('date');
  const [product, setProduct] = useState('all');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());

  const products = useMemo(() => {
    const seen = new Map<string, string>();
    for (const e of entries) seen.set(e.productSlug, e.productName);
    return [...seen].map(([slug, name]) => ({ slug, name }));
  }, [entries]);
  const shown = useMemo(() => (product === 'all' ? entries : entries.filter((e) => e.productSlug === product)), [entries, product]);
  const groups = useMemo(() => groupEntries(shown, view), [shown, view]);
  const manyProducts = products.length > 1;

  const flip = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  };
  const foldKey = (g: WhatsNewGroup) => `${view}:${g.key}`;

  const renderEntry = (e: WhatsNewEntry, parentKey: string) => {
    const key = `${parentKey}|${e.productSlug}/${e.slug}`;
    const open = more.has(key);
    return (
      <li key={key} className="wn-entry">
        <div className="wn-line">
          {view !== 'date' ? <span className="wn-date">{formatDate(e.date)}</span> : null}
          <strong className="wn-title">{e.title}</strong>
          <span className="wn-sum">{e.summary}</span>
        </div>
        <div className="wn-meta">
          {e.kind === 'improved' ? <span className="wn-chip wn-chip--kind">Improved</span> : null}
          {view !== 'module' && view !== 'module-user' ? <span className="wn-chip">{e.moduleTitle}</span> : null}
          {view !== 'user' && view !== 'module-user' ? e.audience.map((a) => <span key={a} className="wn-chip wn-chip--who">{a}</span>) : null}
          {manyProducts && product === 'all' ? <span className="wn-chip wn-chip--product">{e.productName}</span> : null}
          {e.detail ? (
            <button type="button" className="wn-link" aria-expanded={open} onClick={() => setMore(flip(more, key))}>
              {open ? 'Less' : 'More'}
            </button>
          ) : null}
          {e.guideHref ? <a className="wn-link wn-link--guide" href={e.guideHref}>How to use</a> : null}
        </div>
        {open && e.detail ? <p className="wn-detail">{e.detail}</p> : null}
      </li>
    );
  };

  const renderGroup = (g: WhatsNewGroup, depth: number) => {
    const key = foldKey(g);
    const isFolded = folded.has(key);
    const count = countChanges(g);
    const Heading = depth === 0 ? 'h2' : 'h3';
    return (
      <section key={key} className={`wn-group wn-group--${depth}`}>
        <Heading className="wn-group__head">
          <button type="button" className="wn-fold" aria-expanded={!isFolded} onClick={() => setFolded(flip(folded, key))}>
            <span className="wn-fold__chev" aria-hidden="true">{isFolded ? '▸' : '▾'}</span>
            <span className="wn-fold__label">{g.label}</span>
            <span className="wn-fold__count">{count} {count === 1 ? 'change' : 'changes'}</span>
          </button>
        </Heading>
        {isFolded ? null : (
          <>
            {g.entries.length > 0 ? <ul className="wn-list">{g.entries.map((e) => renderEntry(e, key))}</ul> : null}
            {g.children.map((c) => renderGroup(c, depth + 1))}
          </>
        )}
      </section>
    );
  };

  if (entries.length === 0) return <p className="wn-empty">Nothing has been released yet.</p>;

  return (
    <div className="wn">
      <div className="wn-controls">
        <label className="wn-control">
          <span>View by</span>
          <select value={view} onChange={(ev) => { setView(ev.target.value as WhatsNewView); setFolded(new Set()); }}>
            {VIEW_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {manyProducts ? (
          <label className="wn-control">
            <span>Product</span>
            <select value={product} onChange={(ev) => setProduct(ev.target.value)}>
              <option value="all">All products</option>
              {products.map((p) => <option key={p.slug} value={p.slug}>{p.name}</option>)}
            </select>
          </label>
        ) : null}
      </div>
      {groups.map((g) => renderGroup(g, 0))}
    </div>
  );
}

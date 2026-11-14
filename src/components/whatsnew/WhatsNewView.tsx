'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { WhatsNewEntry } from '@/types/content';
import {
  EMPTY_FILTERS, KINDS, KIND_LABEL, applyFilters, countOption, facetValues, formatDate, groupEntries, hasFilters, slugify, viewOptions,
  type FilterFacet, type WhatsNewFilters, type WhatsNewGroup, type WhatsNewView,
} from '@/lib/whats-new/group';
import { whatsNewHref } from '@/lib/whats-new/href';

interface Props {
  entries: WhatsNewEntry[];
  /** Every product the Product filter offers (the all-products page). A product with nothing yet shows 0. */
  products?: { slug: string; name: string }[];
  /** Set on a product's own page: only that product. Without it the page covers every product. */
  scope?: { slug: string; name: string };
}

interface FieldOption {
  value: string;
  label: string;
  count: number;
}
interface FieldSpec {
  facet: FilterFacet;
  label: string;
  title: string;
  allLabel: string;
  options: FieldOption[];
  note?: string;
}

const Chevron = ({ size = 14, turned = false, right = false }: { size?: number; turned?: boolean; right?: boolean }) => (
  <svg className="wn-chev" style={turned ? { transform: 'rotate(-90deg)' } : right ? { transform: 'rotate(-90deg)' } : undefined} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
);
const Arrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
const Cross = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
);

/**
 * What's new for one product (`scope`) or for every product.
 * "View by" regroups the list at once and never touches the filters; Product is
 * one of its choices only when the page covers every product. There is a single
 * Filter button: it lists the fields (Date, Module, User, Type, and Product on
 * the all-products page), and a field's values open only when that field is
 * clicked. Ticked values show as chips under the bar. Every group is open to
 * start with and can be folded; "More" runs on at the end of the text.
 */
export function WhatsNewView({ entries, products, scope }: Props) {
  const allProducts = !scope;
  const [view, setView] = useState<WhatsNewView>('date');
  const [filters, setFilters] = useState<WhatsNewFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [field, setField] = useState<FilterFacet | ''>('');
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [more, setMore] = useState<Set<string>>(new Set());
  const [active, setActive] = useState('');
  const filterButton = useRef<HTMLButtonElement>(null);

  const values = useMemo(() => facetValues(entries), [entries]);
  const productList = useMemo(() => {
    if (scope) return [scope];
    const fromEntries = [...new Map(entries.map((e) => [e.productSlug, e.productName]))].map(([slug, name]) => ({ slug, name }));
    return products && products.length > 0 ? products : fromEntries;
  }, [entries, products, scope]);
  const shown = useMemo(() => applyFilters(entries, filters), [entries, filters]);
  const groups = useMemo(() => groupEntries(shown, view), [shown, view]);
  const manyProducts = allProducts && productList.length > 1;
  const views = useMemo(() => viewOptions(manyProducts), [manyProducts]);

  const groupId = (g: WhatsNewGroup) => `wn-${view}-${slugify(g.key)}`;
  const activeKey = groups.some((g) => g.key === active) ? active : groups[0]?.key ?? '';

  const closeFilter = useCallback(() => { setFilterOpen(false); setField(''); }, []);

  // Close the filter when the reader clicks anywhere else.
  useEffect(() => {
    if (!filterOpen) return;
    const away = (ev: PointerEvent) => {
      if (!(ev.target instanceof Element) || !ev.target.closest('.wn-filter')) closeFilter();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [filterOpen, closeFilter]);

  // Keep the left rail on the group the reader is reading.
  useEffect(() => {
    const nodes = groups.map((g) => ({ key: g.key, el: document.getElementById(`wn-${view}-${slugify(g.key)}`) })).filter((n): n is { key: string; el: HTMLElement } => n.el !== null);
    if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') return;
    const seen = new Set<string>();
    const io = new IntersectionObserver((records) => {
      for (const r of records) {
        const key = nodes.find((n) => n.el === r.target)?.key;
        if (!key) continue;
        if (r.isIntersecting) seen.add(key); else seen.delete(key);
      }
      const first = nodes.find((n) => seen.has(n.key));
      if (first) setActive(first.key);
    }, { rootMargin: '-15% 0px -70% 0px' });
    nodes.forEach((n) => io.observe(n.el));
    return () => io.disconnect();
  }, [groups, view]);

  const flip = useCallback(<T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]), []);
  const pick = (facet: FilterFacet, value: string) => { setFilters((f) => ({ ...f, [facet]: flip(f[facet] as string[], value) })); setActive(''); };
  const clearFacet = (facet: FilterFacet) => { setFilters((f) => ({ ...f, [facet]: [] })); setActive(''); };
  const toggleIn = (set: Set<string>, key: string) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; };

  const fields: FieldSpec[] = [
    ...(manyProducts ? [{
      facet: 'products' as const, label: 'Product', title: 'Choose products', allLabel: 'All products',
      options: productList.map((p) => ({ value: p.slug, label: p.name, count: countOption(entries, filters, 'products', (e) => e.productSlug === p.slug) })),
    }] : []),
    { facet: 'dates', label: 'Date', title: 'Choose dates', allLabel: 'All dates', options: values.dates.map((d) => ({ value: d, label: formatDate(d), count: countOption(entries, filters, 'dates', (e) => e.date === d) })) },
    { facet: 'modules', label: 'Module', title: 'Choose modules', allLabel: 'All modules', options: values.modules.map((m) => ({ value: m, label: m, count: countOption(entries, filters, 'modules', (e) => e.moduleTitle === m) })) },
    {
      facet: 'users', label: 'User', title: 'Choose users', allLabel: 'Everyone', note: 'Features for everyone are always included.',
      options: values.users.map((u) => ({ value: u, label: u, count: countOption(entries, filters, 'users', (e) => e.audience.includes('Everyone') || e.audience.includes(u)) })),
    },
    { facet: 'types', label: 'Type', title: 'Choose types', allLabel: 'All types', options: KINDS.map((k) => ({ value: k, label: KIND_LABEL[k], count: countOption(entries, filters, 'types', (e) => e.kind === k) })) },
  ];
  const openField = fields.find((f) => f.facet === field);
  const tickedIn = (facet: FilterFacet) => (filters[facet] as string[]).length;
  const tickedTotal = fields.reduce((n, f) => n + tickedIn(f.facet), 0);

  const chips: { key: string; text: string; remove: () => void }[] = [];
  const chip = (facet: FilterFacet, title: string, value: string, label: string) => chips.push({ key: `${facet}:${value}`, text: `${title}: ${label}`, remove: () => pick(facet, value) });
  productList.forEach((p) => { if (filters.products.includes(p.slug)) chip('products', 'Product', p.slug, p.name); });
  values.dates.forEach((d) => { if (filters.dates.includes(d)) chip('dates', 'Date', d, formatDate(d)); });
  values.modules.forEach((m) => { if (filters.modules.includes(m)) chip('modules', 'Module', m, m); });
  values.users.forEach((u) => { if (filters.users.includes(u)) chip('users', 'User', u, u); });
  KINDS.forEach((k) => { if (filters.types.includes(k)) chip('types', 'Type', k, KIND_LABEL[k]); });

  const railTitle = view === 'date' ? 'Jump to a day' : view === 'module' ? 'Jump to a module' : view === 'user' ? 'Jump to a user' : 'Jump to a product';

  const onFilterKey = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape' && filterOpen) { ev.stopPropagation(); closeFilter(); filterButton.current?.focus(); }
  };

  const renderEntry = (e: WhatsNewEntry, groupKey: string) => {
    const key = `${view}:${groupKey}|${e.productSlug}/${e.slug}`;
    const open = more.has(key);
    return (
      <li key={key} className="wn-row">
        <p className="wn-text">
          {view !== 'date' ? <span className="wn-date">{formatDate(e.date)}</span> : null}
          <strong className="wn-title">{e.title}</strong>
          <span>{e.summary}</span>
          {open && e.detail ? <span> {e.detail}</span> : null}
          {e.detail ? <button type="button" className="wn-more" aria-expanded={open} onClick={() => setMore(toggleIn(more, key))}>{open ? 'Less' : 'More'}</button> : null}
        </p>
        <dl className="wn-meta">
          {manyProducts && view !== 'product' ? <div><dt>Product</dt><dd>{e.productName}</dd></div> : null}
          <div><dt>Module</dt><dd>{e.moduleTitle}</dd></div>
          <div><dt>For</dt><dd>{e.audience.join(', ')}</dd></div>
          <div><dt>Type</dt><dd><span className={`wn-kind is-${e.kind}`}>{KIND_LABEL[e.kind]}</span></dd></div>
        </dl>
        {e.guideHref ? <a className="wn-how" href={e.guideHref}>How to use <Arrow /></a> : <span />}
      </li>
    );
  };

  const title = scope ? `What’s new in ${scope.name}` : 'What’s new in all products';
  const chooser = <p className="wn-alllink"><a href={whatsNewHref()}>Choose another product</a></p>;
  if (entries.length === 0) {
    return (
      <div className="wn">
        <h1 className="doc-title">{title}</h1>
        <p className="wn-empty">{scope ? `Nothing has been released in ${scope.name} yet.` : 'Nothing has been released yet.'}</p>
        {chooser}
      </div>
    );
  }

  return (
    <div className="wn">
      <div className="wn-head">
        <div>
          <h1 className="doc-title">{title}</h1>
          <p className="doc-lead">{scope ? `What we released in ${scope.name}, newest first. Open How to use to see the feature in the guide.` : 'What we released across every product, newest first. Open How to use to see the feature in the guide.'}</p>
          {chooser}
        </div>
        <p className="wn-total" aria-live="polite"><b>{shown.length}</b> {shown.length === 1 ? 'change' : 'changes'}</p>
      </div>

      <section className="wn-bar" aria-label="View and filter">
        <div className="wn-bgroup">
          <span className="wn-blabel" id="wn-viewby">View by</span>
          <div className="wn-seg" role="group" aria-labelledby="wn-viewby">
            {views.map((o) => (
              <button key={o.value} type="button" className={`wn-seg__btn${view === o.value ? ' is-on' : ''}`} aria-pressed={view === o.value} onClick={() => { setView(o.value); setActive(''); }}>{o.label}</button>
            ))}
          </div>
        </div>
        <span className="wn-divider" aria-hidden="true" />
        <div className={`wn-filter${filterOpen ? ' is-open' : ''}`} onKeyDown={onFilterKey}>
          <button ref={filterButton} type="button" className={`wn-fbtn${tickedTotal > 0 ? ' is-active' : ''}`} aria-haspopup="true" aria-expanded={filterOpen} onClick={() => (filterOpen ? closeFilter() : setFilterOpen(true))}>
            Filter
            {tickedTotal > 0 ? <span className="wn-badge" aria-label={`${tickedTotal} selected`}>{tickedTotal}</span> : null}
            <Chevron />
          </button>
          {filterOpen ? (
            <div className={`wn-fpop${openField ? ' has-values' : ''}`} role="group" aria-label="Filter">
              <div className="wn-fields" role="group" aria-label="Filter by">
                {fields.map((f) => (
                  <button key={f.facet} type="button" className={`wn-field${field === f.facet ? ' is-on' : ''}`} aria-expanded={field === f.facet} onClick={() => setField(field === f.facet ? '' : f.facet)}>
                    <span className="wn-field__t">{f.label}</span>
                    {tickedIn(f.facet) > 0 ? <span className="wn-badge">{tickedIn(f.facet)}</span> : null}
                    <Chevron right />
                  </button>
                ))}
              </div>
              {openField ? (
                <div className="wn-fvalues" role="group" aria-label={openField.title}>
                  <div className="wn-panel__h">{openField.title}</div>
                  <div className="wn-opts">
                    <label className="wn-opt"><input type="checkbox" checked={tickedIn(openField.facet) === 0} onChange={() => clearFacet(openField.facet)} /><span className="wn-opt__t">{openField.allLabel}</span></label>
                    {openField.options.map((o) => (
                      <label key={o.value} className={`wn-opt${o.count === 0 && !(filters[openField.facet] as string[]).includes(o.value) ? ' is-off' : ''}`}>
                        <input type="checkbox" checked={(filters[openField.facet] as string[]).includes(o.value)} onChange={() => pick(openField.facet, o.value)} />
                        <span className="wn-opt__t">{o.label}</span>
                        <span className="wn-opt__n">{o.count}</span>
                      </label>
                    ))}
                  </div>
                  {openField.note ? <div className="wn-panel__note">{openField.note}</div> : null}
                </div>
              ) : null}
              <div className="wn-panel__f">
                <button type="button" className="wn-plink" disabled={!hasFilters(filters)} onClick={() => { setFilters(EMPTY_FILTERS); setActive(''); }}>Clear all</button>
                <button type="button" className="wn-pdone" onClick={() => { closeFilter(); filterButton.current?.focus(); }}>Done</button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {hasFilters(filters) ? (
        <div className="wn-applied" aria-label="Applied filters">
          {chips.map((c) => (
            <span key={c.key} className="wn-tag">{c.text}<button type="button" aria-label={`Remove ${c.text}`} onClick={c.remove}><Cross /></button></span>
          ))}
          <button type="button" className="wn-clearall" onClick={() => { setFilters(EMPTY_FILTERS); setActive(''); }}>Clear all</button>
        </div>
      ) : null}

      <div className="wn-layout">
        <nav className="wn-rail" aria-label={railTitle}>
          <p className="wn-rail__h">{railTitle}</p>
          {groups.map((g) => (
            <a key={g.key} className={`wn-rail__a${g.key === activeKey ? ' is-on' : ''}`} href={`#${groupId(g)}`} aria-current={g.key === activeKey ? 'true' : undefined} onClick={() => setActive(g.key)}>
              <span>{g.label}</span><span className="wn-rail__n">{g.entries.length}</span>
            </a>
          ))}
        </nav>

        <div className="wn-feed">
          {groups.length === 0 ? <div className="wn-empty">Nothing matches these filters. Remove a filter to see more.</div> : null}
          {groups.map((g) => {
            const fk = `${view}:${g.key}`;
            const isFolded = folded.has(fk);
            return (
              <section key={fk} className="wn-grp" id={groupId(g)}>
                <div className="wn-grp__head">
                  <h2 className="wn-grp__h">
                    <button type="button" className="wn-fold" aria-expanded={!isFolded} onClick={() => setFolded(toggleIn(folded, fk))}>
                      <Chevron size={18} turned={isFolded} />
                      <span className="wn-grp__label">{g.label}</span>
                    </button>
                  </h2>
                  <span className="wn-grp__count">{g.entries.length} {g.entries.length === 1 ? 'change' : 'changes'}</span>
                </div>
                {isFolded ? null : <ul className="wn-list">{g.entries.map((e) => renderEntry(e, g.key))}</ul>}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

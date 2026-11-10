'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { downstreamOf, upstreamOf, type ConfigMap, type SetupNode } from '@/lib/content/config-map';

const AREA_COLORS = ['#2563eb', '#16a34a', '#d97706', '#9333ea', '#db2777', '#0891b2', '#dc2626', '#65a30d', '#7c3aed', '#ea580c', '#0d9488', '#4f46e5'];

function useDone(product: string) {
  const key = `pv-config-done:${product}`;
  const [done, setDone] = useState<Set<string>>(new Set());
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) setDone(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* private window or blocked storage: start empty */
    }
  }, [key]);
  const toggle = useCallback(
    (id: string) =>
      setDone((d) => {
        const next = new Set(d);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* ignore */
        }
        return next;
      }),
    [key],
  );
  return { done, toggle };
}

type Role = 'selected' | 'before' | 'after' | 'chain' | 'dim' | 'plain';

interface Line {
  from: string;
  to: string;
  tone: 'before' | 'after' | 'chain';
}

/** Draws the arrows between related cards. Only the selection's links are drawn, to keep it readable. */
function Connectors({ board, lines }: { board: React.RefObject<HTMLDivElement | null>; lines: Line[] }) {
  const [paths, setPaths] = useState<{ d: string; tone: Line['tone']; key: string }[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const measure = useCallback(() => {
    const el = board.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    const at = (id: string) => el.querySelector<HTMLElement>(`[data-node="${CSS.escape(id)}"]`)?.getBoundingClientRect();
    const next: { d: string; tone: Line['tone']; key: string }[] = [];
    for (const l of lines) {
      const a = at(l.from);
      const b = at(l.to);
      if (!a || !b) continue;
      const x1 = a.right - box.left + el.scrollLeft;
      const y1 = a.top + a.height / 2 - box.top + el.scrollTop;
      const x2 = b.left - box.left + el.scrollLeft;
      const y2 = b.top + b.height / 2 - box.top + el.scrollTop;
      if (x2 <= x1) continue;
      const mid = (x1 + x2) / 2;
      next.push({ d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2 - 6},${y2}`, tone: l.tone, key: `${l.from}>${l.to}` });
    }
    setSize({ w: el.scrollWidth, h: el.scrollHeight });
    setPaths(next);
  }, [board, lines]);
  useLayoutEffect(() => {
    measure();
    const el = board.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure, board]);
  if (paths.length === 0) return null;
  return (
    <svg className="cc-lines" width={size.w} height={size.h} aria-hidden="true">
      <defs>
        {(['before', 'after', 'chain'] as const).map((t) => (
          <marker key={t} id={`cc-arrow-${t}`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={`cc-arrow cc-arrow--${t}`} />
          </marker>
        ))}
      </defs>
      {paths.map((p) => (
        <path key={p.key} d={p.d} className={`cc-line cc-line--${p.tone}`} markerEnd={`url(#cc-arrow-${p.tone})`} />
      ))}
    </svg>
  );
}

export function ConfigurationCenter({ product, map }: { product: string; map: ConfigMap }) {
  const { done, toggle } = useDone(product);
  const [selected, setSelected] = useState<string | null>(null);
  const [processId, setProcessId] = useState<string>('');
  const [areas, setAreas] = useState<Set<string>>(new Set());
  const [hideDone, setHideDone] = useState(false);
  const board = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(map.setups.map((s) => [s.id, s])), [map]);
  const processById = useMemo(() => new Map(map.processes.map((p) => [p.id, p])), [map]);
  const color = useMemo(() => new Map(map.areas.map((a, i) => [a, AREA_COLORS[i % AREA_COLORS.length] ?? '#64748b'])), [map]);
  const process = processId ? processById.get(processId) : undefined;
  const chain = useMemo(() => new Set(process?.chain ?? []), [process]);

  const before = useMemo(() => (selected ? upstreamOf(map, selected) : new Set<string>()), [map, selected]);
  const after = useMemo(() => (selected ? downstreamOf(map, selected) : new Set<string>()), [map, selected]);

  const visible = (s: SetupNode) => (areas.size === 0 || areas.has(s.area)) && (!hideDone || !done.has(s.id)) && (!process || chain.has(s.id));

  const role = (id: string): Role => {
    if (selected === id) return 'selected';
    if (selected) return before.has(id) ? 'before' : after.has(id) ? 'after' : 'dim';
    if (process) return chain.has(id) ? 'chain' : 'dim';
    return 'plain';
  };

  const lines = useMemo<Line[]>(() => {
    const out: Line[] = [];
    if (selected) {
      const rel = new Set([selected, ...before, ...after]);
      for (const s of map.setups) {
        if (!rel.has(s.id)) continue;
        for (const n of s.needs) if (rel.has(n.id)) out.push({ from: n.id, to: s.id, tone: s.id === selected || before.has(s.id) ? 'before' : 'after' });
      }
    } else if (process) {
      for (const s of map.setups) if (chain.has(s.id)) for (const n of s.needs) if (chain.has(n.id)) out.push({ from: n.id, to: s.id, tone: 'chain' });
    }
    return out;
  }, [selected, before, after, process, chain, map]);

  const stages = Array.from({ length: map.stages }, (_, i) => i + 1);
  const total = map.setups.length;
  const doneCount = map.setups.filter((s) => done.has(s.id)).length;
  const sel = selected ? byId.get(selected) : undefined;
  const processGroups = useMemo(() => {
    const g = new Map<string, typeof map.processes>();
    for (const p of map.processes) g.set(p.area, [...(g.get(p.area) ?? []), p]);
    return [...g.entries()];
  }, [map]);

  return (
    <div className="cc">
      <div className="cc-stats" aria-label="Summary">
        <div>
          <strong>{total}</strong>
          <span>setups</span>
        </div>
        <div>
          <strong>{map.stages}</strong>
          <span>steps, in order</span>
        </div>
        <div>
          <strong>{map.processes.length}</strong>
          <span>tasks that depend on them</span>
        </div>
        <div className="cc-progress">
          <span>
            Marked done on this computer: <strong>{doneCount}</strong> of {total}
          </span>
          <span className="cc-progress__bar" aria-hidden="true">
            <span style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
          </span>
        </div>
      </div>

      <div className="cc-controls">
        <label className="cc-field">
          <span>What do you want to run?</span>
          <select
            value={processId}
            onChange={(e) => {
              setProcessId(e.target.value);
              setSelected(null);
            }}
          >
            <option value="">Everything (the full setup map)</option>
            {processGroups.map(([area, list]) => (
              <optgroup key={area} label={area}>
                {list.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="cc-areas" role="group" aria-label="Show areas">
          {map.areas.map((a) => (
            <button
              key={a}
              type="button"
              className={`cc-chip${areas.has(a) ? ' cc-chip--on' : ''}`}
              aria-pressed={areas.has(a)}
              onClick={() =>
                setAreas((s) => {
                  const next = new Set(s);
                  if (next.has(a)) next.delete(a);
                  else next.add(a);
                  return next;
                })
              }
            >
              <span className="cc-dot" style={{ background: color.get(a) }} aria-hidden="true" />
              {a}
            </button>
          ))}
          <label className="cc-hide">
            <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide what's done
          </label>
        </div>
      </div>

      {process ? (
        <section className="cc-checklist" aria-labelledby="cc-checklist-h">
          <h2 id="cc-checklist-h">Before you can “{process.title}”, set up these {process.chain.length}, in this order</h2>
          <ol>
            {process.chain.map((id) => {
              const s = byId.get(id);
              if (!s) return null;
              return (
                <li key={id} className={done.has(id) ? 'is-done' : undefined}>
                  <input type="checkbox" checked={done.has(id)} onChange={() => toggle(id)} aria-label={`Mark “${s.title}” done`} />
                  <span className="cc-dot" style={{ background: color.get(s.area) }} aria-hidden="true" />
                  <Link href={s.href}>{s.title}</Link>
                  <span className="cc-muted">
                    Step {s.stage} · {s.area}
                  </span>
                </li>
              );
            })}
          </ol>
          <p>
            Then: <Link href={process.href}>{process.title} →</Link>
          </p>
        </section>
      ) : null}

      <div className="cc-legend" aria-hidden={!selected}>
        {selected ? (
          <>
            <span className="cc-key cc-key--before">Do these first</span>
            <span className="cc-key cc-key--selected">Selected</span>
            <span className="cc-key cc-key--after">These build on it</span>
            <button type="button" className="cc-clear" onClick={() => setSelected(null)}>
              Clear selection
            </button>
          </>
        ) : (
          <span className="cc-muted">Select a setup to see what must come before it and what builds on it. Columns run left to right in the order to do them.</span>
        )}
      </div>

      <div className="cc-board" ref={board}>
        <Connectors board={board} lines={lines} />
        {stages.map((n) => {
          const nodes = map.setups.filter((s) => s.stage === n && visible(s));
          return (
            <section key={n} className="cc-col" aria-labelledby={`cc-step-${n}`}>
              <h2 id={`cc-step-${n}`} className="cc-col__head">
                Step {n}
                <span>{n === 1 ? 'Start here: nothing needed first' : `Needs step ${n - 1} or earlier`}</span>
              </h2>
              {nodes.length === 0 ? <p className="cc-muted cc-empty">Nothing here with these filters.</p> : null}
              {nodes.map((s) => (
                <div key={s.id} data-node={s.id} className={`cc-card cc-card--${role(s.id)}${done.has(s.id) ? ' cc-card--done' : ''}`} style={{ ['--area' as string]: color.get(s.area) }}>
                  <button type="button" className="cc-card__main" aria-pressed={selected === s.id} onClick={() => setSelected((cur) => (cur === s.id ? null : s.id))}>
                    <span className="cc-card__area">{s.area}</span>
                    <span className="cc-card__title">{s.title}</span>
                    <span className="cc-card__meta">
                      {s.needs.length ? `Needs ${s.needs.length}` : 'Nothing first'} · used by {s.usedBy.length} {s.usedBy.length === 1 ? 'task' : 'tasks'}
                    </span>
                  </button>
                  <label className="cc-card__done">
                    <input type="checkbox" checked={done.has(s.id)} onChange={() => toggle(s.id)} />
                    Done
                  </label>
                </div>
              ))}
            </section>
          );
        })}
      </div>

      {sel ? (
        <aside className="cc-detail" aria-labelledby="cc-detail-h">
          <button type="button" className="cc-detail__close" aria-label="Close details" onClick={() => setSelected(null)}>
            ×
          </button>
          <span className="cc-card__area" style={{ ['--area' as string]: color.get(sel.area) }}>
            {sel.area} · Step {sel.stage}
          </span>
          <h2 id="cc-detail-h">{sel.title}</h2>
          <p>{sel.summary}</p>
          <div className="cc-detail__grid">
            <div>
              <h3>Do these first</h3>
              {sel.needs.length === 0 ? (
                <p className="cc-muted">Nothing. You can start with this.</p>
              ) : (
                <ul>
                  {sel.needs.map((n) => {
                    const s = byId.get(n.id);
                    return s ? (
                      <li key={n.id}>
                        <button type="button" className="cc-link" onClick={() => setSelected(n.id)}>
                          {s.title}
                        </button>
                        {n.why ? <span className="cc-muted"> {n.why}</span> : null}
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </div>
            <div>
              <h3>Then you can set up</h3>
              {sel.unlocks.length === 0 ? (
                <p className="cc-muted">No other setup depends on it.</p>
              ) : (
                <ul>
                  {sel.unlocks.map((id) => (
                    <li key={id}>
                      <button type="button" className="cc-link" onClick={() => setSelected(id)}>
                        {byId.get(id)?.title ?? id}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3>Needed for these tasks ({sel.usedBy.length})</h3>
              {sel.usedBy.length === 0 ? (
                <p className="cc-muted">No task guide lists it yet.</p>
              ) : (
                <ul>
                  {sel.usedBy.map((id) => {
                    const p = processById.get(id);
                    return p ? (
                      <li key={id}>
                        <Link href={p.href}>{p.title}</Link> <span className="cc-muted">{p.area}</span>
                      </li>
                    ) : null;
                  })}
                </ul>
              )}
            </div>
          </div>
          <Link className="btn btn--primary" href={sel.href}>
            Open the guide →
          </Link>
        </aside>
      ) : null}
    </div>
  );
}

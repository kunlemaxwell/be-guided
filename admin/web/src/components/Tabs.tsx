import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Small dot after the label, e.g. "this tab has unsaved changes". Read out as `markLabel`. */
  marked?: boolean;
  markLabel?: string;
}

/**
 * Where focus goes for a key press in a tablist (WAI-ARIA tabs pattern):
 * ←/→ move and wrap, Home/End jump to the ends. Returns null for other keys.
 */
export function nextTabIndex(index: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowRight':
      return (index + 1) % count;
    case 'ArrowLeft':
      return (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** The id of a tab button and of its panel, shared by `Tabs` and `TabPanel`. */
export function tabIds(idPrefix: string, id: string): { tab: string; panel: string } {
  return { tab: `${idPrefix}-tab-${id}`, panel: `${idPrefix}-panel-${id}` };
}

interface TabsProps<T extends string> {
  /** Accessible name of the tab list, e.g. "Settings sections". */
  label: string;
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** Prefix for the tab and panel ids; must match the `TabPanel`s. */
  idPrefix: string;
}

/**
 * A row of tabs (WAI-ARIA tabs, automatic activation): only the chosen tab is
 * in the Tab order; ←/→/Home/End move between tabs and show that tab's panel.
 * The parent keeps the chosen tab (e.g. in the URL) and renders `TabPanel`s.
 */
export function Tabs<T extends string>({ label, tabs, value, onChange, idPrefix }: TabsProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(index, e.key, tabs.length);
    if (next === null) return;
    e.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onChange(tab.id);
    refs.current[next]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const on = t.id === value;
        const ids = tabIds(idPrefix, t.id);
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={ids.tab}
            aria-selected={on}
            aria-controls={ids.panel}
            tabIndex={on ? 0 : -1}
            className={`tabs__tab${on ? ' tabs__tab--on' : ''}`}
            onClick={() => onChange(t.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {t.label}
            {t.marked ? (
              <span className="tabs__mark" aria-hidden="true" />
            ) : null}
            {t.marked && t.markLabel ? <span className="visually-hidden"> ({t.markLabel})</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** The content of one tab. Only the chosen panel is rendered. */
export function TabPanel({ idPrefix, id, active, children }: { idPrefix: string; id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  const ids = tabIds(idPrefix, id);
  return (
    <div role="tabpanel" id={ids.panel} aria-labelledby={ids.tab} tabIndex={0} className="tabs__panel">
      {children}
    </div>
  );
}

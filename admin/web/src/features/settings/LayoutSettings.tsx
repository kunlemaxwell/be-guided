import { DENSITIES, LAYOUT_IDS, LAYOUTS, layoutOptions, NAV_POSITIONS, STEP_STYLES, TOC_POSITIONS, WIDTHS, type LayoutId, type LayoutOptions } from '@/lib/layouts';

export interface LayoutValue {
  id?: LayoutId;
  nav?: LayoutOptions['nav'];
  toc?: LayoutOptions['toc'];
  width?: LayoutOptions['width'];
  density?: LayoutOptions['density'];
  steps?: LayoutOptions['steps'];
}

const OPTION_LABELS: { key: keyof LayoutOptions; label: string; values: readonly string[]; names: Record<string, string> }[] = [
  { key: 'nav', label: 'Module menu', values: NAV_POSITIONS, names: { left: 'Side menu on the left', right: 'Side menu on the right', tabs: 'Module tabs on top + side menu', top: 'Module tabs on top only' } },
  { key: 'toc', label: '"On this page"', values: TOC_POSITIONS, names: { right: 'Column on the right', inline: 'Box above the article', hidden: 'Hidden' } },
  { key: 'width', label: 'Reading width', values: WIDTHS, names: { narrow: 'Narrow', normal: 'Normal', wide: 'Wide' } },
  { key: 'density', label: 'Spacing', values: DENSITIES, names: { comfortable: 'Comfortable', compact: 'Compact' } },
  { key: 'steps', label: 'Steps', values: STEP_STYLES, names: { list: 'Numbered list', cards: 'One card per step', split: 'Text beside the screenshot', slides: 'One step per screen' } },
];

/** A small wireframe of the layout, drawn from its options. */
function Wire({ o }: { o: LayoutOptions }) {
  const side = <span className="wire__side" />;
  const toc = o.toc === 'right' ? <span className="wire__toc" /> : null;
  const step = (i: number) =>
    o.steps === 'split' ? (
      <span key={i} className="wire__split"><span className="wire__line" /><span className="wire__shot" /></span>
    ) : o.steps === 'cards' || o.steps === 'slides' ? (
      <span key={i} className={`wire__card${o.steps === 'slides' ? ' wire__card--tall' : ''}`}><span className="wire__line" />{o.steps === 'slides' ? <span className="wire__shot" /> : null}</span>
    ) : (
      <span key={i} className="wire__line" />
    );
  return (
    <span className={`wire wire--${o.width}${o.density === 'compact' ? ' wire--compact' : ''}`} aria-hidden="true">
      {o.nav === 'tabs' || o.nav === 'top' ? <span className="wire__tabs"><span /><span /><span /></span> : null}
      <span className="wire__body">
        {o.nav === 'left' || o.nav === 'tabs' ? side : null}
        <span className="wire__main">
          <span className="wire__title" />
          {o.toc === 'inline' ? <span className="wire__inline" /> : null}
          {[0, 1, ...(o.steps === 'slides' ? [] : [2])].map(step)}
        </span>
        {toc}
        {o.nav === 'right' ? side : null}
      </span>
    </span>
  );
}

/** Settings › Layout: pick a layout, then change any of its five options. */
export function LayoutSettings({ value, onChange }: { value: LayoutValue | undefined; onChange: (next: LayoutValue) => void }) {
  const id: LayoutId = value?.id ?? 'standard';
  const overrides = { nav: value?.nav, toc: value?.toc, width: value?.width, density: value?.density, steps: value?.steps };
  const current = layoutOptions(id, overrides);
  const changed = OPTION_LABELS.filter((o) => overrides[o.key] !== undefined && overrides[o.key] !== LAYOUTS[id].defaults[o.key]);

  return (
    <div className="stack-lg">
      <div className="layout-grid" role="radiogroup" aria-label="Layout">
        {LAYOUT_IDS.map((l) => {
          const on = l === id;
          return (
            <button key={l} type="button" role="radio" aria-checked={on} className={`theme-card layout-card${on ? ' theme-card--on' : ''}`} onClick={() => onChange({ id: l })}>
              <Wire o={LAYOUTS[l].defaults} />
              <span className="theme-card__name">{LAYOUTS[l].name}</span>
              <span className="layout-card__feel">{LAYOUTS[l].feel}</span>
              <span className="theme-card__desc">{LAYOUTS[l].description}</span>
              {on ? <span className="theme-card__tick">Chosen</span> : null}
            </button>
          );
        })}
      </div>

      <div className="subsection">
        <h3 id="layout-custom-h">Customize {LAYOUTS[id].name}</h3>
        <p className="muted">Each option starts at the layout’s own choice. Change any of them; the picture shows the result.</p>
        <div className="layout-custom">
          <div className="layout-custom__fields">
            {OPTION_LABELS.map((opt) => (
              <label key={opt.key} className="field">
                <span className="field__label">{opt.label}</span>
                <select
                  value={current[opt.key]}
                  onChange={(e) => {
                    const v = e.target.value;
                    onChange({ ...value, id, [opt.key]: v === LAYOUTS[id].defaults[opt.key] ? undefined : v });
                  }}
                >
                  {opt.values.map((v) => (
                    <option key={v} value={v}>
                      {opt.names[v]}
                      {v === LAYOUTS[id].defaults[opt.key] ? ` (${LAYOUTS[id].name}’s own)` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {changed.length ? (
              <button type="button" className="btn btn--small" onClick={() => onChange({ id })}>
                Back to {LAYOUTS[id].name}’s own options
              </button>
            ) : null}
          </div>
          <div className="layout-custom__preview">
            <Wire o={current} />
            <p className="muted">Phones always get one column with the menu above the article.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useQuery } from '@tanstack/react-query';
import { HERO_ANIMATIONS, type HeroAnimation, type HeroSettings as HeroValue } from '@/types/content';
import { api, queryKeys } from '../../api/endpoints';
import { Field } from '../../components/Field';

const ANIMATION_OPTIONS: Record<HeroAnimation, { label: string; hint: string }> = {
  static: { label: 'Static', hint: 'One product’s screens, standing still. Pick the product below (the first one ticked is used).' },
  slideshow: { label: 'Slideshow', hint: 'One product at a time: it turns to the next product, rests, then turns again.' },
  '3d': { label: '3D, always moving', hint: 'The products sit on the faces of a cube that keeps turning without stopping.' },
};

export const HERO_DEFAULT: HeroValue = { animation: '3d', products: [], seconds: 5 };

/** Settings › Home page: how the picture at the top of the home page behaves, and which products it shows. */
export function HeroSettings({ value, onChange }: { value: HeroValue | undefined; onChange: (next: HeroValue) => void }) {
  const hero = { ...HERO_DEFAULT, ...(value ?? {}) };
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const products = library.data?.products ?? [];
  const set = (patch: Partial<HeroValue>) => onChange({ ...hero, ...patch });
  const all = hero.products.length === 0;
  const chosen = all ? products.map((p) => p.slug) : hero.products;

  const toggle = (slug: string, on: boolean) => {
    const base = all ? products.map((p) => p.slug) : hero.products;
    const next = on ? [...base.filter((s) => s !== slug), slug] : base.filter((s) => s !== slug);
    set({ products: next.length === products.length && products.every((p, i) => next[i] === p.slug) ? [] : next });
  };
  const move = (slug: string, by: -1 | 1) => {
    const list = [...chosen];
    const i = list.indexOf(slug);
    const j = i + by;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    set({ products: list });
  };

  return (
    <div className="stack">
      <div className="choice-row" role="radiogroup" aria-labelledby="hero-h">
        {HERO_ANIMATIONS.map((a) => (
          <label key={a} className={`choice${hero.animation === a ? ' choice--on' : ''}`}>
            <input type="radio" name="heroAnimation" value={a} checked={hero.animation === a} onChange={() => set({ animation: a })} />
            <span className="choice__label">{ANIMATION_OPTIONS[a].label}</span>
            <span className="choice__hint">{ANIMATION_OPTIONS[a].hint}</span>
          </label>
        ))}
      </div>

      {hero.animation !== 'static' ? (
        <Field
          label={hero.animation === 'slideshow' ? 'Seconds each product stays at the front' : 'Seconds per quarter turn'}
          hint={hero.animation === 'slideshow' ? '2 to 30. 5 is a calm pace.' : '2 to 30. Lower turns faster; 5 is a slow, steady roll.'}
        >
          {(p) => (
            <input
              {...p}
              className="input--short"
              type="number"
              min={2}
              max={30}
              step={0.5}
              value={hero.seconds}
              onChange={(e) => set({ seconds: Math.min(30, Math.max(2, Number(e.target.value) || 5)) })}
            />
          )}
        </Field>
      ) : null}

      <fieldset className="subsection">
        <legend>Products shown{all ? ' (all, in their usual order)' : ''}</legend>
        <p className="muted small">Tick the products to show and put them in order. Each product shows the pictures chosen for it in Products › Hero pictures.</p>
        {library.isLoading ? <p className="muted">Loading products…</p> : null}
        <ul className="hero-products">
          {[...chosen.map((s) => products.find((p) => p.slug === s)).filter((p) => !!p), ...products.filter((p) => !chosen.includes(p.slug))].map((p) => {
            const on = chosen.includes(p!.slug);
            const i = chosen.indexOf(p!.slug);
            return (
              <li key={p!.slug} className="hero-products__row">
                <label className="hero-products__name">
                  <input type="checkbox" checked={on} onChange={(e) => toggle(p!.slug, e.target.checked)} />
                  {on ? <span className="hero-products__n">{i + 1}</span> : null}
                  {p!.meta.name}
                  {p!.meta.status === 'coming-soon' ? <span className="muted small"> · Coming soon</span> : null}
                  {p!.meta.visibility === 'private' ? <span className="muted small"> · Private (not shown)</span> : null}
                </label>
                {on ? (
                  <span className="hero-products__move">
                    <button type="button" className="btn btn--small btn--ghost" aria-label={`Move ${p!.meta.name} up`} disabled={i === 0} onClick={() => move(p!.slug, -1)}>↑</button>
                    <button type="button" className="btn btn--small btn--ghost" aria-label={`Move ${p!.meta.name} down`} disabled={i === chosen.length - 1} onClick={() => move(p!.slug, 1)}>↓</button>
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
        {!all ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => set({ products: [] })}>
            Show all products again
          </button>
        ) : null}
      </fieldset>
    </div>
  );
}

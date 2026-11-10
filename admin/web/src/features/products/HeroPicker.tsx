import { useQuery } from '@tanstack/react-query';
import { api, moduleFileUrl } from '../../api/endpoints';

const MAX = 4;

/**
 * Products › Hero pictures: choose which of the product's screenshots appear
 * on its own page and in the home page hero. The first ticked is the main one.
 */
export function HeroPicker({ product, value, onChange }: { product: string; value: string[]; onChange: (next: string[]) => void }) {
  const images = useQuery({ queryKey: ['product-images', product], queryFn: ({ signal }) => api.getProductImages(product, signal) });
  const toggle = (src: string) => onChange(value.includes(src) ? value.filter((v) => v !== src) : value.length < MAX ? [...value, src] : value);
  // Chosen pictures first (in order), then the rest.
  const list = [...value.filter((v) => (images.data ?? []).includes(v)), ...(images.data ?? []).filter((v) => !value.includes(v))];
  return (
    <fieldset className="subsection">
      <legend>Hero pictures</legend>
      <p className="muted small">
        Pick up to {MAX}. The first is the main picture (home page and the front of this product’s page); the second sits behind it.
        {value.length === 0 ? ' None picked: the first screenshots of its guides are used.' : ''}
      </p>
      {images.isLoading ? <p className="muted">Loading pictures…</p> : null}
      {images.isError ? <p className="muted">Couldn’t load the pictures. Refresh to try again.</p> : null}
      {!images.isLoading && !images.isError && list.length === 0 ? <p className="muted">This product has no screenshots yet.</p> : null}
      {list.length > 0 ? (
        <ul className="hero-picker">
          {list.map((src) => {
            const [module, , file] = src.split('/');
            const i = value.indexOf(src);
            return (
              <li key={src}>
                <button
                  type="button"
                  className={i >= 0 ? 'hero-picker__item hero-picker__item--on' : 'hero-picker__item'}
                  aria-pressed={i >= 0}
                  disabled={i < 0 && value.length >= MAX}
                  onClick={() => toggle(src)}
                  title={src}
                >
                  <img src={moduleFileUrl(product, module!, `images/${file}`)} alt="" loading="lazy" />
                  <span className="hero-picker__name">{module} · {file}</span>
                  {i >= 0 ? <span className="hero-picker__n" aria-label={i === 0 ? 'Main picture' : `Picture ${i + 1}`}>{i + 1}</span> : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
      {value.length > 0 ? (
        <button type="button" className="btn btn--small btn--ghost" onClick={() => onChange([])}>
          Clear (use the guides’ first screenshots)
        </button>
      ) : null}
    </fieldset>
  );
}

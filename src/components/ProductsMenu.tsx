import Link from 'next/link';
import { getProducts } from '@/lib/content/load';
import { ChevronDownIcon } from './Icons';

/**
 * Header "Products" menu: every product, so the header scales to many products.
 * Plain <details>, so it works without JavaScript and closes on selection
 * because each choice navigates.
 */
export function ProductsMenu({ current }: { current?: string }) {
  const products = getProducts();
  if (products.length === 0) return null;
  return (
    <details className="products-menu">
      <summary className="products-menu__button">Products <ChevronDownIcon size={14} /></summary>
      <div className="products-menu__panel" role="menu">
        {products.map((p) =>
          p.status === 'available' ? (
            <Link key={p.slug} role="menuitem" href={`/${p.slug}/`} className="products-menu__item" aria-current={p.slug === current ? 'page' : undefined}>
              <span className="products-menu__name">{p.name}</span>
              <span className="products-menu__summary">{p.summary}</span>
            </Link>
          ) : (
            <span key={p.slug} role="menuitem" aria-disabled="true" className="products-menu__item products-menu__item--soon">
              <span className="products-menu__name">{p.name} <span className="pill">Coming soon</span></span>
              <span className="products-menu__summary">{p.summary}</span>
            </span>
          ),
        )}
      </div>
    </details>
  );
}

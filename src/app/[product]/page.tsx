import type { Metadata } from 'next';
import { orPlaceholder } from '@/lib/static-params';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getProducts } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { ModuleGrid } from '@/components/ModuleGrid';
import { moduleGroups } from '@/lib/content/areas';
import { heroChips, productHero } from '@/lib/content/hero';
import { ProductCollage } from '@/components/hero/ProductCollage';
import { ProductLinkButton } from '@/components/ProductLinkButton';

type Params = { product: string };

/** Only the addresses built by generateStaticParams exist; anything else is a 404 (also while previewing). */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return orPlaceholder(
    getProducts().filter((p) => p.status === 'available').map((p) => ({ product: p.slug })),
    ['product'],
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product } = await params;
  const p = getProduct(product);
  return p ? { title: `${p.name} user guide`, description: p.summary } : {};
}

export default async function ProductPage({ params }: { params: Promise<Params> }) {
  const { product: slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const hero = productHero(product);
  const chips = heroChips(product, hero);

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main>
        <section className={hero.images.length ? 'hero hero--product' : 'hero'}>
          <div className="container">
            <div className={hero.images.length ? 'hero__grid' : undefined}>
              <div className="hero__inner">
                <span className="hero__eyebrow">User guide</span>
                <h1 className="hero__title">{product.name}</h1>
                <p className="hero__lead">{product.summary}</p>
                <div className="hero__actions">
                  <Link className="btn btn--primary" href={`/${product.slug}/configuration-center/`}>
                    Configuration center: what to set up, in order →
                  </Link>
                  <ProductLinkButton slug={product.slug} name={product.name} />
                </div>
              </div>
              <ProductCollage hero={hero} productName={product.name} chips={chips} />
            </div>
          </div>
        </section>
        <div className="container">
          {moduleGroups(product).map((g) => (
            <section key={g.slug} className="section section--tight" aria-labelledby={`group-${g.slug}`}>
              <div className="group-head">
                <h2 id={`group-${g.slug}`} className="group-title">{g.title}</h2>
                {g.oneView ? (
                  <Link className="group-head__link" href={`/${product.slug}/area/${g.slug}/`}>
                    All of {g.title} in one view <span aria-hidden="true">→</span>
                  </Link>
                ) : null}
              </div>
              <ModuleGrid product={{ ...product, modules: g.modules }} compact />
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

import type { Metadata } from 'next';
import { orPlaceholder } from '@/lib/static-params';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getProducts, pageHref, resolveGuideRef } from '@/lib/content/load';
import { buildConfigMap, type MapPageInput } from '@/lib/content/config-map';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { ConfigurationCenter } from '@/components/config/ConfigurationCenter';

type Params = { product: string };

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
  return p ? { title: `Configuration center · ${p.name}`, description: `Everything ${p.name} needs set up, in the order to do it.` } : {};
}

/** Every setup of a product on one map, in order, worked out from the guide pages. */
export default async function ConfigurationCenterPage({ params }: { params: Promise<Params> }) {
  const { product: slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();

  const pages: MapPageInput[] = product.modules.flatMap((m) =>
    m.pages.map((p) => ({
      id: p.id,
      moduleSlug: m.slug,
      moduleTitle: m.title,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      href: pageHref(p),
      section: p.section,
      kind: p.kind,
      needs: p.prerequisites.flatMap((r) => {
        const link = resolveGuideRef(product.slug, r.page);
        return link ? [{ id: link.id, why: r.why }] : [];
      }),
    })),
  );
  const map = buildConfigMap(pages);

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main className="container container--wide cc-page" data-pagefind-ignore="all">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <span>Configuration center</span>
        </nav>
        <h1 className="doc-title">Configuration center</h1>
        <p className="doc-lead">
          Everything {product.name} needs set up, on one map and in the order to do it. Pick what you want to run to see only the setups it needs, or select a setup to see what
          comes before it and what builds on it. Each card opens its guide.
        </p>
        {map.setups.length === 0 ? <p>No setup guides yet.</p> : <ConfigurationCenter product={product.slug} map={map} />}
      </main>
      <SiteFooter />
    </>
  );
}

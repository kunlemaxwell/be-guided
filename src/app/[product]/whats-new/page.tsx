import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpenProducts, getProduct } from '@/lib/content/load';
import { getWhatsNew } from '@/lib/content/whats-new';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { WhatsNewView } from '@/components/whatsnew/WhatsNewView';

type Params = { product: string };

export const dynamicParams = false;

/** Every open product has its own What's new, even before its first entry. */
export function generateStaticParams(): Params[] {
  return getOpenProducts().map((p) => ({ product: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product } = await params;
  const p = getProduct(product);
  return p ? { title: `What's new in ${p.name}`, description: `What was released in ${p.name}, by date, module or user, with a link to how to use each one.` } : {};
}

/** What's new for one product only: the entries of content/products/<product>/whats-new.json. */
export default async function ProductWhatsNewPage({ params }: { params: Promise<Params> }) {
  const { product: slug } = await params;
  const product = getProduct(slug);
  if (!product) notFound();
  const scope = { slug: product.slug, name: product.name };
  return (
    <>
      <SiteHeader product={scope} />
      <main className="container container--wide" style={{ paddingTop: 32, paddingBottom: 96 }}>
        <nav className="breadcrumb wn-crumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <span>What&apos;s new</span>
        </nav>
        <WhatsNewView entries={getWhatsNew(slug)} scope={scope} />
      </main>
      <SiteFooter />
    </>
  );
}

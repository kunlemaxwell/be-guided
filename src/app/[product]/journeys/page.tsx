import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpenProducts, getProduct } from '@/lib/content/load';
import { getJourneys } from '@/lib/content/journeys';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { JourneyPicker } from '@/components/journeys/JourneyPicker';

type Params = { product: string };

export const dynamicParams = false;

/** Only products that have journeys get this page. */
export function generateStaticParams(): Params[] {
  return getOpenProducts().filter((p) => getJourneys(p.slug).length > 0).map((p) => ({ product: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product } = await params;
  const p = getProduct(product);
  return p ? { title: `${p.name} user journeys`, description: `Pick the kind of user you are and follow the guides you need, in order.` } : {};
}

export default async function JourneysPage({ params }: { params: Promise<Params> }) {
  const { product: slug } = await params;
  const product = getProduct(slug);
  const journeys = getJourneys(slug);
  if (!product || journeys.length === 0) notFound();
  const groups = new Map<string, typeof journeys>();
  for (const j of journeys) groups.set(j.group ?? 'Other', [...(groups.get(j.group ?? 'Other') ?? []), j]);

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main className="container section">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <span>User journeys</span>
        </nav>
        <h1 className="doc-title">{product.name} user journeys</h1>
        <p className="doc-lead">A user journey is the short list of guides one kind of user needs, in the order that makes sense. Pick yours to focus the guide, or open one to see the whole path.</p>
        <JourneyPicker
          product={product.slug}
          productName={product.name}
          journeys={journeys.map((j) => ({ slug: j.slug, title: j.title, summary: j.summary, group: j.group, inferred: j.inferred, steps: j.steps }))}
        />
        {[...groups.entries()].map(([group, items]) => (
          <section key={group} className="section section--tight" aria-labelledby={`jg-${group}`}>
            <h2 id={`jg-${group}`} className="group-title">{group}</h2>
            <ul className="journey-list">
              {items.map((j) => (
                <li key={j.slug} className="journey-card">
                  <h3 className="journey-card__title"><Link href={`/${product.slug}/journeys/${j.slug}/`}>{j.title}</Link></h3>
                  <p className="journey-card__summary">{j.summary}</p>
                  <p className="journey-card__meta">{j.steps.length} guides{j.inferred ? ' · worked out from what the product does' : ''}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>
      <SiteFooter />
    </>
  );
}

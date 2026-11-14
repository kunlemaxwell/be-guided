import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getOpenProducts, getProduct } from '@/lib/content/load';
import { getJourney, getJourneys } from '@/lib/content/journeys';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { JourneyChooseButton } from '@/components/journeys/JourneyChooseButton';

type Params = { product: string; journey: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return getOpenProducts().flatMap((p) => getJourneys(p.slug).map((j) => ({ product: p.slug, journey: j.slug })));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product, journey } = await params;
  const p = getProduct(product);
  const j = getJourney(product, journey);
  return p && j ? { title: `${j.title}: ${p.name} user journey`, description: j.summary } : {};
}

/** One user journey drawn as a path: numbered stops joined by a line, each a guide page. */
export default async function JourneyPage({ params }: { params: Promise<Params> }) {
  const { product: slug, journey: jslug } = await params;
  const product = getProduct(slug);
  const journey = getJourney(slug, jslug);
  if (!product || !journey) notFound();

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main className="container section">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <Link href={`/${product.slug}/journeys/`}>User journeys</Link>
        </nav>
        <h1 className="doc-title">{journey.title}</h1>
        <p className="doc-lead">{journey.summary}</p>
        <p className="doc-meta">
          <span>{journey.steps.length} guides</span>
          {journey.inferred ? <span>Worked out from what the product does</span> : null}
        </p>
        <div className="journeys__actions">
          <JourneyChooseButton product={product.slug} slug={journey.slug} title={journey.title} />
          <Link className="btn" href={journey.steps[0]!.href}>Start at step 1</Link>
        </div>
        <ol className="journey-map" aria-label={`${journey.title} journey`}>
          {journey.steps.map((s, i) => (
            <li key={s.id} className="journey-map__stop">
              <span className="journey-map__node" aria-hidden="true">{i + 1}</span>
              <div className="journey-map__card">
                <span className="journey-step__meta">{s.moduleTitle}</span>
                <Link className="journey-step__link" href={s.href}>{s.title}</Link>
                <span className="journey-step__why">{s.why ?? s.summary}</span>
              </div>
            </li>
          ))}
        </ol>
      </main>
      <SiteFooter />
    </>
  );
}

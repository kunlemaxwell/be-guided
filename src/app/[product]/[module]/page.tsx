import type { Metadata } from 'next';
import { orPlaceholder } from '@/lib/static-params';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule, getProduct, getOpenProducts, pageHref } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { groupBySection } from '@/lib/content/sections';
import { areaSlug } from '@/lib/content/areas';

type Params = { product: string; module: string };

/** Only the addresses built by generateStaticParams exist; anything else is a 404 (also while previewing). */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return orPlaceholder(
    getOpenProducts().flatMap((p) => p.modules.map((m) => ({ product: p.slug, module: m.slug }))),
    ['product', 'module'],
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product, module } = await params;
  const m = getModule(product, module);
  return m ? { title: m.title, description: m.summary } : {};
}

export default async function ModulePage({ params }: { params: Promise<Params> }) {
  const { product: pSlug, module: mSlug } = await params;
  const product = getProduct(pSlug);
  const mod = getModule(pSlug, mSlug);
  if (!product || !mod) notFound();

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main className="container" style={{ paddingTop: 40, paddingBottom: 96, maxWidth: 860 }}>
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <span>{mod.title}</span>
        </nav>
        <h1 className="doc-title">{mod.title}</h1>
        <p className="doc-lead">{mod.summary}</p>
        {mod.area ? (
          <Link className="area-callout" href={`/${product.slug}/area/${areaSlug(mod.area)}/`}>
            See all of {mod.area} in one view: every topic, for employees, managers and admins →
          </Link>
        ) : null}
        {mod.pages.length === 0 ? (
          <p style={{ marginTop: 32, color: 'var(--muted)' }}>Guides for this module are being written.</p>
        ) : (
          groupBySection(mod.pages).map((group) => (
            <section key={group.title ?? '_'} aria-label={group.title}>
              {group.title ? <h2 className="module-section__title" id={group.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}>{group.title}</h2> : null}
              <ul style={{ listStyle: 'none', padding: 0, margin: group.title ? '8px 0 0' : '32px 0 0' }}>
                {group.pages.map((p) => (
                  <li key={p.id} style={{ borderTop: 'var(--line-w, 1px) solid var(--line)' }}>
                    <Link href={pageHref(p)} style={{ display: 'block', padding: '18px 0', textDecoration: 'none', color: 'var(--fg)' }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 17 }}>{p.title}</span>
                      <span style={{ display: 'block', color: 'var(--muted)', fontSize: 15, marginTop: 2 }}>{p.summary}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </main>
      <SiteFooter />
    </>
  );
}

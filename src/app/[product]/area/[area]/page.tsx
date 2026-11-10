import type { Metadata } from 'next';
import { orPlaceholder } from '@/lib/static-params';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getProduct, getProducts, pageHref } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { areaSections, areasOf } from '@/lib/content/areas';
import { groupBySection } from '@/lib/content/sections';
import { monogram } from '@/components/ModuleGrid';

type Params = { product: string; area: string };

export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return orPlaceholder(
    getProducts()
      .filter((p) => p.status === 'available')
      .flatMap((p) => areasOf(p).map((a) => ({ product: p.slug, area: a.slug }))),
    ['product', 'area'],
  );
}

function findArea(productSlug: string, areaSlug: string) {
  const product = getProduct(productSlug);
  const area = product ? areasOf(product).find((a) => a.slug === areaSlug) : undefined;
  return product && area ? { product, area } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product, area } = await params;
  const found = findArea(product, area);
  return found ? { title: `${found.area.title}: everything in one view`, description: `Every ${found.area.title} guide for every role.` } : {};
}

/**
 * One view of a whole business area (e.g. HR): a row per topic (Leave,
 * Expenses, ...) and a column per role module (employee, manager, HR admin).
 */
export default async function AreaPage({ params }: { params: Promise<Params> }) {
  const { product: pSlug, area: aSlug } = await params;
  const found = findArea(pSlug, aSlug);
  if (!found) notFound();
  const { product, area } = found;
  const sections = areaSections(area);
  const unsectioned = area.modules.some((m) => m.pages.some((p) => !p.section?.trim()));
  const rows = unsectioned ? [...sections, ''] : sections;
  const total = area.modules.reduce((n, m) => n + m.pages.length, 0);
  // Role-based areas (HR: employee, manager, admin) share topics, so a topic-by-role table reads well.
  // Areas whose modules have their own topics (Accounting + Reports) show one column per module instead.
  const shared = sections.filter((t) => area.modules.filter((m) => m.pages.some((p) => p.section?.trim() === t)).length > 1);
  const byRole = sections.length > 0 && shared.length * 2 >= sections.length;

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <main className="container container--wide area-page">
        <nav className="breadcrumb" aria-label="Breadcrumb">
          <Link href={`/${product.slug}/`}>{product.name}</Link>
          <span aria-hidden="true">/</span>
          <span>{area.title}</span>
        </nav>
        <h1 className="doc-title">{area.title}: everything in one view</h1>
        <p className="doc-lead">
          {byRole
            ? `All ${total} ${area.title} guides, by topic and by who does the task. Start with the setup column, then share the employee and manager guides with your teams.`
            : `All ${total} ${area.title} guides on one page, module by module and topic by topic.`}
        </p>

        <div className="area-roles">
          {area.modules.map((m) => (
            <Link key={m.slug} href={`/${product.slug}/${m.slug}/`} className="area-role">
              <span className="card-badge" aria-hidden="true">{monogram(m.title)}</span>
              <span className="area-role__title">{m.title}</span>
              <span className="area-role__summary">{m.summary}</span>
              <span className="card-foot"><span>{m.pages.length} guides</span><span className="card-foot__arrow" aria-hidden="true">→</span></span>
            </Link>
          ))}
        </div>

        {byRole ? (
        <div className="area-table" role="table" aria-label={`${area.title} guides by topic and role`}>
            <div className="area-table__row area-table__row--head" role="row" style={{ gridTemplateColumns: `180px repeat(${area.modules.length}, 1fr)` }}>
              <span role="columnheader" className="area-table__corner">Topic</span>
              {area.modules.map((m) => <span key={m.slug} role="columnheader">{m.title}</span>)}
            </div>
            {rows.map((topic) => (
              <div key={topic || '_other'} className="area-table__row" role="row" style={{ gridTemplateColumns: `180px repeat(${area.modules.length}, 1fr)` }}>
                <span role="rowheader" className="area-table__topic">{topic || 'General'}</span>
                {area.modules.map((m) => {
                  const pages = m.pages.filter((p) => (p.section?.trim() ?? '') === topic);
                  return (
                    <div key={m.slug} role="cell" className="area-table__cell">
                      <span className="area-table__cell-label">{m.title}</span>
                      {pages.length === 0 ? (
                        <span className="area-table__none">Nothing for this role</span>
                      ) : (
                        <ul>
                          {pages.map((p) => <li key={p.id}><Link href={pageHref(p)}>{p.title}</Link></li>)}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="area-columns" style={{ gridTemplateColumns: `repeat(${area.modules.length}, minmax(0, 1fr))` }}>
            {area.modules.map((m) => (
              <section key={m.slug} className="area-column" aria-label={m.title}>
                <h2 className="area-column__title"><Link href={`/${product.slug}/${m.slug}/`}>{m.title}</Link></h2>
                {groupBySection(m.pages).map((g) => (
                  <div key={g.title ?? '_'} className="area-column__group">
                    {g.title ? <h3 className="area-column__topic">{g.title}</h3> : null}
                    <ul>
                      {g.pages.map((p) => <li key={p.id}><Link href={pageHref(p)}>{p.title}</Link></li>)}
                    </ul>
                  </div>
                ))}
              </section>
            ))}
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

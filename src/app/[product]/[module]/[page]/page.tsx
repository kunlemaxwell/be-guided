import { Fragment } from 'react';
import { groupBySection } from '@/lib/content/sections';
import type { Metadata } from 'next';
import { orPlaceholder } from '@/lib/static-params';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getModule, getPage, getProduct, getOpenProducts, getSite, pageHref, resolveGuideRef } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { GuideMarkdown, assetUrl } from '@/components/guide/GuideMarkdown';
import { GuideLink } from '@/components/guide/GuideLink';
import { BackLink } from '@/components/guide/BackLink';
import { SidebarToggle } from '@/components/guide/SidebarToggle';
import { PageActions } from '@/components/guide/PageActions';
import { VideoBlock } from '@/components/guide/VideoBlock';
import { PageFeedback } from '@/components/guide/PageFeedback';
import { CheckCircleIcon } from '@/components/Icons';
import { isSearchable } from '@/lib/search/documents';

type Params = { product: string; module: string; page: string };

/** Only the addresses built by generateStaticParams exist; anything else is a 404 (also while previewing). */
export const dynamicParams = false;

export function generateStaticParams(): Params[] {
  return orPlaceholder(
    getOpenProducts().flatMap((p) =>
      p.modules.flatMap((m) => m.pages.map((pg) => ({ product: p.slug, module: m.slug, page: pg.slug }))),
    ),
    ['product', 'module', 'page'],
  );
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { product, module, page } = await params;
  const pg = getPage(product, module, page);
  return pg ? { title: pg.title, description: pg.summary } : {};
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export default async function ArticlePage({ params }: { params: Promise<Params> }) {
  const { product: pSlug, module: mSlug, page: slug } = await params;
  const product = getProduct(pSlug);
  const mod = getModule(pSlug, mSlug);
  const page = getPage(pSlug, mSlug, slug);
  if (!product || !mod || !page) notFound();

  const idx = mod.pages.findIndex((p) => p.id === page.id);
  const prev = idx > 0 ? mod.pages[idx - 1] : undefined;
  const next = idx >= 0 && idx < mod.pages.length - 1 ? mod.pages[idx + 1] : undefined;
  const prereqs = page.prerequisites
    .map((p) => ({ ...p, target: resolveGuideRef(page.productSlug, p.page) }))
    .filter((p) => p.target !== null);
  const videoSrc = page.video ? assetUrl(page, page.video.src) : null;
  const videoPoster = page.video?.poster ? assetUrl(page, page.video.poster) ?? undefined : undefined;
  const toc = page.headings;
  const videoDisplay = page.video?.display ?? getSite().video.display;
  // Pagefind indexes only what is inside data-pagefind-body; private pages and drafts never get it.
  const searchBody = isSearchable(product, page) ? { 'data-pagefind-body': '' } : {};

  return (
    <>
      <SiteHeader product={{ slug: product.slug, name: product.name }} />
      <div className="container container--wide">
        <nav className="doc-tabs" aria-label={`${product.name} modules`} data-pagefind-ignore="all">
          {product.modules.map((m) => (
            <Link key={m.slug} href={`/${product.slug}/${m.slug}/`} aria-current={m.slug === mod.slug ? 'true' : undefined}>{m.title}</Link>
          ))}
          <Link href={`/${product.slug}/configuration-center/`}>Configuration center</Link>
        </nav>
        <div className="doc-layout">
          <nav className="doc-nav" aria-label={`${product.name} guide`}>
            <SidebarToggle controls="doc-nav-list" />
            <div id="doc-nav-list" className="doc-nav__list">
              <div className="doc-nav__group">
                <span className="doc-nav__label">{mod.title}</span>
                {groupBySection(mod.pages).map((group) => (
                  <Fragment key={group.title ?? '_'}>
                    {group.title ? <span className="doc-nav__section">{group.title}</span> : null}
                    {group.pages.map((p) => (
                      <Link key={p.id} href={pageHref(p)} aria-current={p.id === page.id ? 'page' : undefined}>{p.title}</Link>
                    ))}
                  </Fragment>
                ))}
              </div>
              <div className="doc-nav__group">
                <span className="doc-nav__label">Other modules</span>
                {product.modules.filter((m) => m.slug !== mod.slug).map((m) => (
                  <Link key={m.slug} href={`/${product.slug}/${m.slug}/`}>{m.title}</Link>
                ))}
                <Link href={`/${product.slug}/configuration-center/`}>Configuration center</Link>
                <Link href={`/${product.slug}/`}>All modules →</Link>
              </div>
            </div>
          </nav>

          <main className="doc-main">
            <div className="doc-article" {...searchBody} data-pagefind-meta={`product:${product.name}`}>
              <span hidden data-pagefind-meta={`module:${mod.title}`} />
              <div data-pagefind-ignore="all">
                <BackLink />
              </div>
              <div className="doc-top" data-pagefind-ignore="all">
                <nav className="breadcrumb" aria-label="Breadcrumb">
                  <Link href={`/${product.slug}/`}>{product.name}</Link>
                  <span aria-hidden="true">/</span>
                  <Link href={`/${product.slug}/${mod.slug}/`}>{mod.title}</Link>
                </nav>
                <PageActions moduleTitle={mod.title} />
              </div>

              <details className="doc-modmenu" data-pagefind-ignore="all">
                <summary>{mod.title}: {mod.pages.length} guides</summary>
                <ol>
                  {mod.pages.map((p) => (
                    <li key={p.id}><Link href={pageHref(p)} aria-current={p.id === page.id ? 'page' : undefined}>{p.title}</Link></li>
                  ))}
                </ol>
              </details>
              <h1 className="doc-title" data-pagefind-meta="title">{page.title}</h1>
              <p className="doc-lead">{page.summary}</p>
              <p className="doc-meta" data-pagefind-ignore="all">
                {page.audience ? <span>For {page.audience.toLowerCase()}</span> : null}
                <span>Updated {formatDate(page.updated)}</span>
                {page.changed ? (
                  <Link className="badge-changed" href="/changelog/" title={page.changed.note}>Changed in latest release</Link>
                ) : null}
              </p>

              {prereqs.length > 0 ? (
                <section className="prereqs" aria-labelledby="before-h" data-pagefind-ignore="all">
                  <h2 id="before-h" className="prereqs__title">Before you start</h2>
                  <ul>
                    {prereqs.map((p) => (
                      <li key={p.page}>
                        <span className="prereqs__check"><CheckCircleIcon size={16} /></span>
                        <span>
                          <GuideLink href={p.target!.href} title={p.target!.title} summary={p.target!.summary} fromTitle={page.title}>
                            {p.target!.title}
                          </GuideLink>
                          {p.why ? <span className="prereqs__why">{p.why}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {toc.length > 1 ? (
                <details className="toc-inline prereqs" open data-pagefind-ignore="all">
                  <summary className="prereqs__title" style={{ cursor: 'pointer' }}>In this article</summary>
                  <ol style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                    {toc.map((h) => (<li key={h.id}><a href={`#${h.id}`}>{h.text}</a></li>))}
                  </ol>
                </details>
              ) : null}

              {page.video && videoSrc ? (
                <div data-pagefind-ignore="all">
                  <VideoBlock src={videoSrc} poster={videoPoster} length={page.video.length} title={page.title} display={videoDisplay} />
                </div>
              ) : null}

              <GuideMarkdown page={page} />

              <PageFeedback pageId={page.id} />
              {prev || next ? (
                <nav className="pager" aria-label="More in this module" data-pagefind-ignore="all">
                  {prev ? (<Link href={pageHref(prev)}><small>Previous</small>{prev.title}</Link>) : <span />}
                  {next ? (<Link href={pageHref(next)}><small>Next</small>{next.title}</Link>) : <span />}
                </nav>
              ) : null}
            </div>
          </main>

          {toc.length > 0 ? (
            <aside className="doc-toc" aria-label="On this page">
              <div className="doc-toc__label">On this page</div>
              {toc.map((h) => (<a key={h.id} href={`#${h.id}`}>{h.text}</a>))}
            </aside>
          ) : <span />}
        </div>
      </div>
      <SiteFooter />
    </>
  );
}

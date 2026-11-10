import Link from 'next/link';
import { getProducts, getSite, pageHref } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { HeroSearchButton } from '@/components/search/HeroSearchButton';
import { ModuleGrid } from '@/components/ModuleGrid';
import { AskElsewhere } from '@/components/chat/AskElsewhere';
import { AddToAi } from '@/components/AddToAi';
import { connectorUrl } from '@/lib/api/config';
import { moduleGroups } from '@/lib/content/areas';
import { hasWideImage, mixedShowcase } from '@/lib/content/showcase';
import { firstImage, heroChips, productHero } from '@/lib/content/hero';
import { ProductCarousel, type CarouselSlide } from '@/components/hero/ProductCarousel';
import { ProductCollage } from '@/components/hero/ProductCollage';

/** Modules shown per product before "Show more". */
const HOME_MODULES = 3;

export default function HomePage() {
  const site = getSite();
  const products = getProducts();
  // Every available product with guides gets its own section; the first one is "featured" in the hero.
  const live = products.filter((p) => p.status === 'available' && p.modules.length > 0);
  const featured = live[0];
  const allPages = live.flatMap((p) => p.modules.flatMap((m) => m.pages));
  const showcase = mixedShowcase(live, 4, (p) => hasWideImage(p));
  // The strip under the hero lists products only; it slides only when there are many.
  const SLIDE_FROM = 7;
  const guideCount = allPages.length;
  const videoCount = allPages.filter((p) => p.video).length;
  // The home hero (Settings › Home page): chosen products in their order, else every product, ready ones first.
  const heroCfg = site.hero;
  const chosen = heroCfg.products.map((slug) => products.find((p) => p.slug === slug)).filter((p): p is (typeof products)[number] => !!p);
  const heroProducts = chosen.length ? chosen : [...products].sort((a, b) => Number(b.status === 'available') - Number(a.status === 'available'));
  const slides: CarouselSlide[] = heroProducts.map((p) => {
    const hero = p.status === 'available' ? productHero(p) : { images: [], label: p.name };
    return { slug: p.slug, name: p.name, summary: p.summary, image: hero.images[0] ?? null, label: hero.label, available: p.status === 'available' && p.modules.length > 0 };
  });
  const staticProduct = heroProducts.find((p) => p.status === 'available' && productHero(p).images.length > 0);

  return (
    <>
      <SiteHeader />
      <main>
        <section className="home-hero">
          <div className="container home-hero__inner">
            <div className="home-hero__copy">
              <span className="home-hero__logo"><img src="/brand/logo.svg" alt="" width={60} height={60} /></span>
              <h1 className="home-hero__title">{site.siteName}</h1>
              <p className="home-hero__lead">
                Every product, explained with real screens. Find the task, follow the steps, and get it right the first time.
              </p>
              <HeroSearchButton />
              <div className="home-hero__actions">
                {live.length === 1 ? (
                  <>
                    <Link className="btn btn--primary" href={`/${featured!.slug}/`}>Open the {featured!.name} guide →</Link>
                    <Link className="btn" href={`/${featured!.slug}/configuration-center/`}>Configuration center</Link>
                  </>
                ) : live.length > 1 ? (
                  <a className="btn btn--primary" href="#products-h">Choose your product ↓</a>
                ) : null}
              </div>
              <dl className="home-stats">
                <div><dt>Guides</dt><dd>{guideCount}</dd></div>
                {live.length > 1 ? <div><dt>Products</dt><dd>{live.length}</dd></div> : null}
                <div><dt>Modules</dt><dd>{live.reduce((n, p) => n + p.modules.length, 0)}</dd></div>
                <div><dt>Videos</dt><dd>{videoCount}</dd></div>
              </dl>
            </div>
            {heroCfg.animation === 'static' ? (
              staticProduct ? (
                <ProductCollage hero={productHero(staticProduct)} productName={staticProduct.name} chips={heroChips(staticProduct, productHero(staticProduct))} />
              ) : null
            ) : (
              <ProductCarousel slides={slides} mode={heroCfg.animation} seconds={heroCfg.seconds} />
            )}
          </div>
        </section>

        <div className={products.length >= SLIDE_FROM ? 'ribbon ribbon--slide' : 'ribbon'} aria-label="Products">
          <div className="ribbon__track">
            {(products.length >= SLIDE_FROM ? [...products, ...products] : products).map((p, i) => (
              <Link key={`${p.slug}-${i}`} href={p.status === 'available' ? `/${p.slug}/` : '#products-h'} className="ribbon__chip" aria-hidden={i >= products.length} tabIndex={i >= products.length ? -1 : undefined}>
                <span className={p.status === 'available' ? 'ribbon__dot' : 'ribbon__dot ribbon__dot--soon'} aria-hidden="true" />
                {p.name}
                <span className="ribbon__status">{p.status === 'available' ? 'Available' : 'Coming soon'}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="container">
          <section className="home-section" aria-labelledby="products-h">
            <header className="home-section__head">
              <span className="home-section__eyebrow">01 · Products</span>
              <h2 id="products-h" className="home-section__title">Pick your product</h2>
              <p className="home-section__lead">Each product has its own modules, guides and videos.</p>
            </header>
            <div className="product-grid">
              {products.map((p) =>
                p.status === 'available' ? (
                  <Link key={p.slug} href={`/${p.slug}/`} className="product-card product-card--feature">
                    <span className="pill pill--live">Available</span>
                    <span className="product-card__name">{p.name}</span>
                    <span className="product-card__summary">{p.summary}</span>
                    <span className="card-foot"><span>{p.modules.length} modules · {p.modules.reduce((n, m) => n + m.pages.length, 0)} guides</span><span className="card-foot__arrow" aria-hidden="true">→</span></span>
                  </Link>
                ) : (
                  <div key={p.slug} className="product-card" aria-disabled="true">
                    <span className="pill">Coming soon</span>
                    <span className="product-card__name">{p.name}</span>
                    <span className="product-card__summary">{p.summary}</span>
                  </div>
                ),
              )}
            </div>
          </section>

          {showcase.length > 1 ? (
            <section className="home-section" aria-labelledby="action-h">
              <header className="home-section__head">
                <span className="home-section__eyebrow">02 · See it in action</span>
                <h2 id="action-h" className="home-section__title">Real screens, marked up step by step</h2>
                <p className="home-section__lead">Screens from every product's live app, newest guides first. Numbered markers match the steps where a spot needs finding.</p>
              </header>
              <div className="shot-grid">
                {showcase.map(({ page: p, productName, moduleTitle }) => (
                  <Link key={p.id} href={pageHref(p)} className="shot-card">
                    <span className="shot-card__frame"><img src={firstImage(p)!} alt="" loading="lazy" /></span>
                    <span className="shot-card__tag">{productName} · {moduleTitle}</span>
                    <span className="shot-card__title">{p.title}</span>
                    <span className="shot-card__summary">{p.summary}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {live.map((p, i) => {
            const groups = moduleGroups(p);
            const ordered = groups.flatMap((g) => g.modules);
            const first = ordered.slice(0, HOME_MODULES);
            const rest = ordered.slice(HOME_MODULES);
            return (
              <section key={p.slug} className="home-section" aria-labelledby={`modules-${p.slug}`}>
                <header className="home-section__head">
                  <span className="home-section__eyebrow">{String(i + 3).padStart(2, '0')} · {p.name}</span>
                  <h2 id={`modules-${p.slug}`} className="home-section__title">
                    {live.length > 1 ? `${p.name} modules` : 'Browse by module'}
                  </h2>
                  <p className="home-section__lead">
                    {ordered.length} modules in {groups.length} areas: {groups.map((g) => g.title).join(', ')}.{' '}
                    <Link href={`/${p.slug}/configuration-center/`}>Configuration center →</Link>
                  </p>
                </header>
                <ModuleGrid product={{ ...p, modules: first }} compact />
                {rest.length > 0 ? (
                  <details className="home-modules__more">
                    <summary>
                      <span className="home-modules__show">Show {rest.length} more modules ↓</span>
                      <span className="home-modules__hide">Show fewer ↑</span>
                    </summary>
                    <ModuleGrid product={{ ...p, modules: rest }} compact />
                  </details>
                ) : null}
                <p className="home-modules__foot">
                  <Link href={`/${p.slug}/`}>Open the {p.name} guide, grouped by area →</Link>
                </p>
              </section>
            );
          })}

          <section className="home-section home-section--ai" aria-labelledby="ai-h">
            <header className="home-section__head">
              <span className="home-section__eyebrow">{String(live.length + 3).padStart(2, '0')} · Ask your AI</span>
              <h2 id="ai-h" className="home-section__title">Use the guide inside Claude or ChatGPT</h2>
              <p className="home-section__lead">
                Ask in your own assistant. It reads these guides and shows the screenshots with its answer.
              </p>
            </header>
            <AddToAi url={connectorUrl()} compact />
            <AskElsewhere />
          </section>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

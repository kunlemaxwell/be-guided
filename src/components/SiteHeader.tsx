import Link from 'next/link';
import { getSite } from '@/lib/content/load';
import { getJourneys } from '@/lib/content/journeys';
import { ModeToggle } from './ModeToggle';
import { ProductsMenu } from './ProductsMenu';
import { SiteSearch } from './search/SiteSearch';

interface Props {
  product?: { slug: string; name: string };
}

/** Site header shared by every page. Theme CSS decides how it looks. */
export function SiteHeader({ product }: Props) {
  const site = getSite();
  const hasJourneys = product ? getJourneys(product.slug).length > 0 : false;
  return (
    <header className="site-header">
      <div className="container container--wide site-header__inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/" className="brand" aria-label={`${site.siteName} home`}>
            <span className="brand__logo"><img src="/brand/logo.svg" alt="" width={24} height={24} /></span>
            <span className="brand__name">{site.siteName}</span>
          </Link>
          {product ? (
            <>
              <span className="brand__sep" aria-hidden="true">/</span>
              <Link href={`/${product.slug}/`} className="brand__product">{product.name}</Link>
            </>
          ) : null}
        </div>
        <SiteSearch />
        <nav className="header-nav" aria-label="Main">
          <ProductsMenu current={product?.slug} />
          {product && hasJourneys ? <Link href={`/${product.slug}/journeys/`}>User journeys</Link> : null}
          <Link href="/changelog/">What&apos;s new</Link>
          <ModeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const site = getSite();
  return (
    <footer className="site-footer">
      <div className="container container--wide">
        <span>© {site.siteName}</span>
        <span className="site-footer__links">
          <span>Can&apos;t find it? Ask AI or contact support.</span>
          <Link href="/connect-ai/">Use this guide in Claude or ChatGPT</Link>
          <Link href="/privacy/">Privacy</Link>
        </span>
      </div>
    </footer>
  );
}

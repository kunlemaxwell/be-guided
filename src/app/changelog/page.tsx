import type { Metadata } from 'next';
import Link from 'next/link';
import { getOpenProducts } from '@/lib/content/load';
import { getWhatsNew } from '@/lib/content/whats-new';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { formatDate } from '@/lib/whats-new/group';
import { whatsNewAllHref, whatsNewHref } from '@/lib/whats-new/href';

export const metadata: Metadata = { title: "What's new", description: 'Choose a product to see what was released in it, or look at every product together.' };

/**
 * What's new from the main page: first ask which product. One product opens that
 * product's own page; "All products" opens every product's changes together.
 * (Inside a product, the header's "What's new" skips this and opens that product's page.)
 */
export default function ChangelogPage() {
  const products = getOpenProducts().map((p) => {
    const list = getWhatsNew(p.slug);
    return { slug: p.slug, name: p.name, summary: p.summary, count: list.length, latest: list[0]?.date };
  });
  const total = products.reduce((n, p) => n + p.count, 0);
  const latest = products.map((p) => p.latest ?? '').sort().pop() ?? '';
  const tile = (href: string, name: string, summary: string, count: number, last?: string) => (
    <li key={href}>
      <Link className="wn-pick__tile" href={href}>
        <span className="wn-pick__name">{name}</span>
        <span className="wn-pick__sum">{summary}</span>
        <span className="wn-pick__meta">{count === 0 ? 'Nothing released yet' : `${count} ${count === 1 ? 'change' : 'changes'}${last ? ` · latest ${formatDate(last)}` : ''}`}</span>
      </Link>
    </li>
  );
  return (
    <>
      <SiteHeader />
      <main className="container container--wide" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <div className="wn wn-pick">
          <h1 className="doc-title">What&apos;s new</h1>
          <p className="doc-lead">Choose a product to see what was released in it, or look at every product together.</p>
          <ul className="wn-pick__list">
            {tile(whatsNewAllHref, 'All products', 'Every product’s changes together, newest first.', total, latest || undefined)}
            {products.map((p) => tile(whatsNewHref(p.slug), p.name, p.summary, p.count, p.latest))}
          </ul>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

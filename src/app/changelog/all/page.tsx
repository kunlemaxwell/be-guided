import type { Metadata } from 'next';
import { getOpenProducts } from '@/lib/content/load';
import { getAllWhatsNew } from '@/lib/content/whats-new';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { WhatsNewView } from '@/components/whatsnew/WhatsNewView';

export const metadata: Metadata = { title: "What's new in all products", description: 'What was released in every product, by product, date, module or user, with a link to how to use each one.' };

/** Every product's changes together. Product is one of the ways to group and filter here, and only here. */
export default function AllProductsWhatsNewPage() {
  const products = getOpenProducts().map((p) => ({ slug: p.slug, name: p.name }));
  return (
    <>
      <SiteHeader />
      <main className="container container--wide" style={{ paddingTop: 48, paddingBottom: 96 }}>
        <WhatsNewView entries={getAllWhatsNew()} products={products} />
      </main>
      <SiteFooter />
    </>
  );
}

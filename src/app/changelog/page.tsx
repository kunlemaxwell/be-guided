import type { Metadata } from 'next';
import Link from 'next/link';
import { getAllPages, pageHref } from '@/lib/content/load';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = { title: "What's new" };

/**
 * PROTOTYPE: lists pages that carry a `changed` note. Step 2 replaces this
 * with release entries (content/products/<p>/changelog/*.md) that each link
 * to the guide pages they updated.
 */
export default function ChangelogPage() {
  const changed = getAllPages()
    .filter((p) => p.changed)
    .sort((a, b) => (b.changed?.date ?? '').localeCompare(a.changed?.date ?? ''));
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 48, paddingBottom: 96, maxWidth: 860 }}>
        <h1 className="doc-title">What&apos;s new</h1>
        <p className="doc-lead">Every change to the guides, with links to the pages that were updated.</p>
        {changed.length === 0 ? (
          <p style={{ marginTop: 32, color: 'var(--muted)' }}>No changes recorded yet.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, marginTop: 32 }}>
            {changed.map((p) => (
              <li key={p.id} style={{ borderTop: 'var(--line-w, 1px) solid var(--line)', padding: '16px 0' }}>
                <Link href={pageHref(p)}>{p.title}</Link>
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>{p.changed?.date} · {p.changed?.note}</div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </>
  );
}

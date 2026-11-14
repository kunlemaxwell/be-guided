import type { Metadata } from 'next';
import { getAllWhatsNew } from '@/lib/content/whats-new';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { WhatsNewView } from '@/components/whatsnew/WhatsNewView';

export const metadata: Metadata = { title: "What's new", description: 'What was released, by date, module or user, with a link to how to use each one.' };

/**
 * What's new: release entries from content/products/<product>/whats-new.json.
 * A date is the day readers got the feature (the day it reached production).
 */
export default function ChangelogPage() {
  const entries = getAllWhatsNew();
  return (
    <>
      <SiteHeader />
      <main className="container" style={{ paddingTop: 48, paddingBottom: 96, maxWidth: 960 }}>
        <h1 className="doc-title">What&apos;s new</h1>
        <p className="doc-lead">What we released, newest first. Select How to use to see the feature in the guide, with its screenshots and steps.</p>
        <WhatsNewView entries={entries} />
      </main>
      <SiteFooter />
    </>
  );
}

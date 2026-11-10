import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { getSite } from '@/lib/content/load';

export const metadata: Metadata = {
  title: 'Privacy',
  description: 'What this guide and its admin collect, why, and who to contact.',
};

/**
 * Privacy notice for the public guide and the admin sign-in (Google needs a
 * public privacy page before "Sign in with Google" can go live). Keep it in
 * step with what the site really collects: PageFeedback, Ask AI, Access sign-in.
 */
/** Contact address shown on this page (set NEXT_PUBLIC_CONTACT_EMAIL when building the site). */
const CONTACT = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || '';

export default function PrivacyPage() {
  const site = getSite();
  return (
    <>
      <SiteHeader />
      <main className="container connect-page">
        <h1 className="doc-title">Privacy</h1>
        <p className="doc-lead">
          {site.siteName} is run by the people who publish this guide. This page explains what we collect when you read the guide or
          sign in to its admin, and why.
        </p>
        <div className="doc-body">
          <h2 id="reading">Reading the guide</h2>
          <p>You can read every public guide page without an account. We do not use advertising or tracking cookies.</p>

          <h2 id="feedback">&ldquo;Was this helpful?&rdquo;</h2>
          <p>
            When you vote at the end of a page, we store your vote, the page, and a random number kept in your browser so the same browser is counted once. If you
            add a comment or an email address, we store those too and use the email only to reply to you.
          </p>

          <h2 id="ask-ai">Ask AI</h2>
          <p>
            If you use Ask AI, your question and the guide pages that answer it are sent to Anthropic&apos;s Claude service to write the answer. Do not include
            passwords or other private details in a question.
          </p>

          <h2 id="sign-in">Signing in to the admin</h2>
          <p>
            Only people invited by the guide&apos;s owners can sign in to the admin. Sign-in is handled by Cloudflare Access, with a one-time email code, a
            Cloudflare account or Google. From Google we receive only your name and email address, and we use them only to check that you were invited and to
            record who made each change in the admin&apos;s history. We do not read your Google data or post anything for you.
          </p>

          <h2 id="sharing">Sharing and keeping</h2>
          <p>
            We do not sell or share this information. It is stored with Cloudflare, which hosts the guide, and GitHub, which keeps the guide pages. We keep it for
            as long as the guide needs it; ask us and we will delete what we hold about you.
          </p>

          <h2 id="contact">Contact</h2>
          <p>
            {CONTACT ? (
              <>Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</>
            ) : (
              <>Questions or requests: contact the people who run this guide.</>
            )}
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

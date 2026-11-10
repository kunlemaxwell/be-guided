import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { SiteFooter, SiteHeader } from '@/components/SiteHeader';
import { ConnectorUrl } from '@/components/ConnectorUrl';
import { AddToAi, CONNECTOR_NAME } from '@/components/AddToAi';
import { connectorUrl } from '@/lib/api/config';
import { getSite } from '@/lib/content/load';

export const metadata: Metadata = {
  title: 'Connect your AI',
  description: 'Add this guide to Claude or ChatGPT, so your AI assistant can answer from the guide pages.',
};


const EXAMPLES = [
  'How do I set up taxes in Acme Books?',
  'Walk me through creating an invoice, step by step.',
  'What do I need to set up before I create a purchase order?',
  'What gets posted to the accounts when an invoice is approved?',
  'Which guides are there for Procurement?',
];

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="steps connect-steps">
      {items.map((item, i) => (
        <li key={i} className="step">
          <div className="step__rail" aria-hidden="true">
            <span className="step__num" />
            <span className="step__line" />
          </div>
          <div className="step__body">{item}</div>
        </li>
      ))}
    </ol>
  );
}

/**
 * "Connect your AI": how to add this guide to Claude or ChatGPT as a
 * connector (the guide API's /api/v1/mcp endpoint). Written for readers who
 * aren't technical. Menu names come from Claude's and OpenAI's help pages
 * (checked 3 Nov 2026) and may change.
 */
export default function ConnectAiPage() {
  const site = getSite();
  const url = connectorUrl();
  return (
    <>
      <SiteHeader />
      <main className="container connect-page">
        <h1 className="doc-title">Connect your AI</h1>
        <p className="doc-lead">
          Use Claude or ChatGPT? Add this guide to it, and your assistant can answer questions straight from these pages, with links to the right step.
        </p>

        <div className="doc-body">
          <h2 id="what-it-does">What it does</h2>
          <p>
            Once it&apos;s connected, you can ask your AI assistant things like <em>&ldquo;How do I set up taxes?&rdquo;</em> in your normal chat. It looks the answer up in {site.siteName}, explains it in its own words, and gives you the link to the page, so you can see the screenshots and the walkthrough video too.
          </p>

          <h2 id="add">Add it in one click</h2>
          <AddToAi url={url} />

          <details className="connect-manual">
            <summary>Prefer to do it by hand? Step-by-step instructions</summary>

          <h2 id="address">1. Copy the connector address</h2>
          <ConnectorUrl url={url} />

          <h2 id="claude">2a. Add it to Claude</h2>
          <Steps
            items={[
              <>In Claude (on the web or in the Claude desktop app), open <strong>Customize</strong>, then <strong>Connectors</strong>.</>,
              <>Select <strong>+ Add</strong>, then <strong>Add custom connector</strong>.</>,
              <>Give it a name, for example <strong>{CONNECTOR_NAME}</strong>, and paste the connector address into the server URL box.</>,
              <>Under <strong>Authentication</strong>, choose <strong>No sign in</strong> (the guide is public, so there is nothing to sign in to). Select <strong>Add</strong>.</>,
              <>In a chat, select the <strong>+</strong> button at the lower left, then <strong>Connectors</strong>, and switch the guide on. Now ask your question.</>,
            ]}
          />
          <p className="connect-note">
            On a Claude Team or Enterprise plan, an owner adds the connector once for everyone under <strong>Organization settings</strong> › <strong>Connectors</strong> (<strong>Add</strong> › <strong>Custom</strong> › <strong>Web</strong>); you then select <strong>Connect</strong> next to it under <strong>Customize</strong> › <strong>Connectors</strong>. The Free plan allows one custom connector.
          </p>

          <h2 id="chatgpt">2b. Add it to ChatGPT</h2>
          <Steps
            items={[
              <>Open ChatGPT on the web (chatgpt.com) and go to <strong>Plugins</strong>.</>,
              <>Select the <strong>+</strong> button, then <strong>Add custom MCP server</strong>.</>,
              <>Give it a name, for example <strong>{CONNECTOR_NAME}</strong>. Under <strong>Connection</strong>, paste the connector address as the <strong>Server URL</strong>.</>,
              <>For authentication, choose <strong>No authentication</strong>.</>,
              <>Read the warning, confirm it, then select <strong>Create as a plugin</strong> and install it.</>,
              <>In a chat, type <strong>@</strong> and pick the guide, then ask your question.</>,
            ]}
          />
          <p className="connect-note">
            In a ChatGPT Business or Enterprise workspace, an admin may need to allow custom MCP servers first. Some ChatGPT accounts still show this under <strong>Settings</strong> › <strong>Connectors</strong> (or <strong>Apps</strong>), with <strong>Developer mode</strong> switched on under <strong>Advanced settings</strong>.
          </p>

          <aside className="callout" data-kind="note">
            <span className="callout__label">Note</span>
            <p>Claude and ChatGPT change their menus from time to time, so the names may differ slightly from the ones above. Look for &ldquo;connectors&rdquo;, &ldquo;plugins&rdquo; or &ldquo;custom MCP server&rdquo;.</p>
          </aside>
          </details>

          <h2 id="what-it-sees">What the AI can and can&apos;t see</h2>
          <ul>
            <li><strong>It can see</strong> the same guide pages anyone can open on this site: the steps, screenshots, troubleshooting tips and video links.</li>
            <li><strong>It can&apos;t see</strong> draft pages, private pages or private products, and it never sees your company&apos;s own records in Acme Books or any other app.</li>
            <li><strong>It can&apos;t change anything.</strong> The connector only reads the guide. It has no sign-in and no access to your account.</li>
            <li>Your questions are handled by Claude or ChatGPT under their own privacy terms. The guide only receives the search words and page names your assistant looks up, and doesn&apos;t keep them.</li>
          </ul>

          <h2 id="examples">Questions to try</h2>
          <ul className="connect-examples">
            {EXAMPLES.map((q) => (
              <li key={q}>&ldquo;{q}&rdquo;</li>
            ))}
          </ul>
          <p>
            Prefer not to connect anything? Use <strong>Ask AI</strong> at the top of any page, or <Link href="/">browse the guides</Link>.
          </p>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}

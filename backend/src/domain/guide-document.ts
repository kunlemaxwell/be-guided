/**
 * Guide page markdown → clean markdown an AI model can read and quote (the
 * MCP connector's `fetch`). Pure: links are resolved through callbacks, so
 * this never decides on its own whether a page is public.
 *
 * What changes:
 *   ::::step{title="X"}      → "### Step n: X" + the step's direct link (#step-x, same anchor as the site)
 *   :::legend                → "Key to the numbered marks on the screenshot above:"
 *   :::note|tip|warning      → "**Note:**" / "**Tip:**" / "**Important:**"
 *   ::postings{to label}     → a link to that section of the postings page
 *   ![alt](images/a.webp)    → an absolute screenshot URL
 *   [t](guide:module/page)   → an absolute link, or plain text when the page isn't public
 *   other ::: fences         → dropped (their text is kept)
 */
// Relative import (no '@/' alias): the site and the backend share the anchor rule.
import { slugifyHeading, stepAnchor } from '../../../src/lib/content/headings';

export interface LinkTarget {
  id: string;
  title: string;
  /** Absolute page URL (with #anchor when the reference had one). */
  url: string;
}

export interface GuideTextContext {
  /** Absolute URL of the page itself, ending in "/". */
  pageUrl: string;
  /** Absolute site address without a trailing slash (for "/…" links). */
  siteUrl: string;
  /** Module file ("images/a.webp") → absolute URL, or null if it isn't a module file. */
  assetUrl(src: string): string | null;
  /** Guide reference → target, or null when it isn't a public page (the link becomes plain text). */
  resolveRef(ref: string): LinkTarget | null;
}

export interface GuideStep {
  number: number;
  title: string;
  url: string;
}

export interface GuideText {
  markdown: string;
  steps: GuideStep[];
  screenshots: string[];
  /** Public pages this page links to (guide: links and postings), in order, without duplicates. */
  linked: LinkTarget[];
}

const CALLOUT: Record<string, string> = { note: 'Note', tip: 'Tip', warning: 'Important' };

function attr(attrs: string, name: string): string | null {
  return new RegExp(`${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;
}

export function guideMarkdownToText(markdown: string, ctx: GuideTextContext): GuideText {
  const steps: GuideStep[] = [];
  const screenshots: string[] = [];
  const linked = new Map<string, LinkTarget>();
  const out: string[] = [];
  let inFence = false;

  const link = (target: LinkTarget | null, text: string): string => {
    if (!target) return text;
    if (!linked.has(target.id)) linked.set(target.id, target);
    return `[${text}](${target.url})`;
  };

  const inline = (line: string): string =>
    line
      // Images first, so the link rule below doesn't see them.
      .replace(/!\[([^\]]*)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/g, (_m, alt: string, src: string) => {
        const url = ctx.assetUrl(src);
        if (!url) return alt ? `(Screenshot: ${alt})` : '';
        screenshots.push(url);
        return `![Screenshot: ${alt || 'screen'}](${url})`;
      })
      .replace(/(?<!!)\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, text: string, href: string) => {
        if (href.startsWith('guide:')) return link(ctx.resolveRef(href), text);
        if (href.startsWith('#')) return `[${text}](${ctx.pageUrl}${href})`;
        if (href.startsWith('/')) return `[${text}](${ctx.siteUrl}${href})`;
        if (/^(https?:|mailto:)/i.test(href)) return `[${text}](${href})`;
        return text;
      });

  for (const raw of markdown.split('\n')) {
    const line = raw.trimEnd();
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      out.push(line);
      continue;
    }
    if (inFence) {
      out.push(line);
      continue;
    }
    const trimmed = line.trim();
    const container = /^:{3,}([a-z]+)(\{[^}]*\})?\s*$/i.exec(trimmed);
    if (container) {
      const [, name = '', attrs = ''] = container;
      if (name === 'step') {
        const title = attr(attrs, 'title') ?? `Step ${steps.length + 1}`;
        const step = { number: steps.length + 1, title, url: `${ctx.pageUrl}#${stepAnchor(title)}` };
        steps.push(step);
        out.push('', `### Step ${step.number}: ${title}`, `Direct link to this step: ${step.url}`, '');
      } else if (name === 'legend') {
        out.push('', 'Key to the numbered marks on the screenshot above:');
      } else if (CALLOUT[name]) {
        out.push('', `**${CALLOUT[name]}:**`);
      }
      continue;
    }
    if (/^:{3,}\s*$/.test(trimmed)) {
      out.push('');
      continue;
    }
    const leaf = /^::([a-z]+)(\{[^}]*\})?\s*$/i.exec(trimmed);
    if (leaf) {
      const [, name = '', attrs = ''] = leaf;
      if (name === 'postings') {
        const to = attr(attrs, 'to');
        const label = attr(attrs, 'label') ?? 'See what gets posted';
        out.push(to ? link(ctx.resolveRef(`guide:${to}`), label) : label);
      }
      continue;
    }
    const h2 = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (h2?.[1]) {
      out.push(`## ${inline(h2[1])}`, `Direct link to this section: ${ctx.pageUrl}#${slugifyHeading(h2[1])}`);
      continue;
    }
    out.push(inline(line));
  }

  return {
    markdown: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    steps,
    screenshots: [...new Set(screenshots)],
    linked: [...linked.values()],
  };
}

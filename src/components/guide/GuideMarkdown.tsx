import fs from 'node:fs';
import path from 'node:path';
import type { ComponentProps, ReactNode } from 'react';
import ReactMarkdown, { defaultUrlTransform, type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
// Relative imports (not '@/…') so this renders under vitest, which has no path aliases.
import { config } from '../../lib/config';
import { getPage, isExcludedRef, resolveGuideRef } from '../../lib/content/load';
import { slugifyHeading, stepAnchor } from '../../lib/content/headings';
import { remarkGuide } from '../../lib/content/remark-guide';
import type { GuidePage } from '../../types/content';
import { GuideLink } from './GuideLink';
import { ZoomImage } from './ZoomImage';

/** Plain text of a React children tree (for heading ids). */
function textOf(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(textOf).join('');
  if (children && typeof children === 'object' && 'props' in children) {
    return textOf((children as { props: { children?: ReactNode } }).props.children);
  }
  return '';
}

/** On-screen width recorded by scripts/annotate.mjs for a marked-up screenshot. */
function displayWidth(page: GuidePage, src: string): number | undefined {
  const rel = src.replace(/^\.\//, '');
  const file = path.join(config.contentDir, 'products', page.productSlug, page.moduleSlug, path.dirname(rel), '_sizes.json');
  if (!fs.existsSync(file)) return undefined;
  const sizes = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
  const w = sizes[path.basename(rel)];
  return typeof w === 'number' ? w : undefined;
}

/** Public URL for an image referenced from a page, or null if the file isn't there yet. */
export function assetUrl(page: GuidePage, src: string): string | null {
  if (/^https?:\/\//.test(src)) return src;
  const rel = src.replace(/^\.\//, '');
  const file = path.join(config.contentDir, 'products', page.productSlug, page.moduleSlug, rel);
  if (!fs.existsSync(file)) return null;
  return `/_content/${page.productSlug}/${page.moduleSlug}/${rel}`;
}

/**
 * The opening of one "## …" section of a page — its lead paragraph and first
 * table — used as the hover card of a "See expected postings" link. Read from
 * the postings page itself, so the card and the page can never disagree.
 */
function sectionPreview(pageId: string, hash: string): string | null {
  const [product, mod, slug] = pageId.split('/');
  if (!product || !mod || !slug) return null;
  const page = getPage(product, mod, slug);
  if (!page) return null;
  const lines = page.body.split('\n');
  const start = lines.findIndex((l) => l.startsWith('## ') && slugifyHeading(l.slice(3).trim()) === hash);
  if (start < 0) return null;
  const out: string[] = [];
  let inTable = false;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith('## ')) break;
    const isRow = line.trim().startsWith('|');
    if (inTable && !isRow) break; // first table done
    if (isRow) inTable = true;
    out.push(line);
  }
  return out.join('\n').trim() || null;
}

const CALLOUT_LABEL: Record<string, string> = { note: 'Note', tip: 'Tip', warning: 'Important' };

export function GuideMarkdown({ page }: { page: GuidePage }) {
  const components = {
    h2: ({ children }: ComponentProps<'h2'>) => <h2 id={slugifyHeading(textOf(children))}>{children}</h2>,
    a: ({ href = '', children }: ComponentProps<'a'>) => {
      if (href.startsWith('guide:')) {
        const target = resolveGuideRef(page.productSlug, href);
        // A page left out of this build (private or draft): plain text, no link.
        if (!target && isExcludedRef(page.productSlug, href)) return <>{children}</>;
        if (!target) return <span className="glink glink--broken" title="This page is not available yet">{children}</span>;
        return (
          <GuideLink href={target.href} title={target.title} summary={target.summary} fromTitle={page.title}>
            {children}
          </GuideLink>
        );
      }
      const external = /^https?:\/\//.test(href);
      return (
        <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {children}
        </a>
      );
    },
    img: ({ src = '', alt = '' }: ComponentProps<'img'>) => {
      const url = typeof src === 'string' ? assetUrl(page, src) : null;
      if (!url) {
        return (
          <span className="shot shot--missing" role="img" aria-label={`Screenshot pending: ${alt}`}>
            <span className="shot__ph">Screenshot pending — {alt}</span>
          </span>
        );
      }
      return (
        <span className="shot">
          <ZoomImage src={url} alt={alt} width={typeof src === 'string' ? displayWidth(page, src) : undefined} />
        </span>
      );
    },
    'guide-postings': (props: { 'data-to'?: string; 'data-label'?: string }) => {
      const to = props['data-to'] ?? '';
      const [ref = '', hash = ''] = to.split('#');
      const target = resolveGuideRef(page.productSlug, ref);
      const label = props['data-label'] || 'See expected postings';
      if (!target && isExcludedRef(page.productSlug, ref)) return null;
      if (!target) return <p className="glink glink--broken">{label}</p>;
      const preview = hash ? sectionPreview(target.id, hash) : null;
      return (
        <div className="postings-link">
          <GuideLink
            href={target.href}
            hash={hash ? `#${hash}` : undefined}
            title={label.replace(/^See /, '').replace(/^./, (c) => c.toUpperCase())}
            summary={target.summary}
            fromTitle={page.title}
            variant="postings"
            preview={preview ? (
              <div className="postings-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{preview}</ReactMarkdown>
              </div>
            ) : undefined}
          >
            <span aria-hidden="true" className="postings-link__icon">⇄</span> {label}
          </GuideLink>
        </div>
      );
    },
    'guide-legend': ({ children }: { children?: ReactNode }) => <div className="legend">{children}</div>,
    'guide-steps': ({ children }: { children?: ReactNode }) => <ol className="steps">{children}</ol>,
    'guide-step': (props: { children?: ReactNode; 'data-title'?: string }) => (
      <li className="step">
        <div className="step__rail" aria-hidden="true">
          <span className="step__num" />
          <span className="step__line" />
        </div>
        <div className="step__body">
          <h3 className="step__title" id={props['data-title'] ? stepAnchor(props['data-title']) : undefined}>{props['data-title']}</h3>
          {props.children}
        </div>
      </li>
    ),
    'guide-callout': (props: { children?: ReactNode; 'data-kind'?: string }) => (
      <aside className="callout" data-kind={props['data-kind']}>
        <span className="callout__label">{CALLOUT_LABEL[props['data-kind'] ?? 'note'] ?? 'Note'}</span>
        {props.children}
      </aside>
    ),
  } as unknown as Components;

  return (
    <div className="doc-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkDirective, remarkGuide]}
        urlTransform={(url) => (url.startsWith('guide:') ? url : defaultUrlTransform(url))}
        components={components}
      >
        {page.body}
      </ReactMarkdown>
    </div>
  );
}

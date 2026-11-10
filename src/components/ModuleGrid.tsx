import Link from 'next/link';
import { pageHref } from '@/lib/content/load';
import { groupBySection } from '@/lib/content/sections';
import type { Product } from '@/types/content';

const MAX_LINKS = 4;

/** Two-letter badge for a card, e.g. "Managers and approvers" -> "MA". */
export function monogram(title: string): string {
  const words = title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !['and', 'of', 'the', 'my'].includes(w.toLowerCase()));
  return (words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2)).toUpperCase();
}

/**
 * Modules of a product. A module with sections lists every section (with how
 * many guides it has); otherwise its first few guides. Each card ends with
 * "All N guides" so nothing in a module is hidden. `compact` shows at most
 * four topics, so cards in a row stay short.
 */
export function ModuleGrid({ product, compact = false }: { product: Product; compact?: boolean }) {
  return (
    <div className={compact ? 'module-grid module-grid--compact' : 'module-grid'}>
      {product.modules.map((m) => {
        const href = `/${product.slug}/${m.slug}/`;
        const sections = groupBySection(m.pages).filter((s) => s.title);
        return (
          <div key={m.slug} className="module-item">
            <span className="card-badge" aria-hidden="true">{monogram(m.title)}</span>
            <Link className="module-item__title" href={href}>{m.title}</Link>
            <p className="module-item__summary">{m.summary}</p>
            {sections.length > 1 ? (
              <ul className="module-item__links">
                {sections.slice(0, compact ? MAX_LINKS : undefined).map((s) => (
                  <li key={s.title}>
                    <Link className="topic-row" href={`${href}#${encodeURIComponent((s.title ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`}>
                      <span>{s.title}</span>
                      <span className="topic-row__count">{s.pages.length}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : m.pages.length > 0 ? (
              <ul className="module-item__links">
                {m.pages.slice(0, MAX_LINKS).map((p) => (
                  <li key={p.id}><Link href={pageHref(p)}>{p.title}</Link></li>
                ))}
              </ul>
            ) : null}
            {m.pages.length > 0 ? (
              <Link className="card-foot module-item__all" href={href}>
                <span>
                  All {m.pages.length} guides
                  {compact && sections.length > MAX_LINKS ? ` · ${sections.length - MAX_LINKS} more topics` : ''}
                </span><span className="card-foot__arrow" aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

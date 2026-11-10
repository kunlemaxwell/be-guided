import { useId, useState, type ReactNode } from 'react';
import { Icon } from './Icon';

interface AccordionProps {
  /** Heading of the section, e.g. "Colours". */
  title: string;
  /** One short line on what is set inside, shown on the closed header, e.g. "Theme colours" or "3 custom colours". */
  summary?: string;
  /** Closed unless asked: people open only the section they need. */
  defaultOpen?: boolean;
  /** Heading level of the title inside the page outline. */
  level?: 2 | 3 | 4;
  children: ReactNode;
}

/**
 * A section that opens and closes (WAI-ARIA accordion): a heading with a
 * button that has `aria-expanded`/`aria-controls` (named by the title, with
 * the summary as its description), and a labelled region.
 * Closed by default. The content stays mounted while closed (hidden), so
 * nothing typed inside is lost.
 */
export function Accordion({ title, summary, defaultOpen = false, level = 3, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const buttonId = `${id}-button`;
  const regionId = `${id}-region`;
  const titleId = `${id}-title`;
  const summaryId = `${id}-summary`;
  const Heading = `h${level}` as const;
  return (
    <div className={`accordion${open ? ' accordion--open' : ''}`}>
      <Heading className="accordion__heading">
        <button
          type="button"
          id={buttonId}
          className="accordion__button"
          aria-expanded={open}
          aria-controls={regionId}
          aria-labelledby={titleId}
          aria-describedby={summary ? summaryId : undefined}
          onClick={() => setOpen((o) => !o)}
        >
          <span className="accordion__title" id={titleId}>
            {title}
          </span>
          {summary ? (
            <span className="accordion__summary" id={summaryId}>
              {summary}
            </span>
          ) : null}
          <span className="accordion__chevron">
            <Icon name="chevronDown" />
          </span>
        </button>
      </Heading>
      <div id={regionId} role="region" aria-labelledby={titleId} className="accordion__body" hidden={!open}>
        {children}
      </div>
    </div>
  );
}

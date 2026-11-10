interface Props {
  pageNumber: number;
  totalPages: number;
  totalCount: number;
  onChange: (pageNumber: number) => void;
  /** e.g. "entries" → "41 entries". */
  noun?: string;
  disabled?: boolean;
}

/** Previous / next for server-side paged lists, with "Page 2 of 5 · 93 entries". */
export function Pagination({ pageNumber, totalPages, totalCount, onChange, noun = 'items', disabled }: Props) {
  return (
    <nav className="pagination" aria-label="Pages">
      <span className="muted small" aria-live="polite">
        Page {pageNumber} of {Math.max(1, totalPages)} · {totalCount} {totalCount === 1 ? noun.replace(/s$/, '') : noun}
      </span>
      <div className="pagination__buttons">
        <button type="button" className="btn btn--small" disabled={disabled || pageNumber <= 1} onClick={() => onChange(pageNumber - 1)}>
          ← Newer
        </button>
        <button type="button" className="btn btn--small" disabled={disabled || pageNumber >= totalPages} onClick={() => onChange(pageNumber + 1)}>
          Older →
        </button>
      </div>
    </nav>
  );
}

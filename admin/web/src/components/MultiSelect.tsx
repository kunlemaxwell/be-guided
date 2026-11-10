import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';

export interface MultiSelectOption {
  value: string;
  label: string;
  /** Small text after the label, e.g. "Private". */
  note?: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  /** Chosen values. When `allSelected` is true this is ignored. */
  value: string[];
  /** "All products" — also covers ones added later. */
  allSelected: boolean;
  onChange: (next: { value: string[]; allSelected: boolean }) => void;
  /** Label of the "all" choice, e.g. "All products". */
  allLabel: string;
  placeholder?: string;
}

/**
 * A dropdown with checkboxes, a search box and an "All …" choice. Scales to
 * dozens of options. Escape or a click outside closes it; focus returns to
 * the button.
 */
export function MultiSelect({ label, options, value, allSelected, onChange, allLabel, placeholder = 'Choose…' }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const searchBox = useRef<HTMLInputElement>(null);
  const id = useId();
  const chosen = useMemo(() => new Set(value), [value]);

  useEffect(() => {
    if (!open) return;
    searchBox.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const filtered = options.filter((o) => o.label.toLowerCase().includes(search.trim().toLowerCase()));
  const summary = allSelected
    ? allLabel
    : value.length === 0
      ? placeholder
      : value.length <= 2
        ? options.filter((o) => chosen.has(o.value)).map((o) => o.label).join(', ')
        : `${value.length} chosen`;

  const toggle = (v: string) => {
    const next = new Set(allSelected ? options.map((o) => o.value) : value);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange({ value: options.map((o) => o.value).filter((x) => next.has(x)), allSelected: false });
  };

  return (
    <div className="multi" ref={root} onKeyDown={(e) => {
      if (e.key === 'Escape' && open) {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    }}>
      <span className="multi__label" id={`${id}-label`}>
        {label}
      </span>
      <button
        ref={button}
        type="button"
        className={`multi__button${value.length === 0 && !allSelected ? ' multi__button--empty' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((o) => !o)}
      >
        <span id={`${id}-value`}>{summary}</span>
        <Icon name="chevronDown" size={16} />
      </button>
      {open ? (
        <div className="multi__panel" role="dialog" aria-label={label}>
          <div className="multi__search">
            <Icon name="search" size={16} />
            <input ref={searchBox} type="search" aria-label={`Search ${label.toLowerCase()}`} placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="check multi__all">
            <input type="checkbox" checked={allSelected} onChange={() => onChange({ value: allSelected ? [] : value, allSelected: !allSelected })} />
            {allLabel}
          </label>
          <div className="multi__options" role="group" aria-label={label}>
            {filtered.length === 0 ? <p className="muted small multi__none">Nothing matches “{search}”.</p> : null}
            {filtered.map((o) => (
              <label key={o.value} className="check multi__option">
                <input type="checkbox" checked={allSelected || chosen.has(o.value)} onChange={() => toggle(o.value)} />
                <span>{o.label}</span>
                {o.note ? <span className="muted small">{o.note}</span> : null}
              </label>
            ))}
          </div>
          <div className="multi__foot">
            <span className="muted small">{allSelected ? `All ${options.length}` : `${value.length} of ${options.length}`} chosen</span>
            <button type="button" className="btn btn--small" onClick={() => {
              setOpen(false);
              button.current?.focus();
            }}>
              Done
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

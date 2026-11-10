import { useId, useRef } from 'react';
import { Icon } from './Icon';

interface Props {
  label: string;
  /** What is stored, e.g. "media/walkthrough.mp4" (empty = nothing chosen). */
  value: string;
  /** Link that opens the chosen file (null when it can't be opened, e.g. missing). */
  href: string | null;
  /** File types offered by the browser's picker, e.g. ".mp4,.webm". */
  accept: string;
  onPick: (file: File) => void;
  onClear?: () => void;
  busy?: boolean;
  /** Status under the field, e.g. "File not on this computer". */
  status?: { tone: 'ok' | 'warn'; text: string } | null;
  hint?: string;
  error?: string;
  /** Existing files the person can pick instead of uploading. */
  existing?: { src: string; name: string }[];
  onChooseExisting?: (src: string) => void;
}

/**
 * "Choose file…" instead of typing a path: opens the computer's file picker,
 * hands the file to `onPick` (which uploads it), then shows the chosen file
 * as a clickable link. Optionally offers files already in the module.
 */
export function FilePicker({ label, value, href, accept, onPick, onClear, busy, status, hint, error, existing, onChooseExisting }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  const name = value ? value.split('/').pop() : '';
  return (
    <div className={`field file-picker${error ? ' field--error' : ''}`} role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className="file-picker__label">
        {label}
      </span>
      <div className="file-picker__row">
        {value ? (
          href ? (
            <a className="file-picker__file" href={href} target="_blank" rel="noreferrer" title={value}>
              <Icon name="file" size={16} />
              {name}
              <Icon name="external" size={14} />
            </a>
          ) : (
            <span className="file-picker__file file-picker__file--plain" title={value}>
              <Icon name="file" size={16} />
              {name}
            </span>
          )
        ) : (
          <span className="muted small">Nothing chosen yet.</span>
        )}
        <button type="button" className="btn btn--small" disabled={busy} onClick={() => input.current?.click()} aria-describedby={hint || error ? `${id}-hint` : undefined}>
          {busy ? 'Uploading…' : value ? 'Choose another file…' : 'Choose file…'}
        </button>
        {value && onClear ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={onClear} disabled={busy}>
            Remove
          </button>
        ) : null}
        <input
          ref={input}
          type="file"
          accept={accept}
          hidden
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onPick(f);
          }}
        />
      </div>
      {existing && existing.length > 0 && onChooseExisting ? (
        <select className="file-picker__existing" aria-label={`Or use a file already uploaded for ${label.toLowerCase()}`} value="" onChange={(e) => e.target.value && onChooseExisting(e.target.value)}>
          <option value="">Or use a file already here…</option>
          {existing.map((f) => (
            <option key={f.src} value={f.src}>
              {f.name}
            </option>
          ))}
        </select>
      ) : null}
      {status ? <span className={`badge badge--${status.tone === 'ok' ? 'on' : 'warn'}`}>{status.text}</span> : null}
      {error ? (
        <p id={`${id}-hint`} className="field__error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

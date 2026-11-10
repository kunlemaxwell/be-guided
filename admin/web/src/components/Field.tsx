import { useId, type ReactNode } from 'react';

interface Props {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, hint, error, children }: Props) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-describedby': hint || error ? hintId : undefined, 'aria-invalid': error ? true : undefined })}
      {error ? (
        <p id={hintId} className="field__error">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

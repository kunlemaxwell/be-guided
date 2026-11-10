import { useId, type ReactNode } from 'react';

interface Props {
  /** Visible label, e.g. "Show on the public site". */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** One line under the label explaining both states. */
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * An on/off switch (role="switch"). Use for a yes/no setting that takes
 * effect when the form is saved, e.g. public/private.
 */
export function Switch({ label, checked, onChange, hint, disabled }: Props) {
  const id = useId();
  return (
    <div className="switch-field">
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`switch${checked ? ' switch--on' : ''}`}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__thumb" aria-hidden="true" />
      </button>
      <label htmlFor={id} className="switch-field__label">
        {label}
        <span className="switch-field__state">{checked ? 'On' : 'Off'}</span>
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="field__hint switch-field__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

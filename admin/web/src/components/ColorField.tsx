import { useEffect, useId, useState } from 'react';
import { Icon } from './Icon';

const HEX = /^#[0-9a-fA-F]{6}$/;

interface Props {
  label: string;
  /** The custom colour, or undefined to use the theme's own. */
  value: string | undefined;
  /** The theme's colour (shown when no custom colour is set). */
  themeValue: string | undefined;
  onChange: (next: string | undefined) => void;
}

/**
 * Colour picker + hex box. Empty means "use the theme's colour"; the
 * reset button returns to it. Invalid hex is not applied until it is valid.
 */
export function ColorField({ label, value, themeValue, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  useEffect(() => setText(value ?? ''), [value]);
  const shown = value ?? themeValue ?? '#000000';
  const invalid = text !== '' && !HEX.test(text);
  return (
    <div className={`color-field${invalid ? ' field--error' : ''}`}>
      <label htmlFor={`${id}-hex`} className="color-field__label">
        {label}
      </label>
      <div className="color-field__row">
        <input
          type="color"
          aria-label={`${label}: colour picker`}
          value={HEX.test(shown) ? shown.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          id={`${id}-hex`}
          className="mono color-field__hex"
          value={text}
          placeholder={themeValue ?? 'Theme'}
          maxLength={7}
          aria-invalid={invalid || undefined}
          aria-describedby={`${id}-state`}
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (v === '') onChange(undefined);
            else if (HEX.test(v)) onChange(v);
          }}
        />
        <button type="button" className="icon-btn" aria-label={`Reset ${label.toLowerCase()} to the theme`} title="Reset to theme" disabled={value === undefined} onClick={() => onChange(undefined)}>
          <Icon name="reset" size={16} />
        </button>
      </div>
      <span id={`${id}-state`} className={invalid ? 'field__error' : 'field__hint'}>
        {invalid ? 'Write it like #1D4ED8' : value === undefined ? 'Theme colour' : 'Custom'}
      </span>
    </div>
  );
}

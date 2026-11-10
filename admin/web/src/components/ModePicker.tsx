import { useId } from 'react';
import type { ContentMode } from '../../../shared/api-types';
import { CONTENT_MODE_OPTIONS, MODE_CAPTION } from '../lib/labels';

interface Props {
  value: ContentMode | null;
  onChange: (mode: ContentMode) => void;
  legend?: string;
}

/** The owner must choose what to produce every time; nothing is preselected. */
export function ModePicker({ value, onChange, legend = 'What should be updated?' }: Props) {
  const name = useId();
  return (
    <fieldset className="mode-picker">
      <legend>{legend}</legend>
      <div className="mode-picker__options">
        {CONTENT_MODE_OPTIONS.map((o) => (
          <label key={o.value} className={`choice${value === o.value ? ' choice--on' : ''}`}>
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            <span className="choice__label">{o.label}</span>
            <span className="choice__hint">{o.hint}</span>
          </label>
        ))}
      </div>
      <p className="caption">{MODE_CAPTION}</p>
    </fieldset>
  );
}

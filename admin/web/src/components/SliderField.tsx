import { useId } from 'react';
import { Icon } from './Icon';

interface Props {
  label: string;
  /** Custom value, or undefined = the theme's. */
  value: number | undefined;
  /** Shown (and used as the slider position) when no custom value is set. */
  themeValue: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (next: number | undefined) => void;
}

/** A number chosen with a slider (plus a number box), with "reset to theme". */
/** Accessible name of the number box: "Line thickness (px)", or just "Heading weight" when there is no unit. */
export function numberBoxLabel(label: string, unit: string): string {
  return unit ? `${label} (${unit})` : label;
}

export function SliderField({ label, value, themeValue, min, max, step = 1, unit = 'px', onChange }: Props) {
  const id = useId();
  const shown = value ?? themeValue;
  return (
    <div className="slider-field">
      <label htmlFor={id} className="color-field__label">
        {label}
      </label>
      <div className="slider-field__row">
        <input id={id} type="range" min={min} max={max} step={step} value={shown} onChange={(e) => onChange(Number(e.target.value))} />
        <input
          type="number"
          className="slider-field__number"
          aria-label={numberBoxLabel(label, unit)}
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n) && n >= min && n <= max) onChange(n);
          }}
        />
        {unit ? <span className="muted small">{unit}</span> : null}
        <button type="button" className="icon-btn" aria-label={`Reset ${label.toLowerCase()} to the theme`} title="Reset to theme" disabled={value === undefined} onClick={() => onChange(undefined)}>
          <Icon name="reset" size={16} />
        </button>
      </div>
      <span className="field__hint">{value === undefined ? 'Theme setting' : 'Custom'}</span>
    </div>
  );
}

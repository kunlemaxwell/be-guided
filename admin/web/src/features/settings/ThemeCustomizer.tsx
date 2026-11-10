import { useState } from 'react';
import { FONT_CHOICES, SHADOW_LEVELS, THEME_COLOR_KEYS, type FontChoice, type ShadowLevel, type ThemeColorKey, type ThemeCustom, type ThemeId } from '@/types/content';
import { Accordion } from '../../components/Accordion';
import { ColorField } from '../../components/ColorField';
import { Field } from '../../components/Field';
import { SliderField } from '../../components/SliderField';
import { themeDefaults } from './theme-defaults';
import { ThemePreview } from './ThemePreview';

const COLOR_LABEL: Record<ThemeColorKey, string> = {
  background: 'Page background',
  surface: 'Cards and panels',
  text: 'Text',
  muted: 'Quiet text',
  line: 'Lines and borders',
  accent: 'Accent (links, buttons)',
  headerBackground: 'Header background',
  headerText: 'Header text',
};

const SHADOW_LABEL: Record<ShadowLevel, string> = { none: 'None', subtle: 'Subtle', soft: 'Soft', medium: 'Medium', strong: 'Strong' };
const HEADINGS = [
  { key: 'h1', label: 'Page title (H1)', min: 20, max: 64 },
  { key: 'h2', label: 'Section heading (H2)', min: 16, max: 48 },
  { key: 'h3', label: 'Sub-heading (H3)', min: 14, max: 36 },
  { key: 'h4', label: 'Step title (H4)', min: 13, max: 28 },
] as const;

/** Removes undefined fields and empty objects, so "all reset" stores nothing. */
export function pruneCustom(value: ThemeCustom): ThemeCustom | undefined {
  const clean = (v: unknown): unknown => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => [k, clean(x)] as const)
        .filter(([, x]) => x !== undefined);
      return entries.length ? Object.fromEntries(entries) : undefined;
    }
    return v;
  };
  return clean(value) as ThemeCustom | undefined;
}

/** The customizer's sections, in the order they are shown. */
export const CUSTOMIZER_SECTIONS = ['colours', 'text', 'headings', 'shape', 'shadow'] as const;
export type CustomizerSection = (typeof CUSTOMIZER_SECTIONS)[number];

/** The ThemeCustom fields each section edits (every field belongs to exactly one section). */
export const SECTION_FIELDS: Record<CustomizerSection, (keyof ThemeCustom)[]> = {
  colours: ['colors'],
  text: ['fontBody', 'fontHeading', 'baseSize'],
  headings: ['headingSizes', 'headingWeight'],
  shape: ['lineWidth', 'radius'],
  shadow: ['shadow'],
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One short line for a closed section header: what is changed from the theme, or "Theme …" when nothing is. */
export function sectionSummary(section: CustomizerSection, v: ThemeCustom | undefined): string {
  const c = v ?? {};
  switch (section) {
    case 'colours': {
      const n = Object.keys(c.colors?.light ?? {}).length + Object.keys(c.colors?.dark ?? {}).length;
      return n ? plural(n, 'custom colour', 'custom colours') : 'Theme colours';
    }
    case 'text': {
      const parts = [c.fontBody ? `${c.fontBody} text` : null, c.fontHeading ? `${c.fontHeading} headings` : null, c.baseSize !== undefined ? `${c.baseSize} px` : null].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Theme fonts and size';
    }
    case 'headings': {
      const n = Object.keys(c.headingSizes ?? {}).length;
      const parts = [n ? plural(n, 'custom size', 'custom sizes') : null, c.headingWeight !== undefined ? `weight ${c.headingWeight}` : null].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Theme sizes';
    }
    case 'shape': {
      const parts = [c.lineWidth !== undefined ? `lines ${c.lineWidth} px` : null, c.radius !== undefined ? `corners ${c.radius} px` : null].filter(Boolean);
      return parts.length ? parts.join(' · ') : 'Theme lines and corners';
    }
    case 'shadow':
      return c.shadow ? SHADOW_LABEL[c.shadow] : 'Theme shadow';
  }
}

/** The value with one section put back to the theme. */
export function resetSection(value: ThemeCustom | undefined, section: CustomizerSection): ThemeCustom | undefined {
  if (!value) return undefined;
  const next: ThemeCustom = { ...value };
  for (const key of SECTION_FIELDS[section]) delete next[key];
  return pruneCustom(next);
}

interface Props {
  theme: ThemeId;
  value: ThemeCustom | undefined;
  onChange: (next: ThemeCustom | undefined) => void;
}

/**
 * Owner's adjustments on top of the chosen theme, one closed section each
 * (colours, text, headings, lines and corners, shadow) with a one-line
 * summary of what's changed, and a live preview beside them. Changes are a
 * draft until Settings › Save.
 */
export function ThemeCustomizer({ theme, value, onChange }: Props) {
  const [palette, setPalette] = useState<'light' | 'dark'>('light');
  const v = value ?? {};
  const base = themeDefaults(theme);
  const update = (patch: Partial<ThemeCustom>) => onChange(pruneCustom({ ...v, ...patch }));
  const setColor = (key: ThemeColorKey, color: string | undefined) =>
    update({ colors: { ...v.colors, [palette]: { ...v.colors?.[palette], [key]: color } } });
  const changed = (section: CustomizerSection) => SECTION_FIELDS[section].some((k) => v[k] !== undefined);
  const resetButton = (section: CustomizerSection, what: string) => (
    <button type="button" className="btn btn--small btn--ghost accordion__reset" disabled={!changed(section)} onClick={() => onChange(resetSection(value, section))}>
      Reset {what} to the theme
    </button>
  );

  return (
    <div className="customizer">
      <div className="customizer__controls">
        <div className="accordion-group">
          <Accordion title="Colours" summary={sectionSummary('colours', value)}>
            <div className="segmented" role="radiogroup" aria-label="Colours for light or dark mode">
              {(['light', 'dark'] as const).map((m) => (
                <button key={m} type="button" role="radio" aria-checked={palette === m} className={`segmented__item${palette === m ? ' segmented__item--on' : ''}`} onClick={() => setPalette(m)}>
                  {m === 'light' ? 'Light mode' : 'Dark mode'}
                </button>
              ))}
            </div>
            <div className="color-grid">
              {THEME_COLOR_KEYS.map((key) => (
                <ColorField key={`${palette}-${key}`} label={COLOR_LABEL[key]} value={v.colors?.[palette]?.[key]} themeValue={base.colors[palette][key]} onChange={(c) => setColor(key, c)} />
              ))}
            </div>
            {resetButton('colours', 'colours')}
          </Accordion>

          <Accordion title="Text and fonts" summary={sectionSummary('text', value)}>
            <div className="grid-2">
              <Field label="Body font">
                {(p) => (
                  <select {...p} value={v.fontBody ?? ''} onChange={(e) => update({ fontBody: (e.target.value || undefined) as FontChoice | undefined })}>
                    <option value="">Theme font ({base.font})</option>
                    {FONT_CHOICES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="Heading font">
                {(p) => (
                  <select {...p} value={v.fontHeading ?? ''} onChange={(e) => update({ fontHeading: (e.target.value || undefined) as FontChoice | undefined })}>
                    <option value="">Same as body font</option>
                    {FONT_CHOICES.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            </div>
            <SliderField label="Body text size" value={v.baseSize} themeValue={base.baseSize} min={13} max={20} onChange={(n) => update({ baseSize: n })} />
            {resetButton('text', 'fonts and size')}
          </Accordion>

          <Accordion title="Headings" summary={sectionSummary('headings', value)}>
            {HEADINGS.map((h) => (
              <SliderField
                key={h.key}
                label={h.label}
                value={v.headingSizes?.[h.key]}
                themeValue={base.headingSizes[h.key]}
                min={h.min}
                max={h.max}
                onChange={(n) => update({ headingSizes: { ...v.headingSizes, [h.key]: n } })}
              />
            ))}
            <SliderField label="Heading weight" value={v.headingWeight} themeValue={base.headingWeight} min={400} max={900} step={100} unit="" onChange={(n) => update({ headingWeight: n })} />
            {resetButton('headings', 'headings')}
          </Accordion>

          <Accordion title="Lines and corners" summary={sectionSummary('shape', value)}>
            <SliderField label="Line thickness" value={v.lineWidth} themeValue={base.lineWidth} min={0} max={4} step={0.5} onChange={(n) => update({ lineWidth: n })} />
            <SliderField label="Corner rounding (bevels)" value={v.radius} themeValue={base.radius} min={0} max={28} onChange={(n) => update({ radius: n })} />
            {resetButton('shape', 'lines and corners')}
          </Accordion>

          <Accordion title="Shadows" summary={sectionSummary('shadow', value)}>
            <Field label="Shadow under cards and panels">
              {(p) => (
                <select {...p} value={v.shadow ?? ''} onChange={(e) => update({ shadow: (e.target.value || undefined) as ShadowLevel | undefined })}>
                  <option value="">Theme setting</option>
                  {SHADOW_LEVELS.map((s) => (
                    <option key={s} value={s}>
                      {SHADOW_LABEL[s]}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          </Accordion>
        </div>

        <div>
          <button type="button" className="btn" disabled={!value} onClick={() => onChange(undefined)}>
            Reset everything to the theme
          </button>
        </div>
      </div>
      <div className="customizer__preview">
        <ThemePreview theme={theme} custom={value} />
      </div>
    </div>
  );
}

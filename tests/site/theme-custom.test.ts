import { describe, expect, it } from 'vitest';
import { customFontHref, hasThemeCustom, luminance, readableOn, themeCustomCss } from '../../src/lib/theme-custom';
import { themeCustomSchema, type ThemeCustom } from '../../src/types/content';

const BASE = 'html[data-custom][data-custom] {';
const LIGHT = "html[data-custom][data-custom]:not([data-mode='dark']) {";
const DARK = "html[data-custom][data-custom][data-mode='dark'] {";

/** The declarations inside the rule that starts with `selector`, or null. */
function rule(css: string, selector: string): string | null {
  const line = css.split('\n').find((l) => l.startsWith(selector));
  return line ? line.slice(selector.length, line.lastIndexOf('}')).trim() : null;
}

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    expect(luminance('#000000')).toBe(0);
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('weights green above red above blue (WCAG coefficients)', () => {
    expect(luminance('#00ff00')).toBeCloseTo(0.7152, 4);
    expect(luminance('#ff0000')).toBeCloseTo(0.2126, 4);
    expect(luminance('#0000ff')).toBeCloseTo(0.0722, 4);
  });

  it('reads upper- and lower-case hex the same', () => {
    expect(luminance('#1D4ED8')).toBe(luminance('#1d4ed8'));
  });
});

describe('readableOn', () => {
  it('picks white text on dark colours', () => {
    expect(readableOn('#000000')).toBe('#ffffff');
    expect(readableOn('#1d4ed8')).toBe('#ffffff');
    expect(readableOn('#14532d')).toBe('#ffffff');
  });

  it('picks dark text on light colours', () => {
    expect(readableOn('#ffffff')).toBe('#0b1120');
    expect(readableOn('#93b4ff')).toBe('#0b1120');
    expect(readableOn('#fcd34d')).toBe('#0b1120');
  });

  it('always reaches WCAG AA (4.5:1) against pure black or white for mid-tones', () => {
    for (const hex of ['#777777', '#808080', '#3b82f6', '#ea580c']) {
      const l = luminance(hex);
      const ratio = readableOn(hex) === '#ffffff' ? 1.05 / (l + 0.05) : (l + 0.05) / 0.05;
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe('themeCustomCss', () => {
  it('returns an empty string for no input or an empty object', () => {
    expect(themeCustomCss(undefined)).toBe('');
    expect(themeCustomCss({})).toBe('');
    expect(themeCustomCss({ colors: {} })).toBe('');
    expect(themeCustomCss({ colors: { light: {}, dark: {} }, headingSizes: {} })).toBe('');
    expect(hasThemeCustom(undefined)).toBe(false);
    expect(hasThemeCustom({})).toBe(false);
  });

  it('reports something to apply once any field is set', () => {
    expect(hasThemeCustom({ radius: 0 })).toBe(true);
  });

  it.each<[string, ThemeCustom, string[]]>([
    ['fontBody', { fontBody: 'Inter' }, ["--font: 'Inter', system-ui, sans-serif;"]],
    ['serif fontHeading', { fontHeading: 'Lora' }, ["--font-heading: 'Lora', Georgia, serif;"]],
    ['baseSize', { baseSize: 17 }, ['--base-size: 17px;']],
    ['h1 (with hero size)', { headingSizes: { h1: 40 } }, ['--h1-size: 40px;', '--hero-size: clamp(28px, 6vw, 52px);']],
    ['h2', { headingSizes: { h2: 26 } }, ['--h2-size: 26px;']],
    ['h3', { headingSizes: { h3: 20 } }, ['--h3-size: 20px;']],
    ['h4 (step titles)', { headingSizes: { h4: 18 } }, ['--h4-size: 18px;']],
    ['headingWeight', { headingWeight: 700 }, ['--heading-weight: 700;']],
    ['lineWidth', { lineWidth: 2 }, ['--line-w: 2px;']],
    ['lineWidth 0', { lineWidth: 0 }, ['--line-w: 0px;']],
    ['radius', { radius: 20 }, ['--radius: 20px;', '--radius-sm: 14px;']],
    ['shadow', { shadow: 'medium' }, ['--shadow-card: 0 6px 18px rgba(15, 23, 42, 0.12);']],
    ['shadow none', { shadow: 'none' }, ['--shadow-card: none;']],
  ])('writes %s into the base rule', (_name, input, expected) => {
    const css = themeCustomCss(input);
    const base = rule(css, BASE);
    expect(base).not.toBeNull();
    for (const decl of expected) expect(base).toContain(decl);
    expect(rule(css, LIGHT)).toBeNull();
    expect(rule(css, DARK)).toBeNull();
  });

  it('keeps a small h1 at its own size as the hero minimum', () => {
    expect(themeCustomCss({ headingSizes: { h1: 22 } })).toContain('--hero-size: clamp(22px, 6vw, 29px);');
  });

  it('puts light colours under :not(dark) and dark colours under [data-mode=dark]', () => {
    const css = themeCustomCss({ colors: { light: { background: '#fafafa' }, dark: { background: '#101010' } } });
    expect(rule(css, LIGHT)).toBe('--bg: #fafafa;');
    expect(rule(css, DARK)).toBe('--bg: #101010;');
    expect(rule(css, BASE)).toBeNull();
  });

  it('only writes the mode that has colours', () => {
    const css = themeCustomCss({ colors: { dark: { text: '#eeeeee' } } });
    expect(rule(css, LIGHT)).toBeNull();
    expect(rule(css, DARK)).toBe('--fg: #eeeeee; --fg-2: #eeeeee;');
  });

  it.each<[keyof NonNullable<NonNullable<ThemeCustom['colors']>['light']>, string[]]>([
    ['background', ['--bg: #123456;']],
    ['surface', ['--surface: #123456;', '--soft: color-mix(in srgb, var(--fg) 3%, #123456);', '--soft-2: color-mix(in srgb, var(--fg) 7%, #123456);']],
    ['text', ['--fg: #123456;', '--fg-2: #123456;']],
    ['muted', ['--muted: #123456;']],
    ['line', ['--line: #123456;', '--line-2: #123456;']],
    ['accent', ['--accent: #123456;', '--link: #123456;', '--primary-bg: #123456;', '--accent-fg: #ffffff;', '--primary-fg: #ffffff;', '--accent-soft: color-mix(in srgb, #123456 12%, var(--surface));', '--callout-bg: color-mix(in srgb, #123456 10%, var(--surface));']],
    ['headerBackground', ['--header-bg: #123456;', '--header-line: color-mix(in srgb, var(--header-fg) 16%, #123456);', '--header-input: color-mix(in srgb, var(--header-fg) 8%, #123456);']],
    ['headerText', ['--header-fg: #123456;', '--header-muted: #123456;']],
  ])('maps the %s colour to its theme variables', (key, expected) => {
    const light = rule(themeCustomCss({ colors: { light: { [key]: '#123456' } } }), LIGHT);
    for (const decl of expected) expect(light).toContain(decl);
  });

  it('gives a light accent dark button text', () => {
    const css = themeCustomCss({ colors: { dark: { accent: '#a5b4fc' } } });
    expect(rule(css, DARK)).toContain('--accent-fg: #0b1120;');
  });

  it('never touches hero variables directly (themes.css derives them)', () => {
    const css = themeCustomCss({ colors: { light: { text: '#111111', muted: '#222222', background: '#ffffff' } } });
    expect(css).not.toContain('--hero-');
  });

  it('outranks the theme blocks in themes.css (selector specificity)', () => {
    // html[data-theme='x'][data-mode='dark'] = 0,2,1; every custom rule must be at least 0,3,1 for colours.
    const css = themeCustomCss({ radius: 4, colors: { light: { accent: '#000000' }, dark: { accent: '#ffffff' } } });
    expect(css.split('\n')).toHaveLength(3);
    for (const line of css.split('\n').slice(1)) expect((line.match(/\[/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('cannot carry markup, because the schema only lets validated values through', () => {
    expect(themeCustomSchema.safeParse({ colors: { light: { accent: 'red;}</style><script>' } } }).success).toBe(false);
    expect(themeCustomSchema.safeParse({ fontBody: "Inter'; }" }).success).toBe(false);
    expect(themeCustomSchema.safeParse({ radius: 99 }).success).toBe(false);
  });
});

describe('customFontHref', () => {
  it('is null when no typeface is chosen', () => {
    expect(customFontHref(undefined)).toBeNull();
    expect(customFontHref({ radius: 3 })).toBeNull();
  });

  it('builds one Google Fonts URL for body and heading, de-duplicated', () => {
    expect(customFontHref({ fontBody: 'Source Sans 3', fontHeading: 'Lora' })).toBe(
      'https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;500;600;700;800&family=Lora:wght@400;500;600;700;800&display=swap',
    );
    expect(customFontHref({ fontBody: 'Inter', fontHeading: 'Inter' })).toBe(
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
    );
  });
});

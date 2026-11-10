import type { FontChoice, ShadowLevel, ThemeColorKey, ThemeCustom } from '@/types/content';

/**
 * Turns the owner's theme customizations into CSS. Shared by the public site
 * (applied on every page) and the admin (live preview), so both always agree.
 *
 * Selectors repeat [data-custom] to outrank the theme blocks in themes.css
 * (html[data-theme=…] and html[data-theme=…][data-mode=dark]) regardless of
 * stylesheet order.
 */

const SHADOWS: Record<ShadowLevel, string> = {
  none: 'none',
  subtle: '0 1px 2px rgba(15, 23, 42, 0.06)',
  soft: '0 2px 8px rgba(15, 23, 42, 0.08)',
  medium: '0 6px 18px rgba(15, 23, 42, 0.12)',
  strong: '0 12px 32px rgba(15, 23, 42, 0.18)',
};

/**
 * Each customizable colour sets these theme variables. The hero band follows
 * them through themes.css (hero colours are defined in terms of --fg, --muted,
 * --soft/--bg, or the header colours in the Warm theme), so they are not
 * listed here.
 */
const COLOR_VARS: Record<ThemeColorKey, string[]> = {
  background: ['--bg'],
  surface: ['--surface'],
  text: ['--fg', '--fg-2'],
  muted: ['--muted'],
  line: ['--line', '--line-2'],
  accent: ['--accent', '--link', '--primary-bg'],
  headerBackground: ['--header-bg'],
  headerText: ['--header-fg', '--header-muted'],
};

/**
 * Tints the theme derives from a chosen colour, so a new accent or header
 * colour doesn't leave the old theme's tints (callouts, current-page
 * highlight, search box) behind. color-mix() keeps them relative to the
 * page's final surface and text colours.
 */
function derived(key: ThemeColorKey, value: string): string[] {
  switch (key) {
    case 'accent':
      return [
        `--accent-fg: ${readableOn(value)};`,
        `--primary-fg: ${readableOn(value)};`,
        `--accent-soft: color-mix(in srgb, ${value} 12%, var(--surface));`,
        `--callout-bg: color-mix(in srgb, ${value} 10%, var(--surface));`,
        `--callout-fg: color-mix(in srgb, ${value} 45%, var(--fg));`,
      ];
    case 'surface':
      // Boxes (Before you start, menus' hover) stay a shade off the surface.
      return [`--soft: color-mix(in srgb, var(--fg) 3%, ${value});`, `--soft-2: color-mix(in srgb, var(--fg) 7%, ${value});`];
    case 'headerBackground':
      return [
        `--header-line: color-mix(in srgb, var(--header-fg) 16%, ${value});`,
        `--header-input: color-mix(in srgb, var(--header-fg) 8%, ${value});`,
      ];
    default:
      return [];
  }
}

const FONT_FALLBACK: Partial<Record<FontChoice, string>> = { Merriweather: 'Georgia, serif', Lora: 'Georgia, serif' };

function fontStack(font: FontChoice): string {
  return `'${font}', ${FONT_FALLBACK[font] ?? 'system-ui, sans-serif'}`;
}

/** Relative luminance (WCAG) of a #RRGGBB colour. */
export function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Text colour that stays readable on the given background (WCAG contrast). */
export function readableOn(hex: string): string {
  const l = luminance(hex);
  const onWhite = 1.05 / (l + 0.05);
  const onBlack = (l + 0.05) / 0.05;
  return onWhite >= onBlack ? '#ffffff' : '#0b1120';
}

function palette(colors: Partial<Record<ThemeColorKey, string>> | undefined): string[] {
  if (!colors) return [];
  const out: string[] = [];
  for (const [key, vars] of Object.entries(COLOR_VARS) as [ThemeColorKey, string[]][]) {
    const value = colors[key];
    if (!value) continue;
    for (const v of vars) out.push(`${v}: ${value};`);
    out.push(...derived(key, value));
  }
  return out;
}

/** True when there is anything to apply. */
export function hasThemeCustom(custom: ThemeCustom | undefined): custom is ThemeCustom {
  return Boolean(custom && themeCustomCss(custom).trim());
}

export function themeCustomCss(custom: ThemeCustom | undefined): string {
  if (!custom) return '';
  const base: string[] = [];
  if (custom.fontBody) base.push(`--font: ${fontStack(custom.fontBody)};`);
  if (custom.fontHeading) base.push(`--font-heading: ${fontStack(custom.fontHeading)};`);
  if (custom.baseSize !== undefined) base.push(`--base-size: ${custom.baseSize}px;`);
  const h = custom.headingSizes ?? {};
  if (h.h1 !== undefined) {
    // The home/product hero title is the page's h1 too; it stays a little
    // larger than an article title and shrinks on narrow screens.
    base.push(`--h1-size: ${h.h1}px;`, `--hero-size: clamp(${Math.min(h.h1, 28)}px, 6vw, ${Math.round(h.h1 * 1.3)}px);`);
  }
  if (h.h2 !== undefined) base.push(`--h2-size: ${h.h2}px;`);
  if (h.h3 !== undefined) base.push(`--h3-size: ${h.h3}px;`);
  if (h.h4 !== undefined) base.push(`--h4-size: ${h.h4}px;`);
  if (custom.headingWeight !== undefined) base.push(`--heading-weight: ${custom.headingWeight};`);
  if (custom.lineWidth !== undefined) base.push(`--line-w: ${custom.lineWidth}px;`);
  if (custom.radius !== undefined) base.push(`--radius: ${custom.radius}px;`, `--radius-sm: ${Math.round(custom.radius * 0.7)}px;`);
  if (custom.shadow) base.push(`--shadow-card: ${SHADOWS[custom.shadow]};`);

  const light = palette(custom.colors?.light);
  const dark = palette(custom.colors?.dark);
  const rules: string[] = [];
  if (base.length) rules.push(`html[data-custom][data-custom] { ${base.join(' ')} }`);
  if (light.length) rules.push(`html[data-custom][data-custom]:not([data-mode='dark']) { ${light.join(' ')} }`);
  if (dark.length) rules.push(`html[data-custom][data-custom][data-mode='dark'] { ${dark.join(' ')} }`);
  return rules.join('\n');
}

/** Google Fonts stylesheet for the customizer's typefaces, or null when none are chosen. */
export function customFontHref(custom: ThemeCustom | undefined): string | null {
  const fonts = [...new Set([custom?.fontBody, custom?.fontHeading].filter((f): f is FontChoice => Boolean(f)))];
  if (fonts.length === 0) return null;
  const families = fonts.map((f) => `family=${f.replace(/ /g, '+')}:wght@400;500;600;700;800`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

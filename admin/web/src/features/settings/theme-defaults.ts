import themesCss from '@/app/themes.css?raw';
import { THEME_COLOR_KEYS, type ThemeColorKey, type ThemeId } from '@/types/content';

/**
 * The theme's own values, read from the public site's src/app/themes.css, so
 * the customizer can show "theme colour" placeholders and "reset to theme".
 */
const COLOR_VAR: Record<ThemeColorKey, string> = {
  background: '--bg',
  surface: '--surface',
  text: '--fg',
  muted: '--muted',
  line: '--line',
  accent: '--accent',
  headerBackground: '--header-bg',
  headerText: '--header-fg',
};

export interface ThemeDefaults {
  colors: { light: Partial<Record<ThemeColorKey, string>>; dark: Partial<Record<ThemeColorKey, string>> };
  font: string;
  baseSize: number;
  headingSizes: { h1: number; h2: number; h3: number; h4: number };
  headingWeight: number;
  lineWidth: number;
  radius: number;
}

function block(theme: ThemeId, dark: boolean): Record<string, string> {
  const selector = dark ? `html[data-theme='${theme}'][data-mode='dark']` : `html[data-theme='${theme}']`;
  const start = themesCss.indexOf(`${selector} {`);
  if (start < 0) return {};
  const body = themesCss.slice(themesCss.indexOf('{', start) + 1, themesCss.indexOf('}', start));
  const out: Record<string, string> = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]!] = m[2]!.trim();
  return out;
}

function hex(v: string | undefined): string | undefined {
  return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : v && /^#[0-9a-fA-F]{3}$/.test(v) ? `#${[...v.slice(1)].map((c) => c + c).join('')}`.toLowerCase() : undefined;
}

function px(v: string | undefined, fallback: number): number {
  if (!v) return fallback;
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.trim().endsWith('rem') ? Math.round(n * 16) : n;
}

export function themeDefaults(theme: ThemeId): ThemeDefaults {
  const light = block(theme, false);
  const dark = { ...light, ...block(theme, true) };
  const colors = (vars: Record<string, string>) =>
    Object.fromEntries(THEME_COLOR_KEYS.map((k) => [k, hex(vars[COLOR_VAR[k]])]).filter(([, v]) => v)) as Partial<Record<ThemeColorKey, string>>;
  return {
    colors: { light: colors(light), dark: colors(dark) },
    font: (light['--font'] ?? '').split(',')[0]?.replace(/['"]/g, '').trim() || 'System',
    baseSize: 16,
    headingSizes: { h1: px(light['--h1-size'], 40), h2: 24, h3: 18, h4: 16 },
    headingWeight: Number(light['--heading-weight'] ?? 700) || 700,
    lineWidth: 1,
    radius: px(light['--radius'], 12),
  };
}

export { themesCss };

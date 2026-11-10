/** Where the reader-facing site runs on this computer (npm run dev -- -p 3100). */
export const SITE_URL: string = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'http://localhost:3100';

/** Theme swatches (accent, background, text) copied from src/app/themes.css. */
export const THEME_SWATCHES: Record<string, { accent: string; bg: string; ink: string; soft: string }> = {
  classic: { accent: '#1d4ed8', bg: '#ffffff', ink: '#0f172a', soft: '#eff4ff' },
  ink: { accent: '#4338ca', bg: '#ffffff', ink: '#09090b', soft: '#eef2ff' },
  warm: { accent: '#14532d', bg: '#faf8f5', ink: '#1c1917', soft: '#f0fdf4' },
  enterprise: { accent: '#0f62fe', bg: '#ffffff', ink: '#161616', soft: '#e8effe' },
  aurora: { accent: '#7c3aed', bg: '#fbfaff', ink: '#1e1b4b', soft: '#f3e8ff' },
};

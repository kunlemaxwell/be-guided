import type { ThemeId } from '@/types/content';

/**
 * Site themes. Every theme renders the same page structure; colours, type,
 * spacing and layout differences live in `src/app/themes.css` under
 * `html[data-theme="<id>"]`. Adding a theme = one entry here + one CSS block.
 */
export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  description: string;
  /** Google Fonts css2 URL for the theme's typeface. */
  fontHref: string;
}

export const THEMES: Record<ThemeId, ThemeDefinition> = {
  classic: {
    id: 'classic',
    label: 'A · Classic',
    description: 'Friendly blue, rounded cards, three-column articles.',
    fontHref: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap',
  },
  ink: {
    id: 'ink',
    label: 'B · Ink',
    description: 'Quiet and typographic, docs-first, hairline dividers.',
    fontHref: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
  },
  warm: {
    id: 'warm',
    label: 'C · Warm',
    description: 'Friendly help center, green header band, one reading column.',
    fontHref: 'https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&display=swap',
  },
  enterprise: {
    id: 'enterprise',
    label: 'D · Enterprise',
    description: 'Structured hub for a large ERP, contents tree, square corners.',
    fontHref: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400&display=swap',
  },
  aurora: {
    id: 'aurora',
    label: 'E · Aurora',
    description: 'Vivid violet-to-teal gradients, glassy cards, bold hero. The most eye-catching.',
    fontHref: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700;800&family=Inter:wght@400;500;600&display=swap',
  },
};

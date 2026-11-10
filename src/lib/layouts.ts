/**
 * Page layouts: how a guide page is arranged (where the menu sits, where
 * "On this page" goes, how wide the reading column is, how steps look).
 * Separate from the theme, which only sets colours and type: any layout
 * works with any theme. Each layout is a preset of five options the owner
 * can change one by one (Settings › Layout).
 */
export const LAYOUT_IDS = ['standard', 'atlas', 'studio', 'notebook', 'portal', 'playbook', 'slides', 'ledger'] as const;
export type LayoutId = (typeof LAYOUT_IDS)[number];

export const NAV_POSITIONS = ['left', 'right', 'tabs', 'top'] as const;
export const TOC_POSITIONS = ['right', 'inline', 'hidden'] as const;
export const WIDTHS = ['narrow', 'normal', 'wide'] as const;
export const DENSITIES = ['comfortable', 'compact'] as const;
export const STEP_STYLES = ['list', 'cards', 'split', 'slides'] as const;

export interface LayoutOptions {
  nav: (typeof NAV_POSITIONS)[number];
  toc: (typeof TOC_POSITIONS)[number];
  width: (typeof WIDTHS)[number];
  density: (typeof DENSITIES)[number];
  steps: (typeof STEP_STYLES)[number];
}

export interface LayoutInfo {
  id: LayoutId;
  name: string;
  /** One line for the picker. */
  description: string;
  /** Like which well-known docs sites. */
  feel: string;
  defaults: LayoutOptions;
}

export const LAYOUTS: Record<LayoutId, LayoutInfo> = {
  standard: { id: 'standard', name: 'Standard', description: 'Menu on the left, the page in the middle, "On this page" on the right.', feel: 'Classic help centre', defaults: { nav: 'left', toc: 'right', width: 'normal', density: 'comfortable', steps: 'list' } },
  atlas: { id: 'atlas', name: 'Atlas', description: 'Module tabs across the top, the module menu on the left, contents on the right. Wide.', feel: 'Like Mintlify', defaults: { nav: 'tabs', toc: 'right', width: 'wide', density: 'comfortable', steps: 'list' } },
  studio: { id: 'studio', name: 'Studio', description: 'Each step side by side: what to do on the left, the screenshot on the right.', feel: 'Like Stripe guides', defaults: { nav: 'left', toc: 'inline', width: 'wide', density: 'comfortable', steps: 'split' } },
  notebook: { id: 'notebook', name: 'Notebook', description: 'One calm reading column. Modules sit in a bar at the top; nothing at the sides.', feel: 'Like a long-form article', defaults: { nav: 'top', toc: 'inline', width: 'narrow', density: 'comfortable', steps: 'list' } },
  portal: { id: 'portal', name: 'Portal', description: 'Module tabs at the top and every step on its own card.', feel: 'Like Zendesk / Intercom', defaults: { nav: 'top', toc: 'inline', width: 'normal', density: 'comfortable', steps: 'cards' } },
  playbook: { id: 'playbook', name: 'Playbook', description: 'The module menu becomes a numbered checklist; steps are cards to work through.', feel: 'Like an onboarding course', defaults: { nav: 'left', toc: 'hidden', width: 'normal', density: 'comfortable', steps: 'cards' } },
  slides: { id: 'slides', name: 'Slides', description: 'One step per screen: scroll and each step fills the view, screenshot first.', feel: 'Like a walkthrough deck', defaults: { nav: 'top', toc: 'hidden', width: 'wide', density: 'comfortable', steps: 'slides' } },
  ledger: { id: 'ledger', name: 'Ledger', description: 'Dense reference: menu on the right, compact text, contents inline.', feel: 'Like API reference docs', defaults: { nav: 'right', toc: 'inline', width: 'wide', density: 'compact', steps: 'list' } },
};

/** The layout's own options with any of the owner's changes on top. */
export function layoutOptions(id: LayoutId, overrides: Partial<LayoutOptions> = {}): LayoutOptions {
  const base = LAYOUTS[id]?.defaults ?? LAYOUTS.standard.defaults;
  return { ...base, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)) } as LayoutOptions;
}

/** The html attributes that switch the CSS (src/app/layouts.css). */
export function layoutAttributes(id: LayoutId, overrides: Partial<LayoutOptions> = {}): Record<string, string> {
  const o = layoutOptions(id, overrides);
  return { 'data-layout': id, 'data-l-nav': o.nav, 'data-l-toc': o.toc, 'data-l-width': o.width, 'data-l-density': o.density, 'data-l-steps': o.steps };
}

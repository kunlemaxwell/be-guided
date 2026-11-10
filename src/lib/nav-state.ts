/**
 * Article sidebar state, shared by the pre-paint boot script (layout.tsx)
 * and the toggle button. Stored per browser; "collapsed" shows a slim rail.
 */
export const NAV_STORAGE_KEY = 'help-nav';
export const NAV_STATES = ['expanded', 'collapsed'] as const;
export type NavState = (typeof NAV_STATES)[number];

export function isNavState(value: unknown): value is NavState {
  return value === 'expanded' || value === 'collapsed';
}

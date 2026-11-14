/**
 * The reader's chosen user journeys, kept per product in this browser only
 * (nothing is sent anywhere). "everyone" = the whole guide, no focus.
 */
export const JOURNEY_EVENT = 'pv-journeys-changed';

export interface JourneyChoice {
  /** Chosen journey slugs. Empty = Everyone. */
  slugs: string[];
  /** True once the reader chose or skipped, so the picker stops being open by default. */
  decided: boolean;
}

const key = (product: string) => `pv-journeys:${product}`;

export function readChoice(product: string): JourneyChoice {
  try {
    const raw = window.localStorage.getItem(key(product));
    if (!raw) return { slugs: [], decided: false };
    const v = JSON.parse(raw) as Partial<JourneyChoice>;
    return { slugs: Array.isArray(v.slugs) ? v.slugs.filter((s): s is string => typeof s === 'string') : [], decided: v.decided === true };
  } catch {
    return { slugs: [], decided: false };
  }
}

export function writeChoice(product: string, choice: JourneyChoice): void {
  try {
    window.localStorage.setItem(key(product), JSON.stringify(choice));
  } catch {
    /* private window or blocked storage: the choice just lasts until the page closes */
  }
  window.dispatchEvent(new CustomEvent(JOURNEY_EVENT, { detail: { product } }));
}

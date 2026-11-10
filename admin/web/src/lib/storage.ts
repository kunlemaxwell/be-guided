/**
 * Per-browser conveniences (e.g. sidebar collapsed). Storage can be blocked
 * or full, so every access is wrapped; the app works the same without it.
 */
export function readPref(key: string): string | null {
  try {
    return window.localStorage.getItem(`pv-admin:${key}`);
  } catch {
    return null;
  }
}

export function writePref(key: string, value: string): void {
  try {
    window.localStorage.setItem(`pv-admin:${key}`, value);
  } catch {
    // Not available: the choice just isn't remembered.
  }
}

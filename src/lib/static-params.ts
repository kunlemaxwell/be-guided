/**
 * `output: 'export'` fails the whole build when a dynamic route has nothing to
 * generate (for example a guide with no area of two or more modules yet). An
 * empty list becomes one placeholder address whose page answers 404, so a new
 * or small guide still builds.
 */
export const NO_PARAMS = '_none';

export function orPlaceholder<T extends Record<string, string>>(list: T[], keys: (keyof T)[]): T[] {
  if (list.length > 0) return list;
  return [Object.fromEntries(keys.map((k) => [k, NO_PARAMS])) as T];
}

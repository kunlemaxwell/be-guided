export interface PathStep { id: string; title: string; summary: string; href: string; moduleTitle: string; why?: string }
export interface PathJourney { slug: string; title: string; steps: PathStep[] }

/**
 * Joins the chosen journeys into one reading order: the first journey's steps
 * in order, then the next journey's new steps, and so on. A page used by more
 * than one chosen journey appears once and lists every journey it serves.
 */
export function mergeJourneys(journeys: PathJourney[]): (PathStep & { for: string[] })[] {
  const out = new Map<string, PathStep & { for: string[] }>();
  for (const j of journeys) {
    for (const s of j.steps) {
      const have = out.get(s.id);
      if (have) have.for.push(j.title);
      else out.set(s.id, { ...s, for: [j.title] });
    }
  }
  return [...out.values()];
}

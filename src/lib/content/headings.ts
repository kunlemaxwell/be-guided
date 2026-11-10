/** URL-safe id for a heading, shared by the renderer and "On this page". */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** Level-2 headings (## …) outside code fences and ::: blocks' fences. */
export function extractHeadings(markdown: string): { id: string; text: string }[] {
  const out: { id: string; text: string }[] = [];
  let inFence = false;
  for (const line of markdown.split('\n')) {
    if (line.trimStart().startsWith('```')) inFence = !inFence;
    if (inFence) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m?.[1]) out.push({ id: slugifyHeading(m[1]), text: m[1].replace(/[*_`]/g, '') });
  }
  return out;
}

/** Anchor for a step title (`::::step{title="…"}`), so search results and links can point at one step. */
export function stepAnchor(title: string): string {
  return `step-${slugifyHeading(title)}`;
}

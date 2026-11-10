/** A run of pages under one heading inside a module. */
export interface PageSection<T> {
  /** Undefined for pages that have no section. */
  title: string | undefined;
  pages: T[];
}

/**
 * Groups already-sorted pages by their `section`, keeping the order in which
 * each section first appears. Pages without a section form their own group
 * (first, if any page has no section and comes first).
 */
export function groupBySection<T extends { section?: string | undefined }>(pages: readonly T[]): PageSection<T>[] {
  const groups: PageSection<T>[] = [];
  const byTitle = new Map<string | undefined, PageSection<T>>();
  for (const page of pages) {
    const title = page.section?.trim() || undefined;
    let group = byTitle.get(title);
    if (!group) {
      group = { title, pages: [] };
      byTitle.set(title, group);
      groups.push(group);
    }
    group.pages.push(page);
  }
  return groups;
}

/** True when a module's pages use more than one heading, so headings are worth showing. */
export function hasSections(pages: readonly { section?: string | undefined }[]): boolean {
  return pages.some((p) => p.section?.trim());
}

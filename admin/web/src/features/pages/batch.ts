import type { ContentMode, NewRequestInput, PageSummary } from '../../../../shared/api-types';

/** What one instruction can ask Claude to do for many pages at once. */
export type BatchAction = 'make-video' | 'refresh-page';

export const BATCH_ACTIONS: { value: BatchAction; label: string; hint: string }[] = [
  { value: 'make-video', label: 'Make a video for each page', hint: 'Claude records a real click-through for every selected page.' },
  { value: 'refresh-page', label: 'Update these pages', hint: 'Claude rewrites and retakes what you choose below.' },
];

/** Most pages one instruction may cover (the server allows the same). */
export const MAX_BATCH_PAGES = 500;

/** Adds every id when any is missing, otherwise removes them all (the "select all" box). */
export function toggleAll(selected: ReadonlySet<string>, ids: readonly string[]): Set<string> {
  const next = new Set(selected);
  const allIn = ids.length > 0 && ids.every((id) => next.has(id));
  for (const id of ids) {
    if (allIn) next.delete(id);
    else next.add(id);
  }
  return next;
}

export function toggleOne(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** "all", "some" or "none" of these ids are selected, for a tri-state checkbox. */
export function selectionState(selected: ReadonlySet<string>, ids: readonly string[]): 'all' | 'some' | 'none' {
  const n = ids.filter((id) => selected.has(id)).length;
  if (n === 0) return 'none';
  return n === ids.length ? 'all' : 'some';
}

/**
 * One request for every selected page. Videos are always "Video only";
 * page updates need the owner's content mode (never assumed).
 */
export function buildBatchRequest(pages: readonly PageSummary[], action: BatchAction, mode: ContentMode | null, note: string): NewRequestInput | null {
  if (pages.length === 0 || pages.length > MAX_BATCH_PAGES) return null;
  const contentMode: ContentMode | null = action === 'make-video' ? 'video' : mode;
  if (!contentMode) return null;
  const products = [...new Set(pages.map((p) => p.product))];
  const trimmed = note.trim();
  return {
    type: action,
    scope: { products, pages: pages.map((p) => p.id) },
    contentMode,
    ...(trimmed ? { note: trimmed } : {}),
  };
}

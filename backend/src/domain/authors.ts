/**
 * Page `author` is any non-empty string: a person's name from People.
 * Two legacy values are still read: "claude" and "human".
 */
export function authorDisplayName(author: unknown): string {
  if (typeof author !== 'string' || !author.trim()) return 'Not set';
  const a = author.trim();
  if (a === 'claude') return 'Claude';
  if (a === 'human') return 'Not set';
  return a;
}

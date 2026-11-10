import type { DiffHunk, DiffLine, FieldChange } from '../../../admin/shared/api-types';
import { fieldLabel } from './errors';

/**
 * Pure text and object diffs for version history and the audit log.
 * Text only: image and video files are never copied, only the lines that
 * reference them.
 */

type Op = { op: ' ' | '+' | '-'; text: string };

/** Lines of a text; a trailing newline does not create an empty last line. */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * Myers O((N+M)·D) shortest edit script between two line arrays.
 * Common prefix/suffix are trimmed first so typical edits are near-linear.
 */
export function diffLines(a: string[], b: string[]): Op[] {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const head: Op[] = a.slice(0, start).map((text) => ({ op: ' ', text }));
  const tail: Op[] = a.slice(endA).map((text) => ({ op: ' ', text }));
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  return [...head, ...myers(midA, midB), ...tail];
}

function myers(a: string[], b: string[]): Op[] {
  const n = a.length;
  const m = b.length;
  if (n === 0) return b.map((text) => ({ op: '+', text }));
  if (m === 0) return a.map((text) => ({ op: '-', text }));
  const max = n + m;
  const offset = max;
  const v = new Int32Array(2 * max + 2);
  const trace: Int32Array[] = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!)) x = v[offset + k + 1]!;
      else x = v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) break outer;
    }
  }
  // Walk the trace backwards to recover the edit script.
  const ops: Op[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d >= 0; d--) {
    const vd = trace[d]!;
    const k = x - y;
    let prevK: number;
    if (k === -d || (k !== d && vd[offset + k - 1]! < vd[offset + k + 1]!)) prevK = k + 1;
    else prevK = k - 1;
    const prevX = vd[offset + prevK]!;
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push({ op: ' ', text: a[x - 1]! });
      x--;
      y--;
    }
    if (d > 0) {
      if (x === prevX) ops.push({ op: '+', text: b[y - 1]! });
      else ops.push({ op: '-', text: a[x - 1]! });
    }
    x = prevX;
    y = prevY;
  }
  return ops.reverse();
}

export interface TextDiff {
  hunks: DiffHunk[];
  added: number;
  removed: number;
}

/** Diff two texts into hunks with `context` unchanged lines around each change. */
export function diffText(before: string, after: string, context = 2): TextDiff {
  const ops = diffLines(splitLines(before), splitLines(after));
  const lines: DiffLine[] = [];
  let oldLine = 1;
  let newLine = 1;
  let added = 0;
  let removed = 0;
  for (const o of ops) {
    if (o.op === ' ') lines.push({ op: ' ', text: o.text, oldLine: oldLine++, newLine: newLine++ });
    else if (o.op === '+') {
      added++;
      lines.push({ op: '+', text: o.text, oldLine: null, newLine: newLine++ });
    } else {
      removed++;
      lines.push({ op: '-', text: o.text, oldLine: oldLine++, newLine: null });
    }
  }
  // Keep every line within `context` of a change; contiguous kept runs form hunks.
  const keep = new Uint8Array(lines.length);
  lines.forEach((l, i) => {
    if (l.op === ' ') return;
    for (let j = Math.max(0, i - context); j <= Math.min(lines.length - 1, i + context); j++) keep[j] = 1;
  });
  const hunks: DiffHunk[] = [];
  let current: DiffLine[] | null = null;
  for (let i = 0; i < lines.length; i++) {
    if (!keep[i]) {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      hunks.push({ lines: current });
    }
    current.push(lines[i]!);
  }
  return { hunks, added, removed };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Field-by-field changes between two JSON objects. Nested objects are
 * walked (e.g. "video.src"); arrays are compared as a whole.
 */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, ignore: string[] = [], prefix = ''): FieldChange[] {
  const out: FieldChange[] = [];
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (ignore.includes(path)) continue;
    const a = before[key];
    const b = after[key];
    if (same(a, b)) continue;
    if ((isPlainObject(a) || a === undefined) && (isPlainObject(b) || b === undefined)) {
      out.push(...diffFields(isPlainObject(a) ? a : {}, isPlainObject(b) ? b : {}, ignore, path));
    } else {
      out.push({ field: path, label: fieldLabel(path), before: a ?? null, after: b ?? null });
    }
  }
  return out;
}

/** "Changed title and summary; 12 lines added, 3 removed" */
export function summarizeChange(fields: FieldChange[], added: number, removed: number): string {
  const parts: string[] = [];
  if (fields.length > 0) {
    const names = [...new Set(fields.map((f) => f.label.toLowerCase()))];
    const shown = names.slice(0, 3);
    const more = names.length - shown.length;
    const list = shown.length > 1 ? `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}` : shown[0];
    parts.push(`Changed ${list}${more > 0 ? ` (+${more} more)` : ''}`);
  }
  if (added || removed) {
    const lines: string[] = [];
    if (added) lines.push(`${added} line${added === 1 ? '' : 's'} added`);
    if (removed) lines.push(added ? `${removed} removed` : `${removed} line${removed === 1 ? '' : 's'} removed`);
    parts.push(lines.join(', '));
  }
  return parts.length ? parts.join('; ') : 'Saved with no changes';
}

import { describe, expect, it } from 'vitest';
import { diffFields, diffLines, diffText, splitLines, summarizeChange } from '../../src/domain/diff';

describe('diffLines (Myers)', () => {
  it('returns only unchanged lines for equal input', () => {
    expect(diffLines(['a', 'b'], ['a', 'b']).every((o) => o.op === ' ')).toBe(true);
  });

  it('finds a minimal script', () => {
    const ops = diffLines(['a', 'b', 'c', 'd'], ['a', 'x', 'c', 'd', 'e']);
    expect(ops.filter((o) => o.op === '+').map((o) => o.text)).toEqual(['x', 'e']);
    expect(ops.filter((o) => o.op === '-').map((o) => o.text)).toEqual(['b']);
  });

  it('handles empty sides', () => {
    expect(diffLines([], ['a', 'b']).map((o) => o.op)).toEqual(['+', '+']);
    expect(diffLines(['a'], []).map((o) => o.op)).toEqual(['-']);
    expect(diffLines([], [])).toEqual([]);
  });

  it('rebuilds both texts from the script', () => {
    const a = 'one\ntwo\nthree\nfour\nfive\nsix'.split('\n');
    const b = 'zero\none\nthree\nfour\nFIVE\nsix\nseven'.split('\n');
    const ops = diffLines(a, b);
    expect(ops.filter((o) => o.op !== '+').map((o) => o.text)).toEqual(a);
    expect(ops.filter((o) => o.op !== '-').map((o) => o.text)).toEqual(b);
  });
});

describe('diffText', () => {
  it('counts added and removed lines and keeps 2 lines of context', () => {
    const before = ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9', 'l10'].join('\n');
    const after = ['l1', 'l2', 'l3', 'l4', 'CHANGED', 'l6', 'l7', 'l8', 'l9', 'l10', 'l11'].join('\n');
    const d = diffText(before, after);
    expect(d.added).toBe(2);
    expect(d.removed).toBe(1);
    expect(d.hunks).toHaveLength(2);
    const first = d.hunks[0]!.lines;
    expect(first.map((l) => l.op).join('')).toBe('  -+  ');
    expect(first[0]).toMatchObject({ text: 'l3', oldLine: 3, newLine: 3 });
    expect(d.hunks[1]!.lines.at(-1)).toMatchObject({ op: '+', text: 'l11', oldLine: null, newLine: 11 });
  });

  it('merges nearby changes into one hunk', () => {
    const d = diffText('a\nb\nc\nd\ne', 'A\nb\nc\nD\ne');
    expect(d.hunks).toHaveLength(1);
  });

  it('treats CRLF and a trailing newline like LF', () => {
    expect(splitLines('a\r\nb\n')).toEqual(['a', 'b']);
    expect(diffText('a\nb\n', 'a\r\nb').added).toBe(0);
  });

  it('is fast on long pages', () => {
    const a = Array.from({ length: 4000 }, (_, i) => `line ${i}`);
    const b = [...a];
    b[100] = 'x';
    b.splice(2000, 5);
    const t = Date.now();
    const d = diffText(a.join('\n'), b.join('\n'));
    expect(Date.now() - t).toBeLessThan(500);
    expect(d.removed).toBe(6);
    expect(d.added).toBe(1);
  });
});

describe('diffFields + summarizeChange', () => {
  it('walks nested objects and labels fields', () => {
    const changes = diffFields({ title: 'A', video: { src: 'media/a.mp4' }, order: 1 }, { title: 'B', video: { src: 'media/b.mp4' }, order: 1, audience: 'Sales' });
    expect(changes.map((c) => c.field)).toEqual(['title', 'video.src', 'audience']);
    expect(changes[0]).toMatchObject({ label: 'Title', before: 'A', after: 'B' });
    expect(changes[1]!.label).toBe('Video file');
  });

  it('ignores listed fields', () => {
    expect(diffFields({ updated: '2026-01-01' }, { updated: '2026-02-02' }, ['updated'])).toEqual([]);
  });

  it('writes a human summary', () => {
    expect(summarizeChange([{ field: 'title', label: 'Title', before: 'a', after: 'b' }], 12, 3)).toBe('Changed title; 12 lines added, 3 removed');
    expect(summarizeChange([], 1, 0)).toBe('1 line added');
    expect(summarizeChange([], 0, 0)).toBe('Saved with no changes');
    const many = ['a', 'b', 'c', 'd'].map((f) => ({ field: f, label: f, before: 1, after: 2 }));
    expect(summarizeChange(many, 0, 0)).toBe('Changed a, b and c (+1 more)');
  });
});

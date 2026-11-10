import type { Nodes, PhrasingContent } from 'mdast';

/**
 * Turns a markdown syntax tree into a plain comparable value: positions are
 * dropped and inline formatting becomes "text + set of marks", so two trees
 * that mean the same thing compare equal even if bold/italic nest differently.
 */
type Plain = string | number | boolean | null | Plain[] | { [key: string]: Plain };

interface InlineLeaf {
  kind: string;
  value: string;
  marks: string[];
}

function flatten(children: PhrasingContent[], marks: string[], out: InlineLeaf[]): void {
  for (const c of children) {
    switch (c.type) {
      case 'text':
        out.push({ kind: 'text', value: c.value, marks });
        break;
      case 'inlineCode':
        out.push({ kind: 'code', value: c.value, marks });
        break;
      case 'break':
        out.push({ kind: 'break', value: '', marks });
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
        flatten(c.children, [...marks, c.type], out);
        break;
      case 'link':
        flatten(c.children, [...marks, `link:${c.url}|${c.title ?? ''}`], out);
        break;
      default:
        out.push({ kind: c.type, value: JSON.stringify(plain(c)), marks });
    }
  }
}

function inline(children: PhrasingContent[]): Plain {
  const leaves: InlineLeaf[] = [];
  flatten(children, [], leaves);
  const merged: InlineLeaf[] = [];
  for (const leaf of leaves) {
    const m = [...leaf.marks].sort();
    const prev = merged[merged.length - 1];
    if (prev && prev.kind === 'text' && leaf.kind === 'text' && prev.marks.join() === m.join()) prev.value += leaf.value;
    else merged.push({ ...leaf, marks: m });
  }
  return merged.map((l) => ({ kind: l.kind, value: l.value, marks: l.marks }));
}

const PHRASING_PARENTS = new Set(['paragraph', 'heading', 'tableCell']);

export function plain(node: Nodes): Plain {
  const out: { [key: string]: Plain } = {};
  for (const [key, value] of Object.entries(node).sort(([a], [b]) => a.localeCompare(b))) {
    if (key === 'position' || value === undefined) continue;
    if (key === 'children' && PHRASING_PARENTS.has(node.type)) {
      out.children = inline(value as PhrasingContent[]);
    } else if (key === 'children') {
      out.children = (value as Nodes[]).map(plain);
    } else if (key === 'attributes' && value && typeof value === 'object') {
      out.attributes = Object.fromEntries(Object.entries(value as Record<string, string>).sort(([a], [b]) => a.localeCompare(b)));
    } else {
      out[key] = value as Plain;
    }
  }
  return out;
}

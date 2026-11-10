import type {
  Heading,
  Html,
  Image,
  Link,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableCell,
  TableRow,
} from 'mdast';
import type { ContainerDirective, LeafDirective } from 'mdast-util-directive';
import { parseMarkdown, stringifyMarkdown } from './processor';
import {
  CALLOUT_KINDS,
  MARK,
  NODE,
  type CalloutKind,
  type DirectiveAttributes,
  type EditorDoc,
  type EditorMark,
  type EditorNode,
} from './types';

/**
 * Guide markdown <-> rich-text editor JSON.
 *
 * Supported constructs become real editor nodes. Anything else (code blocks,
 * quotes, HTML, unknown directives, task lists, odd inline syntax ...) becomes
 * a "raw markdown" block holding the exact original text, so saving never
 * drops content. A paragraph or list is either fully supported or kept raw
 * as a whole.
 */

// ───────────────────────────── markdown → editor ─────────────────────────────

export function markdownToEditor(markdown: string): EditorDoc {
  return mdastToEditor(parseMarkdown(markdown), markdown);
}

export function mdastToEditor(tree: Root, source: string): EditorDoc {
  const content = toEditorBlocks(tree.children, source);
  return { type: NODE.doc, content: content.length > 0 ? content : [{ type: NODE.paragraph }] };
}

function toEditorBlocks(nodes: RootContent[], source: string): EditorNode[] {
  return nodes.map((node) => toEditorBlock(node, source));
}

function rawBlock(node: RootContent, source: string): EditorNode {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  const markdown =
    typeof start === 'number' && typeof end === 'number'
      ? source.slice(start, end)
      : stringifyMarkdown({ type: 'root', children: [node] }).trimEnd();
  return { type: NODE.raw, attrs: { markdown } };
}

function paragraphNode(content: EditorNode[]): EditorNode {
  return content.length > 0 ? { type: NODE.paragraph, content } : { type: NODE.paragraph };
}

function toEditorBlock(node: RootContent, source: string): EditorNode {
  switch (node.type) {
    case 'paragraph': {
      const image = soleImage(node);
      if (image) {
        return { type: NODE.image, attrs: { src: image.url, alt: image.alt ?? null, title: image.title ?? null } };
      }
      const inline = toEditorInline(node.children, []);
      return inline ? paragraphNode(inline) : rawBlock(node, source);
    }
    case 'heading': {
      const inline = toEditorInline(node.children, []);
      return inline && inline.length > 0
        ? { type: NODE.heading, attrs: { level: node.depth }, content: inline }
        : rawBlock(node, source);
    }
    case 'list':
      return toEditorList(node) ?? rawBlock(node, source);
    case 'table':
      return toEditorTable(node) ?? rawBlock(node, source);
    case 'containerDirective':
      return toEditorContainer(node, source) ?? rawBlock(node, source);
    case 'leafDirective':
      return toEditorPostings(node) ?? rawBlock(node, source);
    default:
      return rawBlock(node, source);
  }
}

function soleImage(node: Paragraph): Image | null {
  const [only, ...rest] = node.children;
  return only && rest.length === 0 && only.type === 'image' ? only : null;
}

function toEditorList(node: List): EditorNode | null {
  const items: EditorNode[] = [];
  for (const item of node.children) {
    if (item.checked !== null && item.checked !== undefined) return null;
    const [first] = item.children;
    if (!first || first.type !== 'paragraph') return null;
    const content: EditorNode[] = [];
    for (const child of item.children) {
      if (child.type === 'paragraph') {
        const inline = toEditorInline(child.children, []);
        if (!inline) return null;
        content.push(paragraphNode(inline));
      } else if (child.type === 'list') {
        const sub = toEditorList(child);
        if (!sub) return null;
        content.push(sub);
      } else {
        return null;
      }
    }
    items.push({ type: NODE.listItem, attrs: { spread: item.spread ?? false }, content });
  }
  if (items.length === 0) return null;
  const spread = node.spread ?? false;
  return node.ordered
    ? { type: NODE.orderedList, attrs: { start: node.start ?? 1, spread }, content: items }
    : { type: NODE.bulletList, attrs: { spread }, content: items };
}

function toEditorTable(node: Table): EditorNode | null {
  const width = node.children[0]?.children.length ?? 0;
  if (width === 0) return null;
  const rows: EditorNode[] = [];
  for (const [rowIndex, row] of node.children.entries()) {
    if (row.children.length !== width) return null;
    const cells: EditorNode[] = [];
    for (const cell of row.children) {
      const inline = toEditorInline(cell.children, []);
      if (!inline) return null;
      cells.push({ type: rowIndex === 0 ? NODE.tableHeader : NODE.tableCell, content: [paragraphNode(inline)] });
    }
    rows.push({ type: NODE.tableRow, content: cells });
  }
  return { type: NODE.table, attrs: { align: node.align ?? [] }, content: rows };
}

function stringAttributes(attrs: ContainerDirective['attributes']): DirectiveAttributes | null {
  const out: DirectiveAttributes = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (typeof value !== 'string') return null;
    out[key] = value;
  }
  return out;
}

function hasDirectiveLabel(node: ContainerDirective): boolean {
  const first = node.children[0];
  return first?.type === 'paragraph' && Boolean((first.data as { directiveLabel?: boolean } | undefined)?.directiveLabel);
}

function withoutKeys(attrs: DirectiveAttributes, keys: string[]): DirectiveAttributes {
  const out: DirectiveAttributes = {};
  for (const [key, value] of Object.entries(attrs)) if (!keys.includes(key)) out[key] = value;
  return out;
}

function toEditorStep(node: ContainerDirective, source: string): EditorNode | null {
  const attributes = stringAttributes(node.attributes);
  if (!attributes || hasDirectiveLabel(node) || node.children.length === 0) return null;
  return {
    type: NODE.step,
    attrs: { title: attributes.title ?? null, attributes: withoutKeys(attributes, ['title']) },
    content: toEditorBlocks(node.children, source),
  };
}

function toEditorContainer(node: ContainerDirective, source: string): EditorNode | null {
  const attributes = stringAttributes(node.attributes);
  if (!attributes || hasDirectiveLabel(node) || node.children.length === 0) return null;
  if (node.name === 'steps') {
    const content = node.children.map((child) =>
      child.type === 'containerDirective' && child.name === 'step'
        ? (toEditorStep(child, source) ?? rawBlock(child, source))
        : toEditorBlock(child, source),
    );
    return { type: NODE.steps, attrs: { attributes }, content };
  }
  if (node.name === 'legend') {
    return { type: NODE.legend, attrs: { attributes }, content: toEditorBlocks(node.children, source) };
  }
  if ((CALLOUT_KINDS as readonly string[]).includes(node.name)) {
    return {
      type: NODE.callout,
      attrs: { kind: node.name as CalloutKind, attributes },
      content: toEditorBlocks(node.children, source),
    };
  }
  return null;
}

function toEditorPostings(node: LeafDirective): EditorNode | null {
  if (node.name !== 'postings' || node.children.length > 0) return null;
  const attributes = stringAttributes(node.attributes);
  if (!attributes) return null;
  return {
    type: NODE.postings,
    attrs: {
      to: attributes.to ?? null,
      label: attributes.label ?? null,
      attributes: withoutKeys(attributes, ['to', 'label']),
    },
  };
}

function hasMark(marks: EditorMark[], type: string): boolean {
  return marks.some((m) => m.type === type);
}

function withMark(marks: EditorMark[], mark: EditorMark): EditorMark[] | null {
  return hasMark(marks, mark.type) ? null : [...marks, mark];
}

function textNode(text: string, marks: EditorMark[]): EditorNode {
  return marks.length > 0 ? { type: NODE.text, text, marks } : { type: NODE.text, text };
}

/** Returns null when the run contains something the editor can't represent. */
function toEditorInline(nodes: PhrasingContent[], marks: EditorMark[]): EditorNode[] | null {
  const out: EditorNode[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        if (node.value) out.push(textNode(node.value, marks));
        break;
      case 'inlineCode': {
        const next = withMark(marks, { type: MARK.code });
        if (!node.value || !next) return null;
        out.push(textNode(node.value, next));
        break;
      }
      case 'break':
        out.push(marks.length > 0 ? { type: NODE.hardBreak, marks } : { type: NODE.hardBreak });
        break;
      case 'strong':
      case 'emphasis':
      case 'delete':
      case 'link': {
        const mark: EditorMark =
          node.type === 'strong'
            ? { type: MARK.bold }
            : node.type === 'emphasis'
              ? { type: MARK.italic }
              : node.type === 'delete'
                ? { type: MARK.strike }
                : { type: MARK.link, attrs: { href: node.url, title: node.title ?? null } };
        const next = withMark(marks, mark);
        if (!next) return null;
        const inner = toEditorInline(node.children, next);
        if (!inner || inner.length === 0) return null;
        out.push(...inner);
        break;
      }
      default:
        return null;
    }
  }
  return out;
}

// ───────────────────────────── editor → markdown ─────────────────────────────

export function editorToMarkdown(doc: EditorDoc): string {
  return tidyMarkdown(stringifyMarkdown(editorToMdast(doc)));
}

/** Small cosmetic fixes so saved files look like the hand-written ones. */
export function tidyMarkdown(markdown: string): string {
  return (
    markdown
      // `guide\:sales/x` → `guide:sales/x` inside link destinations (same meaning).
      .replace(/(\]\()([a-z][a-z0-9+.-]*)\\:/gi, '$1$2:')
      // `| - | - |` → `| --- | --- |`
      .replace(/^\|(?: *:?-+:? *\|)+ *$/gm, (line) => line.replace(/-+/g, '---'))
  );
}

export function editorToMdast(doc: EditorDoc): Root {
  return { type: 'root', children: toMdastBlocks(doc.content) };
}

function attrString(node: EditorNode, key: string): string | null {
  const v = node.attrs?.[key];
  return typeof v === 'string' ? v : null;
}

function attrDirective(node: EditorNode): DirectiveAttributes {
  const v = node.attrs?.attributes;
  const out: DirectiveAttributes = {};
  if (v && typeof v === 'object') {
    for (const [key, value] of Object.entries(v as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
    }
  }
  return out;
}

function toMdastBlocks(nodes: EditorNode[] | undefined): RootContent[] {
  const out: RootContent[] = [];
  for (const node of nodes ?? []) {
    const block = toMdastBlock(node);
    if (block) out.push(block);
  }
  return out;
}

function toMdastBlock(node: EditorNode): RootContent | null {
  switch (node.type) {
    case NODE.paragraph: {
      const children = toPhrasing(node.content);
      return children.length > 0 ? ({ type: 'paragraph', children } satisfies Paragraph) : null;
    }
    case NODE.heading: {
      const children = toPhrasing(node.content);
      const level = Number(node.attrs?.level ?? 2);
      const depth = Math.min(6, Math.max(1, Number.isFinite(level) ? level : 2)) as Heading['depth'];
      return children.length > 0 ? ({ type: 'heading', depth, children } satisfies Heading) : null;
    }
    case NODE.bulletList:
    case NODE.orderedList:
      return toMdastList(node);
    case NODE.image: {
      const image: Image = { type: 'image', url: attrString(node, 'src') ?? '', alt: attrString(node, 'alt'), title: attrString(node, 'title') };
      return { type: 'paragraph', children: [image] };
    }
    case NODE.table:
      return toMdastTable(node);
    case NODE.steps:
      return container('steps', attrDirective(node), toMdastBlocks(node.content));
    case NODE.step: {
      const title = attrString(node, 'title');
      return container('step', { ...(title !== null ? { title } : {}), ...attrDirective(node) }, toMdastBlocks(node.content));
    }
    case NODE.legend:
      return container('legend', attrDirective(node), toMdastBlocks(node.content));
    case NODE.callout: {
      const kind = attrString(node, 'kind');
      const name = kind && (CALLOUT_KINDS as readonly string[]).includes(kind) ? kind : 'note';
      return container(name, attrDirective(node), toMdastBlocks(node.content));
    }
    case NODE.postings: {
      const to = attrString(node, 'to');
      const label = attrString(node, 'label');
      const leaf: LeafDirective = {
        type: 'leafDirective',
        name: 'postings',
        attributes: { ...(to !== null ? { to } : {}), ...(label ? { label } : {}), ...attrDirective(node) },
        children: [],
      };
      return leaf;
    }
    case NODE.raw: {
      const markdown = attrString(node, 'markdown') ?? '';
      return markdown.trim() ? ({ type: 'html', value: markdown.replace(/\s+$/, '') } satisfies Html) : null;
    }
    default:
      throw new Error(`The editor produced a block the guide format doesn't know: "${node.type}".`);
  }
}

function container(name: string, attributes: DirectiveAttributes, children: RootContent[]): ContainerDirective {
  return { type: 'containerDirective', name, attributes, children: children as ContainerDirective['children'] };
}

function toMdastList(node: EditorNode): List {
  const ordered = node.type === NODE.orderedList;
  const items: ListItem[] = (node.content ?? []).map((item) => ({
    type: 'listItem',
    spread: item.attrs?.spread === true,
    checked: null,
    children: toMdastBlocks(item.content) as ListItem['children'],
  }));
  const start = Number(node.attrs?.start ?? 1);
  return {
    type: 'list',
    ordered,
    start: ordered ? (Number.isFinite(start) ? start : 1) : null,
    spread: node.attrs?.spread === true,
    children: items,
  };
}

function toMdastTable(node: EditorNode): Table {
  const rawAlign = node.attrs?.align;
  const align = Array.isArray(rawAlign)
    ? rawAlign.map((a) => (a === 'left' || a === 'right' || a === 'center' ? a : null))
    : [];
  const rows: TableRow[] = (node.content ?? []).map((row) => ({
    type: 'tableRow',
    children: (row.content ?? []).map((cell): TableCell => ({ type: 'tableCell', children: cellPhrasing(cell) })),
  }));
  return { type: 'table', align, children: rows };
}

/** A table cell holds one line in markdown; extra paragraphs are joined with a space. */
function cellPhrasing(cell: EditorNode): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const block of cell.content ?? []) {
    const part = block.type === NODE.paragraph ? toPhrasing(block.content) : [{ type: 'text', value: plainText(block) } as const];
    if (part.length === 0) continue;
    if (out.length > 0) out.push({ type: 'text', value: ' ' });
    out.push(...part);
  }
  return mergeText(out);
}

function plainText(node: EditorNode): string {
  if (node.type === NODE.text) return node.text ?? '';
  return (node.content ?? []).map(plainText).join(' ');
}

interface InlineItem {
  node: EditorNode;
  marks: EditorMark[];
}

const MARK_PRIORITY: string[] = [MARK.link, MARK.bold, MARK.italic, MARK.strike];

function sameMark(a: EditorMark, b: EditorMark): boolean {
  if (a.type !== b.type) return false;
  if (a.type !== MARK.link) return true;
  return a.attrs?.href === b.attrs?.href && (a.attrs?.title ?? null) === (b.attrs?.title ?? null);
}

function toPhrasing(nodes: EditorNode[] | undefined): PhrasingContent[] {
  const items: InlineItem[] = (nodes ?? [])
    .filter((n) => n.type === NODE.hardBreak || (n.type === NODE.text && Boolean(n.text)))
    .map((n) => ({ node: n, marks: (n.marks ?? []).filter((m) => m.type === MARK.code || MARK_PRIORITY.includes(m.type)) }));
  return mergeText(buildPhrasing(items));
}

/** Wraps the longest-running mark first, so nesting matches how people write markdown. */
function buildPhrasing(items: InlineItem[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  let i = 0;
  while (i < items.length) {
    const item = items[i] as InlineItem;
    const candidates = item.marks.filter((m) => m.type !== MARK.code);
    if (candidates.length === 0) {
      out.push(leaf(item));
      i += 1;
      continue;
    }
    let best = candidates[0] as EditorMark;
    let bestRun = 0;
    for (const mark of candidates) {
      let run = 0;
      while (i + run < items.length && (items[i + run] as InlineItem).marks.some((m) => sameMark(m, mark))) run += 1;
      const better =
        run > bestRun || (run === bestRun && MARK_PRIORITY.indexOf(mark.type) < MARK_PRIORITY.indexOf(best.type));
      if (better) {
        best = mark;
        bestRun = run;
      }
    }
    const inner = items
      .slice(i, i + bestRun)
      .map((x) => ({ node: x.node, marks: x.marks.filter((m) => !sameMark(m, best)) }));
    out.push(wrap(best, buildPhrasing(inner)));
    i += bestRun;
  }
  return out;
}

function leaf(item: InlineItem): PhrasingContent {
  if (item.node.type === NODE.hardBreak) return { type: 'break' };
  const value = item.node.text ?? '';
  return hasMark(item.marks, MARK.code) ? { type: 'inlineCode', value } : { type: 'text', value };
}

function wrap(mark: EditorMark, children: PhrasingContent[]): PhrasingContent {
  switch (mark.type) {
    case MARK.bold:
      return { type: 'strong', children };
    case MARK.italic:
      return { type: 'emphasis', children };
    case MARK.strike:
      return { type: 'delete', children };
    default: {
      const href = mark.attrs?.href;
      const title = mark.attrs?.title;
      const link: Link = {
        type: 'link',
        url: typeof href === 'string' ? href : '',
        title: typeof title === 'string' && title ? title : null,
        children,
      };
      return link;
    }
  }
}

function mergeText(nodes: PhrasingContent[]): PhrasingContent[] {
  const out: PhrasingContent[] = [];
  for (const node of nodes) {
    const prev = out[out.length - 1];
    if (node.type === 'text' && prev?.type === 'text') prev.value += node.value;
    else out.push(node);
  }
  return out;
}

/**
 * The JSON shape the rich-text editor (TipTap / ProseMirror) reads and writes.
 * Declared here so the markdown converter can run without a browser.
 */
export interface EditorMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface EditorNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: EditorNode[];
  marks?: EditorMark[];
  text?: string;
}

export interface EditorDoc extends EditorNode {
  type: 'doc';
  content: EditorNode[];
}

/** Node and mark names shared by the converter and the editor schema. */
export const NODE = {
  doc: 'doc',
  paragraph: 'paragraph',
  heading: 'heading',
  text: 'text',
  hardBreak: 'hardBreak',
  bulletList: 'bulletList',
  orderedList: 'orderedList',
  listItem: 'listItem',
  table: 'table',
  tableRow: 'tableRow',
  tableHeader: 'tableHeader',
  tableCell: 'tableCell',
  image: 'guideImage',
  steps: 'guideSteps',
  step: 'guideStep',
  legend: 'guideLegend',
  callout: 'guideCallout',
  postings: 'guidePostings',
  raw: 'rawMarkdown',
} as const;

export const MARK = {
  bold: 'bold',
  italic: 'italic',
  strike: 'strike',
  code: 'code',
  link: 'link',
} as const;

export const CALLOUT_KINDS = ['note', 'tip', 'warning'] as const;
export type CalloutKind = (typeof CALLOUT_KINDS)[number];

/** Directive attributes kept as-is so nothing is lost on save. */
export type DirectiveAttributes = Record<string, string>;

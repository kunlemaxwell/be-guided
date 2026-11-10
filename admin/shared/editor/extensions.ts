import { Extension, Node, type AnyExtension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import { NODE } from '../markdown/types';

/**
 * The editor schema, without any React. The web app adds node views on top
 * (see web/src/features/editor/extensions.ts); the tests use this directly to
 * check that every converted page is a valid editor document.
 */

export interface GuideImageOptions {
  /** Turns "images/x.webp" into a URL the browser can load. */
  resolveSrc: (src: string) => string;
}

const directiveAttributes = { attributes: { default: {}, rendered: false } };

/** Markdown-only details (loose lists, table column alignment) kept through edits. */
const MarkdownDetails = Extension.create({
  name: 'markdownDetails',
  addGlobalAttributes() {
    return [
      { types: [NODE.bulletList, NODE.orderedList, NODE.listItem], attributes: { spread: { default: false, rendered: false } } },
      { types: [NODE.table], attributes: { align: { default: [], rendered: false } } },
    ];
  },
});

export const GuideImage = Node.create<GuideImageOptions>({
  name: NODE.image,
  group: 'block',
  atom: true,
  draggable: true,
  addOptions() {
    return { resolveSrc: (src: string) => src };
  },
  addAttributes() {
    return { src: { default: '' }, alt: { default: null }, title: { default: null } };
  },
  parseHTML() {
    return [
      {
        tag: 'figure[data-guide-image]',
        getAttrs: (el) => ({ src: el.getAttribute('data-src') ?? '', alt: el.getAttribute('data-alt') }),
      },
    ];
  },
  renderHTML({ node }) {
    const src = String(node.attrs.src ?? '');
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
    return [
      'figure',
      { class: 'pv-image', 'data-guide-image': '', 'data-src': src, 'data-alt': alt },
      ['img', { src: this.options.resolveSrc(src), alt }],
      ['figcaption', {}, alt || src],
    ];
  },
});

export const GuideSteps = Node.create({
  name: NODE.steps,
  group: 'block',
  content: `(${NODE.step} | block)+`,
  defining: true,
  addAttributes() {
    return directiveAttributes;
  },
  parseHTML() {
    return [{ tag: 'div[data-guide-steps]' }];
  },
  renderHTML() {
    return ['div', { class: 'pv-steps', 'data-guide-steps': '' }, 0];
  },
});

export const GuideStep = Node.create({
  name: NODE.step,
  content: 'block+',
  defining: true,
  addAttributes() {
    return { title: { default: null, rendered: false }, ...directiveAttributes };
  },
  parseHTML() {
    return [{ tag: 'section[data-guide-step]', getAttrs: (el) => ({ title: el.getAttribute('data-title') }) }];
  },
  renderHTML({ node }) {
    return ['section', { class: 'pv-step', 'data-guide-step': '', 'data-title': String(node.attrs.title ?? '') }, 0];
  },
});

export const GuideLegend = Node.create({
  name: NODE.legend,
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return directiveAttributes;
  },
  parseHTML() {
    return [{ tag: 'div[data-guide-legend]' }];
  },
  renderHTML() {
    return ['div', { class: 'pv-legend', 'data-guide-legend': '' }, 0];
  },
});

export const GuideCallout = Node.create({
  name: NODE.callout,
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return { kind: { default: 'note', rendered: false }, ...directiveAttributes };
  },
  parseHTML() {
    return [{ tag: 'aside[data-guide-callout]', getAttrs: (el) => ({ kind: el.getAttribute('data-kind') ?? 'note' }) }];
  },
  renderHTML({ node }) {
    return ['aside', { class: 'pv-callout', 'data-guide-callout': '', 'data-kind': String(node.attrs.kind) }, 0];
  },
});

export const GuidePostings = Node.create({
  name: NODE.postings,
  group: 'block',
  atom: true,
  addAttributes() {
    return { to: { default: null, rendered: false }, label: { default: null, rendered: false }, ...directiveAttributes };
  },
  parseHTML() {
    return [{ tag: 'div[data-guide-postings]', getAttrs: (el) => ({ to: el.getAttribute('data-to') }) }];
  },
  renderHTML({ node }) {
    return ['div', { class: 'pv-postings', 'data-guide-postings': '', 'data-to': String(node.attrs.to ?? '') }, `Postings: ${String(node.attrs.to ?? '')}`];
  },
});

export const RawMarkdown = Node.create({
  name: NODE.raw,
  group: 'block',
  atom: true,
  addAttributes() {
    return { markdown: { default: '', rendered: false } };
  },
  parseHTML() {
    return [{ tag: 'pre[data-raw-markdown]', getAttrs: (el) => ({ markdown: el.textContent ?? '' }) }];
  },
  renderHTML({ node }) {
    return ['pre', { class: 'pv-raw', 'data-raw-markdown': '' }, String(node.attrs.markdown ?? '')];
  },
});

export const GuideLink = Link.extend({
  addAttributes() {
    return { ...this.parent?.(), title: { default: null } };
  },
}).configure({
  openOnClick: false,
  autolink: false,
  linkOnPaste: true,
  protocols: ['guide'],
  HTMLAttributes: { target: null, rel: null },
  isAllowedUri: (url, ctx) => url.startsWith('guide:') || url.startsWith('#') || ctx.defaultValidate(url),
});

export interface CoreExtensionOptions {
  resolveImageSrc?: (src: string) => string;
}

/** Every extension that shapes the document. Node views are added by the web app. */
export function coreExtensions(options: CoreExtensionOptions = {}): AnyExtension[] {
  return [
    StarterKit.configure({ blockquote: false, codeBlock: false, horizontalRule: false }),
    MarkdownDetails,
    GuideLink,
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    GuideImage.configure({ resolveSrc: options.resolveImageSrc ?? ((src: string) => src) }),
    GuideSteps,
    GuideStep,
    GuideLegend,
    GuideCallout,
    GuidePostings,
    RawMarkdown,
  ];
}

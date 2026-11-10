import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkDirective from 'remark-directive';
import remarkStringify from 'remark-stringify';
import type { Root } from 'mdast';

/**
 * The one place that turns guide markdown into a syntax tree and back.
 * Both directions use the same plugins as the site (GFM + directives), and the
 * stringify options match how the guide pages are written by hand.
 */
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

const stringifier = unified()
  .use(remarkStringify, {
    bullet: '-',
    emphasis: '*',
    strong: '*',
    rule: '-',
    fence: '`',
    fences: true,
    listItemIndent: 'one',
    incrementListMarker: true,
  })
  .use(remarkGfm, { tablePipeAlign: false, tableCellPadding: true })
  .use(remarkDirective);

export function parseMarkdown(markdown: string): Root {
  return parser.parse(markdown) as Root;
}

export function stringifyMarkdown(tree: Root): string {
  return stringifier.stringify(tree);
}

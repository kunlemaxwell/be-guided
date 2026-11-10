import { visit } from 'unist-util-visit';
import type { Root } from 'mdast';

/**
 * Maps ::: blocks to elements the renderer understands:
 *
 *   ::::steps / :::step{title="…"}   → <guide-steps> / <guide-step data-title>
 *   :::note / :::tip / :::warning     → <guide-callout data-kind>
 *   :::legend (numbered list)          → <guide-legend>, the key to a screenshot's markers
 *
 *   ::postings{to="accounting/what-gets-posted#invoice"}
 *                                      → <guide-postings data-to>, a "See expected postings" link
 *                                        whose hover card shows that section's table
 *
 * Text like "10:30" can be mis-read as an inline directive; any unknown
 * inline/leaf directive is turned back into its original text.
 */
const CALLOUTS = new Set(['note', 'tip', 'warning']);

interface DirectiveNode {
  type: 'containerDirective' | 'leafDirective' | 'textDirective';
  name: string;
  attributes?: Record<string, string | null | undefined> | null;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
  children: unknown[];
}

export function remarkGuide() {
  return (tree: Root) => {
    visit(tree, (node, index, parent) => {
      const n = node as unknown as DirectiveNode;
      if (n.type === 'containerDirective') {
        const data = (n.data ??= {});
        if (n.name === 'steps') {
          data.hName = 'guide-steps';
        } else if (n.name === 'step') {
          data.hName = 'guide-step';
          data.hProperties = { 'data-title': n.attributes?.title ?? '' };
        } else if (n.name === 'legend') {
          data.hName = 'guide-legend';
        } else if (CALLOUTS.has(n.name)) {
          data.hName = 'guide-callout';
          data.hProperties = { 'data-kind': n.name };
        } else {
          data.hName = 'div';
        }
        return;
      }
      if (n.type === 'leafDirective' && n.name === 'postings') {
        const data = (n.data ??= {});
        data.hName = 'guide-postings';
        data.hProperties = { 'data-to': n.attributes?.to ?? '', 'data-label': n.attributes?.label ?? '' };
        return;
      }
      if ((n.type === 'textDirective' || n.type === 'leafDirective') && parent && typeof index === 'number') {
        const prefix = n.type === 'textDirective' ? ':' : '::';
        (parent as { children: unknown[] }).children[index] = { type: 'text', value: `${prefix}${n.name}` };
      }
    });
  };
}

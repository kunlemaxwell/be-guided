import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { editorToMarkdown, markdownToEditor } from '../shared/markdown/convert';
import { parseMarkdown } from '../shared/markdown/processor';
import { coreExtensions } from '../shared/editor/extensions';
import { NODE, type EditorNode } from '../shared/markdown/types';
import { splitPageFile } from '../../backend/src/domain/page-file';
import { plain } from './normalize';

const CONTENT = path.resolve(__dirname, '../../backend/tests/fixtures/content/products');

function allPages(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory() && !e.name.startsWith('_') && e.name !== 'images' && e.name !== 'media') walk(full);
      else if (e.isFile() && e.name.endsWith('.md')) out.push(full);
    }
  };
  walk(CONTENT);
  return out.sort();
}

function roundTrip(markdown: string): string {
  return editorToMarkdown(markdownToEditor(markdown));
}

function countRaw(node: EditorNode): number {
  return (node.type === NODE.raw ? 1 : 0) + (node.content ?? []).reduce((n, c) => n + countRaw(c), 0);
}

const schema = getSchema(coreExtensions());
const pages = allPages();

describe('markdown ⇄ editor round trip (every guide page)', () => {
  it('finds the guide pages', () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  for (const file of pages) {
    const rel = path.relative(CONTENT, file);
    it(`keeps ${rel} unchanged in meaning`, () => {
      const { body } = splitPageFile(fs.readFileSync(file, 'utf8'));
      const doc = markdownToEditor(body);
      // A valid editor document …
      expect(() => schema.nodeFromJSON(doc).check()).not.toThrow();
      // … the guide constructs are real editor blocks, not raw text …
      expect(countRaw(doc)).toBe(0);
      // … and saving it back means exactly the same thing.
      const out = editorToMarkdown(doc);
      expect(plain(parseMarkdown(out))).toEqual(plain(parseMarkdown(body)));
      // A second pass is stable.
      expect(roundTrip(out)).toBe(out);
    });
  }
});

describe('things the editor has no button for are kept as raw markdown', () => {
  const samples: Record<string, string> = {
    'code block': 'Before\n\n```js\nconst a = 1;\n```\n\nAfter\n',
    quote: '> Quoted **text**\n> second line\n',
    html: '<div class="x">Hi</div>\n',
    'unknown directive': ':::details{open}\nHidden *stuff*\n:::\n',
    'directive label': ':::note[Heads up]\nCareful\n:::\n',
    'task list': '- [ ] todo\n- [x] done\n',
    footnote: 'Text[^1]\n\n[^1]: The note.\n',
    'unknown leaf directive': '::video{src="x.mp4"}\n',
    'thematic break': 'A\n\n---\n\nB\n',
    'inline image': 'See ![icon](images/i.webp) here.\n',
    'list with code': '- one\n\n  ```\n  code\n  ```\n- two\n',
    'step outside steps': ':::step{title="Lonely"}\nAlone\n:::\n',
    'nested raw in step': '::::::steps\n::::step{title="A"}\n> quote in a step\n\n```\ncode\n```\n::::\n::::::\n',
  };
  for (const [name, md] of Object.entries(samples)) {
    it(name, () => {
      const doc = markdownToEditor(md);
      expect(() => schema.nodeFromJSON(doc).check()).not.toThrow();
      const out = editorToMarkdown(doc);
      expect(plain(parseMarkdown(out))).toEqual(plain(parseMarkdown(md)));
    });
  }
});

describe('editor constructs', () => {
  it('converts steps, legend, callouts and postings to editor blocks', () => {
    const md = [
      '::::::steps',
      '::::step{title="Open it"}',
      'Click **Open**.',
      '',
      '![Alt](images/a.webp)',
      '',
      ':::legend',
      '1. First',
      '2. Second',
      ':::',
      '',
      '::postings{to="accounting/what-gets-posted#invoice" label="See postings"}',
      '::::',
      '::::::',
      '',
      ':::warning',
      'Careful with [this](guide:sales/add-a-customer).',
      ':::',
      '',
    ].join('\n');
    const doc = markdownToEditor(md);
    const types = doc.content.map((n) => n.type);
    expect(types).toEqual([NODE.steps, NODE.callout]);
    const step = doc.content[0]?.content?.[0];
    expect(step?.type).toBe(NODE.step);
    expect(step?.attrs?.title).toBe('Open it');
    expect(step?.content?.map((n) => n.type)).toEqual([NODE.paragraph, NODE.image, NODE.legend, NODE.postings]);
    expect(step?.content?.[3]?.attrs).toMatchObject({ to: 'accounting/what-gets-posted#invoice', label: 'See postings' });
    expect(doc.content[1]?.attrs?.kind).toBe('warning');
    const out = editorToMarkdown(doc);
    expect(out).toContain('[this](guide:sales/add-a-customer)');
    expect(out).toContain('::postings{to="accounting/what-gets-posted#invoice" label="See postings"}');
  });

  it('writes table delimiter rows the way the guide does', () => {
    const out = roundTrip('| A | B |\n| --- | :-: |\n| 1 | 2 |\n');
    expect(out).toContain('| --- | :---: |');
  });

  it('keeps an edited title and new text', () => {
    const doc = markdownToEditor(':::::steps\n::::step{title="Old"}\nText\n::::\n:::::\n');
    const step = doc.content[0]?.content?.[0];
    if (!step?.attrs) throw new Error('no step');
    step.attrs.title = 'New "quoted" title';
    expect(editorToMarkdown(doc)).toContain(':::step{title="New &#x22;quoted&#x22; title"}');
  });
});

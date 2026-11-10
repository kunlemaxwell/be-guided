import { useMemo, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import type { GuideTarget, ModuleImage } from '../../../../shared/api-types';
import { editorToMarkdown, markdownToEditor } from '../../../../shared/markdown/convert';
import { NODE, type EditorDoc, type EditorMark, type EditorNode } from '../../../../shared/markdown/types';
import { editorExtensions } from './extensions';
import { moduleFileUrl } from '../../api/endpoints';
import { Toolbar } from './Toolbar';

interface Props {
  /** The page body as it is now (markdown). */
  value: string;
  initialValue: string;
  onChange: (markdown: string) => void;
  images: ModuleImage[];
  targets: GuideTarget[];
  product: string;
  module: string;
}

function toEditorNode(json: JSONContent): EditorNode {
  const node: EditorNode = { type: json.type ?? NODE.paragraph };
  if (json.attrs) node.attrs = json.attrs;
  if (typeof json.text === 'string') node.text = json.text;
  if (json.marks?.length) node.marks = json.marks.map((m): EditorMark => ({ type: m.type, ...(m.attrs ? { attrs: m.attrs } : {}) }));
  if (json.content) node.content = json.content.map(toEditorNode);
  return node;
}

function toDoc(json: JSONContent): EditorDoc {
  return { type: 'doc', content: (json.content ?? []).map(toEditorNode) };
}

/** If the page can't be shown as rich text, show it all as one raw block rather than lose anything. */
function safeDoc(markdown: string): EditorDoc {
  try {
    return markdownToEditor(markdown);
  } catch {
    return { type: 'doc', content: [{ type: NODE.raw, attrs: { markdown } }] };
  }
}

/** The page text: rich editing, or the markdown source on the second tab. */
export function BodyEditor({ value, initialValue, onChange, images, targets, product, module }: Props) {
  const [tab, setTab] = useState<'rich' | 'markdown'>('rich');
  const [source, setSource] = useState(value);

  const extensions = useMemo(
    () =>
      editorExtensions((src) =>
        /^(https?:|data:|\/)/i.test(src) ? src : moduleFileUrl(product, module, src),
      ),
    [product, module],
  );

  const editor = useEditor(
    {
      extensions,
      content: safeDoc(initialValue),
      editorProps: { attributes: { class: 'prose', 'aria-label': 'Page text', role: 'textbox', 'aria-multiline': 'true' } },
      onUpdate: ({ editor: e }) => onChange(editorToMarkdown(toDoc(e.getJSON()))),
    },
    [extensions],
  );

  const showRich = () => {
    if (tab === 'rich') return;
    editor?.commands.setContent(safeDoc(source), false);
    setTab('rich');
  };
  const showMarkdown = () => {
    if (tab === 'markdown') return;
    setSource(value);
    setTab('markdown');
  };

  return (
    <div className="body-editor">
      <div className="body-editor__tabs" role="tablist" aria-label="How to edit the text">
        <button type="button" role="tab" aria-selected={tab === 'rich'} className={`tab${tab === 'rich' ? ' tab--on' : ''}`} onClick={showRich}>
          Edit
        </button>
        <button type="button" role="tab" aria-selected={tab === 'markdown'} className={`tab${tab === 'markdown' ? ' tab--on' : ''}`} onClick={showMarkdown}>
          Markdown
        </button>
      </div>
      {tab === 'rich' && editor ? <Toolbar editor={editor} images={images} targets={targets} /> : null}
      <div hidden={tab !== 'rich'} className="body-editor__rich">
        <EditorContent editor={editor} />
      </div>
      {tab === 'markdown' ? (
        <textarea
          className="markdown-source mono"
          aria-label="Page text as markdown"
          spellCheck={false}
          value={source}
          onChange={(e) => {
            setSource(e.target.value);
            onChange(e.target.value);
          }}
        />
      ) : null}
    </div>
  );
}

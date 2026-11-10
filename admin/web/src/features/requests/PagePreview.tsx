import { useMemo } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { markdownToEditor } from '../../../../shared/markdown/convert';
import { NODE, type EditorDoc } from '../../../../shared/markdown/types';
import { moduleFileUrl } from '../../api/endpoints';
import { editorExtensions } from '../editor/extensions';

function safeDoc(markdown: string): EditorDoc {
  try {
    return markdownToEditor(markdown);
  } catch {
    return { type: 'doc', content: [{ type: NODE.raw, attrs: { markdown } }] };
  }
}

/**
 * A read-only rendering of a proposed page: steps, callouts and screenshots as
 * the editor shows them, with pictures served from the module's images folder.
 */
export function PagePreview({ markdown, product, module, title, summary }: { markdown: string; product: string; module: string; title: string; summary: string }) {
  const extensions = useMemo(() => editorExtensions((src) => (/^(https?:|data:|\/)/i.test(src) ? src : moduleFileUrl(product, module, src))), [product, module]);
  const editor = useEditor(
    {
      extensions,
      editable: false,
      content: safeDoc(markdown),
      editorProps: { attributes: { class: 'prose', 'aria-label': 'Preview of the proposed page' } },
    },
    [extensions, markdown],
  );
  return (
    <article className="page-preview">
      <h2 className="page-preview__title">{title}</h2>
      {summary ? <p className="page-preview__summary">{summary}</p> : null}
      <EditorContent editor={editor} />
    </article>
  );
}

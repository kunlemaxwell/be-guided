import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/** Content the editor has no button for, kept exactly as written and editable as text. */
export function RawView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const markdown = String(node.attrs.markdown ?? '');
  const rows = Math.min(16, Math.max(2, markdown.split('\n').length));
  return (
    <NodeViewWrapper className="pv-raw" contentEditable={false}>
      <div className="block-head">
        <span className="block-label">Kept as written</span>
        <span className="block-hint">The editor has no button for this, so it’s shown as markdown. It is saved exactly as it is here.</span>
        <button type="button" className="block-remove" aria-label="Remove this block" title="Remove this block" onClick={deleteNode}>
          ×
        </button>
      </div>
      <textarea
        className="mono"
        aria-label="Markdown kept as written"
        rows={rows}
        spellCheck={false}
        value={markdown}
        onChange={(e) => updateAttributes({ markdown: e.target.value })}
      />
    </NodeViewWrapper>
  );
}

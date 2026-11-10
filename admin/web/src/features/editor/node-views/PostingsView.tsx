import { useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';

/** The "See expected postings" link, shown as a chip with its target. */
export function PostingsView({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const to = typeof node.attrs.to === 'string' ? node.attrs.to : '';
  const label = typeof node.attrs.label === 'string' ? node.attrs.label : '';
  return (
    <NodeViewWrapper className={`pv-postings${selected ? ' is-selected' : ''}`} contentEditable={false}>
      <span className="pv-postings__chip">
        <span className="pv-postings__kind">Postings</span>
        <span className="mono">{to || 'no target yet'}</span>
        {label ? <span className="muted">“{label}”</span> : null}
      </span>
      <button type="button" className="btn btn--small btn--ghost" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
        {editing ? 'Done' : 'Change'}
      </button>
      <button type="button" className="block-remove" aria-label="Remove the postings link" title="Remove the postings link" onClick={deleteNode}>
        ×
      </button>
      {editing ? (
        <div className="pv-postings__edit">
          <label>
            Points to (page#section)
            <input className="mono" value={to} onChange={(e) => updateAttributes({ to: e.target.value })} />
          </label>
          <label>
            Link text (optional)
            <input value={label} onChange={(e) => updateAttributes({ label: e.target.value || null })} />
          </label>
        </div>
      ) : null}
    </NodeViewWrapper>
  );
}

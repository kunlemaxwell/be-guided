import { NodeViewContent, NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { CALLOUT_KINDS, type CalloutKind } from '../../../../../shared/markdown/types';

const CALLOUT_LABEL: Record<CalloutKind, string> = { note: 'Note', tip: 'Tip', warning: 'Warning' };

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="block-remove" aria-label={label} title={label} onClick={onClick}>
      ×
    </button>
  );
}

/** The numbered steps group. */
export function StepsView({ deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper className="pv-steps">
      <div className="block-head" contentEditable={false}>
        <span className="block-label">Steps</span>
        <RemoveButton onClick={deleteNode} label="Remove all steps" />
      </div>
      <NodeViewContent className="pv-steps__list" />
    </NodeViewWrapper>
  );
}

/** One numbered step card with an editable title. */
export function StepView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const title = typeof node.attrs.title === 'string' ? node.attrs.title : '';
  return (
    <NodeViewWrapper className="pv-step" data-title={title}>
      <div className="pv-step__head" contentEditable={false}>
        <span className="pv-step__num" aria-hidden="true" />
        <input
          className="pv-step__title"
          aria-label="Step title"
          placeholder="Step title"
          value={title}
          onChange={(e) => updateAttributes({ title: e.target.value })}
        />
        <RemoveButton onClick={deleteNode} label="Remove this step" />
      </div>
      <NodeViewContent className="pv-step__body" />
    </NodeViewWrapper>
  );
}

/** The numbered key that explains a screenshot's markers. */
export function LegendView({ deleteNode }: NodeViewProps) {
  return (
    <NodeViewWrapper className="pv-legend">
      <div className="block-head" contentEditable={false}>
        <span className="block-label">Screenshot key</span>
        <span className="block-hint">Numbers match the markers on the screenshot above.</span>
        <RemoveButton onClick={deleteNode} label="Remove this screenshot key" />
      </div>
      <NodeViewContent className="pv-legend__body" />
    </NodeViewWrapper>
  );
}

/** Note / Tip / Warning box. */
export function CalloutView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const kind = (CALLOUT_KINDS as readonly string[]).includes(String(node.attrs.kind)) ? (node.attrs.kind as CalloutKind) : 'note';
  return (
    <NodeViewWrapper className={`pv-callout pv-callout--${kind}`}>
      <div className="block-head" contentEditable={false}>
        <select className="block-select" aria-label="Kind of box" value={kind} onChange={(e) => updateAttributes({ kind: e.target.value })}>
          {CALLOUT_KINDS.map((k) => (
            <option key={k} value={k}>
              {CALLOUT_LABEL[k]}
            </option>
          ))}
        </select>
        <RemoveButton onClick={deleteNode} label={`Remove this ${CALLOUT_LABEL[kind].toLowerCase()}`} />
      </div>
      <NodeViewContent className="pv-callout__body" />
    </NodeViewWrapper>
  );
}

import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { GuideImageOptions } from '../../../../../shared/editor/extensions';

/** A screenshot, shown from this computer, with its description. */
export function ImageView({ node, updateAttributes, deleteNode, extension, selected }: NodeViewProps) {
  const src = String(node.attrs.src ?? '');
  const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : '';
  const resolve = (extension.options as GuideImageOptions).resolveSrc;
  return (
    <NodeViewWrapper className={`pv-image${selected ? ' is-selected' : ''}`} data-drag-handle="">
      <img src={resolve(src)} alt={alt} draggable={false} />
      <div className="pv-image__meta" contentEditable={false}>
        <input aria-label="Screenshot description" placeholder="Describe the screenshot" value={alt} onChange={(e) => updateAttributes({ alt: e.target.value })} />
        <span className="mono muted">{src}</span>
        <button type="button" className="block-remove" aria-label="Remove this screenshot" title="Remove this screenshot" onClick={deleteNode}>
          ×
        </button>
      </div>
    </NodeViewWrapper>
  );
}

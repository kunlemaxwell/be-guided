import { useState } from 'react';
import type { Editor } from '@tiptap/react';
import type { GuideTarget, ModuleImage } from '../../../../shared/api-types';
import { NODE, type CalloutKind } from '../../../../shared/markdown/types';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';

interface Props {
  editor: Editor;
  images: ModuleImage[];
  targets: GuideTarget[];
}

function Tool({ label, onClick, active, disabled, children }: { label: string; onClick: () => void; active?: boolean; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      className={`tool${active ? ' tool--on' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

const NEW_STEP = {
  type: NODE.step,
  attrs: { title: 'New step', attributes: {} },
  content: [{ type: NODE.paragraph, content: [{ type: 'text', text: 'Say what to select or fill in.' }] }],
};

function insertStep(editor: Editor): void {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === NODE.step) {
      editor.chain().focus().insertContentAt($from.after(depth), NEW_STEP).run();
      return;
    }
  }
  editor.chain().focus().insertContent({ type: NODE.steps, attrs: { attributes: {} }, content: [NEW_STEP] }).run();
}

function insertCallout(editor: Editor, kind: CalloutKind): void {
  editor
    .chain()
    .focus()
    .insertContent({
      type: NODE.callout,
      attrs: { kind, attributes: {} },
      content: [{ type: NODE.paragraph, content: [{ type: 'text', text: kind === 'warning' ? 'Careful: ' : 'Good to know: ' }] }],
    })
    .run();
}

function LinkDialog({ editor, targets, onClose }: { editor: Editor; targets: GuideTarget[]; onClose: () => void }) {
  const current = String(editor.getAttributes('link').href ?? '');
  const [kind, setKind] = useState<'guide' | 'web'>(current && !current.startsWith('guide:') ? 'web' : 'guide');
  const [guideRef, setGuideRef] = useState(current.startsWith('guide:') ? current.slice(6) : '');
  const [url, setUrl] = useState(current.startsWith('guide:') ? '' : current);
  const empty = editor.state.selection.empty;
  const href = kind === 'guide' ? (guideRef ? `guide:${guideRef}` : '') : url.trim();
  const webOk = kind === 'guide' || /^(https?:\/\/|mailto:)/i.test(url.trim());

  const apply = () => {
    if (!href) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (empty && !editor.isActive('link')) {
      const text = kind === 'guide' ? (targets.find((t) => t.ref === guideRef)?.title ?? guideRef) : url.trim();
      chain.insertContent({ type: 'text', text, marks: [{ type: 'link', attrs: { href } }] }).run();
    } else {
      chain.setLink({ href }).run();
    }
    onClose();
  };

  return (
    <Dialog
      open
      title="Link"
      onClose={onClose}
      footer={
        <>
          {editor.isActive('link') ? (
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run();
                onClose();
              }}
            >
              Remove link
            </button>
          ) : null}
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!href || !webOk} onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="stack">
        <fieldset className="radio-set radio-set--inline">
          <legend>Link to</legend>
          <label>
            <input type="radio" checked={kind === 'guide'} onChange={() => setKind('guide')} /> Another guide page
          </label>
          <label>
            <input type="radio" checked={kind === 'web'} onChange={() => setKind('web')} /> A web address
          </label>
        </fieldset>
        {kind === 'guide' ? (
          <Field label="Guide page">
            {(p) => (
              <select {...p} value={guideRef} onChange={(e) => setGuideRef(e.target.value)}>
                <option value="">Choose a page…</option>
                {targets.map((t) => (
                  <option key={t.ref} value={t.ref}>
                    {t.moduleTitle} › {t.title}
                  </option>
                ))}
              </select>
            )}
          </Field>
        ) : (
          <Field label="Web address" hint="Starts with https://" error={url && !webOk ? 'Start the address with https://' : undefined}>
            {(p) => <input {...p} value={url} placeholder="https://" onChange={(e) => setUrl(e.target.value)} />}
          </Field>
        )}
        {empty && !editor.isActive('link') ? <p className="muted">Tip: select some words first to turn them into the link.</p> : null}
      </div>
    </Dialog>
  );
}

function ImageDialog({ editor, images, onClose }: { editor: Editor; images: ModuleImage[]; onClose: () => void }) {
  const [chosen, setChosen] = useState<ModuleImage | null>(null);
  const [alt, setAlt] = useState('');
  return (
    <Dialog
      open
      wide
      title="Insert a screenshot"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!chosen}
            onClick={() => {
              if (!chosen) return;
              editor.chain().focus().insertContent({ type: NODE.image, attrs: { src: chosen.src, alt: alt.trim() || null, title: null } }).run();
              onClose();
            }}
          >
            Insert
          </button>
        </>
      }
    >
      {images.length === 0 ? (
        <p className="state state--empty">This module has no screenshots yet. Ask Claude for “Text + screenshots” with “Refresh this page…”.</p>
      ) : (
        <div className="stack">
          <ul className="image-grid" aria-label="Screenshots in this module">
            {images.map((img) => (
              <li key={img.src}>
                <button
                  type="button"
                  className={`image-pick${chosen?.src === img.src ? ' image-pick--on' : ''}`}
                  aria-pressed={chosen?.src === img.src}
                  onClick={() => setChosen(img)}
                >
                  <img src={img.url} alt="" loading="lazy" />
                  <span className="mono">{img.name}</span>
                </button>
              </li>
            ))}
          </ul>
          <Field label="Describe the screenshot" hint="Read aloud to people who can’t see it.">
            {(p) => <input {...p} value={alt} onChange={(e) => setAlt(e.target.value)} />}
          </Field>
        </div>
      )}
    </Dialog>
  );
}

/** Formatting buttons above the page text. */
export function Toolbar({ editor, images, targets }: Props) {
  const [dialog, setDialog] = useState<'link' | 'image' | null>(null);
  const inTable = editor.isActive('table');
  const chain = () => editor.chain().focus();
  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar__group">
        <Tool label="Normal text" active={editor.isActive('paragraph') && !editor.isActive('heading')} onClick={() => chain().setParagraph().run()}>
          ¶
        </Tool>
        <Tool label="Heading" active={editor.isActive('heading', { level: 2 })} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
          H2
        </Tool>
        <Tool label="Smaller heading" active={editor.isActive('heading', { level: 3 })} onClick={() => chain().toggleHeading({ level: 3 }).run()}>
          H3
        </Tool>
      </div>
      <div className="toolbar__group">
        <Tool label="Bold" active={editor.isActive('bold')} onClick={() => chain().toggleBold().run()}>
          <strong>B</strong>
        </Tool>
        <Tool label="Italic" active={editor.isActive('italic')} onClick={() => chain().toggleItalic().run()}>
          <em>I</em>
        </Tool>
        <Tool label="Link" active={editor.isActive('link')} onClick={() => setDialog('link')}>
          Link
        </Tool>
      </div>
      <div className="toolbar__group">
        <Tool label="Bulleted list" active={editor.isActive('bulletList')} onClick={() => chain().toggleBulletList().run()}>
          • List
        </Tool>
        <Tool label="Numbered list" active={editor.isActive('orderedList')} onClick={() => chain().toggleOrderedList().run()}>
          1. List
        </Tool>
      </div>
      <div className="toolbar__group">
        <Tool label="Insert step" onClick={() => insertStep(editor)}>
          + Step
        </Tool>
        <Tool label="Insert note" onClick={() => insertCallout(editor, 'note')}>
          + Note
        </Tool>
        <Tool label="Insert tip" onClick={() => insertCallout(editor, 'tip')}>
          + Tip
        </Tool>
        <Tool label="Insert warning" onClick={() => insertCallout(editor, 'warning')}>
          + Warning
        </Tool>
        <Tool label="Insert screenshot" onClick={() => setDialog('image')}>
          + Screenshot
        </Tool>
        <Tool label="Insert table" disabled={inTable} onClick={() => chain().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run()}>
          + Table
        </Tool>
      </div>
      {inTable ? (
        <div className="toolbar__group">
          <Tool label="Add a row below" onClick={() => chain().addRowAfter().run()}>
            + Row
          </Tool>
          <Tool label="Add a column to the right" onClick={() => chain().addColumnAfter().run()}>
            + Column
          </Tool>
          <Tool label="Remove this row" onClick={() => chain().deleteRow().run()}>
            − Row
          </Tool>
          <Tool label="Remove this column" onClick={() => chain().deleteColumn().run()}>
            − Column
          </Tool>
          <Tool label="Remove the table" onClick={() => chain().deleteTable().run()}>
            Remove table
          </Tool>
        </div>
      ) : null}
      {dialog === 'link' ? <LinkDialog editor={editor} targets={targets} onClose={() => setDialog(null)} /> : null}
      {dialog === 'image' ? <ImageDialog editor={editor} images={images} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { ContentMode, PageSummary } from '../../../../shared/api-types';
import { slugify } from '../../../../shared/slug';
import { api, queryKeys } from '../../api/endpoints';
import { ApiError, describeError } from '../../api/client';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { ModePicker } from '../../components/ModePicker';
import { useNotice } from '../../hooks/useNotice';
import { VIDEO_NOTE } from '../../lib/labels';
import { SITE_URL } from '../../lib/site';
import { useCreateRequest } from '../requests/hooks';
import { BATCH_ACTIONS, type BatchAction, buildBatchRequest, MAX_BATCH_PAGES } from './batch';

function issue(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.issues.find((i) => i.field === field)?.message : undefined;
}

function GeneralError({ error }: { error: unknown }) {
  if (!error || (error instanceof ApiError && error.issues.length > 0)) return null;
  return (
    <p className="field__error" role="alert">
      {describeError(error)}
    </p>
  );
}

/** Title → web address name, editable once touched. */
function useSlug(source: string) {
  const [slug, setSlug] = useState('');
  const [touched, setTouched] = useState(false);
  return {
    value: touched ? slug : slugify(source),
    set: (v: string) => {
      setTouched(true);
      setSlug(v);
    },
    reset: () => {
      setSlug('');
      setTouched(false);
    },
  };
}

export function NewModuleDialog({ product, open, onClose }: { product: string; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [area, setArea] = useState('');
  const slug = useSlug(title);
  const create = useMutation({
    mutationFn: () => api.createModule(product, { slug: slug.value, title: title.trim(), summary: summary.trim(), group: 'run', ...(area.trim() ? { area: area.trim() } : {}) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      notify('success', `Module “${title.trim()}” added.`);
      setTitle('');
      setSummary('');
      setArea('');
      slug.reset();
      onClose();
    },
  });
  return (
    <Dialog
      open={open}
      title="New module"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!title.trim() || !summary.trim() || !slug.value || create.isPending}
            onClick={() => create.mutate()}
          >
            {create.isPending ? 'Adding…' : 'Add module'}
          </button>
        </>
      }
    >
      <div className="stack">
        <Field label="Module name" hint="e.g. Payroll" error={issue(create.error, 'title')}>
          {(p) => <input {...p} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Summary" hint="One line about what this module covers." error={issue(create.error, 'summary')}>
          {(p) => <input {...p} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <Field label="Area" hint="The business area it's shown under on the product page, e.g. Accounting, HR, Sales and purchasing. Use the same area as related modules: employee, manager and admin modules of one function share it." error={issue(create.error, 'area')}>
          {(p) => <input {...p} value={area} onChange={(e) => setArea(e.target.value)} />}
        </Field>
        <Field label="Web address name" hint={`${SITE_URL}/${product}/${slug.value || '…'}/`} error={issue(create.error, 'slug')}>
          {(p) => <input {...p} className="mono" value={slug.value} onChange={(e) => slug.set(e.target.value)} />}
        </Field>
        <GeneralError error={create.error} />
      </div>
    </Dialog>
  );
}

export function NewPageDialog({
  product,
  module,
  moduleTitle,
  onClose,
}: {
  product: string;
  module: string;
  moduleTitle: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { notify } = useNotice();
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [askClaude, setAskClaude] = useState(false);
  const [mode, setMode] = useState<ContentMode | null>(null);
  const slug = useSlug(title);
  const queue = useCreateRequest();
  const create = useMutation({
    mutationFn: async () => {
      const page = await api.createPage(product, module, { slug: slug.value, title: title.trim(), summary: summary.trim() });
      if (askClaude && mode) {
        await queue.mutateAsync({
          type: 'new-page',
          scope: { products: [product], pages: [page.id] },
          contentMode: mode,
          note: `Write the new page “${title.trim()}” in ${moduleTitle}.`,
        });
      }
      return page;
    },
    onSuccess: (page) => {
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      notify('success', askClaude ? 'Draft page created and added to the request list for Claude.' : 'Draft page created.');
      navigate(`/pages/${page.product}/${page.module}/${page.slug}`);
    },
  });
  const ready = title.trim() && summary.trim() && slug.value && (!askClaude || mode);
  return (
    <Dialog
      open
      title={`New page in ${moduleTitle}`}
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" disabled={!ready || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? 'Creating…' : 'Create draft page'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p className="muted">New pages start as drafts: you can see them on this computer, but they aren’t published.</p>
        <Field label="Title" hint="Start with what the reader wants to do, e.g. “Approve a purchase order”." error={issue(create.error, 'title')}>
          {(p) => <input {...p} autoFocus value={title} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Field label="Summary" hint="One sentence shown under the title." error={issue(create.error, 'summary')}>
          {(p) => <input {...p} value={summary} onChange={(e) => setSummary(e.target.value)} />}
        </Field>
        <Field label="Web address name" hint={`${SITE_URL}/${product}/${module}/${slug.value || '…'}/`} error={issue(create.error, 'slug')}>
          {(p) => <input {...p} className="mono" value={slug.value} onChange={(e) => slug.set(e.target.value)} />}
        </Field>
        <label className="check">
          <input type="checkbox" checked={askClaude} onChange={(e) => setAskClaude(e.target.checked)} />
          Ask Claude to write this page from the app (adds it to the request list)
        </label>
        {askClaude ? <ModePicker value={mode} onChange={setMode} legend="What should Claude produce?" /> : null}
        <GeneralError error={create.error} />
      </div>
    </Dialog>
  );
}

export function MakeVideoDialog({ page, onClose }: { page: PageSummary; onClose: () => void }) {
  const { notify } = useNotice();
  const queue = useCreateRequest();
  const [note, setNote] = useState('');
  return (
    <Dialog
      open
      title="Make a video for this page"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={queue.isPending}
            onClick={() =>
              queue.mutate(
                {
                  type: 'make-video',
                  scope: { products: [page.product], pages: [page.id] },
                  contentMode: 'video',
                  ...(note.trim() ? { note: note.trim() } : {}),
                },
                {
                  onSuccess: () => {
                    notify('success', 'Added to the request list. Claude makes it when you say “run the guide queue”.');
                    onClose();
                  },
                },
              )
            }
          >
            {queue.isPending ? 'Adding…' : 'Add to the request list'}
          </button>
        </>
      }
    >
      <div className="stack">
        <p>
          <strong>{page.title}</strong>
        </p>
        <p className="callout-inline">{VIDEO_NOTE} Claude opens the app, follows the steps on this page and records them.</p>
        <Field label="Anything Claude should know? (optional)" hint="e.g. use the customer “Acme Ltd”.">
          {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <GeneralError error={queue.error} />
      </div>
    </Dialog>
  );
}

/** One instruction for many pages: becomes a single request in the list. */
export function BatchInstructionDialog({ pages, onClose, onDone }: { pages: PageSummary[]; onClose: () => void; onDone: () => void }) {
  const { notify } = useNotice();
  const queue = useCreateRequest();
  const allNoVideo = pages.every((p) => p.badges.video !== 'present');
  const [action, setAction] = useState<BatchAction | null>(allNoVideo ? 'make-video' : null);
  const [mode, setMode] = useState<ContentMode | null>(null);
  const [note, setNote] = useState('');
  const request = action ? buildBatchRequest(pages, action, mode, note) : null;
  const tooMany = pages.length > MAX_BATCH_PAGES;
  const n = pages.length;
  return (
    <Dialog
      open
      wide
      title={`One instruction for ${n} ${n === 1 ? 'page' : 'pages'}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!request || queue.isPending}
            onClick={() =>
              request &&
              queue.mutate(request, {
                onSuccess: () => {
                  notify('success', `Added one request for ${n} ${n === 1 ? 'page' : 'pages'}. Claude does them when you say “run the guide queue”.`);
                  onDone();
                },
              })
            }
          >
            {queue.isPending ? 'Adding…' : 'Add to the request list'}
          </button>
        </>
      }
    >
      <div className="stack">
        <details className="batch-pages">
          <summary>
            {n} selected {n === 1 ? 'page' : 'pages'} <span className="muted">(show)</span>
          </summary>
          <ul>
            {pages.map((p) => (
              <li key={p.id}>
                {p.title} <span className="muted">· {p.module}</span>
              </li>
            ))}
          </ul>
        </details>
        {tooMany ? (
          <p className="field__error" role="alert">
            One instruction can cover up to {MAX_BATCH_PAGES} pages. Select fewer pages.
          </p>
        ) : null}
        <fieldset className="mode-picker">
          <legend>What should Claude do?</legend>
          <div className="mode-picker__options">
            {BATCH_ACTIONS.map((o) => (
              <label key={o.value} className={`choice${action === o.value ? ' choice--on' : ''}`}>
                <input type="radio" name="batch-action" value={o.value} checked={action === o.value} onChange={() => setAction(o.value)} />
                <span className="choice__label">{o.label}</span>
                <span className="choice__hint">{o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>
        {action === 'make-video' ? <p className="callout-inline">{VIDEO_NOTE} Claude follows the steps on each page and records them.</p> : null}
        {action === 'refresh-page' ? <ModePicker value={mode} onChange={setMode} /> : null}
        <Field label="Your instruction for all of them (optional)" hint="e.g. use the vendor “PV Demo Supplies”, keep each video under a minute.">
          {(p) => <textarea {...p} rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        <GeneralError error={queue.error} />
      </div>
    </Dialog>
  );
}

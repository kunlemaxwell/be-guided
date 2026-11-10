import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ContentMode, PageDetailDto } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { describeError } from '../../api/client';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { Dialog } from '../../components/Dialog';
import { Field } from '../../components/Field';
import { ModePicker } from '../../components/ModePicker';
import { useAuth } from '../../auth/AuthProvider';
import { useNotice } from '../../hooks/useNotice';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { formatDate } from '../../lib/labels';
import { HistoryPanel } from './HistoryPanel';
import { useCreateRequest } from '../requests/hooks';
import { BodyEditor } from './BodyEditor';
import { DetailsForm, detailIssues, fromDetails, toDetails, type DetailsState } from './DetailsForm';

function RefreshPageDialog({ page, onClose }: { page: PageDetailDto; onClose: () => void }) {
  const { notify } = useNotice();
  const queue = useCreateRequest();
  const [mode, setMode] = useState<ContentMode | null>(null);
  const [note, setNote] = useState('');
  return (
    <Dialog
      open
      wide
      title="Refresh this page"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!mode || queue.isPending}
            onClick={() =>
              mode &&
              queue.mutate(
                { type: 'refresh-page', scope: { products: [page.product], pages: [page.id] }, contentMode: mode, ...(note.trim() ? { note: note.trim() } : {}) },
                {
                  onSuccess: () => {
                    notify('success', 'Added to the request list. Claude does it when you say “run the guide queue”.');
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
          Claude checks <strong>{page.frontmatter.title as string}</strong> against the app and updates it. You review the changes before anything is applied.
        </p>
        <ModePicker value={mode} onChange={setMode} />
        <Field label="Anything Claude should know? (optional)">
          {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
        {queue.isError ? (
          <p className="field__error" role="alert">
            {describeError(queue.error)}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

function PageEditor({ page }: { page: PageDetailDto }) {
  const qc = useQueryClient();
  const canWrite = useAuth().can('content:write');
  const [params, setParams] = useSearchParams();
  const historyOpen = params.get('history') === '1';
  const setHistoryOpen = (open: boolean) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (open) next.set('history', '1');
        else next.delete('history');
        return next;
      },
      { replace: true },
    );
  const { notify } = useNotice();
  const [savedFm, setSavedFm] = useState<Record<string, unknown>>(page.frontmatter);
  const [savedBody, setSavedBody] = useState(page.body);
  const [details, setDetails] = useState<DetailsState>(() => toDetails(page.frontmatter));
  const [body, setBody] = useState(page.body);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDraft, setConfirmDraft] = useState(false);

  const nextFm = useMemo(() => fromDetails(savedFm, details), [savedFm, details]);
  const baseline = useMemo(() => JSON.stringify(fromDetails(savedFm, toDetails(savedFm))), [savedFm]);
  const dirty = body !== savedBody || JSON.stringify(nextFm) !== baseline;
  const issues = detailIssues(nextFm);
  const canSave = canWrite && dirty && Object.keys(issues).length === 0;

  const save = useMutation({
    mutationFn: () => api.savePage(page.product, page.module, page.slug, { frontmatter: nextFm, body }),
    onSuccess: (result) => {
      const fm = { ...nextFm, updated: result.updated };
      setSavedFm(fm);
      setDetails(toDetails(fm));
      setSavedBody(body);
      setSavedAt(result.siteUrl);
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      void qc.invalidateQueries({ queryKey: ['revisions', page.id] });
      notify('success', 'Saved — refresh the site to see it.', { href: result.siteUrl, label: 'View on site' });
    },
    onError: (e) => notify('error', describeError(e)),
  });

  const makeDraft = useMutation({
    mutationFn: () => api.markDraft(page.product, page.module, page.slug),
    onSuccess: () => {
      const fm = { ...savedFm, status: 'draft' };
      setSavedFm(fm);
      setDetails(toDetails(fm));
      setConfirmDraft(false);
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      void qc.invalidateQueries({ queryKey: ['revisions', page.id] });
      notify('success', 'The page is now a draft and no longer shows on the public site.');
    },
    onError: (e) => notify('error', describeError(e)),
  });

  // Don't lose work: warn before leaving with unsaved changes.
  const leaveGuard = useUnsavedChanges(dirty, 'your changes to this page');

  // Ctrl/Cmd+S saves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (canSave && !save.isPending) save.mutate();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSave, save]);

  const status = savedFm.status === 'draft' ? 'draft' : 'published';
  const authorRaw = typeof savedFm.author === 'string' ? savedFm.author : '';
  const author = authorRaw === 'claude' ? 'By Claude' : authorRaw && authorRaw !== 'human' ? `By ${authorRaw}` : 'No author set';
  const isPrivate = savedFm.visibility === 'private';

  return (
    <div className="screen screen--editor">
      <header className="editor-head">
        <div className="editor-head__title">
          <nav className="crumbs" aria-label="Where you are">
            <Link to={`/pages?product=${page.product}`}>{page.productName}</Link>
            <span aria-hidden="true">›</span>
            <span>{page.moduleTitle}</span>
          </nav>
          <h1>{details.title || 'Untitled page'}</h1>
          <p className="editor-head__meta">
            <Badge tone={status === 'draft' ? 'draft' : 'live'}>{status === 'draft' ? 'Draft' : 'Published'}</Badge>
            {isPrivate ? <Badge tone="neutral">Private</Badge> : null}
            <span>{author}</span>
            <span aria-hidden="true">·</span>
            <span>Updated {formatDate(String(savedFm.updated ?? ''))}</span>
          </p>
        </div>
        <div className="editor-head__actions">
          <button type="button" className="btn" onClick={() => setHistoryOpen(true)}>
            Version history
          </button>
          {canWrite ? (
            <button type="button" className="btn" onClick={() => setRefreshing(true)}>
              Refresh this page…
            </button>
          ) : null}
          <a className="btn btn--ghost" href={page.siteUrl} target="_blank" rel="noreferrer">
            View on site ↗
          </a>
          <button type="button" className="btn btn--primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </header>

      <div className={`savebar${dirty ? ' savebar--dirty' : ''}`} role="status" aria-live="polite">
        {dirty ? (
          Object.keys(issues).length > 0 ? (
            <span>Fix the highlighted page details before saving.</span>
          ) : (
            <span>You have unsaved changes.</span>
          )
        ) : savedAt ? (
          <span>
            Saved — refresh the site to see it.{' '}
            <a href={savedAt} target="_blank" rel="noreferrer">
              View on site
            </a>
          </span>
        ) : (
          <span>No changes yet.</span>
        )}
      </div>

      <div className="editor-grid">
        <section className="editor-main" aria-label="Page text">
          <BodyEditor
            value={body}
            initialValue={page.body}
            onChange={setBody}
            images={page.images}
            targets={page.targets}
            product={page.product}
            module={page.module}
          />
        </section>
        <aside className="editor-side panel" aria-label="Page details">
          <h2>Page details</h2>
          <DetailsForm value={details} onChange={setDetails} issues={issues} page={page} canWrite={canWrite} />
          {canWrite ? (
          <div className="danger-zone">
            <h3>Remove from the site</h3>
            <p className="muted small">Pages are never deleted. Removing turns the page into a draft, so only you can see it.</p>
            <button type="button" className="btn btn--small" disabled={status === 'draft' || dirty} onClick={() => setConfirmDraft(true)}>
              Remove from the site
            </button>
            {dirty && status !== 'draft' ? <p className="muted small">Save or undo your changes first.</p> : null}
          </div>
          ) : null}
        </aside>
      </div>

      {refreshing ? <RefreshPageDialog page={page} onClose={() => setRefreshing(false)} /> : null}
      <Dialog
        open={confirmDraft}
        title="Remove this page from the site?"
        onClose={() => setConfirmDraft(false)}
        footer={
          <>
            <button type="button" className="btn" onClick={() => setConfirmDraft(false)}>
              Keep it
            </button>
            <button type="button" className="btn btn--danger" disabled={makeDraft.isPending} onClick={() => makeDraft.mutate()}>
              {makeDraft.isPending ? 'Removing…' : 'Make it a draft'}
            </button>
          </>
        }
      >
        <p>The page stays on this computer as a draft. You can publish it again any time by setting its status back to Published.</p>
      </Dialog>
      {leaveGuard}
      <HistoryPanel product={page.product} module={page.module} page={page.slug} title={String(savedFm.title ?? page.slug)} open={historyOpen} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}

/** /pages/:product/:module/:page */
export default function PageEditorScreen() {
  const params = useParams();
  const product = params.product ?? '';
  const module = params.module ?? '';
  const slug = params.page ?? '';
  const id = `${product}/${module}/${slug}`;
  const query = useQuery({
    queryKey: queryKeys.page(id),
    queryFn: ({ signal }) => api.getPage(product, module, slug, signal),
    // The editor keeps its own copy while you work; don't swap it underneath you.
    refetchOnWindowFocus: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
  return (
    <AsyncView query={query} loadingLabel="Opening the page…">
      {(page) => <PageEditor key={page.id} page={page} />}
    </AsyncView>
  );
}

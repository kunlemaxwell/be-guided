import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PendingChangeDetailDto, PendingChangeDto } from '../../../../shared/api-types';
import { describeError } from '../../api/client';
import { api, moduleFileUrl, queryKeys } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { Dialog } from '../../components/Dialog';
import { TabPanel, Tabs } from '../../components/Tabs';
import { useNotice } from '../../hooks/useNotice';
import { formatDateTime } from '../../lib/labels';
import { PagePreview } from './PagePreview';

type ReviewTab = 'summary' | 'preview' | 'compare';
const REVIEW_TABS = [
  { id: 'summary', label: 'Summary' },
  { id: 'preview', label: 'Preview' },
  { id: 'compare', label: 'Compare text' },
] as const;

/** What they did, the house-standard checks and the screenshots, at a glance. */
function ReviewSummary({ change, detail }: { change: PendingChangeDto; detail: PendingChangeDetailDto }) {
  const r = detail.review;
  const [product, module] = change.pageId.split('/');
  const passed = r.checks.filter((c) => c.ok).length;
  return (
    <div className="stack">
      <dl className="review-facts">
        <div>
          <dt>Where</dt>
          <dd>
            {r.productName} › {r.moduleTitle} › <strong>{change.title}</strong>
          </dd>
        </div>
        <div>
          <dt>What</dt>
          <dd>
            {change.kind === 'create' ? 'A new page' : 'An update to a live page'} · {r.steps} step{r.steps === 1 ? '' : 's'} · {r.screenshots.length} screenshot
            {r.screenshots.length === 1 ? '' : 's'} · about {r.words} words · +{change.linesAdded} / −{change.linesRemoved} lines
          </dd>
        </div>
        <div>
          <dt>From</dt>
          <dd>
            {change.authorName} · {formatDateTime(change.createdAt)}
            {detail.revisions > 1 ? ` · updated ${detail.revisions - 1} time${detail.revisions === 2 ? '' : 's'} while waiting` : ''}
          </dd>
        </div>
        <div>
          <dt>When approved</dt>
          <dd>{r.publishes ? 'Goes live on the public site in about 2 minutes.' : 'Saved as a draft (they marked it draft, so it stays hidden).'}</dd>
        </div>
        {change.note ? (
          <div>
            <dt>Their note</dt>
            <dd>{change.note}</dd>
          </div>
        ) : null}
      </dl>

      <section aria-labelledby="checks-h" className="stack">
        <h3 id="checks-h">
          House standard: {passed} of {r.checks.length} checks passed
        </h3>
        <ul className="check-list">
          {r.checks.map((c) => (
            <li key={c.label} className={c.ok ? 'check-list__ok' : 'check-list__warn'}>
              <span className="check-list__icon" aria-hidden="true">
                {c.ok ? '✓' : '!'}
              </span>
              <span>
                <strong>{c.label}</strong>
                <span className="visually-hidden">{c.ok ? ' (passed)' : ' (needs a look)'}</span>
                <span className="muted small"> {c.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {r.screenshots.length ? (
        <section aria-labelledby="shots-h" className="stack">
          <h3 id="shots-h">Screenshots</h3>
          <div className="shot-strip">
            {r.screenshots.map((s) =>
              s.found && product && module ? (
                <a key={s.src} href={moduleFileUrl(product, module, s.src)} target="_blank" rel="noreferrer" className="shot-strip__item">
                  <img src={moduleFileUrl(product, module, s.src)} alt={s.src} loading="lazy" />
                </a>
              ) : (
                <span key={s.src} className="shot-strip__item shot-strip__missing">
                  Missing: {s.src}
                </span>
              ),
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/** One change: summary and checks, a preview of the page, the text side by side, and Approve / Reject. */
function ReviewDialog({ change, onClose }: { change: PendingChangeDto; onClose: () => void }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const canPublish = useAuth().can('publish');
  const detail = useQuery({ queryKey: queryKeys.change(change.id), queryFn: ({ signal }) => api.getChange(change.id, signal) });
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<ReviewTab>('summary');
  const decide = useMutation({
    mutationFn: (d: 'approve' | 'reject') => api.decideChange(change.id, d, note.trim() || undefined),
    onSuccess: (_r, d) => {
      void qc.invalidateQueries({ queryKey: ['changes'] });
      void qc.invalidateQueries({ queryKey: queryKeys.library });
      notify('success', d === 'approve' ? 'Approved. The site updates in about 2 minutes.' : 'Rejected. Nothing changed on the site.');
      onClose();
    },
    onError: (e) => notify('error', describeError(e)),
  });
  const [product, module] = change.pageId.split('/');
  return (
    <Dialog
      open
      wide
      title={`${change.kind === 'create' ? 'New page' : 'Change'}: ${change.title}`}
      onClose={onClose}
      footer={
        change.status === 'pending' && canPublish ? (
          <>
            <button type="button" className="btn" disabled={decide.isPending} onClick={() => decide.mutate('reject')}>
              Reject
            </button>
            <button type="button" className="btn btn--primary" disabled={decide.isPending} onClick={() => decide.mutate('approve')}>
              {decide.isPending ? 'Saving…' : 'Approve and publish'}
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        )
      }
    >
      <div className="stack">
        <AsyncView query={detail}>
          {(d) => (
            <>
              <Tabs label="Review" tabs={REVIEW_TABS} value={tab} onChange={setTab} idPrefix="review" />
              <TabPanel idPrefix="review" id="summary" active={tab === 'summary'}>
                <ReviewSummary change={change} detail={d} />
              </TabPanel>
              <TabPanel idPrefix="review" id="preview" active={tab === 'preview'}>
                <p className="muted small">How the page reads after approval. The public site adds its own layout, sidebar and links.</p>
                <PagePreview markdown={d.body} product={product ?? ''} module={module ?? ''} title={change.title} summary={d.review.summary} />
              </TabPanel>
              <TabPanel idPrefix="review" id="compare" active={tab === 'compare'}>
                <div className="compare">
                  <div>
                    <h3>Live now</h3>
                    <pre className="compare__text">{d.currentBody ?? '(new page: nothing live yet)'}</pre>
                  </div>
                  <div>
                    <h3>Proposed</h3>
                    <pre className="compare__text">{d.body}</pre>
                  </div>
                </div>
              </TabPanel>
            </>
          )}
        </AsyncView>
        {change.status === 'pending' && canPublish ? (
          <label className="field">
            <span className="field__label">Note for {change.authorName} (optional)</span>
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
        ) : change.decisionNote ? (
          <p>
            <strong>Decision note:</strong> {change.decisionNote}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Changes sent from Claude Code / Codex through the editor connector, waiting for an owner. */
export function ApprovalsPanel() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const changes = useQuery({ queryKey: queryKeys.changes(status), queryFn: ({ signal }) => api.getChanges(status, signal) });
  const [open, setOpen] = useState<PendingChangeDto | null>(null);
  return (
    <section className="panel stack" aria-labelledby="approvals-h">
      <div className="panel__head">
        <div>
          <h2 id="approvals-h">Changes from the connector</h2>
          <p className="muted">Finished pages sent from Claude Code or Codex. Editors never wait to start: they write the whole page, and your approval decides only whether it goes public.</p>
        </div>
        <select aria-label="Show" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="pending">Waiting for approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <AsyncView query={changes} isEmpty={(d) => d.length === 0} empty={status === 'pending' ? 'Nothing waiting for approval.' : 'None yet.'}>
        {(list) => (
          <ul className="request-list">
            {list.map((c) => (
              <li key={c.id} className="request-item">
                <div>
                  <strong>{c.title}</strong>{' '}
                  {c.kind === 'create' ? <Badge tone="neutral">New page</Badge> : null}
                  <div className="muted small">
                    {c.pageId} · {c.authorName} · {formatDateTime(c.createdAt)} · +{c.linesAdded} / −{c.linesRemoved}
                    {c.decidedBy ? ` · ${c.status} by ${c.decidedBy}` : ''}
                  </div>
                </div>
                <button type="button" className="btn btn--small" onClick={() => setOpen(c)}>
                  {c.status === 'pending' ? 'Review' : 'View'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </AsyncView>
      {open ? <ReviewDialog change={open} onClose={() => setOpen(null)} /> : null}
    </section>
  );
}

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ContentMode, LibraryDto, RequestDto } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { describeError } from '../../api/client';
import { AsyncView } from '../../components/AsyncView';
import { Badge, type BadgeTone } from '../../components/Badge';
import { Field } from '../../components/Field';
import { ModePicker } from '../../components/ModePicker';
import { MultiSelect } from '../../components/MultiSelect';
import { useAuth } from '../../auth/AuthProvider';
import { useNotice } from '../../hooks/useNotice';
import { formatDateTime, MODE_LABEL, REQUEST_STATUS_LABEL, REQUEST_TYPE_LABEL } from '../../lib/labels';
import { useApproveCreate, useCreateRequest, useRequestAction, useRequests } from './hooks';
import { ApprovalsPanel } from './ApprovalsPanel';

const STATUS_TONE: Record<RequestDto['status'], BadgeTone> = {
  queued: 'info',
  'in-progress': 'draft',
  done: 'on',
  cancelled: 'neutral',
};

function CheckUpdatesPanel({ library }: { library: LibraryDto }) {
  const { notify } = useNotice();
  const queue = useCreateRequest();
  const [chosen, setChosen] = useState<string[]>([]);
  const [allChosen, setAllChosen] = useState(false);
  const [mode, setMode] = useState<ContentMode | null>(null);
  const [note, setNote] = useState('');

  const ready = (allChosen || chosen.length > 0) && mode !== null;

  return (
    <section className="panel stack" aria-labelledby="check-h">
      <div>
        <h2 id="check-h">Check for updates</h2>
        <p className="muted">Claude compares the guide with the latest version of the app and suggests changes. You choose which ones to apply.</p>
      </div>
      <MultiSelect
        label="Which products?"
        allLabel="All products"
        placeholder="Choose products…"
        options={library.products.map((p) => ({ value: p.slug, label: p.meta.name, note: p.meta.visibility === 'private' ? 'Private' : undefined }))}
        value={chosen}
        allSelected={allChosen}
        onChange={(next) => {
          setChosen(next.value);
          setAllChosen(next.allSelected);
        }}
      />
      <ModePicker value={mode} onChange={setMode} />
      <Field label="Anything Claude should know? (optional)" hint="e.g. the March release changed the invoice screen.">
        {(p) => <textarea {...p} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <div className="form-actions">
        <button
          type="button"
          className="btn btn--primary"
          disabled={!ready || queue.isPending}
          onClick={() =>
            mode &&
            queue.mutate(
              {
                type: 'check-updates',
                scope: { products: allChosen ? 'all' : chosen },
                contentMode: mode,
                ...(note.trim() ? { note: note.trim() } : {}),
              },
              {
                onSuccess: () => {
                  notify('success', 'Added to the request list.');
                  setChosen([]);
                  setAllChosen(false);
                  setMode(null);
                  setNote('');
                },
                onError: (e) => notify('error', describeError(e)),
              },
            )
          }
        >
          {queue.isPending ? 'Adding…' : 'Add to the request list'}
        </button>
        {!ready ? (
          <span className="muted">{!allChosen && chosen.length === 0 ? 'Choose at least one product.' : 'Choose what should be updated.'}</span>
        ) : null}
      </div>
    </section>
  );
}

function ProposalPicker({ request }: { request: RequestDto }) {
  const { notify } = useNotice();
  const proposal = request.proposal;
  const [ticked, setTicked] = useState<Set<string>>(new Set(proposal?.approved ?? []));
  const approve = useRequestAction((id: string) => api.approveChanges(id, [...ticked]));
  if (!proposal) return null;
  const decided = Boolean(proposal.approved?.length);
  return (
    <div className="proposal">
      <h4>Suggested changes</h4>
      {proposal.changes.length === 0 ? <p className="muted">Claude found nothing to change.</p> : null}
      <ul className="proposal__list">
        {proposal.changes.map((c) => (
          <li key={c.id}>
            <label className="check">
              <input
                type="checkbox"
                disabled={decided}
                checked={ticked.has(c.id)}
                onChange={() =>
                  setTicked((t) => {
                    const next = new Set(t);
                    if (next.has(c.id)) next.delete(c.id);
                    else next.add(c.id);
                    return next;
                  })
                }
              />
              <span>
                <strong>{c.title}</strong>
                {c.kind ? <Badge tone="neutral">{c.kind}</Badge> : null}
                {c.page ? <span className="mono muted"> {c.page}</span> : null}
                {c.summary ? <span className="proposal__summary">{c.summary}</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {decided ? (
        <p className="muted">You approved {proposal.approved?.length} of {proposal.changes.length}. Claude applies them on the next run.</p>
      ) : proposal.changes.length > 0 ? (
        <button
          type="button"
          className="btn btn--primary btn--small"
          disabled={ticked.size === 0 || approve.isPending}
          onClick={() =>
            approve.mutate(request.id, {
              onSuccess: () => notify('success', 'Saved your choices. Claude applies them when you say “run the guide queue”.'),
              onError: (e) => notify('error', describeError(e)),
            })
          }
        >
          Apply selected ({ticked.size})
        </button>
      ) : null}
    </div>
  );
}

function pageTitle(id: string, library: LibraryDto | undefined): string {
  const [p, m, s] = id.split('/');
  return library?.products.find((x) => x.slug === p)?.modules.find((x) => x.slug === m)?.pages.find((x) => x.slug === s)?.title ?? id;
}

function scopeText(r: RequestDto, library: LibraryDto | undefined): string {
  if (r.scope.pages?.length) {
    const titles = r.scope.pages.map((id) => {
      const [p, m, s] = id.split('/');
      const page = library?.products.find((x) => x.slug === p)?.modules.find((x) => x.slug === m)?.pages.find((x) => x.slug === s);
      return page ? `“${page.title}”` : id;
    });
    if (titles.length > 3) return `${titles.length} pages: ${titles.slice(0, 3).join(', ')} and ${titles.length - 3} more`;
    return titles.join(', ');
  }
  if (r.scope.products === 'all') return 'All products';
  return r.scope.products.map((slug) => library?.products.find((p) => p.slug === slug)?.meta.name ?? slug).join(', ');
}

function RequestItem({ request, library }: { request: RequestDto; library: LibraryDto | undefined }) {
  const { notify } = useNotice();
  const cancel = useRequestAction(api.cancelRequest);
  const dismiss = useRequestAction(api.dismissRequest);
  const create = useApproveCreate();
  const isOwner = useAuth().can('settings:manage');
  const c = request.create;
  const needsDecision = request.status === 'queued' && Boolean(c);
  return (
    <li className="request">
      <div className="request__head">
        <div>
          <h3>{REQUEST_TYPE_LABEL[request.type]}</h3>
          <p className="request__scope">{scopeText(request, library)}</p>
          {(request.scope.pages?.length ?? 0) > 3 ? (
            <details className="batch-pages">
              <summary>Show all {request.scope.pages?.length} pages</summary>
              <ul>
                {request.scope.pages?.map((id) => <li key={id}>{pageTitle(id, library)}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
        <Badge tone={STATUS_TONE[request.status]}>{REQUEST_STATUS_LABEL[request.status]}</Badge>
      </div>
      <p className="request__meta">
        <span>{MODE_LABEL[request.contentMode]}</span>
        {request.requestedBy ? (
          <>
            <span aria-hidden="true">·</span>
            <span>Asked by {request.requestedBy}</span>
          </>
        ) : null}
        <span aria-hidden="true">·</span>
        <span>Added {formatDateTime(request.createdAt)}</span>
      </p>
      {c ? (
        <dl className="review-facts">
          <dt>{c.kind === 'product' ? 'Product' : 'Module'}</dt>
          <dd>
            {c.name} <span className="muted">({c.kind === 'product' ? c.product : `${c.product}/${c.module ?? ''}`})</span>
          </dd>
          <dt>Summary</dt>
          <dd>{c.summary}</dd>
          {c.repos?.length ? (
            <>
              <dt>Code</dt>
              <dd>{c.repos.map((r) => `${r.url}${r.paths.length ? ` (${r.paths.join(', ')})` : ''}`).join('; ')}</dd>
            </>
          ) : null}
        </dl>
      ) : null}
      {request.note ? <p className="request__note">“{request.note}”</p> : null}
      <ProposalPicker request={request} />
      <div className="request__actions">
        {needsDecision && isOwner ? (
          <button
            type="button"
            className="btn btn--small btn--primary"
            disabled={create.isPending}
            onClick={() =>
              create.mutate(request.id, {
                onSuccess: (r) => notify('success', r.message),
                onError: (e) => notify('error', describeError(e)),
              })
            }
          >
            {create.isPending ? 'Creating…' : 'Approve and create'}
          </button>
        ) : null}
        {needsDecision && !isOwner ? <span className="muted">Waiting for an owner to approve</span> : null}
        {request.status === 'queued' ? (
          <button
            type="button"
            className="btn btn--small"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(request.id, { onError: (e) => notify('error', describeError(e)) })}
          >
            {needsDecision && isOwner ? 'Decline' : 'Cancel request'}
          </button>
        ) : null}
        {request.status === 'cancelled' || request.status === 'done' ? (
          <button
            type="button"
            className="btn btn--small btn--ghost"
            disabled={dismiss.isPending}
            onClick={() => dismiss.mutate(request.id, { onError: (e) => notify('error', describeError(e)) })}
          >
            Remove from list
          </button>
        ) : null}
      </div>
    </li>
  );
}

/** Ask Claude for updates, and follow what's waiting, in progress and done. */
export default function RequestsScreen() {
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const requests = useRequests();
  const canWrite = useAuth().can('content:write');
  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Updates &amp; requests</h1>
          <p className="lede">
            Requests wait here until you tell Claude <strong>“run the guide queue”</strong>.
          </p>
        </div>
      </header>
      <ApprovalsPanel />
      <div className="requests-grid">
        {canWrite ? <AsyncView query={library}>{(data) => <CheckUpdatesPanel library={data} />}</AsyncView> : null}
        <section className="panel" aria-labelledby="queue-h">
          <h2 id="queue-h">Request list</h2>
          <AsyncView
            query={requests}
            isEmpty={(d) => d.length === 0}
            empty="Nothing waiting. Requests you add — checks, videos, page refreshes — appear here."
          >
            {(data) => (
              <ul className="request-list">
                {data.map((r) => (
                  <RequestItem key={r.id} request={r} library={library.data} />
                ))}
              </ul>
            )}
          </AsyncView>
        </section>
      </div>
    </div>
  );
}

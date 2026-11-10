import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { DiffHunk, FieldChange, RevisionSummaryDto } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { Pagination } from '../../components/Pagination';
import { formatDateTime } from '../../lib/labels';

const ACTION_LABEL: Record<RevisionSummaryDto['action'], string> = { create: 'Created', save: 'Saved', draft: 'Made a draft' };

function show(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/** Before → after for each changed page detail. */
export function FieldChanges({ changes }: { changes: FieldChange[] }) {
  if (changes.length === 0) return <p className="muted small">No page details changed.</p>;
  return (
    <table className="changes-table">
      <thead>
        <tr>
          <th scope="col">Detail</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
        </tr>
      </thead>
      <tbody>
        {changes.map((c) => (
          <tr key={c.field}>
            <th scope="row">{c.label}</th>
            <td className="changes-table__before">{show(c.before)}</td>
            <td className="changes-table__after">{show(c.after)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Line-by-line text changes (added lines green, removed lines red), with line numbers. */
export function DiffView({ hunks }: { hunks: DiffHunk[] }) {
  if (hunks.length === 0) return <p className="muted small">The text did not change.</p>;
  return (
    <div className="diff" role="table" aria-label="Text changes">
      {hunks.map((h, i) => (
        <div key={i} className="diff__hunk" role="rowgroup">
          {i > 0 ? <div className="diff__gap" aria-hidden="true">⋯</div> : null}
          {h.lines.map((l, j) => (
            <div key={j} role="row" className={`diff__line diff__line--${l.op === '+' ? 'add' : l.op === '-' ? 'del' : 'ctx'}`}>
              <span role="cell" className="diff__num">{l.oldLine ?? ''}</span>
              <span role="cell" className="diff__num">{l.newLine ?? ''}</span>
              <span role="cell" className="diff__op" aria-label={l.op === '+' ? 'added' : l.op === '-' ? 'removed' : 'unchanged'}>
                {l.op === ' ' ? '' : l.op}
              </span>
              <span role="cell" className="diff__text">{l.text || ' '}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function RevisionDetail({ product, module, page, id }: { product: string; module: string; page: string; id: string }) {
  const detail = useQuery({ queryKey: queryKeys.revision(`${product}/${module}/${page}`, id), queryFn: ({ signal }) => api.getRevision(product, module, page, id, signal) });
  return (
    <AsyncView query={detail} loadingLabel="Opening this version…">
      {(r) => (
        <div className="stack">
          <p>
            <strong>{ACTION_LABEL[r.action]}</strong> by {r.actorName} · {formatDateTime(r.createdAt)}
          </p>
          <p className="muted">{r.summary}</p>
          <h3>Page details</h3>
          <FieldChanges changes={r.fieldChanges} />
          <h3>Text</h3>
          <DiffView hunks={r.bodyDiff} />
          <p className="muted small">Only text is kept in the history; screenshots and videos are not copied.</p>
        </div>
      )}
    </AsyncView>
  );
}

/** Version history of one page: a paged list of revisions; select one for its details. */
export function HistoryPanel({ product, module, page, title, open, onClose }: { product: string; module: string; page: string; title: string; open: boolean; onClose: () => void }) {
  const [pageNumber, setPageNumber] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const id = `${product}/${module}/${page}`;
  const list = useQuery({
    queryKey: queryKeys.revisions(id, pageNumber),
    queryFn: ({ signal }) => api.getRevisions(product, module, page, pageNumber, signal),
    enabled: open,
    placeholderData: (prev) => prev,
  });
  return (
    <Drawer
      open={open}
      onClose={() => {
        setSelected(null);
        onClose();
      }}
      title={selected ? 'One version' : 'Version history'}
      subtitle={title}
      footer={
        selected ? (
          <button type="button" className="btn" onClick={() => setSelected(null)}>
            ← All versions
          </button>
        ) : null
      }
    >
      {selected ? (
        <RevisionDetail product={product} module={module} page={page} id={selected} />
      ) : (
        <AsyncView query={list} isEmpty={(d) => d.totalCount === 0} empty="No saved versions yet. Every save from now on is listed here." loadingLabel="Loading the history…">
          {(data) => (
            <div className="stack">
              <ol className="revision-list">
                {data.items.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="revision" onClick={() => setSelected(r.id)}>
                      <span className="revision__head">
                        <Badge tone={r.action === 'draft' ? 'draft' : r.action === 'create' ? 'info' : 'neutral'}>{ACTION_LABEL[r.action]}</Badge>
                        <strong>{r.actorName}</strong>
                        <span className="muted small">{formatDateTime(r.createdAt)}</span>
                      </span>
                      <span className="revision__summary">{r.summary}</span>
                    </button>
                  </li>
                ))}
              </ol>
              <Pagination pageNumber={data.pageNumber} totalPages={data.totalPages} totalCount={data.totalCount} noun="versions" onChange={setPageNumber} disabled={list.isFetching} />
            </div>
          )}
        </AsyncView>
      )}
    </Drawer>
  );
}

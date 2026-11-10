import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AUDIT_AREA_LABEL, AUDIT_AREAS, type AuditArea, type AuditEntryDto, type FieldChange } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { Drawer } from '../../components/Drawer';
import { Field } from '../../components/Field';
import { Pagination } from '../../components/Pagination';
import { formatDateTime } from '../../lib/labels';
import { FieldChanges } from '../editor/HistoryPanel';

interface Filters {
  area: AuditArea | '';
  actorId: string;
  from: string;
  to: string;
  q: string;
}

const EMPTY: Filters = { area: '', actorId: '', from: '', to: '', q: '' };

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

function changesOf(details: unknown): FieldChange[] | null {
  const d = details as { changes?: unknown; fieldChanges?: unknown } | null;
  const list = d?.changes ?? d?.fieldChanges;
  return Array.isArray(list) ? (list as FieldChange[]) : null;
}

function EntryDetails({ entry }: { entry: AuditEntryDto }) {
  const changes = changesOf(entry.details);
  return (
    <div className="stack">
      <dl className="facts">
        <dt>When</dt>
        <dd>{formatDateTime(entry.at)}</dd>
        <dt>Who</dt>
        <dd>{entry.actorName}</dd>
        <dt>Area</dt>
        <dd>{AUDIT_AREA_LABEL[entry.area]}</dd>
        <dt>Action</dt>
        <dd className="mono">{entry.action}</dd>
        <dt>What</dt>
        <dd className="mono">{entry.target}</dd>
        <dt>Reference</dt>
        <dd className="mono small">{entry.correlationId ?? '—'}</dd>
      </dl>
      <p>{entry.summary}</p>
      {changes ? (
        <>
          <h3>What changed</h3>
          <FieldChanges changes={changes.map((c) => ({ ...c, label: c.label ?? c.field }))} />
        </>
      ) : null}
      <details className="raw-details">
        <summary>All details</summary>
        <pre className="mono small">{JSON.stringify(entry.details, null, 2)}</pre>
      </details>
    </div>
  );
}

/** Audit log: every change — who, when, which area, what — newest first, with filters and a details panel. */
export default function AuditScreen() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [pageNumber, setPageNumber] = useState(1);
  const [open, setOpen] = useState<AuditEntryDto | null>(null);
  const q = useDebounced(filters.q, 300);
  const query = { pageNumber, pageSize: 25, area: filters.area || undefined, actorId: filters.actorId || undefined, from: filters.from || undefined, to: filters.to || undefined, q: q.trim() || undefined };
  const log = useQuery({ queryKey: queryKeys.audit(query), queryFn: ({ signal }) => api.getAudit(query, signal), placeholderData: (prev) => prev });
  const people = useQuery({ queryKey: queryKeys.people, queryFn: ({ signal }) => api.getPeople(signal) });
  const set = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPageNumber(1);
  };
  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY);

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Audit log</h1>
          <p className="lede">Every change made in the admin: who, when, which area and what changed.</p>
        </div>
      </header>
      <section className="panel filters-panel" aria-label="Filters">
        <Field label="Area">
          {(p) => (
            <select {...p} value={filters.area} onChange={(e) => set({ area: e.target.value as AuditArea | '' })}>
              <option value="">All areas</option>
              {AUDIT_AREAS.map((a) => (
                <option key={a} value={a}>
                  {AUDIT_AREA_LABEL[a]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="Person">
          {(p) => (
            <select {...p} value={filters.actorId} onChange={(e) => set({ actorId: e.target.value })}>
              <option value="">Everyone</option>
              {(people.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="From">{(p) => <input {...p} type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => set({ from: e.target.value })} />}</Field>
        <Field label="To">{(p) => <input {...p} type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => set({ to: e.target.value })} />}</Field>
        <Field label="Contains">{(p) => <input {...p} type="search" placeholder="e.g. invoice" value={filters.q} onChange={(e) => set({ q: e.target.value })} />}</Field>
        <button type="button" className="btn btn--ghost filters-panel__clear" disabled={!filtered} onClick={() => set(EMPTY)}>
          Clear filters
        </button>
      </section>
      <section className="panel" aria-label="Entries">
        <AsyncView query={log} isEmpty={(d) => d.totalCount === 0} empty={filtered ? 'Nothing matches these filters.' : 'Nothing has been changed yet. Every change from now on is listed here.'} loadingLabel="Loading the audit log…">
          {(data) => (
            <div className="stack">
              <table className="data-table data-table--clickable">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Area</th>
                    <th scope="col">What happened</th>
                  </tr>
                </thead>
                <tbody aria-busy={log.isFetching}>
                  {data.items.map((e) => (
                    <tr key={e.id}>
                      <td className="nowrap">{formatDateTime(e.at)}</td>
                      <td>{e.actorName}</td>
                      <td>
                        <Badge tone="neutral">{AUDIT_AREA_LABEL[e.area]}</Badge>
                      </td>
                      <td>
                        <button type="button" className="link-button" onClick={() => setOpen(e)}>
                          {e.summary}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination pageNumber={data.pageNumber} totalPages={data.totalPages} totalCount={data.totalCount} noun="entries" onChange={setPageNumber} disabled={log.isFetching} />
            </div>
          )}
        </AsyncView>
      </section>
      <Drawer open={open !== null} title="Audit entry" subtitle={open?.summary} onClose={() => setOpen(null)}>
        {open ? <EntryDetails entry={open} /> : null}
      </Drawer>
    </div>
  );
}

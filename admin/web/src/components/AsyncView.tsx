import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { describeError } from '../api/client';

interface Props<T> {
  query: UseQueryResult<T>;
  /** What "nothing here yet" means for this view. */
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loadingLabel?: string;
  children: (data: T) => ReactNode;
}

/** Every data view: loading, error (with retry), empty, or the data. */
export function AsyncView<T>({ query, isEmpty, empty, loadingLabel = 'Loading…', children }: Props<T>) {
  if (query.isPending) {
    return (
      <div className="state state--loading" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        {loadingLabel}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="state state--error" role="alert">
        <p>{describeError(query.error)}</p>
        <button type="button" className="btn" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (isEmpty?.(query.data)) return <div className="state state--empty">{empty ?? 'Nothing here yet.'}</div>;
  return <>{children(query.data)}</>;
}

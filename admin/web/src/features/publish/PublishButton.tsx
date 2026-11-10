import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api, queryKeys } from '../../api/endpoints';
import { describeError } from '../../api/client';
import { Dialog } from '../../components/Dialog';
import { useNotice } from '../../hooks/useNotice';

/** Top-bar "Publish": commits and pushes the content folder, or explains why it can't yet. */
export function PublishButton() {
  const [open, setOpen] = useState(false);
  const { notify } = useNotice();
  const status = useQuery({ queryKey: queryKeys.publish, queryFn: ({ signal }) => api.getPublishStatus(signal), enabled: open });
  const publish = useMutation({
    mutationFn: api.publish,
    onSuccess: (r) => {
      notify('success', r.message);
      setOpen(false);
    },
  });

  return (
    <>
      <button type="button" className="btn btn--primary" onClick={() => setOpen(true)}>
        Publish
      </button>
      <Dialog
        open={open}
        title="Publish the guide"
        onClose={() => setOpen(false)}
        footer={
          status.data?.canPublish ? (
            <>
              <button type="button" className="btn" onClick={() => setOpen(false)}>
                Not now
              </button>
              <button type="button" className="btn btn--primary" disabled={publish.isPending} onClick={() => publish.mutate()}>
                {publish.isPending ? 'Publishing…' : 'Publish now'}
              </button>
            </>
          ) : (
            <button type="button" className="btn" onClick={() => setOpen(false)}>
              OK
            </button>
          )
        }
      >
        {status.isPending ? <p>Checking…</p> : null}
        {status.isError ? <p role="alert">{describeError(status.error)}</p> : null}
        {status.data ? <p>{status.data.message}</p> : null}
        {publish.isError ? (
          <p className="field__error" role="alert">
            {describeError(publish.error)}
          </p>
        ) : null}
      </Dialog>
    </>
  );
}

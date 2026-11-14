import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { api, queryKeys } from '../../api/endpoints';
import { describeError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { useNotice } from '../../hooks/useNotice';
import { formatDate } from '../../lib/labels';

const KIND_LABEL = { new: 'New', improved: 'Improved', fixed: 'Bug fix' } as const;

function Entries({ product }: { product: string }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const canWrite = useAuth().can('content:write');
  const list = useQuery({ queryKey: queryKeys.whatsNew(product), queryFn: ({ signal }) => api.getWhatsNew(product, signal) });
  const change = useMutation({
    mutationFn: (v: { slug: string; shown: boolean; title: string }) => api.setWhatsNewShown(product, v.slug, v.shown),
    onSuccess: (data, v) => {
      qc.setQueryData(queryKeys.whatsNew(product), data);
      notify('success', v.shown ? `“${v.title}” is shown on What's new.` : `“${v.title}” is hidden from What's new.`);
    },
    onError: (e) => notify('error', describeError(e)),
  });
  return (
    <AsyncView query={list} isEmpty={(d) => d.entries.length === 0} empty="Nothing has been released for this product yet.">
      {(d) => {
        const off = d.entries.filter((e) => !e.shown).length;
        return (
          <>
            <p className="lede">
              {d.autoPublish ? 'New entries appear on the site at once.' : 'New entries stay switched off until you tick them here.'} Change this under Products,
              “Publish What's new automatically”.
              {off > 0 ? ` ${off} ${off === 1 ? 'entry is' : 'entries are'} switched off.` : ''}
            </p>
            <ul className="wn-admin card">
              {d.entries.map((e) => (
                <li key={e.slug} className={`wn-admin__row${e.shown ? '' : ' wn-admin__row--off'}`}>
                  <input
                    type="checkbox"
                    className="select-box"
                    aria-label={`Show ${e.title} on What's new`}
                    checked={e.shown}
                    disabled={!canWrite || change.isPending}
                    onChange={(ev) => change.mutate({ slug: e.slug, shown: ev.target.checked, title: e.title })}
                  />
                  <div className="wn-admin__main">
                    <span className="wn-admin__title">{e.title}</span>
                    <span>{e.summary}</span>
                    <span className="wn-admin__meta">
                      <Badge tone="neutral">{KIND_LABEL[e.kind]}</Badge>
                      <span>{e.moduleTitle}</span>
                      <span aria-hidden="true">·</span>
                      <span>For {e.audience.join(', ')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{formatDate(e.date)}</span>
                    </span>
                  </div>
                  <Badge tone={e.shown ? 'live' : 'draft'}>{e.shown ? 'Shown' : 'Not shown'}</Badge>
                </li>
              ))}
            </ul>
          </>
        );
      }}
    </AsyncView>
  );
}

/** What's new: tick the entries readers should see; untick one to keep it off the public page. */
export default function WhatsNewScreen() {
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const [params, setParams] = useSearchParams();
  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>What's new</h1>
          <p className="lede">Everything released, by product. Tick what readers should see on the What's new page; untick an entry to keep it off.</p>
        </div>
      </header>
      <AsyncView query={library} isEmpty={(d) => d.products.length === 0} empty="No products yet. Add one under Products.">
        {(data) => {
          const current = data.products.find((p) => p.slug === params.get('product')) ?? data.products[0];
          if (!current) return null;
          return (
            <>
              <div className="tabs" role="tablist" aria-label="Product">
                {data.products.map((p) => (
                  <button
                    key={p.slug}
                    type="button"
                    role="tab"
                    aria-selected={p.slug === current.slug}
                    className={`tab${p.slug === current.slug ? ' tab--on' : ''}`}
                    onClick={() => setParams({ product: p.slug }, { replace: true })}
                  >
                    {p.meta.name}
                  </button>
                ))}
              </div>
              <Entries key={current.slug} product={current.slug} />
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import type { ModuleSummary, PageSummary, ProductSummary } from '../../../../shared/api-types';
import { api, queryKeys } from '../../api/endpoints';
import { useAuth } from '../../auth/AuthProvider';
import { ActionsMenu } from '../../components/ActionsMenu';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { formatDate } from '../../lib/labels';
import { SITE_URL } from '../../lib/site';
import { selectionState, toggleAll, toggleOne } from './batch';
import { BatchInstructionDialog, MakeVideoDialog, NewModuleDialog, NewPageDialog } from './PageDialogs';

/** A checkbox that can show "some selected" (indeterminate). */
function TriCheckbox({ state, label, onChange }: { state: 'all' | 'some' | 'none'; label: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === 'some';
  }, [state]);
  return <input ref={ref} type="checkbox" className="select-box" aria-label={label} checked={state === 'all'} onChange={onChange} />;
}

type FilterId = 'no-video' | 'no-screens' | 'drafts' | 'private';

const FILTERS: { id: FilterId; label: string; test: (p: PageSummary) => boolean }[] = [
  { id: 'no-video', label: 'No video yet', test: (p) => p.badges.video === 'none' },
  { id: 'no-screens', label: 'No screenshots yet', test: (p) => !p.badges.screenshots },
  { id: 'drafts', label: 'Drafts', test: (p) => p.status === 'draft' },
  { id: 'private', label: 'Private', test: (p) => p.visibility === 'private' },
];

function PageBadges({ page }: { page: PageSummary }) {
  const b = page.badges;
  return (
    <span className="badges" aria-label="What this page has">
      <Badge tone={b.text ? 'on' : 'off'} title={b.text ? 'Has written steps' : 'No text yet'}>
        Text
      </Badge>
      <Badge tone={b.screenshots ? 'on' : 'off'} title={b.screenshots ? `${b.screenshotCount} screenshots` : 'No screenshots yet'}>
        Screenshots{b.screenshots ? ` ${b.screenshotCount}` : ''}
      </Badge>
      {b.video === 'missing' ? (
        <Badge tone="warn" title="The page lists a video, but the video file is not on this computer.">
          Video missing
        </Badge>
      ) : (
        <Badge tone={b.video === 'present' ? 'on' : 'off'} title={b.video === 'present' ? 'Has a walkthrough video' : 'No video yet'}>
          Video
        </Badge>
      )}
    </span>
  );
}

function PageRow({
  page,
  onMakeVideo,
  canWrite,
  selected,
  onSelect,
}: {
  page: PageSummary;
  onMakeVideo: (p: PageSummary) => void;
  canWrite: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const editor = `/pages/${page.product}/${page.module}/${page.slug}`;
  return (
    <li className={`page-row${canWrite ? ' page-row--selectable' : ''}${selected ? ' page-row--selected' : ''}`}>
      {canWrite ? (
        <input type="checkbox" className="select-box" aria-label={`Select ${page.title}`} checked={selected} onChange={() => onSelect(page.id)} />
      ) : null}
      <div className="page-row__main">
        <Link className="page-row__title" to={editor}>
          {page.title}
        </Link>
        <span className="page-row__meta">
          <Badge tone={page.status === 'draft' ? 'draft' : 'live'}>{page.status === 'draft' ? 'Draft' : 'Published'}</Badge>
          {page.visibility === 'private' ? (
            <Badge tone="neutral" title="Hidden from the public site">
              Private
            </Badge>
          ) : null}
          <span>{page.authorName === 'Not set' ? 'No author' : `By ${page.authorName}`}</span>
          <span aria-hidden="true">·</span>
          <span>Updated {formatDate(page.updated)}</span>
        </span>
        {page.problem ? <span className="field__error">{page.problem}</span> : null}
      </div>
      <PageBadges page={page} />
      <div className="page-row__actions">
        <ActionsMenu
          label={`Actions for ${page.title}`}
          items={[
            { label: 'Open', to: editor },
            { label: 'View on site', href: `${SITE_URL}/${page.product}/${page.module}/${page.slug}/` },
            { label: 'Make a video…', onSelect: () => onMakeVideo(page), disabled: !canWrite },
            { label: 'Version history', to: `${editor}?history=1` },
          ]}
        />
      </div>
    </li>
  );
}

function ModuleSection({
  module,
  pages,
  filtered,
  onNewPage,
  onMakeVideo,
  selected,
  onSelect,
  onSelectMany,
}: {
  module: ModuleSummary;
  pages: PageSummary[];
  filtered: boolean;
  onNewPage: (m: ModuleSummary) => void;
  onMakeVideo: (p: PageSummary) => void;
  selected: ReadonlySet<string>;
  onSelect: (id: string) => void;
  onSelectMany: (ids: string[]) => void;
}) {
  const canWrite = useAuth().can('content:write');
  if (filtered && pages.length === 0) return null;
  const ids = pages.map((p) => p.id);
  return (
    <section className="module" aria-labelledby={`m-${module.slug}`}>
      <header className="module__head">
        {canWrite && ids.length > 0 ? (
          <TriCheckbox state={selectionState(selected, ids)} label={`Select all ${ids.length} shown in ${module.meta.title}`} onChange={() => onSelectMany(ids)} />
        ) : null}
        <div className="module__title">
          <h2 id={`m-${module.slug}`}>{module.meta.title}</h2>
          <p className="muted">{module.meta.summary}</p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn--small btn--ghost" onClick={() => onNewPage(module)}>
            + New page
          </button>
        ) : null}
      </header>
      {pages.length === 0 ? (
        <p className="state state--empty state--inline">No pages in this module yet.</p>
      ) : (
        <ul className="page-list">
          {pages.map((p) => (
            <PageRow key={p.id} page={p} onMakeVideo={onMakeVideo} canWrite={canWrite} selected={selected.has(p.id)} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </section>
  );
}

function ProductPages({ product }: { product: ProductSummary }) {
  const canWrite = useAuth().can('content:write');
  const [filters, setFilters] = useState<Set<FilterId>>(new Set());
  const [newModule, setNewModule] = useState(false);
  const [newPageIn, setNewPageIn] = useState<ModuleSummary | null>(null);
  const [videoFor, setVideoFor] = useState<PageSummary | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);

  const active = FILTERS.filter((f) => filters.has(f.id));
  const visible = product.modules.map((m) => ({ module: m, pages: m.pages.filter((p) => active.every((f) => f.test(p))) }));
  const all = product.modules.flatMap((m) => m.pages);
  const shown = visible.reduce((n, v) => n + v.pages.length, 0);
  const shownIds = visible.flatMap((v) => v.pages.map((p) => p.id));
  const chosen = all.filter((p) => selected.has(p.id));
  const noVideoIds = all.filter((p) => p.badges.video !== 'present').map((p) => p.id);

  const toggle = (id: FilterId) =>
    setFilters((f) => {
      const next = new Set(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <>
      <div className="toolbar-row">
        <div className="filters" role="group" aria-label="Show only">
          <span className="muted">Show only:</span>
          {FILTERS.map((f) => (
            <button key={f.id} type="button" className={`chip${filters.has(f.id) ? ' chip--on' : ''}`} aria-pressed={filters.has(f.id)} onClick={() => toggle(f.id)}>
              {f.label}
              <span className="chip__count">{all.filter(f.test).length}</span>
            </button>
          ))}
        </div>
        {canWrite ? (
          <button type="button" className="btn" onClick={() => setNewModule(true)}>
            + New module
          </button>
        ) : null}
      </div>

      {canWrite && all.length > 0 ? (
        <div className="select-row" role="group" aria-label="Select pages">
          <label className="check">
            <TriCheckbox state={selectionState(selected, shownIds)} label={`Select all ${shownIds.length} pages shown`} onChange={() => setSelected((s) => toggleAll(s, shownIds))} />
            <span>Select all shown ({shownIds.length})</span>
          </label>
          {noVideoIds.length > 0 ? (
            <button
              type="button"
              className="btn btn--small btn--ghost"
              onClick={() => {
                setSelected(new Set(noVideoIds));
                setFilters(new Set<FilterId>(['no-video']));
              }}
            >
              Select all without a video ({noVideoIds.length})
            </button>
          ) : null}
        </div>
      ) : null}

      {product.modules.length === 0 ? (
        <div className="state state--empty">This product has no modules yet. Select “New module” to start its guide.</div>
      ) : active.length > 0 && shown === 0 ? (
        <div className="state state--empty">No pages match. Turn off a filter to see more.</div>
      ) : (
        <div className="stack-lg">
          {visible.map(({ module, pages }) => (
            <ModuleSection
              key={module.slug}
              module={module}
              pages={pages}
              filtered={active.length > 0}
              onNewPage={setNewPageIn}
              onMakeVideo={setVideoFor}
              selected={selected}
              onSelect={(id) => setSelected((s) => toggleOne(s, id))}
              onSelectMany={(ids) => setSelected((s) => toggleAll(s, ids))}
            />
          ))}
        </div>
      )}

      <NewModuleDialog product={product.slug} open={newModule} onClose={() => setNewModule(false)} />
      {newPageIn ? (
        <NewPageDialog product={product.slug} module={newPageIn.slug} moduleTitle={newPageIn.meta.title} onClose={() => setNewPageIn(null)} />
      ) : null}
      {videoFor ? <MakeVideoDialog page={videoFor} onClose={() => setVideoFor(null)} /> : null}
      {chosen.length > 0 ? (
        <div className="batch-bar" role="region" aria-label="Selected pages">
          <span className="batch-bar__count">
            <strong>{chosen.length}</strong> {chosen.length === 1 ? 'page' : 'pages'} selected
          </span>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setSelected(new Set())}>
            Clear
          </button>
          <button type="button" className="btn btn--primary" onClick={() => setBatchOpen(true)}>
            Give one instruction…
          </button>
        </div>
      ) : null}
      {batchOpen && chosen.length > 0 ? (
        <BatchInstructionDialog
          pages={chosen}
          onClose={() => setBatchOpen(false)}
          onDone={() => {
            setBatchOpen(false);
            setSelected(new Set());
          }}
        />
      ) : null}
    </>
  );
}

/** The main screen: product → modules → pages, with what each page has. */
export default function PagesScreen() {
  const library = useQuery({ queryKey: queryKeys.library, queryFn: ({ signal }) => api.getLibrary(signal) });
  const [params, setParams] = useSearchParams();

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Pages</h1>
          <p className="lede">Every guide page, by product and module. Select a page to edit it.</p>
        </div>
      </header>
      <AsyncView query={library} isEmpty={(d) => d.products.length === 0} empty="No products yet. Add one under Products.">
        {(data) => {
          const current = data.products.find((p) => p.slug === params.get('product')) ?? data.products[0];
          if (!current) return null;
          return (
            <>
              <div className="tabs" role="tablist" aria-label="Product">
                {data.products.map((p) => {
                  const count = p.modules.reduce((n, m) => n + m.pages.length, 0);
                  return (
                    <button
                      key={p.slug}
                      type="button"
                      role="tab"
                      aria-selected={p.slug === current.slug}
                      className={`tab${p.slug === current.slug ? ' tab--on' : ''}`}
                      onClick={() => setParams({ product: p.slug }, { replace: true })}
                    >
                      {p.meta.name}
                      {p.meta.visibility === 'private' ? <span className="tab__private">Private</span> : null}
                      <span className="tab__count">{count}</span>
                    </button>
                  );
                })}
              </div>
              <ProductPages key={current.slug} product={current} />
            </>
          );
        }}
      </AsyncView>
    </div>
  );
}

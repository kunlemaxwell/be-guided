import { useState, type ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ContentMode } from '../../../../shared/api-types';
import { ApiError } from '../../api/client';
import { Accordion } from '../../components/Accordion';
import { ActionsMenu } from '../../components/ActionsMenu';
import { AsyncView } from '../../components/AsyncView';
import { Badge } from '../../components/Badge';
import { ColorField } from '../../components/ColorField';
import { Dialog } from '../../components/Dialog';
import { Drawer } from '../../components/Drawer';
import { Field } from '../../components/Field';
import { FilePicker } from '../../components/FilePicker';
import { Icon, ICONS, type IconName } from '../../components/Icon';
import { ModePicker } from '../../components/ModePicker';
import { MultiSelect } from '../../components/MultiSelect';
import { Pagination } from '../../components/Pagination';
import { SliderField } from '../../components/SliderField';
import { Switch } from '../../components/Switch';
import { TabPanel, Tabs } from '../../components/Tabs';
import { DiffView, FieldChanges } from '../editor/HistoryPanel';

/** A fake query result, to show AsyncView's four states without a server. */
function fakeQuery<T>(state: 'loading' | 'error' | 'empty' | 'success', data: T): UseQueryResult<T> {
  const base = { refetch: async () => undefined } as unknown as UseQueryResult<T>;
  if (state === 'loading') return { ...base, isPending: true, isError: false } as UseQueryResult<T>;
  if (state === 'error') return { ...base, isPending: false, isError: true, error: new ApiError('SERVER_ERROR', 'Something went wrong. Nothing was changed. Try again.') } as UseQueryResult<T>;
  return { ...base, isPending: false, isError: false, data } as UseQueryResult<T>;
}

/** Tabs in their states, for the Components screen. */
function DemoTabs() {
  const [tab, setTab] = useState<'one' | 'two' | 'three'>('one');
  const tabs = [
    { id: 'one', label: 'Appearance' },
    { id: 'two', label: 'Pages and videos', marked: true, markLabel: 'unsaved changes' },
    { id: 'three', label: 'People' },
  ] as const;
  return (
    <div className="stack">
      <Tabs label="Example sections" tabs={tabs} value={tab} onChange={setTab} idPrefix="demo-tabs" />
      {tabs.map((t) => (
        <TabPanel key={t.id} idPrefix="demo-tabs" id={t.id} active={tab === t.id}>
          <p className="muted small">The {t.label} panel.</p>
        </TabPanel>
      ))}
    </div>
  );
}

function Example({ name, when, children }: { name: string; when: string; children: ReactNode }) {
  return (
    <section className="panel stack" aria-labelledby={`c-${name}`}>
      <div>
        <h2 id={`c-${name}`} className="mono">
          {name}
        </h2>
        <p className="muted small">{when}</p>
      </div>
      <div className="component-demo">{children}</div>
    </section>
  );
}

/**
 * Living catalogue of the shared components in admin/web/src/components
 * (documented in its README.md), each in its main states.
 */
export default function ComponentsScreen() {
  const [sw, setSw] = useState(true);
  const [multi, setMulti] = useState<{ value: string[]; allSelected: boolean }>({ value: ['acme-books'], allSelected: false });
  const [color, setColor] = useState<string | undefined>('#1d4ed8');
  const [size, setSize] = useState<number | undefined>(undefined);
  const [dialog, setDialog] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [pageNo, setPageNo] = useState(2);
  const [mode, setMode] = useState<ContentMode | null>(null);
  const [file, setFile] = useState('media/create-an-invoice.mp4');
  const products = Array.from({ length: 36 }, (_, i) => ({ value: i === 0 ? 'acme-books' : `product-${i}`, label: i === 0 ? 'Acme Books' : `Product ${i + 1}`, note: i % 7 === 3 ? 'Private' : undefined }));

  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Components</h1>
          <p className="lede">The building blocks every admin screen uses. Documented in admin/web/src/components/README.md.</p>
        </div>
      </header>
      <div className="components-grid">
        <Example name="AsyncView" when="Every data view: loading, error with retry, empty, and success.">
          <div className="grid-2">
            {(['loading', 'error', 'empty', 'success'] as const).map((s) => (
              <div key={s} className="component-demo__cell">
                <span className="muted small">{s}</span>
                <AsyncView query={fakeQuery(s, s === 'empty' ? [] : ['A page'])} isEmpty={(d) => d.length === 0} empty="Nothing here yet.">
                  {(d) => <p>{d.join(', ')}</p>}
                </AsyncView>
              </div>
            ))}
          </div>
        </Example>

        <Example name="Badge" when="Small status chips: text/screenshots/video, draft/published, private.">
          <span className="badges">
            <Badge tone="on">Text</Badge>
            <Badge tone="off">Screenshots</Badge>
            <Badge tone="warn">Video missing</Badge>
            <Badge tone="draft">Draft</Badge>
            <Badge tone="live">Published</Badge>
            <Badge tone="neutral">Private</Badge>
            <Badge tone="info">Waiting</Badge>
          </span>
        </Example>

        <Example name="ActionsMenu" when="Row actions behind a vertical ⋮ button. Keyboard: Enter/↓ opens, ↑/↓ move, Escape closes.">
          <ActionsMenu
            label="Actions for Create an invoice"
            items={[{ label: 'Open', to: '/pages' }, { label: 'View on site', href: 'http://localhost:3100' }, { label: 'Make a video…', onSelect: () => undefined }, { label: 'Disabled action', disabled: true }]}
          />
        </Example>

        <Example name="Tabs" when="Splitting one screen into areas (Settings). ←/→/Home/End move between tabs; a dot marks a tab with unsaved changes.">
          <DemoTabs />
        </Example>

        <Example name="Accordion" when="Long groups of fields people rarely need all at once (theme customizer). Closed by default; the header says what is set inside.">
          <div className="accordion-group">
            <Accordion title="Colours" summary="2 custom colours">
              <p className="muted small">The fields for this section go here.</p>
            </Accordion>
            <Accordion title="Shadows" summary="Theme shadow">
              <p className="muted small">The fields for this section go here.</p>
            </Accordion>
          </div>
        </Example>

        <Example name="Switch" when="An on/off setting saved with its form, e.g. “Show on the public site”.">
          <Switch label="Show on the public site" checked={sw} onChange={setSw} hint={sw ? 'Readers can find it.' : 'Private: kept off the public site.'} />
          <Switch label="Disabled switch" checked={false} onChange={() => undefined} disabled />
        </Example>

        <Example name="MultiSelect" when="Choosing several of many (30–40) items, with search and an “All” choice.">
          <MultiSelect label="Which products?" allLabel="All products" options={products} value={multi.value} allSelected={multi.allSelected} onChange={setMulti} />
        </Example>

        <Example name="FilePicker" when="“Choose file…” instead of typing a path; shows the chosen file as a link.">
          <FilePicker label="Video file" value={file} href="#" accept="video/*" onPick={(f) => setFile(`media/${f.name}`)} onClear={() => setFile('')} hint="Copied into this module’s media folder." />
          <FilePicker label="Cover picture (missing file)" value="images/cover.webp" href={null} accept="image/*" onPick={() => undefined} status={{ tone: 'warn', text: 'File not on this computer' }} />
          <FilePicker label="Uploading" value="" href={null} accept="image/*" onPick={() => undefined} busy />
          <FilePicker label="With an error" value="" href={null} accept="image/*" onPick={() => undefined} error="That file is not what its name says. Choose the original file." />
        </Example>

        <Example name="ColorField" when="A colour with picker + hex box and “reset to theme”.">
          <ColorField label="Accent (links, buttons)" value={color} themeValue="#1d4ed8" onChange={setColor} />
          <ColorField label="Using the theme colour" value={undefined} themeValue="#0f172a" onChange={() => undefined} />
        </Example>

        <Example name="SliderField" when="A number on a slider with “reset to theme”.">
          <SliderField label="Corner rounding" value={size} themeValue={14} min={0} max={28} onChange={setSize} />
        </Example>

        <Example name="Field" when="Label + control + hint or error, wired for screen readers.">
          <Field label="Title" hint="Start with what the reader wants to do.">
            {(p) => <input {...p} defaultValue="Create an invoice" />}
          </Field>
          <Field label="Summary" error="Add a one-sentence summary.">
            {(p) => <input {...p} defaultValue="" />}
          </Field>
        </Example>

        <Example name="ModePicker" when="The mandatory content mode for every request (nothing preselected).">
          <ModePicker value={mode} onChange={setMode} />
        </Example>

        <Example name="Pagination" when="Server-side paged lists (audit log, version history).">
          <Pagination pageNumber={pageNo} totalPages={5} totalCount={93} noun="entries" onChange={setPageNo} />
        </Example>

        <Example name="Dialog and Drawer" when="Dialog: a question or short form. Drawer: details beside a list. Both trap focus and close on Escape.">
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setDialog(true)}>
              Open a dialog
            </button>
            <button type="button" className="btn" onClick={() => setDrawer(true)}>
              Open a drawer
            </button>
          </div>
          <Dialog open={dialog} title="Remove this page from the site?" onClose={() => setDialog(false)} footer={<button type="button" className="btn" onClick={() => setDialog(false)}>Keep it</button>}>
            <p>The page stays on this computer as a draft.</p>
          </Dialog>
          <Drawer open={drawer} title="Audit entry" subtitle="Saved “Create an invoice”" onClose={() => setDrawer(false)}>
            <p>Details go here.</p>
          </Drawer>
        </Example>

        <Example name="FieldChanges and DiffView" when="What changed in a version: page details before/after, and text lines added/removed.">
          <FieldChanges changes={[{ field: 'title', label: 'Title', before: 'Create an invoice', after: 'Create a sales invoice' }]} />
          <DiffView
            hunks={[
              {
                lines: [
                  { op: ' ', text: 'Select **New invoice**.', oldLine: 4, newLine: 4 },
                  { op: '-', text: 'Choose a customer.', oldLine: 5, newLine: null },
                  { op: '+', text: 'Choose the customer from the list.', oldLine: null, newLine: 5 },
                ],
              },
            ]}
          />
        </Example>

        <Example name="Icon" when="Decorative line icons (always hidden from screen readers).">
          <span className="icon-row">
            {(Object.keys(ICONS) as IconName[]).map((n) => (
              <span key={n} className="icon-row__item" title={n}>
                <Icon name={n} />
                <span className="muted small">{n}</span>
              </span>
            ))}
          </span>
        </Example>
      </div>
    </div>
  );
}

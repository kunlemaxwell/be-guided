import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { GuideTarget, ModuleFile, PageDetailDto, UploadKind } from '../../../../shared/api-types';
import { pageFrontmatterSchema } from '@/types/content';
import { describeError } from '../../api/client';
import { api, moduleFileUrl, queryKeys } from '../../api/endpoints';
import { Field } from '../../components/Field';
import { FilePicker } from '../../components/FilePicker';
import { Switch } from '../../components/Switch';
import { useNotice } from '../../hooks/useNotice';

/** The page details form (everything in the frontmatter except the text). */
export interface DetailsState {
  title: string;
  summary: string;
  audience: string;
  status: 'published' | 'draft';
  /** false = private (kept off the public site). */
  isPublic: boolean;
  /** A person's name from People, or a legacy value ("claude"/"human"). */
  author: string;
  order: string;
  appRoutes: string;
  prerequisites: { key: number; page: string; why: string }[];
  videoSrc: string;
  videoPoster: string;
  videoLength: string;
  videoDisplay: '' | 'collapsed' | 'expanded';
}

let nextKey = 1;

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function toDetails(fm: Record<string, unknown>): DetailsState {
  const video = (fm.video ?? {}) as Record<string, unknown>;
  const prereqs = Array.isArray(fm.prerequisites) ? (fm.prerequisites as Record<string, unknown>[]) : [];
  return {
    title: str(fm.title),
    summary: str(fm.summary),
    audience: str(fm.audience),
    status: fm.status === 'draft' ? 'draft' : 'published',
    isPublic: fm.visibility !== 'private',
    // Legacy "claude" is the person "Claude" in People.
    author: str(fm.author) === 'claude' ? 'Claude' : str(fm.author),
    order: String(typeof fm.order === 'number' ? fm.order : 100),
    appRoutes: Array.isArray(fm.appRoutes) ? (fm.appRoutes as unknown[]).map(String).join('\n') : '',
    prerequisites: prereqs.map((p) => ({ key: nextKey++, page: str(p.page), why: str(p.why) })),
    videoSrc: str(video.src),
    videoPoster: str(video.poster),
    videoLength: str(video.length),
    videoDisplay: video.display === 'collapsed' || video.display === 'expanded' ? video.display : '',
  };
}

/** Applies the form to the original frontmatter, keeping fields the form doesn't show. */
export function fromDetails(fm: Record<string, unknown>, d: DetailsState): Record<string, unknown> {
  const next: Record<string, unknown> = { ...fm, title: d.title.trim(), summary: d.summary.trim() };
  const setOrDelete = (key: string, value: unknown, keep: boolean) => {
    if (keep) next[key] = value;
    else delete next[key];
  };
  setOrDelete('audience', d.audience.trim(), Boolean(d.audience.trim()));
  setOrDelete('status', d.status, 'status' in fm || d.status !== 'published');
  setOrDelete('visibility', d.isPublic ? 'public' : 'private', 'visibility' in fm || !d.isPublic);
  setOrDelete('author', d.author.trim(), Boolean(d.author.trim()) || 'author' in fm);
  const order = d.order.trim() === '' ? Number.NaN : Number(d.order);
  setOrDelete('order', Number.isInteger(order) ? order : d.order, 'order' in fm || d.order.trim() !== '100');
  const routes = d.appRoutes.split('\n').map((r) => r.trim()).filter(Boolean);
  setOrDelete('appRoutes', routes, routes.length > 0);
  const prereqs = d.prerequisites
    .filter((p) => p.page.trim())
    .map((p) => (p.why.trim() ? { page: p.page.trim(), why: p.why.trim() } : { page: p.page.trim() }));
  setOrDelete('prerequisites', prereqs, prereqs.length > 0);
  if (d.videoSrc.trim()) {
    const video: Record<string, unknown> = { ...((fm.video as Record<string, unknown> | undefined) ?? {}), src: d.videoSrc.trim() };
    for (const [key, value] of [
      ['poster', d.videoPoster.trim()],
      ['length', d.videoLength.trim()],
      ['display', d.videoDisplay],
    ] as const) {
      if (value) video[key] = value;
      else delete video[key];
    }
    next.video = video;
  } else {
    delete next.video;
  }
  return next;
}

export function detailIssues(next: Record<string, unknown>): Record<string, string> {
  const r = pageFrontmatterSchema.safeParse({ ...next, updated: '2000-01-01' });
  if (r.success) return {};
  const out: Record<string, string> = {};
  for (const i of r.error.issues) {
    const k = String(i.path[0] ?? '');
    if (k === 'title') out.title = 'Give the page a title.';
    else if (k === 'summary') out.summary = 'Add a one-sentence summary.';
    else if (k === 'order') out.order = 'Use a whole number.';
    else if (k === 'author') out.author = 'Choose who wrote this page.';
    else out[k] = 'Check this field.';
  }
  return out;
}

interface Props {
  value: DetailsState;
  onChange: (next: DetailsState) => void;
  issues: Record<string, string>;
  page: PageDetailDto;
  /** False for viewers: everything is read-only. */
  canWrite: boolean;
}

const DISPLAY_LABEL = { collapsed: 'Compact (opens when clicked)', expanded: 'Full player' } as const;

function prerequisiteOptions(targets: GuideTarget[], selfRef: string): GuideTarget[] {
  return targets.filter((t) => t.ref !== selfRef);
}

const LEGACY_AUTHORS: Record<string, string> = { claude: 'Claude', human: 'Not set' };

/** Who wrote the page: picked from People (legacy values shown readably). */
function AuthorPicker({ value, onChange, error, disabled }: { value: string; onChange: (v: string) => void; error?: string; disabled: boolean }) {
  const people = useQuery({ queryKey: queryKeys.people, queryFn: ({ signal }) => api.getPeople(signal) });
  const active = (people.data ?? []).filter((p) => p.active);
  const known = active.some((p) => p.name === value);
  return (
    <Field label="Written by" error={error ?? (people.isError ? describeError(people.error) : undefined)} hint="People are listed in Settings › People.">
      {(p) => (
        <select {...p} value={value} disabled={disabled || people.isPending} onChange={(e) => onChange(e.target.value)}>
          {value === '' || value === 'human' ? <option value={value}>Not set</option> : null}
          {!known && value && value !== 'human' ? <option value={value}>{LEGACY_AUTHORS[value] ?? value} (not in People)</option> : null}
          {people.isPending ? <option>Loading people…</option> : null}
          {active.map((person) => (
            <option key={person.id} value={person.name}>
              {person.name}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/** Uploads a file into this page's module and reports the result. */
function useModuleUpload(page: PageDetailDto, kind: UploadKind, onDone: (file: ModuleFile) => void) {
  const { notify } = useNotice();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const pick = async (file: File) => {
    setBusy(true);
    setError(undefined);
    try {
      const { data, message } = await api.upload(page.product, page.module, kind, file);
      onDone({ src: data.src, name: data.name, url: data.url });
      notify('success', data.renamed ? `${message} Save the page to keep it.` : 'Uploaded. Save the page to keep it.');
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };
  return { pick, busy, error };
}

export function DetailsForm({ value: d, onChange, issues, page, canWrite }: Props) {
  // Uploads finish later: always apply changes to the latest form state.
  const latest = useRef(d);
  latest.current = d;
  const set = <K extends keyof DetailsState>(key: K, v: DetailsState[K]) => onChange({ ...latest.current, [key]: v });
  const setPrereq = (key: number, patch: Partial<DetailsState['prerequisites'][number]>) =>
    set('prerequisites', d.prerequisites.map((p) => (p.key === key ? { ...p, ...patch } : p)));
  const options = prerequisiteOptions(page.targets, `${page.module}/${page.slug}`);
  const [media, setMedia] = useState<ModuleFile[]>(page.media);
  const [images, setImages] = useState<ModuleFile[]>(page.images);
  const savedVideo = str((page.frontmatter.video as Record<string, unknown> | undefined)?.src);
  const savedPoster = str((page.frontmatter.video as Record<string, unknown> | undefined)?.poster);

  const videoUpload = useModuleUpload(page, 'video', (f) => {
    setMedia((m) => [...m.filter((x) => x.src !== f.src), f]);
    set('videoSrc', f.src);
  });
  const posterUpload = useModuleUpload(page, 'image', (f) => {
    setImages((m) => [...m.filter((x) => x.src !== f.src), f]);
    set('videoPoster', f.src);
  });

  const fileHref = (src: string, list: ModuleFile[]) => {
    if (!src) return null;
    if (/^https?:\/\//i.test(src)) return src;
    return list.some((f) => f.src === src) ? moduleFileUrl(page.product, page.module, src) : null;
  };
  const fileStatus = (src: string, list: ModuleFile[]) => {
    if (!src || /^https?:\/\//i.test(src)) return null;
    return list.some((f) => f.src === src) ? null : { tone: 'warn' as const, text: 'File not on this computer' };
  };

  return (
    <fieldset className="stack details-form" disabled={!canWrite}>
      <legend className="visually-hidden">Page details</legend>
      <Switch
        label="Show on the public site"
        checked={d.isPublic}
        onChange={(v) => set('isPublic', v)}
        hint={d.isPublic ? 'Readers can find this page once it is published.' : 'Private: kept off the public site, Ask AI and search. Still editable here.'}
      />
      <Field label="Title" error={issues.title}>
        {(p) => <input {...p} value={d.title} onChange={(e) => set('title', e.target.value)} />}
      </Field>
      <Field label="Summary" hint="One sentence under the title." error={issues.summary}>
        {(p) => <textarea {...p} rows={3} value={d.summary} onChange={(e) => set('summary', e.target.value)} />}
      </Field>
      <Field label="Who it’s for (optional)" hint="e.g. Sales and finance staff">
        {(p) => <input {...p} value={d.audience} onChange={(e) => set('audience', e.target.value)} />}
      </Field>
      <AuthorPicker value={d.author} onChange={(v) => set('author', v)} error={issues.author} disabled={!canWrite} />
      <div className="grid-2">
        <fieldset className="radio-set">
          <legend>Status</legend>
          <label>
            <input type="radio" name="status" checked={d.status === 'published'} onChange={() => set('status', 'published')} /> Published
          </label>
          <label>
            <input type="radio" name="status" checked={d.status === 'draft'} onChange={() => set('status', 'draft')} /> Draft
          </label>
        </fieldset>
        <Field label="Order" hint="Lower comes first." error={issues.order}>
          {(p) => <input {...p} inputMode="numeric" value={d.order} onChange={(e) => set('order', e.target.value)} />}
        </Field>
      </div>

      <fieldset className="subsection">
        <legend>Do these first</legend>
        <p className="muted small">Pages the reader should finish before this one.</p>
        {d.prerequisites.map((p) => (
          <div key={p.key} className="prereq-row">
            <select aria-label="Page to do first" value={p.page} onChange={(e) => setPrereq(p.key, { page: e.target.value })}>
              <option value="">Choose a page…</option>
              {!options.some((o) => o.ref === p.page) && p.page ? <option value={p.page}>{p.page} (not found)</option> : null}
              {options.map((o) => (
                <option key={o.ref} value={o.ref}>
                  {o.moduleTitle} › {o.title}
                </option>
              ))}
            </select>
            <input aria-label="Why" placeholder="Why (optional)" value={p.why} onChange={(e) => setPrereq(p.key, { why: e.target.value })} />
            <button
              type="button"
              className="block-remove"
              aria-label="Take this page off the list"
              title="Take this page off the list"
              onClick={() => set('prerequisites', d.prerequisites.filter((x) => x.key !== p.key))}
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" className="btn btn--small" onClick={() => set('prerequisites', [...d.prerequisites, { key: nextKey++, page: '', why: '' }])}>
          + Add a page
        </button>
      </fieldset>

      <fieldset className="subsection">
        <legend>App screens this page explains</legend>
        <Field label="Screen addresses" hint="One per line, e.g. /sales/invoices/new">
          {(p) => <textarea {...p} className="mono" rows={2} value={d.appRoutes} onChange={(e) => set('appRoutes', e.target.value)} />}
        </Field>
      </fieldset>

      <fieldset className="subsection">
        <legend>Walkthrough video</legend>
        <FilePicker
          label="Video file"
          value={d.videoSrc}
          href={fileHref(d.videoSrc, media)}
          accept=".mp4,.webm,.mov,.m4v,video/*"
          onPick={(f) => void videoUpload.pick(f)}
          onClear={() => set('videoSrc', '')}
          busy={videoUpload.busy}
          error={videoUpload.error}
          status={d.videoSrc === savedVideo && page.video.state === 'missing' ? { tone: 'warn', text: 'File not on this computer' } : fileStatus(d.videoSrc, media)}
          hint="A real click-through of the app. The file is copied into this module’s media folder."
          existing={media}
          onChooseExisting={(src) => set('videoSrc', src)}
        />
        {d.videoSrc.trim() ? (
          <>
            <FilePicker
              label="Cover picture (optional)"
              value={d.videoPoster}
              href={fileHref(d.videoPoster, [...images, ...media])}
              accept=".webp,.png,.jpg,.jpeg,.gif,image/*"
              onPick={(f) => void posterUpload.pick(f)}
              onClear={() => set('videoPoster', '')}
              busy={posterUpload.busy}
              error={posterUpload.error}
              status={d.videoPoster === savedPoster && page.video.posterState === 'missing' ? { tone: 'warn', text: 'File not on this computer' } : fileStatus(d.videoPoster, [...images, ...media])}
              existing={images}
              onChooseExisting={(src) => set('videoPoster', src)}
            />
            <Field label="Length (optional)" hint="e.g. 1 min 20 s">
              {(p) => <input {...p} value={d.videoLength} onChange={(e) => set('videoLength', e.target.value)} />}
            </Field>
            <Field label="How the video shows on this page">
              {(p) => (
                <select {...p} value={d.videoDisplay} onChange={(e) => set('videoDisplay', e.target.value as DetailsState['videoDisplay'])}>
                  <option value="">Site default ({DISPLAY_LABEL[page.siteDefaultVideoDisplay]})</option>
                  <option value="collapsed">{DISPLAY_LABEL.collapsed}</option>
                  <option value="expanded">{DISPLAY_LABEL.expanded}</option>
                </select>
              )}
            </Field>
          </>
        ) : (
          <p className="muted small">No video yet. Choose a file, or use “Make a video” on the Pages screen to ask Claude for one.</p>
        )}
      </fieldset>
    </fieldset>
  );
}

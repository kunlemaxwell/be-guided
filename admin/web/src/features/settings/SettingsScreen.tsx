import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { THEMES } from '@/lib/themes';
import { siteSettingsSchema, THEME_IDS, VIDEO_DISPLAYS, type HeroSettings as HeroValue, type ThemeCustom, type ThemeId, type VideoDisplay } from '@/types/content';
import { api, queryKeys } from '../../api/endpoints';
import { describeError } from '../../api/client';
import { useAuth } from '../../auth/AuthProvider';
import { AsyncView } from '../../components/AsyncView';
import { Field } from '../../components/Field';
import { TabPanel, Tabs } from '../../components/Tabs';
import { useNotice } from '../../hooks/useNotice';
import { useUnsavedChanges } from '../../hooks/useUnsavedChanges';
import { SITE_URL, THEME_SWATCHES } from '../../lib/site';
import { PeoplePanel } from './PeoplePanel';
import { ConnectorPanel } from './ConnectorPanel';
import { canonical, dirtyTabs, SETTINGS_TABS, tabFromParam, type SettingsTab } from './settings-tabs';
import { LayoutSettings, type LayoutValue } from './LayoutSettings';
import { ThemeCustomizer } from './ThemeCustomizer';
import { HeroSettings } from './HeroSettings';

const MODES = [
  { value: 'light', label: 'Light', hint: 'Readers start on a light page.' },
  { value: 'dark', label: 'Dark', hint: 'Readers start on a dark page.' },
  { value: 'system', label: 'Match the reader’s device', hint: 'Light or dark, whichever their computer or phone uses.' },
] as const;

const VIDEO_OPTIONS: Record<VideoDisplay, { label: string; hint: string }> = {
  collapsed: { label: 'Compact (opens when clicked)', hint: 'One slim “Watch the walkthrough” row; the player opens when the reader clicks it.' },
  expanded: { label: 'Full player', hint: 'The video player is shown straight away at the top of the page.' },
};

const TABS_ID = 'settings';

type Site = Record<string, unknown>;

function videoDisplay(site: Site): VideoDisplay {
  const v = (site.video as { display?: unknown } | undefined)?.display;
  return v === 'expanded' ? 'expanded' : 'collapsed';
}

function themeOf(site: Site): ThemeId {
  return (THEME_IDS as readonly string[]).includes(String(site.theme)) ? (site.theme as ThemeId) : 'classic';
}

/** The chosen tab lives in the address (`?tab=people`), so it survives a refresh and can be linked to. */
function useSettingsTab(): [SettingsTab, (tab: SettingsTab) => void] {
  const [params, setParams] = useSearchParams();
  const tab = tabFromParam(params.get('tab'));
  const choose = (next: SettingsTab) =>
    setParams(
      (p) => {
        const out = new URLSearchParams(p);
        out.set('tab', next);
        return out;
      },
      { replace: true },
    );
  return [tab, choose];
}

/** Settings, one tab per area. The site's look and details are a draft with one Save bar; People save straight away. */
function SettingsTabs({ saved }: { saved: Site }) {
  const qc = useQueryClient();
  const { notify } = useNotice();
  const canEdit = useAuth().can('settings:manage');
  const [tab, setTab] = useSettingsTab();
  const [draft, setDraft] = useState<Site>(saved);
  const savedKey = canonical(saved);
  // A fresh copy from the server (after Save) becomes the new starting point (keeping the file's key order).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setDraft(saved), [savedKey]);

  const dirty = canonical(draft) !== savedKey;
  const changedTabs = useMemo(() => dirtyTabs(saved, draft), [saved, draft]);
  const parsed = useMemo(() => siteSettingsSchema.safeParse(draft), [draft]);
  const fieldIssue = (field: string) => (parsed.success ? undefined : parsed.error.issues.find((i) => i.path[0] === field)?.message);
  const leaveGuard = useUnsavedChanges(dirty, 'your settings');
  const update = (patch: Site) => setDraft((d) => ({ ...d, ...patch }));
  const theme = themeOf(draft);

  const save = useMutation({
    mutationFn: () => api.saveSite(draft),
    onSuccess: (next) => {
      qc.setQueryData(queryKeys.site, next);
      notify('success', 'Saved — refresh the site to see it.', { href: SITE_URL, label: 'Open the site' });
    },
    onError: (e) => notify('error', describeError(e)),
  });

  const tabs = SETTINGS_TABS.map((t) => ({ ...t, marked: changedTabs.has(t.id), markLabel: 'unsaved changes' }));

  return (
    <div className="stack-lg">
      {leaveGuard}
      <div className={`savebar savebar--sticky${dirty ? ' savebar--dirty' : ''}`} role="status" aria-live="polite">
        <span>{!canEdit ? 'Only an owner can change these settings.' : dirty ? (parsed.success ? 'Unsaved changes.' : 'Some values are not valid yet.') : 'All changes saved.'}</span>
        {canEdit ? (
          <span className="savebar__actions">
            <button type="button" className="btn btn--small" disabled={!dirty || save.isPending} onClick={() => setDraft(saved)}>
              Discard
            </button>
            <button type="button" className="btn btn--primary btn--small" disabled={!dirty || !parsed.success || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </span>
        ) : null}
      </div>

      <Tabs label="Settings sections" tabs={tabs} value={tab} onChange={setTab} idPrefix={TABS_ID} />

      <TabPanel idPrefix={TABS_ID} id="appearance" active={tab === 'appearance'}>
        <fieldset className="stack-lg plain-fieldset" disabled={!canEdit}>
          <legend className="visually-hidden">Appearance</legend>
          <section className="panel" aria-labelledby="theme-h">
            <h2 id="theme-h">Theme</h2>
            <p className="muted">The colours and typeface of every page. How pages are arranged is on the Layout tab, and any layout works with any theme.</p>
            <div className="theme-grid" role="radiogroup" aria-labelledby="theme-h">
              {THEME_IDS.map((id: ThemeId) => {
                const t = THEMES[id];
                const sw = THEME_SWATCHES[id];
                const on = theme === id;
                return (
                  <button key={id} type="button" role="radio" aria-checked={on} className={`theme-card${on ? ' theme-card--on' : ''}`} onClick={() => update({ theme: id })}>
                    <span className="swatch" aria-hidden="true" style={{ background: sw?.bg, color: sw?.ink }}>
                      <span className="swatch__bar" style={{ background: sw?.accent }} />
                      <span className="swatch__lines">
                        <span style={{ background: sw?.ink }} />
                        <span style={{ background: sw?.soft }} />
                        <span style={{ background: sw?.soft }} />
                      </span>
                      <span className="swatch__dot" style={{ background: sw?.accent }} />
                    </span>
                    <span className="theme-card__name">{t.label}</span>
                    <span className="theme-card__desc">{t.description}</span>
                    {on ? <span className="theme-card__tick">{saved.theme === id ? 'In use' : 'Chosen'}</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="subsection">
              <h3 id="mode-h">Light or dark to start with</h3>
              <p className="muted">Readers can still switch for themselves.</p>
              <div className="choice-row" role="radiogroup" aria-labelledby="mode-h">
                {MODES.map((m) => (
                  <label key={m.value} className={`choice${(draft.defaultMode ?? 'system') === m.value ? ' choice--on' : ''}`}>
                    <input type="radio" name="defaultMode" value={m.value} checked={(draft.defaultMode ?? 'system') === m.value} onChange={() => update({ defaultMode: m.value })} />
                    <span className="choice__label">{m.label}</span>
                    <span className="choice__hint">{m.hint}</span>
                  </label>
                ))}
              </div>
            </div>
          </section>

          <section className="panel" aria-labelledby="custom-h">
            <h2 id="custom-h">Customize the theme</h2>
            <p className="muted">Open a section to fine-tune it on top of {THEMES[theme].label}. Anything you don’t change keeps the theme’s own look; the preview shows your changes as you go.</p>
            <ThemeCustomizer theme={theme} value={draft.themeCustom as ThemeCustom | undefined} onChange={(next) => update({ themeCustom: next })} />
          </section>
        </fieldset>
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="layout" active={tab === 'layout'}>
        <fieldset className="stack-lg plain-fieldset" disabled={!canEdit}>
          <legend className="visually-hidden">Layout</legend>
          <section className="panel stack" aria-labelledby="layout-h">
            <div>
              <h2 id="layout-h">Page layout</h2>
              <p className="muted">How every guide page is arranged: where the menu sits, where “On this page” goes, how wide the text is and how steps look.</p>
            </div>
            <LayoutSettings value={draft.layout as LayoutValue | undefined} onChange={(next) => update({ layout: next })} />
          </section>
        </fieldset>
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="home" active={tab === 'home'}>
        <fieldset className="stack-lg plain-fieldset" disabled={!canEdit}>
          <legend className="visually-hidden">Home page</legend>
          <section className="panel stack" aria-labelledby="hero-h">
            <div>
              <h2 id="hero-h">Hero animation</h2>
              <p className="muted">The picture at the top of the home page. Product pages always show their own pictures.</p>
            </div>
            <HeroSettings value={draft.hero as HeroValue | undefined} onChange={(next) => update({ hero: next })} />
          </section>
        </fieldset>
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="pages" active={tab === 'pages'}>
        <fieldset className="stack-lg plain-fieldset" disabled={!canEdit}>
          <legend className="visually-hidden">Pages and videos</legend>
          <section className="panel" aria-labelledby="video-h">
            <h2 id="video-h">Walkthrough videos on pages</h2>
            <p className="muted">A page can choose differently in its own settings.</p>
            <div className="choice-row" role="radiogroup" aria-labelledby="video-h">
              {VIDEO_DISPLAYS.map((v) => (
                <label key={v} className={`choice${videoDisplay(draft) === v ? ' choice--on' : ''}`}>
                  <input
                    type="radio"
                    name="videoDisplay"
                    value={v}
                    checked={videoDisplay(draft) === v}
                    onChange={() => update({ video: { ...((draft.video as object | undefined) ?? {}), display: v } })}
                  />
                  <span className="choice__label">{VIDEO_OPTIONS[v].label}</span>
                  <span className="choice__hint">{VIDEO_OPTIONS[v].hint}</span>
                </label>
              ))}
            </div>
          </section>
        </fieldset>
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="people" active={tab === 'people'}>
        <PeoplePanel />
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="connector" active={tab === 'connector'}>
        <ConnectorPanel />
      </TabPanel>

      <TabPanel idPrefix={TABS_ID} id="site" active={tab === 'site'}>
        <fieldset className="stack-lg plain-fieldset" disabled={!canEdit}>
          <legend className="visually-hidden">Site details</legend>
          <section className="panel stack" aria-labelledby="site-h">
            <div>
              <h2 id="site-h">Site details</h2>
              <p className="muted">The name readers see in the header and browser tab, and where they can get more help.</p>
            </div>
            <Field label="Site name" error={fieldIssue('siteName') ? 'Give the site a name.' : undefined}>
              {(p) => <input {...p} value={typeof draft.siteName === 'string' ? draft.siteName : ''} onChange={(e) => update({ siteName: e.target.value })} />}
            </Field>
            <Field
              label="Support link (optional)"
              hint="A web address readers can use when the guide doesn’t answer their question, e.g. https://example.com/support."
              error={fieldIssue('supportUrl') ? 'Enter a full web address starting with https://' : undefined}
            >
              {(p) => <input {...p} type="url" inputMode="url" value={typeof draft.supportUrl === 'string' ? draft.supportUrl : ''} onChange={(e) => update({ supportUrl: e.target.value.trim() || undefined })} />}
            </Field>
          </section>
        </fieldset>
      </TabPanel>
    </div>
  );
}

/** Settings: Appearance, Pages and videos, People and Site details, each on its own tab. */
export default function SettingsScreen() {
  const site = useQuery({ queryKey: queryKeys.site, queryFn: ({ signal }) => api.getSite(signal), refetchOnWindowFocus: false });
  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>Settings</h1>
          <p className="lede">How the guide site looks and who works on it. Changes to the site are kept as a draft until you select Save.</p>
        </div>
      </header>
      <AsyncView query={site}>{(data) => <SettingsTabs saved={data} />}</AsyncView>
    </div>
  );
}

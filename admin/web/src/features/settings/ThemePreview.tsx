import { useMemo, useState } from 'react';
import type { ThemeCustom, ThemeId } from '@/types/content';
import { THEMES } from '@/lib/themes';
import { customFontHref, themeCustomCss } from '@/lib/theme-custom';
import { themesCss } from './theme-defaults';

const PREVIEW_CSS = `
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font);font-size:var(--base-size,16px);line-height:1.6}
.h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 22px;background:var(--header-bg);color:var(--header-fg);border-bottom:var(--line-w,1px) solid var(--header-line,var(--line))}
.h b{font-family:var(--font-heading,var(--font));font-weight:var(--heading-weight)}
.h span{color:var(--header-muted,var(--header-fg));font-size:.85em}
main{padding:26px 28px 32px;max-width:680px}
.crumb{color:var(--muted);font-size:.85em}
h1{margin:6px 0 4px;font-family:var(--font-heading,var(--font));font-size:var(--h1-size);font-weight:var(--heading-weight);line-height:1.12;letter-spacing:-.02em}
h2{margin:24px 0 8px;font-family:var(--font-heading,var(--font));font-size:var(--h2-size,24px);font-weight:var(--heading-weight);letter-spacing:-.015em}
h3{margin:0 0 4px;font-family:var(--font-heading,var(--font));font-size:var(--h3-size,18px);font-weight:600}
h4{margin:0;font-family:var(--font-heading,var(--font));font-size:var(--h4-size,16px);font-weight:600}
.lead{color:var(--muted);margin:0}
ol{list-style:none;padding:0;margin:0;display:grid;gap:10px}
li{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:var(--line-w,1px) solid var(--line);border-radius:var(--radius-sm);background:var(--surface)}
.n{flex:none;display:grid;place-items:center;width:26px;height:26px;border-radius:999px;background:var(--accent);color:var(--accent-fg);font-weight:700;font-size:.8em}
li p{margin:2px 0 0;color:var(--fg-2,var(--fg))}
.callout{margin-top:16px;padding:12px 14px;border-radius:var(--radius-sm);background:var(--callout-bg,var(--soft));color:var(--callout-fg,var(--fg));border-left:3px solid var(--accent)}
.card{margin-top:16px;padding:16px 18px;border:var(--line-w,1px) solid var(--line);border-radius:var(--radius);background:var(--surface);box-shadow:var(--shadow-card,none)}
.card p{margin:4px 0 12px;color:var(--muted)}
a{color:var(--link,var(--accent))}
.btn{display:inline-block;padding:8px 14px;border-radius:var(--radius-sm);background:var(--primary-bg,var(--accent));color:var(--primary-fg,#fff);text-decoration:none;font-weight:600;font-size:.9em}
`;

const ARTICLE = `
<div class="h"><b>Be Guided</b><span>Guides · Search</span></div>
<main>
  <div class="crumb">Acme Books › Sales</div>
  <h1>Create an invoice</h1>
  <p class="lead">Bill a customer for goods or services in a few steps.</p>
  <h2>Steps</h2>
  <ol>
    <li><span class="n">1</span><div><h4>Open Invoices</h4><p>Go to <a href="#">Sales › Invoices</a> and select <b>New invoice</b>.</p></div></li>
    <li><span class="n">2</span><div><h4>Choose the customer</h4><p>Start typing the name, then pick it from the list.</p></div></li>
  </ol>
  <div class="callout"><b>Tip:</b> Save as a draft if you need someone to check it first.</div>
  <div class="card"><h3>Before you start</h3><p>Add the customer first if they are new.</p><a class="btn" href="#">Add a customer</a></div>
</main>`;

interface Props {
  theme: ThemeId;
  custom: ThemeCustom | undefined;
}

/**
 * Live preview of a mini article with the chosen theme + customizer, using
 * the site's own theme CSS and themeCustomCss() so it matches the real site.
 * Rendered in a sandboxed iframe (no scripts).
 */
export function ThemePreview({ theme, custom }: Props) {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const doc = useMemo(() => {
    const fonts = [THEMES[theme].fontHref, customFontHref(custom)].filter(Boolean).map((href) => `<link rel="stylesheet" href="${href}">`);
    const hasCustom = Boolean(custom && themeCustomCss(custom).trim());
    return `<!doctype html><html lang="en" data-theme="${theme}" data-mode="${mode}"${hasCustom ? ' data-custom' : ''}><head><meta charset="utf-8">${fonts.join('')}<style>${themesCss}\n${PREVIEW_CSS}\n${themeCustomCss(custom)}</style></head><body>${ARTICLE}</body></html>`;
  }, [theme, custom, mode]);
  return (
    <div className="theme-preview">
      <div className="theme-preview__bar">
        <span className="muted small">Preview</span>
        <div className="segmented" role="radiogroup" aria-label="Preview in light or dark">
          {(['light', 'dark'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={`segmented__item${mode === m ? ' segmented__item--on' : ''}`} onClick={() => setMode(m)}>
              {m === 'light' ? 'Light' : 'Dark'}
            </button>
          ))}
        </div>
      </div>
      <iframe title="Theme preview: a sample guide page" className="theme-preview__frame" sandbox="" srcDoc={doc} />
    </div>
  );
}

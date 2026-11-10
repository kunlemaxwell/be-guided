import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getSite } from '@/lib/content/load';
import { config } from '@/lib/config';
import { THEMES } from '@/lib/themes';
import { layoutAttributes } from '@/lib/layouts';
import { customFontHref, hasThemeCustom, themeCustomCss } from '@/lib/theme-custom';
import { NAV_STORAGE_KEY } from '@/lib/nav-state';
import { GuidePanelProvider } from '@/components/guide/GuidePanel';
import { ChatProvider } from '@/components/chat/ChatProvider';
import './globals.css';
import './layouts.css';

// Site settings are read per render, never at module load: while previewing,
// a theme or mode saved in the admin must show on a plain refresh.
export function generateMetadata(): Metadata {
  const site = getSite();
  return {
    title: { default: site.siteName, template: `%s · ${site.siteName}` },
    description: 'Step-by-step guides, screenshots and videos.',
    metadataBase: new URL(config.siteUrl),
  };
}

/**
 * Runs before first paint so the page never flashes the wrong mode or
 * sidebar state. Built from the site settings and constants only (no reader
 * input), so it is safe to inline. The sidebar starts collapsed on phones
 * until the reader opens it; after that their choice is remembered.
 */
function bootScript(defaultMode: string): string {
  return `(function(){var d=document.documentElement;try{if(/[?&]embed=1(&|$)/.test(location.search))d.setAttribute('data-embed','');}catch(e){}try{var m=localStorage.getItem('help-mode');if(m!=='light'&&m!=='dark'){var def=${JSON.stringify(defaultMode)};m=def==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):def;}d.setAttribute('data-mode',m);}catch(e){}var n=null;try{n=localStorage.getItem(${JSON.stringify(NAV_STORAGE_KEY)});}catch(e){}try{if(n!=='collapsed'&&n!=='expanded')n=window.matchMedia('(max-width: 760px)').matches?'collapsed':'expanded';d.setAttribute('data-nav',n);}catch(e){}})();`;
}

export default function RootLayout({ children }: { children: ReactNode }) {
  const site = getSite();
  const theme = THEMES[site.theme];
  // The customizer's CSS is generated only from schema-validated values
  // (hex colours, enum fonts, bounded numbers), so inlining it is safe.
  const custom = hasThemeCustom(site.themeCustom) ? site.themeCustom : undefined;
  const customCss = custom ? themeCustomCss(custom) : '';
  const customFonts = custom ? customFontHref(custom) : null;
  const { id: layoutId, ...layoutOverrides } = site.layout;
  return (
    <html lang="en" {...layoutAttributes(layoutId, layoutOverrides)} data-theme={theme.id} data-mode="light" data-nav="expanded" data-custom={custom ? '' : undefined} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript(site.defaultMode) }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href={theme.fontHref} />
        {customFonts ? <link rel="stylesheet" href={customFonts} /> : null}
        {customCss ? <style id="theme-custom" dangerouslySetInnerHTML={{ __html: customCss.replace(/</g, '\\3c ') }} /> : null}
      </head>
      <body>
        <GuidePanelProvider>
          <ChatProvider>{children}</ChatProvider>
        </GuidePanelProvider>
      </body>
    </html>
  );
}

import { useEffect, useRef, useState } from 'react';
import { IN_CHAT, relayStudio } from '../../widget/host';

type Tab = 'plans' | 'checks' | 'skills' | 'feedback';

const COPY: Record<'automation' | 'feedback', { title: string; lede: string; tabs: Tab }> = {
  automation: {
    title: 'Automatic checks',
    lede: 'Update plans and schedules, the log of every check (pick which changes to apply), and the writing and QA skills a connected AI follows.',
    tabs: 'plans',
  },
  feedback: {
    title: 'Reader feedback',
    lede: 'Every "Was this helpful?" vote from the public guide: thumbs up and down per page, comments, and the email when a reader left one.',
    tabs: 'feedback',
  },
};

/**
 * The Studio app (studio/index.html, also the connector's in-chat app) inside
 * the admin. Same origin, so it calls POST /api/v1/automation/call with the
 * admin's own sign-in. The frame grows with its content.
 */
export default function StudioScreen({ kind }: { kind: 'automation' | 'feedback' }) {
  const copy = COPY[kind];
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(900);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      const doc = el.contentDocument;
      if (!doc) return;
      observer?.disconnect();
      observer = new ResizeObserver(() => setHeight(Math.max(600, doc.documentElement.scrollHeight + 24)));
      observer.observe(doc.body);
    };
    el.addEventListener('load', onLoad);
    return () => {
      el.removeEventListener('load', onLoad);
      observer?.disconnect();
    };
  }, [kind]);

  // Inside the chat: the Studio is part of this page (srcdoc) and its calls go through the chat.
  const [studioHtml, setStudioHtml] = useState<string | null>(null);
  useEffect(() => {
    if (!IN_CHAT) return;
    void import('../../../public/studio.html?raw').then((m) => setStudioHtml(m.default));
  }, []);
  useEffect(() => {
    if (!IN_CHAT || !frame.current) return;
    return relayStudio(frame.current, (h) => setHeight(Math.max(600, h + 24)));
  }, [studioHtml, kind]);

  const theme = document.documentElement.dataset.theme;
  const src = `/studio.html?transport=admin&embed=1&tab=${copy.tabs}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`;
  return (
    <div className="screen">
      <header className="screen__head">
        <div>
          <h1>{copy.title}</h1>
          <p className="lede">{copy.lede}</p>
        </div>
      </header>
      {IN_CHAT ? (
        studioHtml ? (
          <iframe
            key={kind}
            ref={frame}
            title={copy.title}
            name={`pv-studio?transport=parent&embed=1&tab=${copy.tabs}${theme ? `&theme=${encodeURIComponent(theme)}` : ''}`}
            srcDoc={studioHtml}
            style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent' }}
          />
        ) : (
          <p className="muted">Loading…</p>
        )
      ) : (
        <iframe key={kind} ref={frame} title={copy.title} src={src} style={{ width: '100%', height, border: 0, display: 'block', background: 'transparent' }} />
      )}
    </div>
  );
}

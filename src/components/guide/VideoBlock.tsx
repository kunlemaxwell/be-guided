'use client';

import { useState } from 'react';
import { PlayIcon } from '../Icons';

interface Props {
  src: string;
  poster?: string;
  length?: string;
  /** The page title, so the row reads "Watch the Create an invoice walkthrough". */
  title: string;
  /** "collapsed" = one slim row that opens the player; "expanded" = player shown. */
  display: 'collapsed' | 'expanded';
}

/**
 * Walkthrough video. Pages without a video don't render this at all, so no
 * empty space. The admin app decides whether it starts compact or open.
 */
export function VideoBlock({ src, poster, length, title, display }: Props) {
  const [open, setOpen] = useState(display === 'expanded');
  // "Create an invoice" reads naturally as "create an invoice" mid-sentence;
  // names such as "Acme Books" keep their capitals.
  const name = /^[A-Z][a-z]/.test(title) ? title.charAt(0).toLowerCase() + title.slice(1) : title;
  const label = `Watch the ${name} walkthrough`;
  return (
    <div className="video" data-display={display}>
      <button type="button" className="video__toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="video__thumb"><PlayIcon /></span>
        <span className="video__text">
          {label}
          <small>{length ? `${length} · ` : ''}same steps as below</small>
        </span>
        <span className="video__action">{open ? 'Hide' : 'Play'}</span>
      </button>
      {open ? (
        <video
          src={src}
          poster={poster}
          controls
          // Compact mode opened on request, so start playing; full mode waits for the reader.
          autoPlay={display === 'collapsed'}
          playsInline
          preload="metadata"
          aria-label={label}
        >
          Your browser can't play this video.
        </video>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { CloseIcon } from '../Icons';

interface Props {
  src: string;
  alt: string;
  /** Natural on-screen width in CSS px; the image never grows past it. */
  width?: number;
}

/** Screenshot that opens full-size on click; Esc or click closes it. */
export function ZoomImage({ src, alt, width }: Props) {
  const [open, setOpen] = useState(false);
  const closeBtn = useRef<HTMLButtonElement | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  return (
    <>
      <button ref={trigger} type="button" className="shot__btn" onClick={() => setOpen(true)} aria-label={`Enlarge screenshot: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" style={width ? { width, maxWidth: '100%' } : undefined} />
      </button>
      {open ? (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label={alt} onClick={close}>
          <button ref={closeBtn} type="button" className="lightbox__close" onClick={close} aria-label="Close">
            <CloseIcon size={20} />
          </button>
          <img src={src} alt={alt} onClick={(e) => e.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}

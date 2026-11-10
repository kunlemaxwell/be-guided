import { useEffect, useId, useRef, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * Modal dialog on the native <dialog> element: it keeps keyboard focus
 * inside while open, closes on Escape, and returns focus where it was.
 */
export function Dialog({ open, title, onClose, children, footer, wide }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
      // Start in the first field of a form dialog (React's autoFocus runs before showModal moves focus).
      el.querySelector<HTMLElement>('.dialog__body input:not([type="hidden"]), .dialog__body select, .dialog__body textarea')?.focus();
    } else if (!open && el.open) {
      el.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  // Dialogs that are simply removed from the page also hand focus back.
  useEffect(() => () => returnFocus.current?.focus(), []);

  return (
    <dialog
      ref={ref}
      className={`dialog${wide ? ' dialog--wide' : ''}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      {open ? (
        <>
          <header className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </header>
          <div className="dialog__body">{children}</div>
          {footer ? <footer className="dialog__foot">{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}

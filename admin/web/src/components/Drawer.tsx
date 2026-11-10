import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Shown under the title, e.g. the page name. */
  subtitle?: ReactNode;
  footer?: ReactNode;
}

/**
 * A panel that slides in from the right, for details next to a list (audit
 * entry, page history). Built on the native modal <dialog>: focus is trapped
 * inside, Escape closes, and focus returns to where it was.
 */
export function Drawer({ open, title, onClose, children, subtitle, footer }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      el.showModal();
    } else if (!open && el.open) {
      el.close();
      returnFocus.current?.focus();
    }
  }, [open]);

  useEffect(() => () => returnFocus.current?.focus(), []);

  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <div className="drawer__inner">
          <header className="drawer__head">
            <div>
              <h2 id={titleId}>{title}</h2>
              {subtitle ? <p className="muted small">{subtitle}</p> : null}
            </div>
            <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
              <Icon name="close" />
            </button>
          </header>
          <div className="drawer__body">{children}</div>
          {footer ? <footer className="drawer__foot">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

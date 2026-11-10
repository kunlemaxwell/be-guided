import { useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';

export interface ActionItem {
  label: string;
  /** In-app route (react-router). */
  to?: string;
  /** External link, opened in a new tab. */
  href?: string;
  onSelect?: () => void;
  disabled?: boolean;
}

interface Props {
  /** Accessible name of the ⋮ button, e.g. "Actions for Create an invoice". */
  label: string;
  items: ActionItem[];
}

/**
 * A vertical ⋮ button that opens a small menu of row actions. Keyboard:
 * Enter/Space/↓ opens and focuses the first item, ↑/↓/Home/End move,
 * Escape closes and returns focus, Tab or a click outside closes.
 */
export function ActionsMenu({ label, items }: Props) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();

  const focusItem = (index: number) => {
    const els = menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])');
    if (!els || els.length === 0) return;
    const i = (index + els.length) % els.length;
    els[i]?.focus();
  };

  useEffect(() => {
    if (!open) return;
    focusItem(0);
    const onDown = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node) && !button.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? [])];
    const current = els.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusItem(current + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusItem(current - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusItem(els.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div className="actions-menu">
      <button
        ref={button}
        type="button"
        className="icon-btn actions-menu__button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <Icon name="more" />
      </button>
      {open ? (
        <div ref={menu} id={id} role="menu" aria-label={label} className="actions-menu__list" onKeyDown={onMenuKey}>
          {items.map((item) => {
            const common = { role: 'menuitem', tabIndex: -1, className: 'actions-menu__item', 'aria-disabled': item.disabled || undefined } as const;
            if (item.to && !item.disabled) {
              return (
                <Link key={item.label} to={item.to} {...common} onClick={() => close(false)}>
                  {item.label}
                </Link>
              );
            }
            if (item.href && !item.disabled) {
              return (
                <a key={item.label} href={item.href} target="_blank" rel="noreferrer" {...common} onClick={() => close(false)}>
                  {item.label} <Icon name="external" size={14} />
                </a>
              );
            }
            return (
              <button
                key={item.label}
                type="button"
                {...common}
                disabled={item.disabled}
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

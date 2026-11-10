import type { ReactNode } from 'react';

export type BadgeTone = 'on' | 'off' | 'warn' | 'draft' | 'live' | 'neutral' | 'info';

/** A small labelled status chip. */
export function Badge({ tone, children, title }: { tone: BadgeTone; children: ReactNode; title?: string }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {children}
    </span>
  );
}

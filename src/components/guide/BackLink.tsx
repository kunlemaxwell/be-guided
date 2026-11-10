'use client';

import { useEffect, useState } from 'react';

/**
 * Shows "← Back to <page>" when the reader arrived from another guide page's
 * link. Only same-site paths are accepted, so the link can't be abused.
 */
export function BackLink() {
  const [back, setBack] = useState<{ href: string; title: string } | null>(null);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const from = q.get('from');
    const title = q.get('fromTitle');
    if (from && title && from.startsWith('/') && !from.startsWith('//')) {
      setBack({ href: from, title: title.slice(0, 120) });
    }
  }, []);

  if (!back) return null;
  return (
    <a className="back-link" href={back.href}>
      ← Back to {back.title}
    </a>
  );
}

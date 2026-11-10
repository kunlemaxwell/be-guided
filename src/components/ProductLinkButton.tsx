'use client';

import { useEffect, useRef, useState } from 'react';
import { CheckIcon, CopyIcon } from './Icons';

/**
 * "Copy link to this guide" on a product's home: copies the product's own
 * address, so it can be shared and opens straight on this product.
 */
export function ProductLinkButton({ slug, name }: { slug: string; name: string }) {
  const [copied, setCopied] = useState<'yes' | 'failed' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    const url = `${window.location.origin}/${slug}/`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied('yes');
    } catch {
      window.prompt(`Link to the ${name} guide:`, url);
      setCopied('failed');
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 2500);
  };

  return (
    <button type="button" className="btn product-link-btn" onClick={copy} aria-live="polite">
      {copied === 'yes' ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
      {copied === 'yes' ? 'Link copied' : `Copy link to the ${name} guide`}
    </button>
  );
}

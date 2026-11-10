import { getOpenProducts, pageHref } from '@/lib/content/load';
import { buildSearchDocuments } from '@/lib/search/documents';

/**
 * GET /search/index.json — the public guide pages as plain text, for the
 * search box while previewing (`npm run dev` has no Pagefind index) and as a
 * backup if the Pagefind index can't load. Built with the static site, so it
 * holds exactly what is published: private pages and drafts are never in it.
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json({ docs: buildSearchDocuments(getOpenProducts(), pageHref) });
}

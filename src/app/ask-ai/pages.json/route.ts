import { getOpenProducts, getSite, pageHref } from '@/lib/content/load';

/**
 * GET /ask-ai/pages.json — the guide as data for Ask AI and the "Connect
 * your AI" (MCP) connector, built with the static site. On Cloudflare, both
 * read this file instead of the content repository, so they answer from
 * exactly what is published. Private pages, pages of private products and
 * (outside local preview) drafts are already left out of this build; status
 * and visibility are included so the API can check again. Pages are listed in
 * site order (product, module, page).
 */
export const dynamic = 'force-static';

export function GET(): Response {
  return Response.json({
    supportUrl: getSite().supportUrl ?? null,
    pages: getOpenProducts().flatMap((product) =>
      product.modules.flatMap((mod) =>
        mod.pages.map((p) => ({
          id: p.id,
          product: p.productSlug,
          module: p.moduleSlug,
          slug: p.slug,
          title: p.title,
          summary: p.summary,
          status: p.status,
          visibility: p.visibility,
          productName: product.name,
          productVisibility: product.visibility,
          moduleTitle: mod.title,
          href: pageHref(p),
          updated: p.updated,
          prerequisites: p.prerequisites,
          video: p.video ? { src: p.video.src, poster: p.video.poster, length: p.video.length } : null,
          body: p.body,
        })),
      ),
    ),
  });
}

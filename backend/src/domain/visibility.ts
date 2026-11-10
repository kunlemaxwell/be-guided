/**
 * What the public can see. A page is public only when it is published,
 * marked public, and its product is public and not "Coming soon". Private products and pages stay
 * editable in the admin but are kept out of the public site and Ask AI.
 */
export function isPubliclyVisible(product: Record<string, unknown>, page: { status?: unknown; visibility?: unknown }): boolean {
  const productPublic = product.visibility !== 'private' && product.status !== 'coming-soon';
  const published = page.status === undefined || page.status === 'published';
  const pagePublic = page.visibility === undefined || page.visibility === 'public';
  return productPublic && published && pagePublic;
}

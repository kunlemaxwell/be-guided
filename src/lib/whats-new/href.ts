/**
 * Where "What's new" lives. Inside a product it is that product's own page, so a
 * reader in one product never has to filter the others out. From the main page
 * it first asks which product (or all of them): see `whatsNewAllHref` for the
 * page that lists every product's changes together.
 */
export function whatsNewHref(productSlug?: string): string {
  return productSlug ? `/${productSlug}/whats-new/` : '/changelog/';
}

/** Every product's changes together, with Product as a way to group and filter. */
export const whatsNewAllHref = '/changelog/all/';

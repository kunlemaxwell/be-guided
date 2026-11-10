/**
 * The public help site is a fully static export. Cloudflare Pages serves the
 * `out/` folder; the guide API and the AI connector run as Cloudflare Pages
 * Functions (see `functions/`), so no Node server is needed in production.
 *
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  output: 'export',
  trailingSlash: true,
  // Screenshots are compressed at publish time (admin app), not at request
  // time, so the free hosting tier's image-transformation limits never apply.
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;

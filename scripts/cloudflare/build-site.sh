#!/bin/bash
# Builds the public guide site for Cloudflare Pages without disturbing a
# running `next dev` (both would write to .next/). It copies the project to
# .wrangler/site-build/ (git-ignored), builds there and leaves the result in
# .wrangler/site-build/out/. Private products and raw captures are left out.
#
#   SITE_URL=https://… ADMIN_URL=https://… bash scripts/cloudflare/build-site.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
BUILD="$ROOT/.wrangler/site-build"
: "${SITE_URL:?SITE_URL is required}"

mkdir -p "$BUILD"
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude out --exclude .wrangler \
  --exclude .admin --exclude _capture-frames --exclude 'public/_content' \
  --exclude '_capture/raw' --exclude 'admin/web/dist' --exclude brand --exclude .git \
  "$ROOT/" "$BUILD/"
ln -sfn "$ROOT/node_modules" "$BUILD/node_modules"

cd "$BUILD"
NEXT_PUBLIC_HELP_ENV=production \
NEXT_PUBLIC_SITE_URL="$SITE_URL" \
NEXT_PUBLIC_API_BASE_URL="${ADMIN_URL:-}" \
INCLUDE_PRIVATE_PRODUCTS=false \
  npm run build

# Refuse to hand over a build that still points at this computer or carries raw captures.
if grep -rlE "localhost:(3000|3100|3101)" out --include='*.html' --include='*.js' --include='*.txt' >/dev/null 2>&1; then
  echo "build-site: the build still points at localhost" >&2; exit 3
fi
if find out -path '*_capture*' | grep -q .; then
  echo "build-site: raw screen captures found in the build" >&2; exit 4
fi
# `npm run build` runs Pagefind afterwards (postbuild); without its index the search box falls back to /search/index.json.
if [ ! -f out/pagefind/pagefind.js ]; then
  echo "build-site: the search index (out/pagefind) is missing" >&2; exit 6
fi
# Cloudflare Pages refuses files over 25 MiB (usually a long video).
big="$(find out -type f -size +25M)"
if [ -n "$big" ]; then
  echo "build-site: these files are over Cloudflare Pages' 25 MB limit:" >&2; echo "$big" | sed 's|^out/|  |' >&2; exit 5
fi
echo "build-site: ready in $BUILD/out"

#!/bin/bash
# Finishes two Cloudflare switches for the online admin:
#   1. "Adding someone in People lets them sign in": asks for the Cloudflare API token
#      (hidden, never shown or written to a file) and gives it to the admin (secret CF_API_TOKEN).
#   2. "Big videos": if the R2 bucket's public address is switched on, tells the admin to use it.
# Then puts the admin online again.
#
#   bash scripts/cloudflare/connect-sign-in.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
BUCKET="be-guided-media"

echo
echo "Paste the Cloudflare token, then press Enter (nothing will appear while you paste)."
echo "Just press Enter to skip this part."
read -r -s TOKEN
echo
if [ -n "$TOKEN" ]; then
  [ ${#TOKEN} -ge 30 ] || { echo "That doesn't look like a Cloudflare token. Run this again."; exit 1; }
  printf '%s' "$TOKEN" | npx --no-install wrangler secret put CF_API_TOKEN >/dev/null
  echo "Sign-in token saved."
fi
unset TOKEN

echo "Checking the big-video storage..."
URL="$(npx --no-install wrangler r2 bucket dev-url get "$BUCKET" 2>/dev/null | grep -Eo 'https://pub-[a-z0-9]+\.r2\.dev' | head -1 || true)"
if [ -n "$URL" ]; then
  node scripts/cloudflare/set-toml.mjs R2_PUBLIC_URL "$URL" >/dev/null
  echo "Big videos will play from $URL"
else
  echo "Big-video storage is not public yet (videos stay limited to 24 MB). That's fine."
fi

echo "Putting the admin online again..."
npx --no-install wrangler deploy 2>&1 | grep -E "Deployed|ERROR" || true
echo
echo "Done. You can close this window."

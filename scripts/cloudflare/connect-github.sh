#!/bin/bash
# Connects Be Guided to its GitHub repository in one go:
#   1. asks for the GitHub token (hidden, never shown or written to a file),
#   2. sends this project to GitHub (first push),
#   3. gives the token to the online admin (Cloudflare secret GITHUB_TOKEN),
#   4. puts the admin online again with the repository name.
#
#   bash scripts/cloudflare/connect-github.sh your-name/be-guided
set -euo pipefail
cd "$(dirname "$0")/../.."
REPO="${1:?Usage: connect-github.sh owner/repo}"

echo
echo "Paste the GitHub token, then press Enter (nothing will appear while you paste):"
read -r -s TOKEN
echo
[ ${#TOKEN} -ge 20 ] || { echo "That doesn't look like a token. Run this again."; exit 1; }

echo "Sending the project to GitHub..."
AUTH="$(printf 'x-access-token:%s' "$TOKEN" | base64)"
git -c http.extraHeader="Authorization: Basic $AUTH" push -u origin main 2>&1 | grep -vi "authorization" || { echo "Push failed. Check the token has Contents: Read and write on $REPO."; exit 1; }

echo "Giving the token to the online admin..."
printf '%s' "$TOKEN" | npx --no-install wrangler secret put GITHUB_TOKEN >/dev/null
unset TOKEN AUTH

node scripts/cloudflare/set-toml.mjs GITHUB_REPO "$REPO" >/dev/null
echo "Putting the admin online again..."
npx --no-install wrangler deploy 2>&1 | grep -E "Deployed|ERROR" || true
echo
echo "Done. GitHub is connected."

#!/bin/bash
# Sends this computer's commits to GitHub (the site then rebuilds itself).
# First run asks for the GitHub token once (hidden) and keeps it in the Mac's
# Keychain, so later runs need nothing.
set -euo pipefail
cd "$(dirname "$0")/../.."
git config credential.helper osxkeychain
if ! printf 'protocol=https\nhost=github.com\n\n' | git credential-osxkeychain get 2>/dev/null | grep -q '^password='; then
  echo "Paste the GitHub token, then press Enter (nothing will appear while you paste):"
  read -r -s TOKEN; echo
  printf 'protocol=https\nhost=github.com\nusername=x-access-token\npassword=%s\n\n' "$TOKEN" | git credential-osxkeychain store
  unset TOKEN
fi
echo "Getting the latest from GitHub (including saves made in the online admin)..."
git pull --rebase origin main
echo "Sending your changes..."
git push origin main
echo
echo "Done. If your site is connected to GitHub, it rebuilds in about 2 minutes."

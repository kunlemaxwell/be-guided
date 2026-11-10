#!/bin/bash
# Puts Be Guided on Cloudflare, step by step, in plain English.
# Started with `npm run setup` in the project folder (macOS, Linux, or Windows with WSL/Git Bash).
#
# Safe to run again: every step checks what already exists and skips it.
# It never sees your passwords or keys. Cloudflare's own sign-in page opens in
# your browser, and keys are typed straight into Cloudflare's tool (hidden).
#
#   bash scripts/cloudflare/setup.sh             everything
#   bash scripts/cloudflare/setup.sh --site-only  just rebuild and republish the public site

set -u
cd "$(dirname "$0")/../.."
ROOT="$(pwd)"
SETTINGS="scripts/cloudflare/settings.env"
LOG_DIR=".wrangler/setup-logs"
mkdir -p "$LOG_DIR"

# ── Looks ──────────────────────────────────────────────────────────────────
B=$'\e[1m'; G=$'\e[32m'; Y=$'\e[33m'; R=$'\e[31m'; N=$'\e[0m'
STEP=0
step()  { STEP=$((STEP + 1)); echo; echo "${B}━━ Step $STEP: $1 ━━${N}"; }
say()   { echo "   $1"; }
ok()    { echo "   ${G}✓${N} $1"; }
warn()  { echo "   ${Y}!${N} $1"; }
fail()  { echo "   ${R}✗${N} $1"; }
pause() { echo; read -r -p "   Press Enter to continue (or type s to skip this step): " a; [ "${a:-}" != "s" ]; }
ask()   { local q="$1" def="${2:-}" a; if [ -n "$def" ]; then read -r -p "   $q [$def]: " a; echo "${a:-$def}"; else read -r -p "   $q: " a; echo "$a"; fi; }
wr()    { npx --no-install wrangler "$@"; }

# Non-secret choices are remembered here between runs (git-ignored).
save() { # save KEY VALUE
  touch "$SETTINGS"
  grep -v "^$1=" "$SETTINGS" > "$SETTINGS.tmp" 2>/dev/null; mv "$SETTINGS.tmp" "$SETTINGS"
  printf '%s=%q\n' "$1" "$2" >> "$SETTINGS"
  eval "$1=\$2"
}
[ -f "$SETTINGS" ] && . "$SETTINGS"
SITE_PROJECT="${SITE_PROJECT:-be-guided}"
WORKER_NAME="$(sed -n 's/^name *= *"\(.*\)"/\1/p' wrangler.toml | head -1)"
DB_NAME="$(sed -n 's/^database_name *= *"\(.*\)"/\1/p' wrangler.toml | head -1)"
BUCKET="$(sed -n 's/^bucket_name *= *"\([^"]*\)".*/\1/p' wrangler.toml | head -1)"
# Paths Cloudflare Access must leave open (Bypass, Include Everyone). Everything
# else on the admin's address asks for sign-in. Keep in step with docs/DEPLOY.md 4.3.
ACCESS_BYPASS_PATHS=(api/v1/chat api/v1/mcp api/v1/editor api/v1/health api/v1/openapi.json)
TOML_CHANGED=0
set_toml() { [ "$(node scripts/cloudflare/set-toml.mjs "$1" "$2")" = changed ] && TOML_CHANGED=1; return 0; }
toml_val() { sed -n "s/^ *$1 *= *\"\([^\"]*\)\".*/\1/p" wrangler.toml | head -1; }

# ── The steps ─────────────────────────────────────────────────────────────

sign_in() {
  step "Sign in to Cloudflare"
  if wr whoami 2>&1 | grep -qi "not authenticated"; then
    say "Your browser will open Cloudflare's sign-in page. Sign in there and"
    say "select Allow. Then come back to this window."
    pause || return 1
    wr login || { fail "Sign-in didn't finish. Run this again when you're ready."; exit 1; }
  fi
  ok "Signed in: $(wr whoami 2>/dev/null | grep -Eo '[[:alnum:]._%+-]+@[[:alnum:].-]+' | head -1)"
  local acct; acct="${CLOUDFLARE_ACCOUNT_ID:-$(wr whoami 2>/dev/null | grep -Eo '\b[a-f0-9]{32}\b' | head -1)}"
  [ -n "$acct" ] && set_toml CF_ACCOUNT_ID "$acct"
}

database() {
  step "Create the admin's database (people, version history, audit log)"
  local id
  id="$(wr d1 list --json 2>/dev/null | node scripts/cloudflare/json-pick.mjs name "$DB_NAME" uuid)"
  if [ -z "$id" ]; then
    say "Creating a database called \"$DB_NAME\"..."
    wr d1 create "$DB_NAME" > "$LOG_DIR/d1-create.log" 2>&1 || { fail "Couldn't create it. Details: $LOG_DIR/d1-create.log"; return 1; }
    id="$(wr d1 list --json 2>/dev/null | node scripts/cloudflare/json-pick.mjs name "$DB_NAME" uuid)"
  fi
  [ -n "$id" ] || { fail "Couldn't find the database after creating it."; return 1; }
  set_toml database_id "$id"
  ok "Database ready"
  say "Setting up its tables (if Cloudflare asks \"Ok to proceed?\", type y)..."
  wr d1 migrations apply "$DB_NAME" --remote && ok "Tables ready" || warn "Tables will be set up automatically on the admin's first use."
}

# Switch the R2 binding in wrangler.toml on or off (lines prefixed "#R2 ").
r2_binding() {
  if [ "$1" = on ]; then perl -pi -e 's/^#R2 //' wrangler.toml
  else perl -pi -e 's/^(\[\[r2_buckets\]\]|binding = "MEDIA"|bucket_name = "be-guided-media".*)$/#R2 $1/ unless /^#R2 /' wrangler.toml; fi
}

media_bucket() {
  step "Create storage for uploaded pictures and videos"
  if wr r2 bucket list 2>/dev/null | grep -Eq "(^|[^a-z0-9-])$BUCKET([^a-z0-9-]|\$)"; then ok "Storage \"$BUCKET\" already exists"; r2_binding on; return 0; fi
  if wr r2 bucket create "$BUCKET" > "$LOG_DIR/r2-create.log" 2>&1; then ok "Storage \"$BUCKET\" created"; r2_binding on; return 0; fi
  r2_binding off
  warn "Storage (R2) isn't switched on for your account yet. Everything else still"
  say "works; only uploading pictures and videos in the online admin waits for it."
  say "To add it: https://dash.cloudflare.com → R2 Object Storage → start using R2"
  say "(the free plan includes 10 GB). Then run this again."
  say "Details: $LOG_DIR/r2-create.log"
  return 1
}

deploy_admin() {
  step "Put the admin online"
  say "Building the admin (about a minute)..."
  npm run build:admin > "$LOG_DIR/build-admin.log" 2>&1 || { fail "The build failed. Details: $LOG_DIR/build-admin.log"; return 1; }
  say "Uploading it to Cloudflare. If Cloudflare asks you to choose a workers.dev"
  say "name for your account, type one (for example: your-name)."
  wr deploy 2>&1 | tee "$LOG_DIR/deploy-admin.log"
  [ "${PIPESTATUS[0]}" = 0 ] || { fail "Upload failed. Details: $LOG_DIR/deploy-admin.log"; return 1; }
  local url
  url="$(grep -Eo "https://$WORKER_NAME\.[a-z0-9-]+\.workers\.dev" "$LOG_DIR/deploy-admin.log" | head -1)"
  [ -n "$url" ] && save ADMIN_URL "$url"
  TOML_CHANGED=0
  ok "Admin is online at ${ADMIN_URL:-(see the lines above)}"
}

site_url_lookup() {
  wr pages project list 2>/dev/null | grep -Eo "\b$SITE_PROJECT(-[a-z0-9]+)?\.pages\.dev\b" | head -1
}

deploy_site() {
  step "Put the public guide site online"
  if [ -z "$(site_url_lookup)" ]; then
    say "Creating a Cloudflare Pages site called \"$SITE_PROJECT\"..."
    wr pages project create "$SITE_PROJECT" --production-branch main > "$LOG_DIR/pages-create.log" 2>&1 \
      || { fail "Couldn't create it. Details: $LOG_DIR/pages-create.log"; return 1; }
  fi
  local host; host="$(site_url_lookup)"
  [ -n "$host" ] || { fail "Couldn't find the site's address."; return 1; }
  [ -z "${SITE_URL:-}" ] && save SITE_URL "https://$host"
  say "Site address: $SITE_URL (a custom domain can be added later, see docs/DEPLOY.md)"
  say "Building the site (a minute or two). Private products are left out."
  SITE_URL="$SITE_URL" ADMIN_URL="${ADMIN_URL:-}" bash scripts/cloudflare/build-site.sh > "$LOG_DIR/build-site.log" 2>&1 \
    || { fail "The build failed or wasn't safe to upload. Details: $LOG_DIR/build-site.log"; return 1; }
  wr pages deploy .wrangler/site-build/out --project-name "$SITE_PROJECT" --branch main --commit-dirty=true 2>&1 | tee "$LOG_DIR/deploy-site.log"
  [ "${PIPESTATUS[0]}" = 0 ] || { fail "Upload failed. Details: $LOG_DIR/deploy-site.log"; return 1; }
  ok "Guide site is online at $SITE_URL"
}

link_site_and_admin() {
  step "Connect the site and the admin"
  set_toml SITE_URL "$SITE_URL"
  local origins="$SITE_URL"; [ -n "${CUSTOM_DOMAIN:-}" ] && origins="$origins,https://$CUSTOM_DOMAIN"
  set_toml CHAT_ALLOWED_ORIGINS "$origins"
  ok "Ask AI on $SITE_URL may talk to the admin"
}

# Opens a link in the browser where possible; always prints it too.
open_link() { say "$1"; (open "$1" || xdg-open "$1" || cmd.exe /c start "" "$1") >/dev/null 2>&1 || true; }

# A token form with exactly the two Access permissions ticked.
ACCESS_TOKEN_LINK='https://dash.cloudflare.com/profile/api-tokens?permissionGroupKeys=%5B%7B%22key%22%3A%22access%22%2C%22type%22%3A%22edit%22%7D%2C%7B%22key%22%3A%22access_acct%22%2C%22type%22%3A%22edit%22%7D%5D&name=be-guided-access&accountId=*&zoneId=all'

access() {
  step "Lock the admin so only you can open it (Cloudflare Access)"
  local team aud
  team="$(toml_val CF_ACCESS_TEAM_DOMAIN)"; aud="$(toml_val CF_ACCESS_AUD)"
  if [[ "$team" != *REPLACE* && "$aud" != *REPLACE* && -n "$aud" ]]; then ok "Already set up ($team)"; return 0; fi
  [ -n "${ADMIN_URL:-}" ] || { fail "The admin's address isn't known yet. Run this again after the admin is online."; return 1; }
  local email; email="$(toml_val BOOTSTRAP_OWNER_EMAIL)"; [[ "$email" == *REPLACE* ]] && email=""
  email="$(ask 'Your email (only this email can open the admin; add more people later in the admin)' "$email")"
  [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]] || { fail "That email doesn't look right. Run this again to retry."; return 1; }
  set_toml BOOTSTRAP_OWNER_EMAIL "$email"

  say "Cloudflare needs a one-time key (API token) to set up the lock for you."
  say "Your browser will open Cloudflare's token page with the right boxes ticked."
  say "There: select Continue to summary, then Create Token, then Copy."
  say "(Type m instead of pressing Enter to do this step by hand in the dashboard.)"
  local a; read -r -p "   Press Enter to open the page: " a
  [ "${a:-}" = m ] && { access_by_hand; return $?; }
  [ "${a:-}" = s ] && return 1
  open_link "$ACCESS_TOKEN_LINK"

  local token out rc tries=0
  read -r -s -p "   Paste the token here (it stays hidden, and isn't saved): " token; echo
  [ -n "$token" ] || { fail "No token pasted. Run this again to retry."; return 1; }
  while :; do
    tries=$((tries + 1))
    out="$(CF_ACCESS_SETUP_TOKEN="$token" CF_ACCOUNT_ID="$(toml_val CF_ACCOUNT_ID)" ADMIN_HOST="$ADMIN_URL" \
      OWNER_EMAILS="$email" BYPASS_PATHS="$(IFS=,; echo "${ACCESS_BYPASS_PATHS[*]}")" \
      node scripts/cloudflare/access.mjs 2>"$LOG_DIR/access.log")"; rc=$?
    [ $rc = 2 ] && [ $tries -lt 3 ] || break
    warn "Cloudflare Zero Trust (which runs the lock) isn't switched on for your account yet."
    say "Your browser will open it. Choose a team name and the Free plan (free for up to"
    say "50 people; Cloudflare may ask for a card but doesn't charge for Free)."
    open_link "https://one.dash.cloudflare.com/"
    read -r -p "   When that's done, press Enter to try again: " a
  done
  case $rc in
    0) ;;
    3) unset token; fail "That token can't manage Access. Make it again from the page that opened, and keep both ticked permissions."; return 1 ;;
    *) unset token; fail "The lock wasn't set up. Details: $LOG_DIR/access.log"; return 1 ;;
  esac
  # Optional: keep the token in Cloudflare (as a Worker secret) so adding someone
  # under Settings > People also lets them through the lock.
  local keep; keep="$(ask 'Let the admin add people to the lock for you, so you only add them in one place? (Y/n)' Y)"
  if [[ "$keep" =~ ^[Yy] ]]; then
    if printf '%s' "$token" | wr secret put CF_API_TOKEN > "$LOG_DIR/access-secret.log" 2>&1; then
      ok "People you add in the admin can sign in straight away"
      KEEP_ACCESS_TOKEN=1
    else
      warn "Couldn't save it (details: $LOG_DIR/access-secret.log). Add people to the lock in Cloudflare instead."
    fi
  fi
  unset token
  team="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).team))')"
  aud="$(printf '%s' "$out" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).aud))')"
  set_toml CF_ACCESS_TEAM_DOMAIN "$team"
  set_toml CF_ACCESS_AUD "$aud"
  ok "Admin locked: only $email can open it (sign-in by a code sent to that email)"
  ok "Left open for your AI: ${ACCESS_BYPASS_PATHS[*]}"
  if [ "${KEEP_ACCESS_TOKEN:-0}" = 1 ]; then
    say "Keep the be-guided-access token in Cloudflare: the admin uses it to add people."
  else
    say "You can delete the be-guided-access token in Cloudflare now; it isn't needed again."
  fi
}

access_by_hand() {
  local team aud
  say "This part is done in Cloudflare's dashboard. docs/DEPLOY.md (section 4) has"
  say "pictures-free, click-by-click steps. In short:"
  say "  1. dash.cloudflare.com → Workers & Pages → $WORKER_NAME → Settings →"
  say "     Domains & Routes → workers.dev → turn on Cloudflare Access."
  say "  2. Select Manage Cloudflare Access. Add the emails of the people allowed in."
  say "  3. Copy the Audience (AUD) tag and your team domain"
  say "     (it looks like https://yourteam.cloudflareaccess.com)."
  say "  4. Add these public paths as Bypass (section 4.3 of docs/DEPLOY.md):"
  local p; for p in "${ACCESS_BYPASS_PATHS[@]}"; do say "       $p"; done
  pause || return 1
  team="$(ask 'Paste your team domain (https://….cloudflareaccess.com)')"
  aud="$(ask 'Paste the Audience (AUD) tag')"
  [[ "$team" =~ ^https://[a-z0-9-]+\.cloudflareaccess\.com/?$ ]] || { fail "That team domain doesn't look right. Run this again to retry."; return 1; }
  [[ "$aud" =~ ^[A-Za-z0-9]{20,}$ ]] || { fail "That AUD tag doesn't look right. Run this again to retry."; return 1; }
  set_toml CF_ACCESS_TEAM_DOMAIN "${team%/}"
  set_toml CF_ACCESS_AUD "$aud"
  local email; email="$(ask 'Your own email (you become the first owner)' "$(toml_val BOOTSTRAP_OWNER_EMAIL)")"
  [ -n "$email" ] && set_toml BOOTSTRAP_OWNER_EMAIL "$email"
  ok "Access details saved"
}

has_secret() { wr secret list 2>/dev/null | grep -qw "$1"; }

github() {
  step "Connect the admin to the guide content on GitHub"
  say "In the cloud, the admin saves pages to a GitHub repository (a developer can"
  say "set this up; see docs/DEPLOY.md section 5)."
  local repo; repo="$(toml_val GITHUB_REPO)"
  if [[ "$repo" == *REPLACE* || -z "$repo" ]]; then
    pause || return 1
    repo="$(ask 'The repository, as owner/name (for example your-name/be-guided)')"
    [[ "$repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || { fail "That doesn't look like owner/name."; return 1; }
    set_toml GITHUB_REPO "$repo"
  fi
  ok "Repository: $repo"
  if has_secret GITHUB_TOKEN; then ok "GitHub access key already saved in Cloudflare"; return 0; fi
  say "Now paste the GitHub access key (fine-grained token, Contents read/write on"
  say "that repository only). It is typed straight into Cloudflare and hidden here."
  [ "$TOML_CHANGED" = 1 ] && { deploy_admin || return 1; }
  wr secret put GITHUB_TOKEN && ok "Saved" || fail "Not saved. Run this again to retry."
}

claude_key() {
  step "Switch on Ask AI (optional)"
  if has_secret ANTHROPIC_API_KEY; then ok "Claude API key already saved in Cloudflare"; return 0; fi
  say "Ask AI needs a Claude API key from console.anthropic.com (API keys). Without"
  say "it the chat politely says it isn't switched on yet. Skip this if you don't have one."
  pause || return 0
  wr secret put ANTHROPIC_API_KEY && ok "Saved" || fail "Not saved. Run this again to retry."
}

finish() {
  if [ "$TOML_CHANGED" = 1 ]; then deploy_admin || true; fi
  step "Check everything"
  if [ -n "${ADMIN_URL:-}" ]; then
    local h; h="$(curl -s -o /dev/null -w '%{http_code}' "$ADMIN_URL/api/v1/health")"
    [ "$h" = 200 ] && ok "Admin answers" || warn "Admin answered $h. If you just set up Access, add the Bypass paths (docs/DEPLOY.md 4.3)."
    # "Connect your AI": a ping must get through Access without signing in.
    local m; m="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ADMIN_URL/api/v1/mcp" \
      -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
      -d '{"jsonrpc":"2.0","id":1,"method":"ping"}')"
    [ "$m" = 200 ] && ok "AI connector answers" || warn "AI connector answered $m. Add the Bypass for api/v1/mcp (docs/DEPLOY.md 4.3)."
  fi
  [ -n "${SITE_URL:-}" ] && { [ "$(curl -s -o /dev/null -w '%{http_code}' "$SITE_URL/")" = 200 ] && ok "Guide site answers" || warn "Guide site isn't answering yet (it can take a minute)."; }
  echo
  echo "${B}   Your guide site:${N}  ${SITE_URL:-not set up yet}"
  echo "${B}   Your admin:${N}       ${ADMIN_URL:-not set up yet}"
  [ -n "${ADMIN_URL:-}" ] && echo "${B}   AI connector URL:${N} $ADMIN_URL/api/v1/mcp  (for Claude and ChatGPT, see the site's Connect your AI page)"
  echo
  say "To republish the site after changing guides on this computer, run"
  say "npm run setup -- --site-only. Running npm run setup again skips what is done."
}

# ── Run ───────────────────────────────────────────────────────────────────
echo "${B}Be Guided → Cloudflare${N}"
say "This puts the guide site and the admin online. It takes about 10 minutes"
say "the first time. You can stop at any step and run it again later."

[ -d node_modules ] || { say "Getting things ready..."; npm install || exit 1; }

if [ "${1:-}" = "--site-only" ]; then
  sign_in; deploy_site; finish; exit 0
fi

sign_in
database
media_bucket
deploy_admin
deploy_site
link_site_and_admin
access
github
claude_key
finish

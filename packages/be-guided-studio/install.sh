#!/usr/bin/env bash
# Be Guided Studio: one-time set-up on this computer.
#   bash install.sh
# Installs the Studio into ~/.be-guided/studio, asks for your editor connector
# address and personal key (typed hidden, saved only in ~/.be-guided/studio.json,
# readable by you alone), and adds it to Claude Code and Codex if they are installed.
set -euo pipefail

DEFAULT_URL="${BE_GUIDED_URL:-}"
HOME_DIR="$HOME/.be-guided"
DEST="$HOME_DIR/studio"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }

command -v node >/dev/null 2>&1 || { echo "Node.js 20 or newer is needed: https://nodejs.org (then run this again)."; exit 1; }
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 20 ] || { echo "Node.js 20 or newer is needed (you have $(node -v))."; exit 1; }

say "1/4  Copying the Studio to $DEST"
mkdir -p "$DEST"
if [ "$SRC" != "$DEST" ]; then
  cp -R "$SRC/bin" "$SRC/ui" "$SRC/package.json" "$SRC/README.md" "$SRC/install.sh" "$DEST/"
fi
(cd "$DEST" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

say "2/4  Your editor connector"
URL="${BE_GUIDED_URL:-}"
if [ -z "$URL" ]; then
  read -r -p "Connector address (your admin address + /api/v1/editor, shown in Settings › Editor connector): " URL </dev/tty || true
  [ -n "$URL" ] || { echo "The connector address is needed. Run this again."; exit 1; }
fi
KEY="${BE_GUIDED_KEY:-}"
if [ -z "$KEY" ]; then
  echo "Paste your personal key (bgk_…). An owner makes one in the admin: Settings › Editor connector. It will not show as you paste."
  read -r -s -p "Key: " KEY </dev/tty || true
  echo
fi
case "$KEY" in bgk_*) ;; *) echo "That does not look like a Be Guided key (it starts with bgk_)."; exit 1 ;; esac
AGENT="${BE_GUIDED_AGENT:-claude}"
umask 077
PV_URL="$URL" PV_KEY="$KEY" PV_AGENT="$AGENT" node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({url: process.env.PV_URL, key: process.env.PV_KEY, agent: process.env.PV_AGENT}, null, 2))' "$HOME_DIR/studio.json"
chmod 600 "$HOME_DIR/studio.json"
unset KEY

say "3/4  Checking the connection"
node "$DEST/bin/be-guided-studio.mjs" doctor

say "4/4  Adding it to your AI tools"
BIN="$DEST/bin/be-guided-studio.mjs"
if command -v claude >/dev/null 2>&1; then
  claude mcp remove --scope user be-guided-studio >/dev/null 2>&1 || true
  claude mcp add --scope user be-guided-studio -- node "$BIN" mcp && echo "Claude Code: added (be-guided-studio)."
else
  echo "Claude Code is not installed; skipped. Later: claude mcp add --scope user be-guided-studio -- node \"$BIN\" mcp"
fi
# Claude Desktop (shows the Studio as an app inside the chat). Only the command is written; the key stays in studio.json.
DESKTOP_CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
if [ -d "$HOME/Library/Application Support/Claude" ]; then
  [ -f "$DESKTOP_CFG" ] && cp "$DESKTOP_CFG" "$DESKTOP_CFG.before-be-guided"
  node -e '
    const fs = require("fs"); const [file, bin, node] = process.argv.slice(1);
    let cfg = {}; try { cfg = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
    cfg.mcpServers = { ...(cfg.mcpServers || {}), "be-guided-studio": { command: node, args: [bin, "mcp"] } };
    fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  ' "$DESKTOP_CFG" "$BIN" "$(command -v node)" && echo "Claude Desktop: added (quit and reopen Claude to see it)."
else
  echo "Claude Desktop is not installed; skipped."
fi
CODEX_CFG="$HOME/.codex/config.toml"
if command -v codex >/dev/null 2>&1 || [ -d "$HOME/.codex" ]; then
  mkdir -p "$HOME/.codex"
  touch "$CODEX_CFG"
  if grep -q '^\[mcp_servers.be-guided-studio\]' "$CODEX_CFG"; then
    echo "Codex: already set up."
  else
    printf '\n[mcp_servers.be-guided-studio]\ncommand = "node"\nargs = ["%s", "mcp"]\n' "$BIN" >> "$CODEX_CFG"
    echo "Codex: added to $CODEX_CFG."
  fi
else
  echo "Codex is not installed; skipped."
fi

cat <<MSG

Done. Be Guided Studio is ready.

  Open it in your browser:       node "$BIN" open
  In Claude or Codex, just ask:  "open Be Guided Studio"  or  "run the queued Be Guided checks"
  Claude Desktop: quit and reopen Claude, start a new chat and say "open Be Guided Studio".
  Run waiting checks by themselves every 15 minutes (Mac):
      node "$BIN" schedule --install

MSG

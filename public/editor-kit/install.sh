#!/bin/bash
# Be Guided editor kit: installs the "be-guided-screenshots"
# skill for Claude Code (and Codex, if it is installed) so your screenshots get
# the guide's marked-up look.
#
#   curl -fsSL <guide site>/editor-kit/install.sh | BE_GUIDED_KIT_URL=<guide site>/editor-kit bash
#
# Needs Node 18 or newer. Safe to run again (it updates the kit).
set -euo pipefail
BASE="${BE_GUIDED_KIT_URL:-}"
[ -n "$BASE" ] || { echo "Set BE_GUIDED_KIT_URL to your guide site + /editor-kit (the admin shows the full command)."; exit 1; }
command -v node >/dev/null || { echo "Please install Node.js 18 or newer first (https://nodejs.org), then run this again."; exit 1; }

install_into() {
  local dir="$1/be-guided-screenshots"
  mkdir -p "$dir"
  curl -fsSL "$BASE/SKILL.md" -o "$dir/SKILL.md"
  curl -fsSL "$BASE/annotate.mjs" -o "$dir/annotate.mjs"
  if [ ! -d "$dir/node_modules/sharp" ]; then
    printf '{"name":"be-guided-screenshots","private":true,"type":"module"}\n' > "$dir/package.json"
    (cd "$dir" && npm install --silent --no-audit --no-fund sharp@0.33 >/dev/null)
  fi
  echo "Installed in $dir"
}

install_into "$HOME/.claude/skills"
if [ -d "$HOME/.codex" ]; then install_into "$HOME/.codex/skills"; fi
echo "Done. Restart Claude Code (or Codex) so it picks up the screenshot skill."

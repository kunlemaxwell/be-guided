# Be Guided Studio

The Studio is where you set up and watch automatic guide updates for Be Guided:

- **Plans and schedules:** auto check on or off; how often (every 1, 2, 4, 6, 8 or 12 hours, every day at a set time, every few days, or a set day each month); auto update on or off; "require approval before auto updates"; the content mode (text only, text + screenshots, text + screenshots + video). Ready-made plans are presets you can change or copy. Each product follows one plan at a time; apply a plan to one product or to all.
- **Check log:** every check with what it found. Open one, tick the changes to apply, skip the rest, and pick the content mode for each change.
- **Skills:** upload a writing skill (how guides are written) and a QA skill (how to test during a check), for every product or chosen ones.
- **Reader feedback:** every thumbs up and down from the public guide, with comments and the reader's email when they left one. Download as CSV.

It runs on your own computer. Only its calls to your guide's API leave the machine.

## Install (once)

1. Unzip `be-guided-studio.zip`.
2. Open Terminal in that folder and run: `bash install.sh`
3. When asked, paste your editor connector address (your admin address followed by `/api/v1/editor`), then your personal key (an owner makes one in the admin: Settings › Editor connector).

The installer needs Node.js 20 or newer. It adds the Studio to Claude Code and Codex if you have them.

## Use it

| Where | How |
| --- | --- |
| Your browser | `node ~/.be-guided/studio/bin/be-guided-studio.mjs open` |
| Claude Desktop or claude.ai | Ask "open Be Guided Studio"; the app shows inside the chat |
| Claude Code or Codex | Ask "run the queued Be Guided checks" or "set up a daily 8 AM check for my product" |
| By itself every 15 minutes (Mac) | `node ~/.be-guided/studio/bin/be-guided-studio.mjs schedule --install` |

## How a check runs

1. The guide API queues a check when a product's plan is due (or when someone presses **Check now**).
2. An AI with this Studio (Claude Code or Codex, started by you or by the schedule) takes it with `claim_update_check`. The job lists the code repos, the content mode, the writing and QA skills, and the steps.
3. It compares the code and screens with the guide and reports what changed (`report_update_check`).
4. If the plan updates without approval, it applies the changes and marks them applied. Otherwise the check waits in the **Check log** until someone ticks what to apply; the chosen changes become guide requests.

## Commands

| Command | What it does |
| --- | --- |
| `mcp` | MCP server for Claude and Codex (stdio) |
| `open [--port 4317] [--no-browser]` | The Studio in your browser, on this computer only |
| `run-due [--agent claude\|codex] [--dry-run]` | Starts the AI if checks are waiting |
| `schedule [--install \| --remove] [--agent codex]` | The macOS 15-minute job for `run-due` |
| `doctor` | Checks the address and key |

Settings live in `~/.be-guided/studio.json` (only you can read it), or in the environment variables `BE_GUIDED_URL` and `BE_GUIDED_KEY`. To switch a key off, an owner turns it off in the admin; it stops working at once.

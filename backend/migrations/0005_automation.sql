-- Automatic update checks, their log, skills for AI writers/testers, and readers' votes.
-- Never edit an applied migration: add 0006_*.sql instead.

-- A saved set-up ("update plan"): how often to check, and what to do with what it finds.
CREATE TABLE IF NOT EXISTS update_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  auto_check INTEGER NOT NULL CHECK (auto_check IN (0, 1)),
  -- JSON: {"kind":"hours","every":4} | {"kind":"daily","at":"08:00"} | {"kind":"days","every":3,"at":"09:00"} | {"kind":"monthly","day":1,"at":"07:00"}
  frequency TEXT NOT NULL,
  time_zone TEXT NOT NULL DEFAULT 'Africa/Lagos',
  auto_update INTEGER NOT NULL CHECK (auto_update IN (0, 1)),
  require_approval INTEGER NOT NULL CHECK (require_approval IN (0, 1)),
  content_mode TEXT NOT NULL CHECK (content_mode IN ('text', 'text+screens', 'video', 'all')),
  built_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);

-- Which plan is on for a product. One row per product, so only one plan applies at a time.
CREATE TABLE IF NOT EXISTS plan_assignments (
  product TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES update_plans (id),
  assigned_at TEXT NOT NULL,
  assigned_by TEXT
);

-- One check run: queued by the schedule or "Check now", done by an AI, then decided.
CREATE TABLE IF NOT EXISTS update_checks (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  plan_id TEXT,
  plan_name TEXT,
  trigger TEXT NOT NULL CHECK (trigger IN ('schedule', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'waiting-approval', 'updating', 'done', 'failed', 'cancelled')),
  content_mode TEXT NOT NULL,
  auto_update INTEGER NOT NULL,
  require_approval INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  requested_by TEXT,
  run_by TEXT,
  summary TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS update_checks_product ON update_checks (product, created_at);
CREATE INDEX IF NOT EXISTS update_checks_status ON update_checks (status);

-- What a check found: one row per change, ticked (selected) or skipped by a person, then applied.
CREATE TABLE IF NOT EXISTS update_check_changes (
  id TEXT PRIMARY KEY,
  check_id TEXT NOT NULL REFERENCES update_checks (id),
  seq INTEGER NOT NULL,
  page_id TEXT,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  evidence TEXT,
  decision TEXT NOT NULL DEFAULT 'pending' CHECK (decision IN ('pending', 'selected', 'skipped', 'applied')),
  mode TEXT,
  decided_by TEXT,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS update_check_changes_check ON update_check_changes (check_id, seq);

-- Skills: instructions an AI follows when it writes guides (writing) or tests the app (qa).
CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('writing', 'qa')),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  file_name TEXT,
  -- JSON array of product slugs; NULL = every product.
  products TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT,
  deleted_at TEXT
);

-- "Was this helpful?" votes from readers of the public guide. One per page per browser.
CREATE TABLE IF NOT EXISTS page_votes (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  visitor TEXT NOT NULL,
  helpful INTEGER NOT NULL CHECK (helpful IN (0, 1)),
  comment TEXT,
  email TEXT,
  country TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (page_id, visitor)
);
CREATE INDEX IF NOT EXISTS page_votes_page ON page_votes (page_id);
CREATE INDEX IF NOT EXISTS page_votes_updated ON page_votes (updated_at);

-- Ready-made plans to pick from (they can be changed or copied, not deleted).
INSERT OR IGNORE INTO update_plans (id, name, auto_check, frequency, time_zone, auto_update, require_approval, content_mode, built_in, created_at, updated_at) VALUES
  ('plan-daily-8am', 'Every day at 8 AM, text + screenshots', 1, '{"kind":"daily","at":"08:00"}', 'Africa/Lagos', 1, 1, 'text+screens', 1, '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
  ('plan-every-4h-report', 'Every 4 hours, report only', 1, '{"kind":"hours","every":4}', 'Africa/Lagos', 0, 1, 'text', 1, '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
  ('plan-3-days-everything', 'Every 3 days at 9 AM, everything (with video)', 1, '{"kind":"days","every":3,"at":"09:00"}', 'Africa/Lagos', 1, 1, 'all', 1, '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z'),
  ('plan-monthly-text-auto', '1st of the month at 7 AM, text only, no approval', 1, '{"kind":"monthly","day":1,"at":"07:00"}', 'Africa/Lagos', 1, 0, 'text', 1, '2026-11-05T00:00:00.000Z', '2026-11-05T00:00:00.000Z');

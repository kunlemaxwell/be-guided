-- Be Guided: initial schema (SQLite / Cloudflare D1).
-- Applied by backend/src/infrastructure/shared/migrator.ts on start-up (local)
-- and on the first request (Cloudflare). Also valid for `wrangler d1 migrations apply`.
-- Never edit an applied migration: add 0002_*.sql instead.

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS people_email_unique ON people (email) WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  area TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS audit_log_at ON audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_area_at ON audit_log (area, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_at ON audit_log (actor_id, at DESC);

CREATE TABLE IF NOT EXISTS page_revisions (
  id TEXT PRIMARY KEY,
  page_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'save', 'draft')),
  summary TEXT NOT NULL,
  field_changes TEXT NOT NULL DEFAULT '[]',
  body_diff TEXT NOT NULL DEFAULT '[]',
  lines_added INTEGER NOT NULL DEFAULT 0,
  lines_removed INTEGER NOT NULL DEFAULT 0,
  correlation_id TEXT
);
CREATE INDEX IF NOT EXISTS page_revisions_page_created ON page_revisions (page_id, created_at DESC);

-- Cloudflare only: the "Updates & requests" queue (locally it stays in .admin/requests.json
-- so Claude can read it when the owner says "run the guide queue").
CREATE TABLE IF NOT EXISTS guide_requests (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  data TEXT NOT NULL,
  proposal TEXT
);

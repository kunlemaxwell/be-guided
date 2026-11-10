-- Editor connector: personal keys for Claude Code / Codex, and changes waiting for approval.
-- Never edit an applied migration: add 0003_*.sql instead.

-- Only a SHA-256 hash of each key is stored; the key itself is shown once when created.
CREATE TABLE IF NOT EXISTS connector_keys (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people (id),
  label TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  -- JSON array of product slugs the key may edit; NULL = every product.
  products TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  last_used_at TEXT,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS connector_keys_person ON connector_keys (person_id);

-- A page change sent through the connector for a product that needs approval.
CREATE TABLE IF NOT EXISTS pending_changes (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('create', 'save')),
  product TEXT NOT NULL,
  module TEXT NOT NULL,
  slug TEXT NOT NULL,
  frontmatter TEXT NOT NULL,
  body TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  author_id TEXT,
  author_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  decided_by TEXT,
  decided_at TEXT,
  decision_note TEXT
);
CREATE INDEX IF NOT EXISTS pending_changes_status_created ON pending_changes (status, created_at DESC);

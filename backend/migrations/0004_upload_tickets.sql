-- One-time upload links for the editor connector: the AI sends a screenshot or video
-- file straight to the link (curl) instead of pasting it into the chat as base64.
-- Only a SHA-256 hash of the link's token is stored.
CREATE TABLE IF NOT EXISTS upload_tickets (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL REFERENCES connector_keys (id),
  person_id TEXT NOT NULL REFERENCES people (id),
  product TEXT NOT NULL,
  module TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('image', 'video')),
  file_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  used_at TEXT
);

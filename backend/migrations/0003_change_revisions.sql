-- How many times an editor updated a change while it waited for approval (1 = sent once).
ALTER TABLE pending_changes ADD COLUMN revisions INTEGER NOT NULL DEFAULT 1;

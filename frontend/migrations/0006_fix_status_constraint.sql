-- Fix status CHECK constraint to include new pipeline statuses
-- SQLite requires recreating the table to modify CHECK constraints

-- Create new table with updated constraint
CREATE TABLE projects_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'analyzing', 'rejected', 'refining', 'generating', 'selecting', 'finalizing', 'complete', 'error')),
  spec TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE
);

-- Copy existing data
INSERT INTO projects_new (id, name, description, status, spec, created_at, updated_at, user_id)
SELECT id, name, description, status, spec, created_at, updated_at, user_id FROM projects;

-- Drop old table
DROP TABLE projects;

-- Rename new table
ALTER TABLE projects_new RENAME TO projects;

-- Recreate index
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

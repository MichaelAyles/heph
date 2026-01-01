-- Add admin flag to users
ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0;

-- Set mike as admin
UPDATE users SET is_admin = 1 WHERE username = 'mike';

-- Debug logs table
CREATE TABLE IF NOT EXISTS debug_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  level TEXT NOT NULL DEFAULT 'info', -- debug, info, warn, error
  category TEXT NOT NULL DEFAULT 'general', -- api, llm, auth, project, etc.
  message TEXT NOT NULL,
  metadata TEXT, -- JSON blob for extra context
  request_id TEXT, -- to group logs from same request
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Index for fast queries
CREATE INDEX IF NOT EXISTS idx_debug_logs_user_id ON debug_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_debug_logs_level ON debug_logs(level);
CREATE INDEX IF NOT EXISTS idx_debug_logs_category ON debug_logs(category);
CREATE INDEX IF NOT EXISTS idx_debug_logs_created_at ON debug_logs(created_at);

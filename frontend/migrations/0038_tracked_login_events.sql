-- Track login events for watched users (for admin monitoring)
CREATE TABLE IF NOT EXISTS tracked_login_events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  username TEXT NOT NULL,
  login_method TEXT NOT NULL CHECK (login_method IN ('password', 'oauth')),
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tracked_login_events_username
  ON tracked_login_events(username);

CREATE INDEX IF NOT EXISTS idx_tracked_login_events_created_at
  ON tracked_login_events(created_at DESC);

-- Users and Authentication
-- Simple password auth with proper user data model

-- =============================================================================
-- USERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,  -- For now, plaintext. Upgrade to bcrypt later.
  display_name TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- =============================================================================
-- SESSIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- =============================================================================
-- ADD USER_ID TO EXISTING TABLES
-- =============================================================================

-- Add user_id to projects
ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

-- Add user_id to conversations (redundant with project, but useful for queries)
ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);

-- Add user_id to llm_requests for usage tracking per user
ALTER TABLE llm_requests ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_llm_requests_user ON llm_requests(user_id);

-- =============================================================================
-- SEED DEFAULT USER
-- =============================================================================

-- Create default user "mike" with password "mike"
INSERT INTO users (id, username, password_hash, display_name)
VALUES ('user-mike', 'mike', 'mike', 'Mike');

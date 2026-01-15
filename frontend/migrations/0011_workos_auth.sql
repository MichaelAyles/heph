-- WorkOS OAuth Support
-- Add workos_id to users for OAuth login

ALTER TABLE users ADD COLUMN workos_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_workos ON users(workos_id);

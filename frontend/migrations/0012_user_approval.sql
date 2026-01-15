-- Add approval gating for new users
-- Existing users (like mike) are auto-approved
ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 0;

-- Approve existing users
UPDATE users SET is_approved = 1 WHERE id IS NOT NULL;

-- Update control_mode CHECK constraint to include debug_it
-- SQLite doesn't support modifying CHECK constraints, so we recreate the table

-- Disable foreign key constraints during table recreation
PRAGMA foreign_keys = OFF;

-- Step 1: Create new users table with updated constraint
CREATE TABLE users_new (
    id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    display_name TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    last_login_at TEXT,
    is_admin INTEGER DEFAULT 0,
    control_mode TEXT DEFAULT 'fix_it'
        CHECK (control_mode IN ('vibe_it', 'fix_it', 'design_it', 'debug_it')),
    workos_id TEXT,
    is_approved INTEGER DEFAULT 0
);

-- Step 2: Copy data from old table
INSERT INTO users_new (id, username, password_hash, display_name, created_at, last_login_at, is_admin, control_mode, workos_id, is_approved)
SELECT id, username, password_hash, display_name, created_at, last_login_at, is_admin, control_mode, workos_id, is_approved
FROM users;

-- Step 3: Drop old table
DROP TABLE users;

-- Step 4: Rename new table
ALTER TABLE users_new RENAME TO users;

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Re-enable foreign key constraints
PRAGMA foreign_keys = ON;

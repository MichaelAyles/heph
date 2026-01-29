-- Add debug_it control mode for admins
-- SQLite CHECK constraints don't prevent values not in the list when using ALTER TABLE,
-- but this documents the expected values and will be enforced by new table creation.

-- Note: SQLite doesn't support modifying CHECK constraints directly.
-- The application layer (functions/api/users/me/mode.ts) enforces the valid modes.
-- This migration serves as documentation that debug_it is now a valid mode.

-- The API enforces:
-- 1. Only valid modes: vibe_it, fix_it, design_it, debug_it
-- 2. debug_it is admin-only (requires is_admin = 1)

-- Debug breakpoints table for Debug It mode
-- Stores pending LLM call breakpoints that pause execution until user resolves them

CREATE TABLE IF NOT EXISTS debug_breakpoints (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    project_id TEXT,
    thread_id TEXT,
    node_name TEXT NOT NULL,
    system_prompt TEXT NOT NULL,
    user_context TEXT NOT NULL,
    full_input TEXT NOT NULL,
    invocation_config TEXT,
    token_estimate INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_breakpoints_user_expires ON debug_breakpoints(user_id, expires_at);

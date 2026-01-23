-- Execution History for LangGraph Debugger
-- Stores execution runs and their events for replay

CREATE TABLE IF NOT EXISTS execution_runs (
    id TEXT PRIMARY KEY,
    thread_id TEXT,
    user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    input TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',  -- JSON array of ExecutionEvent
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_ms INTEGER,
    success INTEGER DEFAULT 1,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Index for listing runs by user
CREATE INDEX IF NOT EXISTS idx_execution_runs_user_id ON execution_runs(user_id);

-- Index for listing runs by thread
CREATE INDEX IF NOT EXISTS idx_execution_runs_thread_id ON execution_runs(thread_id);

-- Index for listing recent runs
CREATE INDEX IF NOT EXISTS idx_execution_runs_created_at ON execution_runs(created_at DESC);

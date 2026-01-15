-- LangGraph Checkpoints Table
-- Stores checkpoint data for LangGraph orchestrator state persistence

CREATE TABLE IF NOT EXISTS orchestrator_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT,                 -- Serialization type (e.g., 'json')
  checkpoint TEXT NOT NULL,  -- Serialized checkpoint data
  metadata TEXT NOT NULL,    -- JSON-serialized checkpoint metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- Pending writes for interrupted checkpoints
CREATE TABLE IF NOT EXISTS orchestrator_pending_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT,
  value TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- Index for efficient lookup by thread_id and ordering by creation time
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
ON orchestrator_checkpoints(thread_id, checkpoint_ns, created_at DESC);

-- Index for finding checkpoints by parent (for history traversal)
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent
ON orchestrator_checkpoints(thread_id, checkpoint_ns, parent_checkpoint_id);

-- LangGraph Checkpoints Table
-- Stores checkpoint data for LangGraph orchestrator state persistence

CREATE TABLE IF NOT EXISTS orchestrator_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  checkpoint TEXT NOT NULL,  -- JSON-serialized checkpoint data
  metadata TEXT NOT NULL,    -- JSON-serialized checkpoint metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_id)
);

-- Index for efficient lookup by thread_id and ordering by creation time
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
ON orchestrator_checkpoints(thread_id, created_at DESC);

-- Index for finding checkpoints by parent (for history traversal)
CREATE INDEX IF NOT EXISTS idx_checkpoints_parent
ON orchestrator_checkpoints(thread_id, parent_checkpoint_id);

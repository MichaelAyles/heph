-- LangGraph Checkpoints Tables
-- Stores graph execution state for pause/resume capability

-- Main checkpoints table
CREATE TABLE IF NOT EXISTS langgraph_checkpoints (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  parent_checkpoint_id TEXT,
  type TEXT NOT NULL DEFAULT 'checkpoint',
  checkpoint TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- Index for listing checkpoints by thread
CREATE INDEX IF NOT EXISTS idx_checkpoints_thread_created
ON langgraph_checkpoints(thread_id, checkpoint_ns, created_at DESC);

-- Pending writes table (for intermediate state during execution)
CREATE TABLE IF NOT EXISTS langgraph_checkpoints_writes (
  thread_id TEXT NOT NULL,
  checkpoint_ns TEXT NOT NULL DEFAULT '',
  checkpoint_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx)
);

-- Index for looking up writes by checkpoint
CREATE INDEX IF NOT EXISTS idx_writes_checkpoint
ON langgraph_checkpoints_writes(thread_id, checkpoint_ns, checkpoint_id);

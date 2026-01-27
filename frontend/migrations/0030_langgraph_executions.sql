-- LangGraph Node Executions
-- Stores execution history for all standalone LangGraph nodes
-- Each invocation of /api/langgraph/invoke/:nodeName creates a record

CREATE TABLE IF NOT EXISTS langgraph_executions (
  id TEXT PRIMARY KEY,
  node_name TEXT NOT NULL,
  thread_id TEXT,
  project_id TEXT,
  user_id TEXT,

  -- Timing
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,

  -- Input/Output (JSON)
  input_json TEXT NOT NULL,
  output_json TEXT,
  error TEXT,

  -- Debug info
  model TEXT,
  temperature REAL,
  system_prompt TEXT,
  user_prompt TEXT,
  raw_response TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  cost_usd REAL,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),

  -- Foreign keys
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_langgraph_executions_node ON langgraph_executions(node_name);
CREATE INDEX IF NOT EXISTS idx_langgraph_executions_thread ON langgraph_executions(thread_id);
CREATE INDEX IF NOT EXISTS idx_langgraph_executions_project ON langgraph_executions(project_id);
CREATE INDEX IF NOT EXISTS idx_langgraph_executions_user ON langgraph_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_langgraph_executions_time ON langgraph_executions(started_at DESC);

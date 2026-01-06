-- Full Conversation Logging
-- Store complete LLM messages in/out for debugging and analysis

-- =============================================================================
-- LLM CONVERSATIONS TABLE
-- =============================================================================

CREATE TABLE IF NOT EXISTS llm_conversations (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  user_id TEXT NOT NULL,
  request_id TEXT,
  -- Message data
  messages_in TEXT NOT NULL,    -- JSON array of input messages
  message_out TEXT,             -- The assistant's response content
  -- Request metadata
  model TEXT,
  temperature REAL,
  max_tokens INTEGER,
  -- Response metadata
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_llm_conversations_project ON llm_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_llm_conversations_user ON llm_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_conversations_created ON llm_conversations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_conversations_request ON llm_conversations(request_id);

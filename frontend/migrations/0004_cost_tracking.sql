-- Cost tracking for LLM requests

-- Add cost column to llm_requests
ALTER TABLE llm_requests ADD COLUMN cost_usd REAL DEFAULT 0;

-- Index for cost queries
CREATE INDEX IF NOT EXISTS idx_llm_requests_cost ON llm_requests(cost_usd);

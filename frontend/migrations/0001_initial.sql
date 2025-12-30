-- Heph Initial Schema
-- Cloudflare D1 (SQLite)

-- =============================================================================
-- PROJECTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'analyzing', 'designing', 'complete', 'error')),
  spec TEXT, -- JSON: ProjectSpec
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created ON projects(created_at DESC);

-- =============================================================================
-- PCB BLOCKS
-- =============================================================================

CREATE TABLE IF NOT EXISTS pcb_blocks (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mcu', 'power', 'sensor', 'output', 'connector', 'utility')),
  description TEXT,
  width_units INTEGER NOT NULL DEFAULT 1,
  height_units INTEGER NOT NULL DEFAULT 1,
  taps TEXT NOT NULL DEFAULT '[]', -- JSON: BusTap[]
  i2c_addresses TEXT, -- JSON: string[]
  spi_cs TEXT,
  power TEXT, -- JSON: { current_max_ma: number }
  components TEXT, -- JSON: BlockComponent[]
  is_validated INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blocks_slug ON pcb_blocks(slug);
CREATE INDEX IF NOT EXISTS idx_blocks_category ON pcb_blocks(category);
CREATE INDEX IF NOT EXISTS idx_blocks_active ON pcb_blocks(is_active);

-- =============================================================================
-- CONVERSATIONS
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT NOT NULL,
  messages TEXT NOT NULL DEFAULT '[]', -- JSON: ConversationMessage[]
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conversations_project ON conversations(project_id);

-- =============================================================================
-- SYSTEM SETTINGS
-- =============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  llm_provider TEXT DEFAULT 'openrouter' CHECK (llm_provider IN ('openrouter', 'gemini')),
  default_model TEXT DEFAULT 'google/gemini-2.0-flash-001',
  openrouter_api_key TEXT,
  gemini_api_key TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Insert default settings
INSERT OR IGNORE INTO system_settings (id) VALUES (1);

-- =============================================================================
-- LLM USAGE TRACKING
-- =============================================================================

CREATE TABLE IF NOT EXISTS llm_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  project_id TEXT,
  model TEXT NOT NULL,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  latency_ms INTEGER,
  status TEXT DEFAULT 'success',
  error_message TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_llm_requests_project ON llm_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_llm_requests_created ON llm_requests(created_at DESC);

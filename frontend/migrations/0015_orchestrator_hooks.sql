-- Migration 0015: Create orchestrator_hooks table
-- Stores hook configurations for orchestrator node lifecycle events

CREATE TABLE IF NOT EXISTS orchestrator_hooks (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  node_name TEXT NOT NULL,
  hook_type TEXT NOT NULL CHECK (hook_type IN ('on_enter', 'on_exit', 'on_result', 'on_error')),
  hook_function TEXT NOT NULL,
  hook_config TEXT,  -- JSON configuration object
  priority INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(node_name, hook_type, hook_function)
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_hooks_node ON orchestrator_hooks(node_name);
CREATE INDEX IF NOT EXISTS idx_orchestrator_hooks_type ON orchestrator_hooks(hook_type);
CREATE INDEX IF NOT EXISTS idx_orchestrator_hooks_active ON orchestrator_hooks(is_active);

-- Seed with some example hooks (inactive by default)

-- Progress reporting hooks
INSERT INTO orchestrator_hooks (node_name, hook_type, hook_function, hook_config, is_active) VALUES
  ('analyze_feasibility', 'on_enter', 'report_progress', '{"message": "Analyzing project feasibility...", "stage": "spec", "percentage": 5}', 1),
  ('generate_blueprints', 'on_enter', 'report_progress', '{"message": "Generating product visualizations...", "stage": "spec", "percentage": 30}', 1),
  ('finalize_spec', 'on_enter', 'report_progress', '{"message": "Finalizing specification...", "stage": "spec", "percentage": 50}', 1),
  ('select_pcb_blocks', 'on_enter', 'report_progress', '{"message": "Selecting circuit blocks...", "stage": "pcb", "percentage": 55}', 1),
  ('generate_enclosure', 'on_enter', 'report_progress', '{"message": "Generating enclosure design...", "stage": "enclosure", "percentage": 65}', 1),
  ('generate_firmware', 'on_enter', 'report_progress', '{"message": "Generating firmware code...", "stage": "firmware", "percentage": 80}', 1),
  ('mark_stage_complete_export', 'on_exit', 'report_progress', '{"message": "Design complete!", "stage": "export", "percentage": 100}', 1);

-- Logging hooks (disabled by default for performance)
INSERT INTO orchestrator_hooks (node_name, hook_type, hook_function, hook_config, is_active) VALUES
  ('*', 'on_enter', 'log_event', '{"level": "debug", "category": "orchestrator"}', 0),
  ('*', 'on_error', 'log_event', '{"level": "error", "category": "orchestrator"}', 0);

-- Validation hooks
INSERT INTO orchestrator_hooks (node_name, hook_type, hook_function, hook_config, is_active) VALUES
  ('finalize_spec', 'on_exit', 'validate_spec', '{"strict": true}', 0),
  ('select_pcb_blocks', 'on_exit', 'validate_pcb', '{"check_conflicts": true}', 0);

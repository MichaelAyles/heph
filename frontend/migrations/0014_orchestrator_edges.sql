-- Migration 0014: Create orchestrator_edges table
-- Stores the graph edges defining workflow transitions between nodes

CREATE TABLE IF NOT EXISTS orchestrator_edges (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  from_node TEXT NOT NULL,
  to_node TEXT NOT NULL,
  condition TEXT,  -- JSON condition object
  edge_type TEXT DEFAULT 'flow' CHECK (edge_type IN ('flow', 'conditional', 'loop')),
  priority INTEGER DEFAULT 0,
  description TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(from_node, to_node)
);

CREATE INDEX IF NOT EXISTS idx_orchestrator_edges_from ON orchestrator_edges(from_node);
CREATE INDEX IF NOT EXISTS idx_orchestrator_edges_to ON orchestrator_edges(to_node);
CREATE INDEX IF NOT EXISTS idx_orchestrator_edges_active ON orchestrator_edges(is_active);

-- Seed with default edges representing the orchestrator flow

-- SPEC STAGE: Start → Feasibility → Questions → Blueprints → Selection → Naming → Finalize
INSERT INTO orchestrator_edges (from_node, to_node, edge_type, description) VALUES
  ('start', 'analyze_feasibility', 'flow', 'Begin with feasibility analysis'),
  ('analyze_feasibility', 'answer_questions_auto', 'flow', 'Auto-answer open questions in VIBE IT mode'),
  ('analyze_feasibility', 'request_user_input', 'conditional', 'Ask user in FIX IT/DESIGN IT mode'),
  ('answer_questions_auto', 'generate_blueprints', 'flow', 'Generate product visualizations'),
  ('request_user_input', 'generate_blueprints', 'flow', 'Continue after user answers'),
  ('generate_blueprints', 'select_blueprint', 'flow', 'Select preferred design'),
  ('select_blueprint', 'generate_project_names', 'flow', 'Generate name options'),
  ('generate_project_names', 'select_project_name', 'flow', 'Select or customize name'),
  ('select_project_name', 'finalize_spec', 'flow', 'Lock down specification'),
  ('finalize_spec', 'mark_stage_complete_spec', 'flow', 'Mark spec stage complete');

-- PCB STAGE: Select blocks → Validate → Complete
INSERT INTO orchestrator_edges (from_node, to_node, edge_type, description) VALUES
  ('mark_stage_complete_spec', 'select_pcb_blocks', 'flow', 'Begin PCB block selection'),
  ('select_pcb_blocks', 'validate_cross_stage_pcb', 'flow', 'Validate PCB against spec'),
  ('validate_cross_stage_pcb', 'mark_stage_complete_pcb', 'conditional', 'Mark PCB complete if valid'),
  ('validate_cross_stage_pcb', 'fix_stage_issue_pcb', 'conditional', 'Fix issues if validation fails'),
  ('fix_stage_issue_pcb', 'validate_cross_stage_pcb', 'loop', 'Re-validate after fix');

-- ENCLOSURE STAGE: Generate → Review → Accept/Revise → Complete
INSERT INTO orchestrator_edges (from_node, to_node, edge_type, description) VALUES
  ('mark_stage_complete_pcb', 'generate_enclosure', 'flow', 'Generate OpenSCAD enclosure'),
  ('generate_enclosure', 'review_enclosure', 'flow', 'Review enclosure design'),
  ('review_enclosure', 'accept_and_render_enclosure', 'conditional', 'Accept if score >= 85'),
  ('review_enclosure', 'generate_enclosure_revise', 'conditional', 'Revise with feedback if score < 85'),
  ('generate_enclosure_revise', 'review_enclosure', 'loop', 'Re-review after revision'),
  ('accept_and_render_enclosure', 'mark_stage_complete_enclosure', 'flow', 'Mark enclosure complete');

-- FIRMWARE STAGE: Generate → Review → Accept/Revise → Complete
INSERT INTO orchestrator_edges (from_node, to_node, edge_type, description) VALUES
  ('mark_stage_complete_enclosure', 'generate_firmware', 'flow', 'Generate ESP32 firmware'),
  ('generate_firmware', 'review_firmware', 'flow', 'Review firmware code'),
  ('review_firmware', 'accept_and_render_firmware', 'conditional', 'Accept if score >= 85'),
  ('review_firmware', 'generate_firmware_revise', 'conditional', 'Revise with feedback if score < 85'),
  ('generate_firmware_revise', 'review_firmware', 'loop', 'Re-review after revision'),
  ('accept_and_render_firmware', 'mark_stage_complete_firmware', 'flow', 'Mark firmware complete');

-- EXPORT STAGE: Complete
INSERT INTO orchestrator_edges (from_node, to_node, edge_type, description) VALUES
  ('mark_stage_complete_firmware', 'mark_stage_complete_export', 'flow', 'Mark export stage complete'),
  ('mark_stage_complete_export', 'end', 'flow', 'Orchestration complete');

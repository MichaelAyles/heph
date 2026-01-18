-- Migration 0020: Enhanced orchestrator_edges
-- Adds max_loops column for iteration control and updates conditions to structured format

-- Add max_loops column for loop iteration control
ALTER TABLE orchestrator_edges ADD COLUMN max_loops INTEGER DEFAULT 3;

-- Update existing edge conditions to structured JSON format
-- Format: { "field": "<state field path>", "operator": ">=|<=|==|!=|contains", "value": <threshold> }

-- SPEC STAGE conditions
UPDATE orchestrator_edges SET
  condition = '{"field": "mode", "operator": "==", "value": "vibe_it"}'
WHERE from_node = 'analyze_feasibility' AND to_node = 'answer_questions_auto';

UPDATE orchestrator_edges SET
  condition = '{"field": "mode", "operator": "!=", "value": "vibe_it"}'
WHERE from_node = 'analyze_feasibility' AND to_node = 'request_user_input';

-- PCB STAGE conditions
UPDATE orchestrator_edges SET
  condition = '{"field": "lastValidation.isValid", "operator": "==", "value": true}'
WHERE from_node = 'validate_cross_stage_pcb' AND to_node = 'mark_stage_complete_pcb';

UPDATE orchestrator_edges SET
  condition = '{"field": "lastValidation.isValid", "operator": "==", "value": false}',
  max_loops = 5
WHERE from_node = 'validate_cross_stage_pcb' AND to_node = 'fix_stage_issue_pcb';

-- ENCLOSURE STAGE conditions
UPDATE orchestrator_edges SET
  condition = '{"all": [{"field": "lastReview.score", "operator": ">=", "value": 85}, {"field": "lastReview.verdict", "operator": "==", "value": "accept"}]}'
WHERE from_node = 'review_enclosure' AND to_node = 'accept_and_render_enclosure';

UPDATE orchestrator_edges SET
  condition = '{"any": [{"field": "lastReview.score", "operator": "<", "value": 85}, {"field": "lastReview.verdict", "operator": "==", "value": "revise"}]}',
  max_loops = 3
WHERE from_node = 'review_enclosure' AND to_node = 'generate_enclosure_revise';

-- FIRMWARE STAGE conditions
UPDATE orchestrator_edges SET
  condition = '{"all": [{"field": "lastReview.score", "operator": ">=", "value": 85}, {"field": "lastReview.verdict", "operator": "==", "value": "accept"}]}'
WHERE from_node = 'review_firmware' AND to_node = 'accept_and_render_firmware';

UPDATE orchestrator_edges SET
  condition = '{"any": [{"field": "lastReview.score", "operator": "<", "value": 85}, {"field": "lastReview.verdict", "operator": "==", "value": "revise"}]}',
  max_loops = 3
WHERE from_node = 'review_firmware' AND to_node = 'generate_firmware_revise';

-- Add new edges for user escalation after max loops exceeded
INSERT OR IGNORE INTO orchestrator_edges (from_node, to_node, edge_type, condition, priority, description, max_loops) VALUES
  ('generate_enclosure_revise', 'request_user_input', 'conditional',
   '{"field": "loopCount.enclosure", "operator": ">=", "value": 3}',
   10, 'Escalate to user after 3 failed enclosure revisions', NULL),
  ('generate_firmware_revise', 'request_user_input', 'conditional',
   '{"field": "loopCount.firmware", "operator": ">=", "value": 3}',
   10, 'Escalate to user after 3 failed firmware revisions', NULL);

-- Create index for max_loops queries
CREATE INDEX IF NOT EXISTS idx_orchestrator_edges_max_loops ON orchestrator_edges(max_loops);

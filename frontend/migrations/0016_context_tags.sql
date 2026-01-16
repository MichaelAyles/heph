-- Migration 0016: Add context_tags to orchestrator_prompts
-- Allows admin UI to override TypeScript defaults for state context filtering

ALTER TABLE orchestrator_prompts ADD COLUMN context_tags TEXT DEFAULT '[]';

-- Update existing prompts with sensible defaults based on node type
UPDATE orchestrator_prompts SET context_tags = '["identity"]' WHERE node_name = 'analyzeFeasibility';
UPDATE orchestrator_prompts SET context_tags = '["identity", "feasibility"]' WHERE node_name = 'answerQuestions';
UPDATE orchestrator_prompts SET context_tags = '["identity", "feasibility", "decisions"]' WHERE node_name = 'generateBlueprints';
UPDATE orchestrator_prompts SET context_tags = '["visual"]' WHERE node_name = 'selectBlueprint';
UPDATE orchestrator_prompts SET context_tags = '["identity", "spec", "visual"]' WHERE node_name = 'generateNames';
UPDATE orchestrator_prompts SET context_tags = '["spec"]' WHERE node_name = 'selectName';
UPDATE orchestrator_prompts SET context_tags = '["identity", "feasibility", "decisions", "visual"]' WHERE node_name = 'finalizeSpec';
UPDATE orchestrator_prompts SET context_tags = '["spec", "pcb"]' WHERE node_name IN ('selectBlocks', 'validatePcb');
UPDATE orchestrator_prompts SET context_tags = '["spec", "pcb", "visual", "enclosure"]' WHERE node_name = 'generateEnclosure';
UPDATE orchestrator_prompts SET context_tags = '["spec", "pcb", "enclosure"]' WHERE node_name = 'reviewEnclosure';
UPDATE orchestrator_prompts SET context_tags = '["spec", "pcb", "firmware"]' WHERE node_name IN ('generateFirmware', 'reviewFirmware');

-- Migration 0029: Add position columns to orchestrator_prompts for graph visualization
-- Allows persisting node positions in the LangGraph debugger

ALTER TABLE orchestrator_prompts ADD COLUMN position_x REAL DEFAULT NULL;
ALTER TABLE orchestrator_prompts ADD COLUMN position_y REAL DEFAULT NULL;

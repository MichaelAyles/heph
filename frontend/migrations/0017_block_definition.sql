-- Add block definition column for formal block.json storage
-- This replaces scattered columns (taps, edges, net_mappings, etc.) with a unified JSON schema
-- See docs/BLOCK_SPEC.md for schema documentation

-- Add the definition column to store the full block.json content
-- This is the canonical source of truth for all block metadata
ALTER TABLE pcb_blocks ADD COLUMN definition TEXT DEFAULT NULL;

-- Add version column for tracking block updates
ALTER TABLE pcb_blocks ADD COLUMN version TEXT DEFAULT '1.0.0';

-- Add created_at and updated_at timestamps
ALTER TABLE pcb_blocks ADD COLUMN created_at TEXT DEFAULT (datetime('now'));
ALTER TABLE pcb_blocks ADD COLUMN updated_at TEXT DEFAULT (datetime('now'));

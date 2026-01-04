-- User Control Modes
-- Three automation levels: vibe_it (auto), fix_it (pause on error), design_it (manual approval)

-- =============================================================================
-- ADD CONTROL_MODE TO USERS
-- =============================================================================

-- Add control_mode column with default 'fix_it' (balanced automation)
ALTER TABLE users ADD COLUMN control_mode TEXT DEFAULT 'fix_it'
  CHECK (control_mode IN ('vibe_it', 'fix_it', 'design_it'));

-- =============================================================================
-- ADD PAUSE STATE TO PROJECTS
-- =============================================================================

-- Track when a project is paused and why
ALTER TABLE projects ADD COLUMN pause_reason TEXT;
ALTER TABLE projects ADD COLUMN pause_data TEXT;  -- JSON with context for resuming

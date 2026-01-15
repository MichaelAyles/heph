-- Gallery Visibility Controls
-- Add opt-in publishing for the public gallery

-- is_public: 0 = private (default), 1 = published to gallery
-- show_author: 1 = show username (default), 0 = show "Anonymous"

ALTER TABLE projects ADD COLUMN is_public INTEGER DEFAULT 0;
ALTER TABLE projects ADD COLUMN show_author INTEGER DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public);

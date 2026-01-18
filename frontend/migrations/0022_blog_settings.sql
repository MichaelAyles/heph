-- Blog settings table for admin overrides
-- Blogs are stored as static markdown files in /blogs directory
-- This table only stores visibility and customization overrides

CREATE TABLE IF NOT EXISTS blog_settings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  blog_slug TEXT UNIQUE NOT NULL,
  is_published INTEGER DEFAULT 1,
  custom_thumbnail TEXT,
  custom_title TEXT,
  custom_description TEXT,
  sort_order INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_blog_settings_slug ON blog_settings(blog_slug);
CREATE INDEX IF NOT EXISTS idx_blog_settings_published ON blog_settings(is_published);

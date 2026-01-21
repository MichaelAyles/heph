-- Add 'remote' and 'custom' to pcb_blocks category constraint
-- SQLite doesn't support ALTER CONSTRAINT, so we need to recreate the table

-- Step 1: Create new table with updated constraint
CREATE TABLE pcb_blocks_new (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('mcu', 'power', 'sensor', 'output', 'connector', 'utility', 'remote', 'custom')),
  description TEXT,
  width_units INTEGER NOT NULL DEFAULT 1,
  height_units INTEGER NOT NULL DEFAULT 1,
  taps TEXT NOT NULL DEFAULT '[]',
  i2c_addresses TEXT,
  spi_cs TEXT,
  power TEXT,
  components TEXT,
  is_validated INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  edges TEXT DEFAULT '{}',
  files TEXT DEFAULT NULL,
  net_mappings TEXT DEFAULT NULL,
  definition TEXT DEFAULT NULL,
  version TEXT DEFAULT '1.0.0'
);

-- Step 2: Copy data from old table
INSERT INTO pcb_blocks_new SELECT * FROM pcb_blocks;

-- Step 3: Drop old table
DROP TABLE pcb_blocks;

-- Step 4: Rename new table
ALTER TABLE pcb_blocks_new RENAME TO pcb_blocks;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_blocks_category ON pcb_blocks(category);
CREATE INDEX IF NOT EXISTS idx_blocks_slug ON pcb_blocks(slug);

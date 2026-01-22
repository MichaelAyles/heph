-- JLCPCB component rotation and metadata
-- Stores rotation offsets needed to correct KiCad rotations for JLCPCB pick-and-place

CREATE TABLE jlcpcb_components (
  lcsc_part_number TEXT PRIMARY KEY,        -- e.g., "C295747"
  manufacturer_part_number TEXT,             -- e.g., "S2B-PH-SM4-TB"
  description TEXT,
  footprint TEXT,                            -- e.g., "JST_PH_S2B-PH-SM4-TB"
  rotation_offset INTEGER DEFAULT 0,         -- degrees to add to KiCad rotation
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Footprint pattern fallbacks (when LCSC part not found)
CREATE TABLE jlcpcb_footprint_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern TEXT NOT NULL UNIQUE,              -- regex pattern
  rotation_offset INTEGER DEFAULT 0,
  priority INTEGER DEFAULT 0,                -- higher = matched first
  comment TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Seed initial data from current hardcoded values
INSERT INTO jlcpcb_components (lcsc_part_number, description, rotation_offset) VALUES
  ('C295747', 'S2B-PH-SM4-TB (2-pin JST-PH battery connector)', 180),
  ('C2155673', 'TPS259541DSGR (eFuse)', -90),
  ('C148077', 'AW9523B QFN-24 (I2C expander)', -90),
  ('C427425', 'LTST-C19HE1WT (0603 LED)', -90);

INSERT INTO jlcpcb_footprint_patterns (pattern, rotation_offset, priority, comment) VALUES
  ('S2B.*PH.*SM', 180, 100, 'JST-PH SMD connectors'),
  ('JST.*PH', 180, 90, 'JST-PH connectors (generic)'),
  ('QFN-24', -90, 80, 'QFN-24 packages'),
  ('SON50P', -90, 70, 'SON/DFN packages (TI convention)'),
  ('LED.*0603', -90, 60, '0603 LEDs'),
  ('LTST-C', -90, 50, 'Lite-On LEDs'),
  ('USB.*C.*6P', 0, 40, 'USB-C 6-pin (no correction needed)'),
  ('FH34SR', 0, 30, 'Hirose FH34 FFC connectors');

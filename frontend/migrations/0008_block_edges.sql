-- Block edge definitions for PCB merging
-- Each block can have connections on its edges that overlap with adjacent blocks

-- Add edge definitions column to pcb_blocks
-- This JSON column stores edge connections for each side of the block
-- Format: { "north": [...], "south": [...], "east": [...], "west": [...] }
-- Each connection: { "net": "GND", "offsetMm": 1.0, "layer": "F.Cu" }
ALTER TABLE pcb_blocks ADD COLUMN edges TEXT DEFAULT '{}';

-- Add file references column for R2-stored KiCad files
-- Format: { "schematic": "slug.kicad_sch", "pcb": "slug.kicad_pcb", "stepModel": "slug.step" }
ALTER TABLE pcb_blocks ADD COLUMN files TEXT DEFAULT NULL;

-- Add net mappings column for schematic merge
-- Format: { "localNet": { "globalNet": "I2C0_SDA", "padRefs": ["U1.5", "R1.1"] } }
ALTER TABLE pcb_blocks ADD COLUMN net_mappings TEXT DEFAULT NULL;

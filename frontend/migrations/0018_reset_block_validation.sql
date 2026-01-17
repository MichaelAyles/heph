-- Reset block validation status for all seeded blocks
-- These blocks were created with placeholder data and need real KiCad files
-- to be properly validated for use with the new formal block.json schema

-- Mark all existing blocks as unvalidated and inactive
-- They need to be re-uploaded with proper files and block.json definitions
UPDATE pcb_blocks SET is_validated = 0, is_active = 0 WHERE definition IS NULL;

-- Add a comment to the migration log
-- Note: The mcu-esp32c6 block in kicad_seed_data/templates/ESP32/ESP32/ should be
-- uploaded via the admin panel to become the reference block with a proper definition

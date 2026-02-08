-- Add provider-specific model defaults to system_settings
ALTER TABLE system_settings ADD COLUMN openrouter_text_model TEXT DEFAULT 'google/gemini-3-flash-preview';
ALTER TABLE system_settings ADD COLUMN openrouter_image_model TEXT DEFAULT 'google/gemini-2.5-flash-image';
ALTER TABLE system_settings ADD COLUMN vertex_text_model TEXT DEFAULT 'gemini-3-flash-preview';
ALTER TABLE system_settings ADD COLUMN vertex_image_model TEXT DEFAULT 'gemini-2.5-flash-image';

-- Backfill existing row
UPDATE system_settings
SET
  openrouter_text_model = COALESCE(openrouter_text_model, 'google/gemini-3-flash-preview'),
  openrouter_image_model = COALESCE(openrouter_image_model, 'google/gemini-2.5-flash-image'),
  vertex_text_model = COALESCE(vertex_text_model, 'gemini-3-flash-preview'),
  vertex_image_model = COALESCE(vertex_image_model, 'gemini-2.5-flash-image')
WHERE id = 1;

import type { Env } from '../env'

export interface SystemSettingsRecord {
  llm_provider?: string | null
  default_model?: string | null
  openrouter_text_model?: string | null
  openrouter_image_model?: string | null
  vertex_text_model?: string | null
  vertex_image_model?: string | null
  openrouter_api_key?: string | null
  gemini_api_key?: string | null
}

export async function getSystemSettings(env: Env): Promise<SystemSettingsRecord | null> {
  try {
    return await env.DB.prepare(
      `SELECT llm_provider, default_model, openrouter_text_model, openrouter_image_model,
              vertex_text_model, vertex_image_model, openrouter_api_key, gemini_api_key
       FROM system_settings WHERE id = 1`
    ).first<SystemSettingsRecord>()
  } catch {
    // Backward compatibility for environments where migration 0037 has not run yet.
    return await env.DB.prepare(
      `SELECT llm_provider, default_model, openrouter_api_key, gemini_api_key
       FROM system_settings WHERE id = 1`
    ).first<SystemSettingsRecord>()
  }
}

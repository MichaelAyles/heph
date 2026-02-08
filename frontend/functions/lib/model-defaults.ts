import type { Env } from '../env'

export type LLMProviderMode = 'openrouter' | 'vertex'

interface SettingsLike {
  llm_provider?: string | null
  default_model?: string | null
}

export interface ProviderModelDefaults {
  providerMode: LLMProviderMode
  openrouter: {
    textModel: string
    imageModel: string | null
  }
  vertex: {
    textModel: string
    imageModel: string | null
  }
  active: {
    textModel: string
    imageModel: string | null
  }
}

export function getProviderMode(env: Env, llmProvider?: string | null): LLMProviderMode {
  if (env.GCP_SERVICE_ACCOUNT_JSON) return 'vertex'
  return llmProvider === 'openrouter' ? 'openrouter' : 'vertex'
}

export function getProviderModelDefaults(
  env: Env,
  settings?: SettingsLike | null
): ProviderModelDefaults {
  const fallbackText = (settings?.default_model as string) || 'google/gemini-2.0-flash-001'

  const openrouterTextModel = env.OPENROUTER_TEXT_MODEL_SLUG || env.TEXT_MODEL_SLUG || fallbackText
  const openrouterImageModel = env.OPENROUTER_IMAGE_MODEL_SLUG || env.IMAGE_MODEL_SLUG || null

  const vertexTextModel = env.VERTEX_TEXT_MODEL_SLUG || env.TEXT_MODEL_SLUG || fallbackText
  const vertexImageModel = env.VERTEX_IMAGE_MODEL_SLUG || env.IMAGE_MODEL_SLUG || null

  const providerMode = getProviderMode(env, settings?.llm_provider)
  const active =
    providerMode === 'openrouter'
      ? { textModel: openrouterTextModel, imageModel: openrouterImageModel }
      : { textModel: vertexTextModel, imageModel: vertexImageModel }

  return {
    providerMode,
    openrouter: {
      textModel: openrouterTextModel,
      imageModel: openrouterImageModel,
    },
    vertex: {
      textModel: vertexTextModel,
      imageModel: vertexImageModel,
    },
    active,
  }
}

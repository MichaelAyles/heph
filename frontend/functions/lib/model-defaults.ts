import type { Env } from '../env'

export type LLMProviderMode = 'openrouter' | 'vertex'

interface SettingsLike {
  llm_provider?: string | null
  default_model?: string | null
  openrouter_text_model?: string | null
  openrouter_image_model?: string | null
  vertex_text_model?: string | null
  vertex_image_model?: string | null
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
  if (llmProvider === 'openrouter') return 'openrouter'
  if (llmProvider === 'gemini' || llmProvider === 'vertex') return 'vertex'
  return env.GCP_SERVICE_ACCOUNT_JSON ? 'vertex' : 'openrouter'
}

export function getProviderModelDefaults(
  env: Env,
  settings?: SettingsLike | null
): ProviderModelDefaults {
  const openrouterTextModel =
    settings?.openrouter_text_model ||
    env.OPENROUTER_TEXT_MODEL_SLUG ||
    env.TEXT_MODEL_SLUG ||
    'google/gemini-3-flash-preview'
  const openrouterImageModel =
    settings?.openrouter_image_model ||
    env.OPENROUTER_IMAGE_MODEL_SLUG ||
    env.IMAGE_MODEL_SLUG ||
    'google/gemini-2.5-flash-image'

  const vertexTextModel =
    settings?.vertex_text_model ||
    env.VERTEX_TEXT_MODEL_SLUG ||
    env.TEXT_MODEL_SLUG ||
    'gemini-3-flash-preview'
  const vertexImageModel =
    settings?.vertex_image_model ||
    env.VERTEX_IMAGE_MODEL_SLUG ||
    env.IMAGE_MODEL_SLUG ||
    'gemini-2.5-flash-image'

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

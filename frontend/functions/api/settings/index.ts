import type { Env } from '../../env'
import { createLogger } from '../../lib/logger'
import { getProviderModelDefaults, getProviderMode } from '../../lib/model-defaults'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context

  const row = await env.DB.prepare(
    'SELECT llm_provider, openrouter_api_key, gemini_api_key FROM system_settings WHERE id = 1'
  ).first()

  const providerMode = getProviderMode(env, (row?.llm_provider as string) || null)
  const models = getProviderModelDefaults(env, { llm_provider: row?.llm_provider as string })

  return Response.json({
    settings: {
      llmProvider: (row?.llm_provider as string) || 'openrouter',
      providerMode,
      textModel: models.active.textModel,
      imageModel: models.active.imageModel,
      openrouterTextModel: models.openrouter.textModel,
      openrouterImageModel: models.openrouter.imageModel,
      vertexTextModel: models.vertex.textModel,
      vertexImageModel: models.vertex.imageModel,
      hasOpenRouterKey: !!(row?.openrouter_api_key || env.OPENROUTER_API_KEY),
      hasGeminiKey: !!row?.gemini_api_key,
    },
  })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env } = context

  try {
    const body = (await context.request.json()) as { llmProvider?: 'openrouter' | 'gemini' }

    if (body.llmProvider !== undefined) {
      if (!['openrouter', 'gemini'].includes(body.llmProvider)) {
        return Response.json({ error: 'Invalid LLM provider' }, { status: 400 })
      }

      await env.DB.prepare(
        'UPDATE system_settings SET llm_provider = ?, updated_at = ? WHERE id = 1'
      )
        .bind(body.llmProvider, new Date().toISOString())
        .run()
    }

    // Fetch updated settings
    const row = await env.DB.prepare(
      'SELECT llm_provider, openrouter_api_key, gemini_api_key FROM system_settings WHERE id = 1'
    ).first()

    const providerMode = getProviderMode(env, (row?.llm_provider as string) || null)
    const models = getProviderModelDefaults(env, { llm_provider: row?.llm_provider as string })

    return Response.json({
      settings: {
        llmProvider: row!.llm_provider,
        providerMode,
        textModel: models.active.textModel,
        imageModel: models.active.imageModel,
        openrouterTextModel: models.openrouter.textModel,
        openrouterImageModel: models.openrouter.imageModel,
        vertexTextModel: models.vertex.textModel,
        vertexImageModel: models.vertex.imageModel,
        hasOpenRouterKey: !!(row?.openrouter_api_key || env.OPENROUTER_API_KEY),
        hasGeminiKey: !!row?.gemini_api_key,
      },
    })
  } catch (error) {
    const logger = createLogger(env)
    await logger.error('api', 'Update settings error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return Response.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

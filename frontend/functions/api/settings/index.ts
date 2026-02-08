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
    `SELECT llm_provider, default_model, openrouter_text_model, openrouter_image_model,
            vertex_text_model, vertex_image_model, openrouter_api_key, gemini_api_key
     FROM system_settings WHERE id = 1`
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
    const body = (await context.request.json()) as {
      llmProvider?: 'openrouter' | 'gemini'
      openrouterTextModel?: string
      openrouterImageModel?: string
      vertexTextModel?: string
      vertexImageModel?: string
    }

    if (body.llmProvider !== undefined && !['openrouter', 'gemini'].includes(body.llmProvider)) {
      return Response.json({ error: 'Invalid LLM provider' }, { status: 400 })
    }
    if (body.openrouterTextModel !== undefined && !body.openrouterTextModel.trim()) {
      return Response.json({ error: 'OpenRouter text model cannot be empty' }, { status: 400 })
    }
    if (body.openrouterImageModel !== undefined && !body.openrouterImageModel.trim()) {
      return Response.json({ error: 'OpenRouter image model cannot be empty' }, { status: 400 })
    }
    if (body.vertexTextModel !== undefined && !body.vertexTextModel.trim()) {
      return Response.json({ error: 'Vertex text model cannot be empty' }, { status: 400 })
    }
    if (body.vertexImageModel !== undefined && !body.vertexImageModel.trim()) {
      return Response.json({ error: 'Vertex image model cannot be empty' }, { status: 400 })
    }

    if (
      body.llmProvider !== undefined ||
      body.openrouterTextModel !== undefined ||
      body.openrouterImageModel !== undefined ||
      body.vertexTextModel !== undefined ||
      body.vertexImageModel !== undefined
    ) {
      await env.DB.prepare(
        `UPDATE system_settings
         SET llm_provider = COALESCE(?, llm_provider),
             openrouter_text_model = COALESCE(?, openrouter_text_model),
             openrouter_image_model = COALESCE(?, openrouter_image_model),
             vertex_text_model = COALESCE(?, vertex_text_model),
             vertex_image_model = COALESCE(?, vertex_image_model),
             updated_at = ?
         WHERE id = 1`
      )
        .bind(
          body.llmProvider ?? null,
          body.openrouterTextModel?.trim() ?? null,
          body.openrouterImageModel?.trim() ?? null,
          body.vertexTextModel?.trim() ?? null,
          body.vertexImageModel?.trim() ?? null,
          new Date().toISOString()
        )
        .run()
    }

    // Fetch updated settings
    const row = await env.DB.prepare(
      `SELECT llm_provider, default_model, openrouter_text_model, openrouter_image_model,
              vertex_text_model, vertex_image_model, openrouter_api_key, gemini_api_key
       FROM system_settings WHERE id = 1`
    ).first()

    const providerMode = getProviderMode(env, (row?.llm_provider as string) || null)
    const models = getProviderModelDefaults(
      env,
      row as { llm_provider?: string; default_model?: string }
    )

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

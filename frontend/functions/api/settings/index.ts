import type { Env } from '../../env'
import { createLogger } from '../../lib/logger'
import { getProviderModelDefaults, getProviderMode } from '../../lib/model-defaults'
import { getSystemSettings } from '../../lib/system-settings'

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

interface User {
  id: string
  isAdmin: boolean
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  const row = await getSystemSettings(env)

  const providerMode = getProviderMode(env, (row?.llm_provider as string) || null)
  const models = getProviderModelDefaults(env, row || undefined)

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
      hasOpenRouterKey: !!env.OPENROUTER_API_KEY,
      hasVertexKey: !!env.GCP_SERVICE_ACCOUNT_JSON,
      hasGeminiKey: false,
    },
  })
}

export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!user.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

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
      try {
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
      } catch (error) {
        const isLegacySchemaError =
          error instanceof Error &&
          (/no such column/i.test(error.message) || /has no column named/i.test(error.message))
        if (!isLegacySchemaError) {
          throw error
        }

        // Legacy schema fallback: only provider is persisted.
        if (body.llmProvider !== undefined) {
          await env.DB.prepare(
            'UPDATE system_settings SET llm_provider = ?, updated_at = ? WHERE id = 1'
          )
            .bind(body.llmProvider, new Date().toISOString())
            .run()
        }
      }
    }

    // Fetch updated settings
    const row = await getSystemSettings(env)

    const providerMode = getProviderMode(env, (row?.llm_provider as string) || null)
    const models = getProviderModelDefaults(env, row || undefined)

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
        hasOpenRouterKey: !!env.OPENROUTER_API_KEY,
        hasVertexKey: !!env.GCP_SERVICE_ACCOUNT_JSON,
        hasGeminiKey: false,
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

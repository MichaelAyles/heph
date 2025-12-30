import type { Env } from '../../env'

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

  // Get model slugs from environment
  const textModel = env.TEXT_MODEL_SLUG || 'google/gemini-2.0-flash-001'
  const imageModel = env.IMAGE_MODEL_SLUG || null

  return Response.json({
    settings: {
      llmProvider: (row?.llm_provider as string) || 'openrouter',
      textModel,
      imageModel,
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

    const textModel = env.TEXT_MODEL_SLUG || 'google/gemini-2.0-flash-001'
    const imageModel = env.IMAGE_MODEL_SLUG || null

    return Response.json({
      settings: {
        llmProvider: row!.llm_provider,
        textModel,
        imageModel,
        hasOpenRouterKey: !!(row?.openrouter_api_key || env.OPENROUTER_API_KEY),
        hasGeminiKey: !!row?.gemini_api_key,
      },
    })
  } catch (error) {
    console.error('Update settings error:', error)
    return Response.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}

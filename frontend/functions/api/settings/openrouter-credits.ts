/**
 * OpenRouter Credits API
 *
 * Fetches the current credit balance from OpenRouter's API
 * GET /api/settings/openrouter-credits
 */

import type { Env } from '../../env'

interface User {
  id: string
  isAdmin: boolean
}

interface OpenRouterCreditsResponse {
  data: {
    total_credits: number
    total_usage: number
  }
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get OpenRouter API key from settings or env
  const settings = await env.DB.prepare(
    'SELECT openrouter_api_key FROM system_settings WHERE id = 1'
  ).first()

  const apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''

  if (!apiKey) {
    return Response.json(
      { error: 'OpenRouter API key not configured', credits: null },
      { status: 200 }
    )
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/credits', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    })

    if (!response.ok) {
      const errorText = await response.text()
      // 403 typically means the key doesn't have permission (not a provisioning key)
      if (response.status === 403) {
        return Response.json(
          {
            error: 'API key does not have credits access (requires provisioning key)',
            credits: null,
          },
          { status: 200 }
        )
      }
      return Response.json(
        { error: `OpenRouter API error: ${response.status}`, details: errorText, credits: null },
        { status: 200 }
      )
    }

    const result = (await response.json()) as OpenRouterCreditsResponse

    return Response.json({
      credits: {
        total: result.data.total_credits,
        used: result.data.total_usage,
        remaining: result.data.total_credits - result.data.total_usage,
      },
    })
  } catch (error) {
    return Response.json(
      { error: `Failed to fetch credits: ${String(error)}`, credits: null },
      { status: 200 }
    )
  }
}

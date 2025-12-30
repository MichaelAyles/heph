import type { Env } from '../../env'
import { calculateImageCost } from './pricing'

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
  username: string
  displayName: string | null
}

interface ImageRequest {
  prompt: string
  model?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const startTime = Date.now()

  try {
    const body = (await context.request.json()) as ImageRequest
    const { prompt } = body

    if (!prompt) {
      return Response.json({ error: 'Prompt required' }, { status: 400 })
    }

    // Get settings
    const settings = await env.DB.prepare(
      'SELECT openrouter_api_key FROM system_settings WHERE id = 1'
    ).first()

    const apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''
    if (!apiKey) {
      return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
    }

    // Use the configured image model from .dev.vars
    const model = body.model || env.IMAGE_MODEL_SLUG
    if (!model) {
      return Response.json({ error: 'IMAGE_MODEL_SLUG not configured in .dev.vars' }, { status: 500 })
    }

    // Use chat completions with image generation request
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://phaestus.dev',
        'X-Title': 'Phaestus',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: `Generate an image of: ${prompt}. Return the image directly.`,
          },
        ],
        max_tokens: 4096,
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Image API error:', errorText)

      // Log failed request
      const id = crypto.randomUUID().replace(/-/g, '')
      await env.DB.prepare(
        `INSERT INTO llm_requests (id, user_id, project_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, status, error_message, created_at)
         VALUES (?, ?, NULL, ?, 0, 0, 0, ?, 0, 'error', ?, datetime('now'))`
      )
        .bind(id, user.id, model, Date.now() - startTime, errorText)
        .run()

      return Response.json({
        error: 'Image generation failed',
        details: errorText,
        status: response.status,
        model
      }, { status: 502 })
    }

    const result = await response.json()
    const latencyMs = Date.now() - startTime

    // Extract image from response - handle various formats
    let imageUrl: string | null = null
    let rawResponse: string | null = null

    const message = result.choices?.[0]?.message

    // Check for images array (Gemini format via OpenRouter)
    if (message?.images && Array.isArray(message.images)) {
      for (const img of message.images) {
        if (img.type === 'image_url' && img.image_url?.url) {
          imageUrl = img.image_url.url
          break
        }
      }
    }

    // Try chat completions format (content field)
    const content = message?.content
    if (!imageUrl && content) {
      if (typeof content === 'string') {
        // Check if it's base64 or URL
        if (content.startsWith('data:image') || content.startsWith('http')) {
          imageUrl = content
        } else {
          rawResponse = content
        }
      } else if (Array.isArray(content)) {
        // Multipart content
        for (const part of content) {
          if (part.type === 'image_url' && part.image_url?.url) {
            imageUrl = part.image_url.url
          } else if (part.type === 'image' && part.source?.data) {
            imageUrl = `data:${part.source.media_type || 'image/png'};base64,${part.source.data}`
          }
        }
      }
    }

    // If no image found, return the raw response for debugging
    if (!imageUrl) {
      return Response.json({
        error: 'No image in response',
        rawResponse: rawResponse || JSON.stringify(result).slice(0, 500),
        model,
        latencyMs,
      }, { status: 200 })
    }

    // Log successful request with cost
    const id = crypto.randomUUID().replace(/-/g, '')
    const costUsd = calculateImageCost(model)
    await env.DB.prepare(
      `INSERT INTO llm_requests (id, user_id, project_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, status, error_message, created_at)
       VALUES (?, ?, NULL, ?, 0, 0, 0, ?, ?, 'success', NULL, datetime('now'))`
    )
      .bind(id, user.id, model, latencyMs, costUsd)
      .run()

    return Response.json({
      imageUrl,
      model,
      latencyMs,
    })
  } catch (error) {
    console.error('Image error:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

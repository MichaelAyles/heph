import type { Env } from '../../env'
import { calculateImageCost } from './pricing'
import { createLogger } from '../../lib/logger'
import { getProviderModelDefaults, getProviderMode } from '../../lib/model-defaults'
import { getSystemSettings } from '../../lib/system-settings'
import { getVertexAccessToken, getVertexUrl } from '../../lib/vertex-auth'
import {
  assertProjectAccess,
  ProjectAccessError,
  resolveRequestedModel,
} from '../../lib/llm-routing'
import { OPENROUTER_API_URL, APP_URL } from '../../lib/config'
import type { PagesFunction, User } from '../../lib/message-types'

interface ImageRequest {
  prompt: string
  model?: string
  projectId?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const startTime = Date.now()

  try {
    const body = (await context.request.json()) as ImageRequest
    const { prompt } = body

    await logger.debug('llm', 'Image request received', {
      promptLength: prompt?.length,
      model: body.model,
      projectId: body.projectId,
    })

    if (!prompt) {
      return Response.json({ error: 'Prompt required' }, { status: 400 })
    }

    let projectId: string | undefined
    try {
      projectId = await assertProjectAccess(env, user, body.projectId)
    } catch (error) {
      if (error instanceof ProjectAccessError) {
        if (error.code === 'not_found') {
          return Response.json({ error: 'Project not found' }, { status: 404 })
        }
        return Response.json({ error: 'Forbidden' }, { status: 403 })
      }
      throw error
    }

    // Get settings
    const settings = await getSystemSettings(env)
    const provider = getProviderMode(env, (settings?.llm_provider as string) || null)

    const defaults = getProviderModelDefaults(
      env,
      settings as { llm_provider?: string; default_model?: string }
    )
    const modelResolution = resolveRequestedModel(
      body.model,
      defaults.active,
      'image',
      user.isAdmin === true
    )
    const model = modelResolution.model

    if (modelResolution.wasOverridden) {
      await logger.warn('llm', 'Non-admin requested disallowed model, using active default', {
        requestedModel: modelResolution.requestedModel,
        resolvedModel: model,
      })
    }

    let response: Response
    if (provider === 'vertex') {
      if (!env.GCP_SERVICE_ACCOUNT_JSON) {
        return Response.json({ error: 'Vertex service account not configured' }, { status: 500 })
      }
      const accessToken = await getVertexAccessToken(env.GCP_SERVICE_ACCOUNT_JSON)
      const gcpProjectId = env.GCP_PROJECT_ID || 'phaestus-app-api'
      const region = env.GCP_REGION || 'europe-west2'

      response = await fetch(getVertexUrl(gcpProjectId, region, model, 'generateContent'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `Generate an image of: ${prompt}. Return the image directly.` }],
            },
          ],
          generationConfig: {
            maxOutputTokens: 4096,
          },
        }),
      })
    } else {
      const apiKey = env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_URL,
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
    }

    if (!response.ok) {
      const errorText = await response.text()
      await logger.error('llm', 'Image API error', { error: errorText, model, provider })

      await logImageRequest(
        env,
        user.id,
        projectId,
        model,
        Date.now() - startTime,
        'error',
        errorText
      )

      // Don't expose error details to client (may contain API keys or sensitive info)
      return Response.json({ error: 'Image generation failed' }, { status: 502 })
    }

    const result = await response.json()
    const latencyMs = Date.now() - startTime

    // Get actual cost from OpenRouter if available
    const usageData = result.usage as
      | {
          prompt_tokens?: number
          completion_tokens?: number
          total_cost?: number
        }
      | undefined
    const actualCostUsd = usageData?.total_cost

    // Extract image from response - handle various formats
    let imageUrl: string | null = null
    let rawResponse: string | null = null

    const message = result.choices?.[0]?.message
    const vertexPart = result.candidates?.[0]?.content?.parts?.[0] as
      | { inlineData?: { mimeType?: string; data?: string }; fileData?: { fileUri?: string } }
      | undefined

    if (provider === 'vertex') {
      if (vertexPart?.inlineData?.data) {
        imageUrl = `data:${vertexPart.inlineData.mimeType || 'image/png'};base64,${vertexPart.inlineData.data}`
      } else if (vertexPart?.fileData?.fileUri) {
        imageUrl = vertexPart.fileData.fileUri
      } else {
        rawResponse = JSON.stringify(result).slice(0, 500)
      }
    }

    // Check for images array (Gemini format via OpenRouter)
    if (!imageUrl && message?.images && Array.isArray(message.images)) {
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
      await logImageRequest(
        env,
        user.id,
        projectId,
        model,
        latencyMs,
        'error',
        rawResponse || 'No image in provider response',
        actualCostUsd
      )

      return Response.json(
        {
          error: 'No image in response',
          rawResponse: rawResponse || JSON.stringify(result).slice(0, 500),
          model,
          latencyMs,
        },
        { status: 502 }
      )
    }

    // If we have a base64 image, upload to R2 storage
    let finalImageUrl = imageUrl
    if (imageUrl.startsWith('data:image')) {
      try {
        // Parse base64 data URL
        const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/)
        if (matches) {
          const mimeType = matches[1]
          const base64Data = matches[2]
          const binaryData = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0))

          // Generate unique filename
          const imageId = crypto.randomUUID().replace(/-/g, '')
          const extension = mimeType.split('/')[1] || 'png'
          const key = `blueprints/${imageId}.${extension}`

          // Upload to R2
          await env.STORAGE.put(key, binaryData, {
            httpMetadata: {
              contentType: mimeType,
            },
          })

          // Return the R2 URL (using Cloudflare's public bucket URL or a custom domain)
          // For now, use a relative path that the frontend can access
          finalImageUrl = `/api/images/${key}`

          await logger.debug('llm', 'Image uploaded to R2', { key, size: binaryData.length })
        }
      } catch (uploadError) {
        await logger.error('llm', 'Failed to upload image to R2', { error: String(uploadError) })
        // Fall back to base64 URL if upload fails (will likely fail on DB save anyway)
      }
    }

    // Log successful request with cost (prefer actual cost from OpenRouter)
    const costUsd = actualCostUsd ?? calculateImageCost(model)
    await logImageRequest(env, user.id, projectId, model, latencyMs, 'success', null, costUsd)

    await logger.llm('Image generated', { model, latencyMs, costUsd })

    return Response.json({
      imageUrl: finalImageUrl,
      model,
      latencyMs,
    })
  } catch (error) {
    await logger.error('llm', 'Image error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function logImageRequest(
  env: Env,
  userId: string,
  projectId: string | undefined,
  model: string,
  latencyMs: number,
  status: 'success' | 'error',
  errorMessage: string | null,
  actualCostUsd?: number
) {
  try {
    const id = crypto.randomUUID().replace(/-/g, '')
    const costUsd = actualCostUsd ?? calculateImageCost(model)
    await env.DB.prepare(
      `INSERT INTO llm_requests (id, user_id, project_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, status, error_message, created_at)
       VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, ?, datetime('now'))`
    )
      .bind(id, userId, projectId || null, model, latencyMs, costUsd, status, errorMessage)
      .run()
  } catch {
    // Usage logging is best-effort and must not fail the request.
  }
}

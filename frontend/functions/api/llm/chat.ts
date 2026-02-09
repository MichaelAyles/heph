import type { Env } from '../../env'
import { calculateCost } from './pricing'
import { createLogger } from '../../lib/logger'
import { convertToGeminiFormat } from '../../lib/gemini'
import { getVertexAccessToken, getVertexUrl } from '../../lib/vertex-auth'
import { getProviderModelDefaults, getProviderMode } from '../../lib/model-defaults'
import { getSystemSettings } from '../../lib/system-settings'
import {
  assertProjectAccess,
  ProjectAccessError,
  resolveRequestedModel,
} from '../../lib/llm-routing'
import { OPENROUTER_API_URL, APP_URL } from '../../lib/config'
import type {
  PagesFunction,
  User,
  ChatMessage,
  ChatRequest,
  OpenAIMessage,
  OpenAITextContent,
  OpenAIImageContent,
} from '../../lib/message-types'

/**
 * Convert our internal message format to OpenAI/OpenRouter format
 * OpenRouter expects base64 images as data URLs
 */
function convertToOpenRouterFormat(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    const role = msg.role === 'tool' ? 'assistant' : msg.role

    if (typeof msg.content === 'string') {
      return { role, content: msg.content }
    }

    // Convert multipart content
    const content: (OpenAITextContent | OpenAIImageContent)[] = msg.content.map((part) => {
      if (part.type === 'image') {
        return {
          type: 'image_url' as const,
          image_url: {
            url: `data:${part.mimeType};base64,${part.data}`,
          },
        }
      }
      return {
        type: 'text' as const,
        text: part.text,
      }
    })

    return { role, content }
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const startTime = Date.now()

  try {
    const body = (await context.request.json()) as ChatRequest
    const { messages } = body

    await logger.debug('llm', 'Chat request received', {
      messageCount: messages?.length,
      projectId: body.projectId,
      model: body.model,
    })

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
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
      'text',
      user.isAdmin === true
    )
    const model = modelResolution.model
    const temperature = body.temperature ?? 0.7
    const maxTokens = body.maxTokens ?? 16384

    if (modelResolution.wasOverridden) {
      await logger.warn('llm', 'Non-admin requested disallowed model, using active default', {
        requestedModel: modelResolution.requestedModel,
        resolvedModel: model,
      })
    }

    let response: Response

    if (provider === 'vertex') {
      // Vertex AI (GCP)
      if (!env.GCP_SERVICE_ACCOUNT_JSON) {
        return Response.json({ error: 'Vertex service account not configured' }, { status: 500 })
      }
      const accessToken = await getVertexAccessToken(env.GCP_SERVICE_ACCOUNT_JSON!)
      const gcpProjectId = env.GCP_PROJECT_ID || 'phaestus-app-api'
      const region = env.GCP_REGION || 'europe-west2'
      const contents = convertToGeminiFormat(messages)

      response = await fetch(getVertexUrl(gcpProjectId, region, model, 'generateContent'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        }),
      })
    } else if (provider === 'openrouter') {
      const apiKey = env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      // Convert messages to OpenRouter format (handles multipart/vision content)
      const openRouterMessages = convertToOpenRouterFormat(messages)

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
          messages: openRouterMessages,
          temperature,
          max_tokens: maxTokens,
        }),
      })
    } else {
      return Response.json({ error: 'Unsupported LLM provider' }, { status: 500 })
    }

    if (!response.ok) {
      const error = await response.text()
      await logger.error('llm', 'LLM API error', { error, model, provider })

      // Log failed request
      await logLlmRequest(
        env,
        user.id,
        projectId,
        model,
        0,
        0,
        Date.now() - startTime,
        'error',
        error
      )

      // Log full conversation on error too
      await logConversation(
        env,
        user.id,
        projectId,
        requestId,
        messages,
        null,
        model,
        temperature,
        maxTokens,
        0,
        0,
        Date.now() - startTime,
        'error',
        error
      )

      return Response.json({ error: 'LLM API error' }, { status: 502 })
    }

    const result = (await response.json()) as Record<string, unknown>
    const latencyMs = Date.now() - startTime

    let content: string
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

    let actualCostUsd: number | undefined

    if (provider === 'openrouter') {
      const choices = result.choices as Array<{ message: { content: string } }>
      content = choices?.[0]?.message?.content || ''
      const usageData = result.usage as {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        total_cost?: number // OpenRouter returns actual cost in USD
      }
      usage = usageData
        ? {
            promptTokens: usageData.prompt_tokens,
            completionTokens: usageData.completion_tokens,
            totalTokens: usageData.total_tokens,
          }
        : undefined
      // Use OpenRouter's actual cost if available (credits = USD)
      actualCostUsd = usageData?.total_cost
    } else {
      // Gemini and Vertex AI use the same response format
      const candidates = result.candidates as Array<{
        content: { parts: Array<{ text: string }> }
      }>
      content = candidates?.[0]?.content?.parts?.[0]?.text || ''
      const usageMetadata = result.usageMetadata as {
        promptTokenCount: number
        candidatesTokenCount: number
        totalTokenCount: number
      }
      usage = usageMetadata
        ? {
            promptTokens: usageMetadata.promptTokenCount,
            completionTokens: usageMetadata.candidatesTokenCount,
            totalTokens: usageMetadata.totalTokenCount,
          }
        : undefined
    }

    // Log successful request
    await logLlmRequest(
      env,
      user.id,
      projectId,
      model,
      usage?.promptTokens || 0,
      usage?.completionTokens || 0,
      latencyMs,
      'success',
      null,
      actualCostUsd
    )

    // Log full conversation
    await logConversation(
      env,
      user.id,
      projectId,
      requestId,
      messages,
      content,
      model,
      temperature,
      maxTokens,
      usage?.promptTokens || 0,
      usage?.completionTokens || 0,
      latencyMs,
      'success',
      null
    )

    await logger.llm('Chat completed', {
      model,
      latencyMs,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      contentLength: content.length,
    })

    const usageResponse = usage
      ? {
          ...usage,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
        }
      : undefined

    return Response.json({ content, model, usage: usageResponse })
  } catch (error) {
    await logger.error('llm', 'Chat error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function logLlmRequest(
  env: Env,
  userId: string,
  projectId: string | undefined,
  model: string,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  status: string,
  errorMessage: string | null,
  actualCostUsd?: number
) {
  try {
    const id = crypto.randomUUID().replace(/-/g, '')
    // Use actual cost from provider if available, otherwise estimate
    const costUsd = actualCostUsd ?? calculateCost(model, promptTokens, completionTokens)

    await env.DB.prepare(
      `
      INSERT INTO llm_requests (id, user_id, project_id, model, prompt_tokens, completion_tokens, total_tokens, latency_ms, cost_usd, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(
        id,
        userId,
        projectId || null,
        model,
        promptTokens,
        completionTokens,
        promptTokens + completionTokens,
        latencyMs,
        costUsd,
        status,
        errorMessage
      )
      .run()
  } catch {
    // Usage logging is best-effort and must not fail the request.
  }
}

async function logConversation(
  env: Env,
  userId: string,
  projectId: string | undefined,
  requestId: string,
  messagesIn: ChatMessage[],
  messageOut: string | null,
  model: string,
  temperature: number,
  maxTokens: number,
  promptTokens: number,
  completionTokens: number,
  latencyMs: number,
  status: string,
  errorMessage: string | null
) {
  try {
    const id = crypto.randomUUID().replace(/-/g, '')
    await env.DB.prepare(
      `
      INSERT INTO llm_conversations (id, project_id, user_id, request_id, messages_in, message_out, model, temperature, max_tokens, prompt_tokens, completion_tokens, latency_ms, status, error_message, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `
    )
      .bind(
        id,
        projectId || null,
        userId,
        requestId,
        JSON.stringify(messagesIn),
        messageOut,
        model,
        temperature,
        maxTokens,
        promptTokens,
        completionTokens,
        latencyMs,
        status,
        errorMessage
      )
      .run()
  } catch {
    // Silently fail - conversation logging is best-effort
  }
}

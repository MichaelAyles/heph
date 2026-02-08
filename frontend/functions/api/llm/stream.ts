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
  OpenAIMessage,
  OpenAITextContent,
  OpenAIImageContent,
} from '../../lib/message-types'

interface StreamRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  projectId?: string
}

function convertToOpenRouterFormat(messages: ChatMessage[]): OpenAIMessage[] {
  return messages.map((msg) => {
    if (typeof msg.content === 'string') {
      return { role: msg.role === 'tool' ? 'assistant' : msg.role, content: msg.content }
    }

    const content: (OpenAITextContent | OpenAIImageContent)[] = msg.content.map((part) => {
      if (part.type === 'image') {
        return {
          type: 'image_url',
          image_url: { url: `data:${part.mimeType};base64,${part.data}` },
        }
      }
      return {
        type: 'text',
        text: part.text,
      }
    })

    return { role: msg.role === 'tool' ? 'assistant' : msg.role, content }
  })
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  try {
    const body = (await context.request.json()) as StreamRequest
    const { messages } = body

    await logger.debug('llm', 'Stream request received', {
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
    const maxTokens = body.maxTokens ?? 4096

    if (modelResolution.wasOverridden) {
      await logger.warn('llm', 'Non-admin requested disallowed model, using active default', {
        requestedModel: modelResolution.requestedModel,
        resolvedModel: model,
      })
    }

    let upstreamResponse: Response

    if (provider === 'vertex') {
      // Vertex AI streaming
      if (!env.GCP_SERVICE_ACCOUNT_JSON) {
        return Response.json({ error: 'Vertex service account not configured' }, { status: 500 })
      }
      const accessToken = await getVertexAccessToken(env.GCP_SERVICE_ACCOUNT_JSON!)
      const gcpProjectId = env.GCP_PROJECT_ID || 'phaestus-app-api'
      const region = env.GCP_REGION || 'europe-west2'
      const contents = convertToGeminiFormat(messages)

      upstreamResponse = await fetch(
        getVertexUrl(gcpProjectId, region, model, 'streamGenerateContent') + '?alt=sse',
        {
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
        }
      )
    } else if (provider === 'openrouter') {
      const apiKey = env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      const openRouterMessages = convertToOpenRouterFormat(messages)

      upstreamResponse = await fetch(OPENROUTER_API_URL, {
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
          stream: true,
        }),
      })
    } else {
      return Response.json({ error: 'Unsupported LLM provider' }, { status: 500 })
    }

    if (!upstreamResponse.ok) {
      const error = await upstreamResponse.text()
      await logger.error('llm', 'LLM stream error', { error, model, provider })
      return Response.json({ error: 'LLM API error' }, { status: 502 })
    }

    await logger.llm('Stream started', { model, provider })

    // Create a TransformStream to process and forward the response
    const { readable, writable } = new TransformStream()

    // Process the stream in the background
    // Pass messages for token estimation
    void processStream(
      upstreamResponse.body!,
      writable,
      provider,
      env,
      user.id,
      projectId,
      model,
      messages
    )

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    await logger.error('llm', 'Stream error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function processStream(
  input: ReadableStream<Uint8Array>,
  output: WritableStream<Uint8Array>,
  provider: string,
  env: Env,
  userId: string,
  projectId: string | undefined,
  model: string,
  messages: ChatMessage[]
) {
  const reader = input.getReader()
  const writer = output.getWriter()
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()

  let fullContent = ''
  let streamBuffer = ''
  const startTime = Date.now()

  // Track usage data from stream (OpenRouter sends it in final message)
  let streamUsage: {
    promptTokens?: number
    completionTokens?: number
    totalCost?: number
  } = {}

  try {
    const processSsePayload = async (payload: string) => {
      if (!payload || payload === '[DONE]') return

      try {
        const parsed = JSON.parse(payload)
        let token = ''

        if (provider === 'openrouter') {
          token = parsed.choices?.[0]?.delta?.content || ''
          if (parsed.usage) {
            streamUsage = {
              promptTokens: parsed.usage.prompt_tokens,
              completionTokens: parsed.usage.completion_tokens,
              totalCost: parsed.usage.total_cost,
            }
          }
        } else {
          token = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
          if (parsed.usageMetadata) {
            streamUsage = {
              promptTokens: parsed.usageMetadata.promptTokenCount,
              completionTokens: parsed.usageMetadata.candidatesTokenCount,
            }
          }
        }

        if (token) {
          fullContent += token
          await writer.write(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
        }
      } catch {
        // Skip malformed JSON payloads from upstream SSE.
      }
    }

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      streamBuffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')

      let eventBoundary = streamBuffer.indexOf('\n\n')
      while (eventBoundary !== -1) {
        const rawEvent = streamBuffer.slice(0, eventBoundary)
        streamBuffer = streamBuffer.slice(eventBoundary + 2)

        const payload = rawEvent
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.replace(/^data:\s?/, ''))
          .join('\n')
          .trim()

        await processSsePayload(payload)
        eventBoundary = streamBuffer.indexOf('\n\n')
      }
    }

    if (streamBuffer.trim().length > 0) {
      const fallbackPayloads = streamBuffer
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s?/, '').trim())
        .filter((line) => line.length > 0)

      for (const payload of fallbackPayloads) {
        await processSsePayload(payload)
      }
    }

    // Send completion event
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ done: true, content: fullContent })}\n\n`)
    )

    // Use actual usage data if available, otherwise estimate
    const latencyMs = Date.now() - startTime
    const promptTokens = streamUsage.promptTokens ?? Math.ceil(JSON.stringify(messages).length / 4)
    const completionTokens = streamUsage.completionTokens ?? Math.ceil(fullContent.length / 4)

    await logLlmRequest(
      env,
      userId,
      projectId,
      model,
      promptTokens,
      completionTokens,
      latencyMs,
      'success',
      null,
      streamUsage.totalCost
    )

    // Log full conversation
    await logConversation(
      env,
      userId,
      projectId,
      messages,
      fullContent,
      model,
      promptTokens,
      completionTokens,
      latencyMs,
      'success',
      null
    )
  } catch {
    // Stream processing error - send error event to client
    await writer.write(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`))
  } finally {
    await writer.close()
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
  messagesIn: ChatMessage[],
  messageOut: string | null,
  model: string,
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
        null, // No request_id in streaming context
        JSON.stringify(messagesIn),
        messageOut,
        model,
        null, // Temperature not tracked here
        null, // Max tokens not tracked here
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

import type { Env } from '../../env'
import { calculateCost } from './pricing'
import { createLogger } from '../../lib/logger'

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
  isAdmin?: boolean
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

interface ChatRequest {
  messages: ChatMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  projectId?: string
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const startTime = Date.now()

  try {
    const body = (await context.request.json()) as ChatRequest
    const { messages, projectId } = body

    await logger.debug('llm', 'Chat request received', {
      messageCount: messages?.length,
      projectId,
      model: body.model,
    })

    if (!messages || messages.length === 0) {
      return Response.json({ error: 'Messages required' }, { status: 400 })
    }

    // Get settings
    const settings = await env.DB.prepare(
      'SELECT llm_provider, default_model, openrouter_api_key, gemini_api_key FROM system_settings WHERE id = 1'
    ).first()

    const provider = (settings?.llm_provider as string) || 'openrouter'
    // Priority: request body > env var > database > hardcoded fallback
    const model = body.model || env.TEXT_MODEL_SLUG || (settings?.default_model as string) || 'google/gemini-2.0-flash-001'
    const temperature = body.temperature ?? 0.7
    const maxTokens = body.maxTokens ?? 4096

    let apiKey: string
    let response: Response

    if (provider === 'openrouter') {
      apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://phaestus.dev',
          'X-Title': 'Phaestus',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        }),
      })
    } else {
      // Gemini
      apiKey = (settings?.gemini_api_key as string) || ''
      if (!apiKey) {
        return Response.json({ error: 'Gemini API key not configured' }, { status: 500 })
      }

      // Convert messages to Gemini format
      const contents = convertToGeminiFormat(messages)

      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature,
              maxOutputTokens: maxTokens,
            },
          }),
        }
      )
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

      return Response.json({ error: 'LLM API error' }, { status: 502 })
    }

    const result = (await response.json()) as Record<string, unknown>
    const latencyMs = Date.now() - startTime

    let content: string
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined

    if (provider === 'openrouter') {
      const choices = result.choices as Array<{ message: { content: string } }>
      content = choices?.[0]?.message?.content || ''
      const usageData = result.usage as {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
      usage = usageData
        ? {
            promptTokens: usageData.prompt_tokens,
            completionTokens: usageData.completion_tokens,
            totalTokens: usageData.total_tokens,
          }
        : undefined
    } else {
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
      null
    )

    await logger.llm('Chat completed', {
      model,
      latencyMs,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      contentLength: content.length,
    })

    return Response.json({ content, model, usage })
  } catch (error) {
    await logger.error('llm', 'Chat error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function convertToGeminiFormat(messages: ChatMessage[]) {
  const result: Array<{ role: string; parts: Array<{ text: string }> }> = []

  for (const msg of messages) {
    if (msg.role === 'system') {
      result.unshift({ role: 'user', parts: [{ text: msg.content }] })
      result.splice(1, 0, { role: 'model', parts: [{ text: 'Understood.' }] })
    } else {
      result.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }],
      })
    }
  }

  return result
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
  errorMessage: string | null
) {
  const id = crypto.randomUUID().replace(/-/g, '')
  const costUsd = calculateCost(model, promptTokens, completionTokens)

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
}

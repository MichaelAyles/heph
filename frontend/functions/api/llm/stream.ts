import type { Env } from '../../env'
import { calculateCost } from './pricing'
import { createLogger } from '../../lib/logger'
import { convertToGeminiFormat } from '../../lib/gemini'

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

interface StreamRequest {
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

  try {
    const body = (await context.request.json()) as StreamRequest
    const { messages, projectId } = body

    await logger.debug('llm', 'Stream request received', {
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
    const model =
      body.model ||
      env.TEXT_MODEL_SLUG ||
      (settings?.default_model as string) ||
      'google/gemini-2.0-flash-001'
    const temperature = body.temperature ?? 0.7
    const maxTokens = body.maxTokens ?? 4096

    let apiKey: string
    let upstreamResponse: Response

    if (provider === 'openrouter') {
      apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      upstreamResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
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
          stream: true,
        }),
      })
    } else {
      // Gemini streaming
      apiKey = (settings?.gemini_api_key as string) || ''
      if (!apiKey) {
        return Response.json({ error: 'Gemini API key not configured' }, { status: 500 })
      }

      const contents = convertToGeminiFormat(messages)

      upstreamResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
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
    processStream(upstreamResponse.body!, writable, provider, env, user.id, projectId, model, messages)

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
  const startTime = Date.now()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = decoder.decode(value, { stream: true })
      const lines = chunk.split('\n').filter((line) => line.startsWith('data: '))

      for (const line of lines) {
        const data = line.slice(6)
        if (data === '[DONE]') continue

        try {
          const parsed = JSON.parse(data)
          let token = ''

          if (provider === 'openrouter') {
            token = parsed.choices?.[0]?.delta?.content || ''
          } else {
            token = parsed.candidates?.[0]?.content?.parts?.[0]?.text || ''
          }

          if (token) {
            fullContent += token
            // Forward the SSE event
            await writer.write(encoder.encode(`data: ${JSON.stringify({ token })}\n\n`))
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // Send completion event
    await writer.write(
      encoder.encode(`data: ${JSON.stringify({ done: true, content: fullContent })}\n\n`)
    )

    // Log the request with estimated token counts
    // Estimate: ~4 characters per token
    const latencyMs = Date.now() - startTime
    const estimatedCompletionTokens = Math.ceil(fullContent.length / 4)
    const estimatedPromptTokens = Math.ceil(JSON.stringify(messages).length / 4)
    await logLlmRequest(
      env,
      userId,
      projectId,
      model,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      latencyMs,
      'success',
      null
    )
  } catch (error) {
    console.error('Stream processing error:', error)
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

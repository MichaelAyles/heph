/**
 * Chat API Endpoint
 *
 * POST /api/chat - Main chat endpoint for the PHAESTUS graph
 *
 * Request:
 * {
 *   message: string
 *   sessionId?: string  // For conversation continuity
 * }
 *
 * Response:
 * {
 *   response: string
 *   route: "REJECT" | "CLARIFY" | "PROCEED" | null
 *   assessment?: CapabilityAssessment
 *   projectId?: string  // Set when project created on PROCEED
 *   sessionId: string
 * }
 */

import type { Env } from '../../env'
import { runGraph, type LLMClient, type GraphConfig } from '../../../src/services/phaestus-graph'
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

interface ChatRequest {
  message: string
  sessionId?: string
}

// =============================================================================
// LLM Client Adapter
// =============================================================================

/**
 * Create an LLM client that uses the configured provider (OpenRouter or Gemini)
 */
async function createLLMClient(env: Env): Promise<LLMClient> {
  // Get settings
  const settings = await env.DB.prepare(
    'SELECT llm_provider, default_model, openrouter_api_key, gemini_api_key FROM system_settings WHERE id = 1'
  ).first()

  const provider = (settings?.llm_provider as string) || 'openrouter'
  const model =
    env.TEXT_MODEL_SLUG ||
    (settings?.default_model as string) ||
    'google/gemini-2.0-flash-001'

  return {
    chat: async ({ messages, temperature = 0.3, projectId }) => {
      let apiKey: string
      let response: Response

      if (provider === 'openrouter') {
        apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''
        if (!apiKey) {
          throw new Error('OpenRouter API key not configured')
        }

        // Convert to OpenRouter format
        const openRouterMessages = messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        }))

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
            messages: openRouterMessages,
            temperature,
            max_tokens: 4096,
          }),
        })
      } else {
        // Gemini
        apiKey = (settings?.gemini_api_key as string) || ''
        if (!apiKey) {
          throw new Error('Gemini API key not configured')
        }

        // Convert messages to Gemini format
        const contents = convertToGeminiFormat(
          messages.map((m) => ({ role: m.role, content: m.content }))
        )

        response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature,
                maxOutputTokens: 4096,
              },
            }),
          }
        )
      }

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`LLM API error: ${error}`)
      }

      const result = (await response.json()) as Record<string, unknown>

      let content: string

      if (provider === 'openrouter') {
        const choices = result.choices as Array<{ message: { content: string } }>
        content = choices?.[0]?.message?.content || ''
      } else {
        const candidates = result.candidates as Array<{
          content: { parts: Array<{ text: string }> }
        }>
        content = candidates?.[0]?.content?.parts?.[0]?.text || ''
      }

      return { content }
    },
  }
}

// =============================================================================
// Request Handler
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)

  try {
    const body = (await context.request.json()) as ChatRequest
    const { message, sessionId } = body

    await logger.debug('api', 'Chat request received', {
      messageLength: message?.length,
      sessionId,
    })

    // Validate input
    if (!message || typeof message !== 'string') {
      return Response.json({ error: 'Message is required' }, { status: 400 })
    }

    if (message.length > 2000) {
      return Response.json({ error: 'Message too long (max 2000 characters)' }, { status: 400 })
    }

    // Create LLM client
    const llm = await createLLMClient(env)

    // Build graph config
    const config: GraphConfig = {
      db: env.DB,
      llm,
    }

    // Run the graph
    const result = await runGraph(message, config, sessionId)

    await logger.info('api', 'Chat completed', {
      route: result.route,
      projectId: result.projectId,
      sessionId: result.sessionId,
    })

    // Return response
    return Response.json({
      response: result.response,
      route: result.route,
      assessment: result.state.capabilityAssessment,
      projectId: result.projectId,
      sessionId: result.sessionId,
    })
  } catch (error) {
    await logger.error('api', 'Chat error', { error: String(error) })
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

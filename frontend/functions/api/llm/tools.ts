/**
 * LLM Tool Calling Support
 *
 * Handles Gemini/OpenRouter function calling for the orchestrator.
 * Supports both native Gemini format and OpenRouter's OpenAI-compatible format.
 */

import type { Env } from '../../env'
import { calculateCost } from './pricing'
import { createLogger } from '../../lib/logger'
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
  ToolParameter,
  ToolDefinition,
  ToolCall,
  ChatMessage,
} from '../../lib/message-types'

// Re-export types for external consumers
export type { ToolParameter, ToolDefinition, ToolCall, ChatMessage }

export interface ToolResult {
  toolCallId: string
  content: string
}

export interface ToolChatRequest {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  model?: string
  temperature?: number
  maxTokens?: number
  projectId?: string
  // Gemini-specific: enable thinking mode
  thinking?: {
    type: 'enabled' | 'disabled'
    budgetTokens?: number
  }
}

export interface ToolChatResponse {
  content: string
  model: string
  toolCalls?: ToolCall[]
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
  thinking?: string
  finishReason: 'stop' | 'tool_calls' | 'length' | 'error'
}

// =============================================================================
// GEMINI FORMAT CONVERSION
// =============================================================================

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } }

interface GeminiFunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: string
    properties: Record<string, unknown>
    required?: string[]
  }
}

function convertMessagesToGeminiFormat(messages: ChatMessage[]): GeminiContent[] {
  const result: GeminiContent[] = []
  const toolNameByCallId = new Map<string, string>()

  for (const msg of messages) {
    if (msg.role === 'system') {
      // Gemini doesn't support system role, prepend as user message with model ack
      result.unshift({ role: 'user', parts: [{ text: msg.content }] })
      result.splice(1, 0, {
        role: 'model',
        parts: [{ text: 'Understood. I will follow these instructions.' }],
      })
    } else if (msg.role === 'assistant') {
      const parts: GeminiPart[] = []

      if (msg.content) {
        parts.push({ text: msg.content })
      }

      if (msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          toolNameByCallId.set(tc.id, tc.name)
          parts.push({
            functionCall: {
              name: tc.name,
              args: tc.arguments,
            },
          })
        }
      }

      if (parts.length > 0) {
        result.push({ role: 'model', parts })
      }
    } else if (msg.role === 'tool') {
      // Tool results need to be grouped with the model's function call
      // Gemini expects function_response parts in a user message
      const functionName =
        (msg.toolCallId && toolNameByCallId.get(msg.toolCallId)) || msg.toolCallId || 'unknown'
      result.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: functionName,
              response: { result: msg.content },
            },
          },
        ],
      })
    } else {
      // User message
      result.push({ role: 'user', parts: [{ text: msg.content }] })
    }
  }

  return result
}

function convertToolsToGeminiFormat(tools: ToolDefinition[]): GeminiFunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: tool.parameters.properties,
      required: tool.parameters.required,
    },
  }))
}

function parseGeminiResponse(result: Record<string, unknown>): {
  content: string
  toolCalls?: ToolCall[]
  thinking?: string
  finishReason: string
} {
  const candidates = result.candidates as Array<{
    content: {
      parts: Array<{
        text?: string
        functionCall?: { name: string; args: Record<string, unknown> }
      }>
    }
    finishReason?: string
  }>

  if (!candidates || candidates.length === 0) {
    return { content: '', finishReason: 'error' }
  }

  const candidate = candidates[0]
  const parts = candidate.content?.parts || []

  let content = ''
  const toolCalls: ToolCall[] = []
  let thinking: string | undefined

  for (const part of parts) {
    if (part.text) {
      // Check if this is thinking content (Gemini 2.0 returns thinking in special format)
      if (part.text.startsWith('<thinking>')) {
        thinking = part.text.replace(/<\/?thinking>/g, '')
      } else {
        content += part.text
      }
    }

    if (part.functionCall) {
      toolCalls.push({
        id: `call_${Date.now()}_${toolCalls.length}`,
        name: part.functionCall.name,
        arguments: part.functionCall.args || {},
      })
    }
  }

  const finishReason =
    toolCalls.length > 0
      ? 'tool_calls'
      : candidate.finishReason === 'STOP'
        ? 'stop'
        : candidate.finishReason || 'stop'

  return {
    content,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    thinking,
    finishReason,
  }
}

// =============================================================================
// OPENROUTER FORMAT CONVERSION
// =============================================================================

interface OpenRouterMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content?: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

interface OpenRouterTool {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

function convertMessagesToOpenRouterFormat(messages: ChatMessage[]): OpenRouterMessage[] {
  return messages.map((msg) => {
    const result: OpenRouterMessage = {
      role: msg.role,
      content: msg.content || undefined,
    }

    if (msg.toolCalls) {
      result.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }))
    }

    if (msg.toolCallId) {
      result.tool_call_id = msg.toolCallId
    }

    return result
  })
}

function convertToolsToOpenRouterFormat(tools: ToolDefinition[]): OpenRouterTool[] {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: tool.parameters.properties,
        required: tool.parameters.required,
      },
    },
  }))
}

function parseOpenRouterResponse(result: Record<string, unknown>): {
  content: string
  toolCalls?: ToolCall[]
  finishReason: string
} {
  const choices = result.choices as Array<{
    message: {
      content?: string
      tool_calls?: Array<{
        id: string
        function: { name: string; arguments: string }
      }>
    }
    finish_reason?: string
  }>

  if (!choices || choices.length === 0) {
    return { content: '', finishReason: 'error' }
  }

  const choice = choices[0]
  const content = choice.message?.content || ''

  let toolCalls: ToolCall[] | undefined
  if (choice.message?.tool_calls) {
    toolCalls = choice.message.tool_calls.map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: (() => {
        try {
          return JSON.parse(tc.function.arguments || '{}')
        } catch {
          return {}
        }
      })(),
    }))
  }

  const finishReason =
    choice.finish_reason === 'tool_calls' ? 'tool_calls' : choice.finish_reason || 'stop'

  return { content, toolCalls, finishReason }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data } = context
  const user = data.user as User
  const requestId = (data.requestId as string) || crypto.randomUUID().replace(/-/g, '')
  const logger = createLogger(env, user, requestId)
  const startTime = Date.now()

  try {
    const body = (await context.request.json()) as ToolChatRequest
    const { messages, tools, thinking } = body

    await logger.debug('llm', 'Tool chat request received', {
      messageCount: messages?.length,
      toolCount: tools?.length,
      projectId: body.projectId,
      model: body.model,
      thinkingEnabled: thinking?.type === 'enabled',
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
      // Vertex AI with tool calling
      if (!env.GCP_SERVICE_ACCOUNT_JSON) {
        return Response.json({ error: 'Vertex service account not configured' }, { status: 500 })
      }
      const accessToken = await getVertexAccessToken(env.GCP_SERVICE_ACCOUNT_JSON!)
      const gcpProjectId = env.GCP_PROJECT_ID || 'phaestus-app-api'
      const region = env.GCP_REGION || 'europe-west2'
      const contents = convertMessagesToGeminiFormat(messages)

      const requestBody: Record<string, unknown> = {
        contents,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
        },
      }

      if (tools && tools.length > 0) {
        requestBody.tools = [{ functionDeclarations: convertToolsToGeminiFormat(tools) }]
      }

      if (thinking?.type === 'enabled') {
        requestBody.generationConfig = {
          ...(requestBody.generationConfig as Record<string, unknown>),
          thinkingConfig: {
            thinkingBudget: thinking.budgetTokens || 10000,
          },
        }
      }

      response = await fetch(getVertexUrl(gcpProjectId, region, model, 'generateContent'), {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      })
    } else if (provider === 'openrouter') {
      const apiKey = env.OPENROUTER_API_KEY || ''
      if (!apiKey) {
        return Response.json({ error: 'OpenRouter API key not configured' }, { status: 500 })
      }

      const requestBody: Record<string, unknown> = {
        model,
        messages: convertMessagesToOpenRouterFormat(messages),
        temperature,
        max_tokens: maxTokens,
      }

      if (tools && tools.length > 0) {
        requestBody.tools = convertToolsToOpenRouterFormat(tools)
        requestBody.tool_choice = 'auto'
      }

      response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': APP_URL,
          'X-Title': 'Phaestus Orchestrator',
        },
        body: JSON.stringify(requestBody),
      })
    } else {
      return Response.json({ error: 'Unsupported LLM provider' }, { status: 500 })
    }

    if (!response.ok) {
      const error = await response.text()
      await logger.error('llm', 'Tool chat API error', { error, model, provider })

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
        undefined,
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

    let parsed: { content: string; toolCalls?: ToolCall[]; thinking?: string; finishReason: string }
    let usage: { promptTokens: number; completionTokens: number; totalTokens: number } | undefined
    let actualCostUsd: number | undefined

    if (provider === 'openrouter') {
      parsed = parseOpenRouterResponse(result)
      const usageData = result.usage as {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
        total_cost?: number
      }
      usage = usageData
        ? {
            promptTokens: usageData.prompt_tokens,
            completionTokens: usageData.completion_tokens,
            totalTokens: usageData.total_tokens,
          }
        : undefined
      actualCostUsd = usageData?.total_cost
    } else {
      parsed = parseGeminiResponse(result)
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
      parsed.content,
      parsed.toolCalls,
      model,
      temperature,
      maxTokens,
      usage?.promptTokens || 0,
      usage?.completionTokens || 0,
      latencyMs,
      'success',
      null
    )

    await logger.llm('Tool chat completed', {
      model,
      latencyMs,
      promptTokens: usage?.promptTokens,
      completionTokens: usage?.completionTokens,
      contentLength: parsed.content.length,
      toolCallCount: parsed.toolCalls?.length || 0,
      finishReason: parsed.finishReason,
    })

    const usageResponse = usage
      ? {
          ...usage,
          prompt_tokens: usage.promptTokens,
          completion_tokens: usage.completionTokens,
          total_tokens: usage.totalTokens,
        }
      : undefined

    const responseBody: ToolChatResponse = {
      content: parsed.content,
      model,
      toolCalls: parsed.toolCalls,
      usage: usageResponse,
      thinking: parsed.thinking,
      finishReason: parsed.finishReason as ToolChatResponse['finishReason'],
    }

    return Response.json(responseBody)
  } catch (error) {
    await logger.error('llm', 'Tool chat error', { error: String(error) })
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
  toolCalls: ToolCall[] | undefined,
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
    // Include tool calls in the output for debugging
    const outputContent = toolCalls
      ? JSON.stringify({ content: messageOut, toolCalls })
      : messageOut

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
        outputContent,
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

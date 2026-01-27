/**
 * LangGraph Node Invoke API
 *
 * POST /api/langgraph/invoke/:nodeName
 *
 * Invokes a standalone LangGraph node and returns the result.
 * All executions are logged to the langgraph_executions table.
 */

import type { Env } from '../../../env'
import {
  getNode,
  hasNode,
  invokeNode,
  getAllNodeNames,
  type NodeContext,
  type NodeConfig,
  type LLMChatParams,
  type LLMChatResponse,
} from '../../../../src/services/langgraph/nodes'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
}

interface InvokeRequest {
  input: Record<string, unknown>
  threadId?: string
  projectId?: string
  config?: NodeConfig
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, data, params } = context
  const user = data.user as User | undefined

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const nodeName = params.nodeName as string

  if (!hasNode(nodeName)) {
    return Response.json(
      { error: `Node "${nodeName}" not found`, availableNodes: getAllNodeNames() },
      { status: 404 }
    )
  }

  // Parse request body
  let body: InvokeRequest
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.input || typeof body.input !== 'object') {
    return Response.json({ error: 'input is required and must be an object' }, { status: 400 })
  }

  // Verify project access if projectId provided
  if (body.projectId) {
    const project = await env.DB.prepare('SELECT user_id FROM projects WHERE id = ?')
      .bind(body.projectId)
      .first<{ user_id: string }>()

    if (!project) {
      return Response.json({ error: 'Project not found' }, { status: 404 })
    }

    if (project.user_id !== user.id && !user.isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Get system prompt override from database
  const promptRow = await env.DB.prepare(
    'SELECT system_prompt FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(nodeName)
    .first<{ system_prompt: string | null }>()

  // Create LLM chat function that proxies to our API
  const llmChat = async (params: LLMChatParams): Promise<LLMChatResponse> => {
    // Call the internal LLM API
    const llmResponse = await fetch(new URL('/api/llm/chat', context.request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.request.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        messages: params.messages,
        temperature: params.temperature,
        model: params.model,
        maxTokens: params.maxTokens,
        projectId: params.projectId || body.projectId,
      }),
    })

    if (!llmResponse.ok) {
      const error = await llmResponse.text()
      throw new Error(`LLM API error: ${error}`)
    }

    const result = await llmResponse.json<{
      content: string
      model: string
      usage?: {
        prompt_tokens: number
        completion_tokens: number
        total_tokens: number
      }
    }>()

    return result
  }

  // Build context
  const nodeContext: NodeContext = {
    projectId: body.projectId,
    userId: user.id,
    threadId: body.threadId,
    systemPromptOverride: promptRow?.system_prompt || undefined,
    llmChat,
  }

  // Get node for metadata
  const node = getNode(nodeName)!

  try {
    // Invoke the node
    const result = await invokeNode(nodeName, body.input, body.config || {}, nodeContext)

    // Log execution to database
    const executionId = result.nodeId
    await env.DB.prepare(
      `INSERT INTO langgraph_executions (
        id, node_name, thread_id, project_id, user_id,
        started_at, completed_at, duration_ms,
        input_json, output_json, error,
        model, temperature, system_prompt, user_prompt, raw_response,
        prompt_tokens, completion_tokens, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        executionId,
        nodeName,
        body.threadId || null,
        body.projectId || null,
        user.id,
        result.debug.startTime,
        result.debug.endTime,
        result.debug.durationMs,
        JSON.stringify(body.input),
        JSON.stringify(result.output),
        null,
        result.debug.model,
        result.debug.temperature,
        result.debug.systemPrompt,
        result.debug.userPrompt,
        result.debug.rawResponse,
        result.debug.promptTokens || null,
        result.debug.completionTokens || null,
        result.debug.costUsd || null
      )
      .run()

    return Response.json(result)
  } catch (error) {
    // Log failed execution
    const executionId = crypto.randomUUID()
    const errorMessage = error instanceof Error ? error.message : String(error)

    await env.DB.prepare(
      `INSERT INTO langgraph_executions (
        id, node_name, thread_id, project_id, user_id,
        started_at, completed_at, duration_ms,
        input_json, output_json, error,
        model, temperature, system_prompt, user_prompt, raw_response,
        prompt_tokens, completion_tokens, cost_usd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        executionId,
        nodeName,
        body.threadId || null,
        body.projectId || null,
        user.id,
        new Date().toISOString(),
        new Date().toISOString(),
        0,
        JSON.stringify(body.input),
        null,
        errorMessage,
        body.config?.model || node.defaultTemperature.toString(),
        body.config?.temperature ?? node.defaultTemperature,
        nodeContext.systemPromptOverride || null,
        JSON.stringify(body.input).slice(0, 1000),
        null,
        null,
        null,
        null
      )
      .run()

    console.error(`Node "${nodeName}" invocation failed:`, error)
    return Response.json({ error: errorMessage, nodeId: executionId }, { status: 500 })
  }
}

// Helper to get all node names (imported at top of file via static import)

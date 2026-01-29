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
  type LLMImageParams,
  type LLMImageResponse,
  type DynamicContext,
} from '../../../../src/services/langgraph/nodes'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin: boolean
  controlMode: string
}

// Breakpoint data returned when execution is paused in debug_it mode
interface BreakpointData {
  id: string
  nodeName: string
  nodeType: 'chat' | 'image'
  systemPromptTemplate: string // Raw template with @variables
  systemPromptExpanded: string // Expanded with actual values
  dynamicContext: DynamicContext
  fullInput: Record<string, unknown>
  invocationConfig: NodeConfig | null
  tokenEstimate: number
  projectId?: string
  threadId?: string
  expiresAt: string
}

interface InvokeRequest {
  input: Record<string, unknown>
  threadId?: string
  projectId?: string
  config?: NodeConfig
}

/**
 * Get a nested value from an object using dot notation
 * e.g., getNestedValue(obj, 'spec.feasibility.suggestedRevisions.revisedDescription')
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined) return undefined
    if (typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

/**
 * Format a value for template expansion
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(not available)'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (value.length === 0) return '(empty list)'
    // Format arrays nicely
    return value
      .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
      .join('\n')
  }
  // Objects get JSON formatted
  return JSON.stringify(value, null, 2)
}

/**
 * Expand template variables in system prompt with dynamic context
 *
 * Supported patterns:
 * - @availableBlocks - List of available hardware blocks (special formatting)
 * - @projectState - Full project state object
 * - @projectState.path.to.value - Nested property access (e.g., @projectState.spec.feasibility.suggestedRevisions.revisedDescription)
 * - @feasibility - Shortcut for @projectState.spec.feasibility
 * - @feasibility.path - Nested access from feasibility (e.g., @feasibility.suggestedRevisions.revisedDescription)
 */
function expandTemplateVariables(prompt: string, dynamicContext: DynamicContext): string {
  let expanded = prompt

  // Special formatting for @availableBlocks (as a list)
  if (expanded.includes('@availableBlocks')) {
    if (dynamicContext.availableBlocks && dynamicContext.availableBlocks.length > 0) {
      const blocksList = dynamicContext.availableBlocks
        .map(
          (b) =>
            `- ${b.name} (${b.category}): ${b.description}${b.interfaces?.length ? ` [${b.interfaces.join(', ')}]` : ''}`
        )
        .join('\n')
      expanded = expanded.replace(/@availableBlocks(?![.\w])/g, blocksList)
    } else {
      expanded = expanded.replace(/@availableBlocks(?![.\w])/g, '(No hardware blocks available)')
    }
  }

  // Expand @feasibility and @feasibility.path shortcuts
  const feasibilityPattern = /@feasibility(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(feasibilityPattern, (match, path) => {
    const feasibility = dynamicContext.projectState?.spec?.feasibility
    if (!feasibility) return '(No feasibility data available)'
    if (!path) return formatValue(feasibility)
    const value = getNestedValue(feasibility, path)
    return formatValue(value)
  })

  // Expand @projectState and @projectState.path
  const projectStatePattern = /@projectState(?:\.([a-zA-Z0-9_.]+))?/g
  expanded = expanded.replace(projectStatePattern, (match, path) => {
    if (!dynamicContext.projectState) return '(No project state available)'
    if (!path) {
      const state = dynamicContext.projectState
      return `Status: ${state.status}${state.spec ? `\nSpec: ${JSON.stringify(state.spec, null, 2)}` : ''}`
    }
    const value = getNestedValue(dynamicContext.projectState, path)
    return formatValue(value)
  })

  return expanded
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

  // Get system prompt from database (REQUIRED - no fallback to hardcoded prompts)
  const promptRow = await env.DB.prepare(
    'SELECT system_prompt FROM orchestrator_prompts WHERE node_name = ?'
  )
    .bind(nodeName)
    .first<{ system_prompt: string | null }>()

  if (!promptRow || !promptRow.system_prompt) {
    return Response.json(
      {
        error: `No prompt found in database for node "${nodeName}". Add entry to orchestrator_prompts table.`,
      },
      { status: 500 }
    )
  }

  // Check for system prompt override (used by debug test endpoint)
  const systemPromptOverrideEncoded = context.request.headers.get('X-System-Prompt-Override')
  const systemPrompt = systemPromptOverrideEncoded
    ? decodeURIComponent(systemPromptOverrideEncoded)
    : promptRow.system_prompt

  // Get node to check what context it needs
  const node = getNode(nodeName)!
  const contextTypes = node.contextTypes || []

  // Fetch dynamic context based on node requirements
  const dynamicContext: DynamicContext = {}

  // Fetch available blocks if needed
  if (contextTypes.includes('availableBlocks')) {
    const blocksResult = await env.DB.prepare(
      `SELECT slug, definition FROM pcb_blocks WHERE is_active = 1`
    ).all<{ slug: string; definition: string | null }>()

    dynamicContext.availableBlocks = (blocksResult.results || [])
      .map((row) => {
        try {
          const def = row.definition ? JSON.parse(row.definition) : null
          // Support both flat structure (def.name) and nested (def.metadata.name)
          return {
            slug: row.slug,
            name: def?.metadata?.name || def?.name || row.slug,
            category: def?.metadata?.category || def?.category || 'unknown',
            description: def?.metadata?.description || def?.description || '',
            interfaces: def?.electrical?.interfaces ? Object.keys(def.electrical.interfaces) : [],
          }
        } catch {
          return {
            slug: row.slug,
            name: row.slug,
            category: 'unknown',
            description: '',
            interfaces: [],
          }
        }
      })
      .filter((b) => b.name) // Filter out empty entries
  }

  // Fetch project state if needed
  if (contextTypes.includes('projectState') && body.projectId) {
    const projectRow = await env.DB.prepare(`SELECT status, spec FROM projects WHERE id = ?`)
      .bind(body.projectId)
      .first<{ status: string; spec: string | null }>()

    if (projectRow) {
      dynamicContext.projectState = {
        status: projectRow.status,
        spec: projectRow.spec ? JSON.parse(projectRow.spec) : undefined,
      }
    }
  }

  // Expand template variables in system prompt with dynamic context
  // This happens BEFORE breakpoint creation so debug shows the actual expanded prompt
  const expandedSystemPrompt = expandTemplateVariables(systemPrompt, dynamicContext)

  // Check for debug_it mode breakpoint
  const skipBreakpoint = context.request.headers.get('X-Skip-Debug-Breakpoint') === 'true'
  if (user.controlMode === 'debug_it' && !skipBreakpoint) {
    // Create a breakpoint record and pause execution
    const breakpointId = crypto.randomUUID()
    const inputJson = JSON.stringify(body.input, null, 2)
    const tokenEstimate = Math.ceil((expandedSystemPrompt.length + inputJson.length) / 4) // ~4 chars per token

    // Breakpoint expires in 5 minutes
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString()

    await env.DB.prepare(
      `INSERT INTO debug_breakpoints (
        id, user_id, project_id, thread_id, node_name,
        system_prompt, user_context, full_input,
        invocation_config, token_estimate, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        breakpointId,
        user.id,
        body.projectId || null,
        body.threadId || null,
        nodeName,
        expandedSystemPrompt, // Store the expanded prompt with dynamic context
        JSON.stringify(dynamicContext, null, 2), // Keep raw context for reference
        JSON.stringify(body.input),
        body.config ? JSON.stringify(body.config) : null,
        tokenEstimate,
        expiresAt
      )
      .run()

    const breakpointData: BreakpointData = {
      id: breakpointId,
      nodeName,
      nodeType: node.type,
      systemPromptTemplate: systemPrompt, // Raw template with @variables
      systemPromptExpanded: expandedSystemPrompt, // Expanded for actual LLM call
      dynamicContext,
      fullInput: body.input,
      invocationConfig: body.config || null,
      tokenEstimate,
      projectId: body.projectId,
      threadId: body.threadId,
      expiresAt,
    }

    return Response.json({ paused: true, breakpointId, breakpointData })
  }

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

  // Create LLM image function that proxies to our API
  const llmImage = async (params: LLMImageParams): Promise<LLMImageResponse> => {
    const imageResponse = await fetch(new URL('/api/llm/image', context.request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: context.request.headers.get('Cookie') || '',
      },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model,
      }),
    })

    if (!imageResponse.ok) {
      const error = await imageResponse.text()
      throw new Error(`Image API error: ${error}`)
    }

    const result = await imageResponse.json<{
      imageUrl: string
      model: string
      latencyMs?: number
    }>()

    return {
      url: result.imageUrl,
      model: result.model,
    }
  }

  // Build context
  const nodeContext: NodeContext = {
    projectId: body.projectId,
    userId: user.id,
    threadId: body.threadId,
    systemPrompt: expandedSystemPrompt, // Expanded with template variables
    dynamicContext, // Raw dynamic context (for nodes that need to process it differently)
    llmChat,
    llmImage,
  }

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

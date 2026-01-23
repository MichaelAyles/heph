/**
 * POST /api/admin/langgraph/execute
 *
 * Executes the LangGraph with SSE streaming of execution events.
 * This execution engine:
 * 1. Loads node system prompts from orchestrator_prompts table
 * 2. Calls LLM for each node execution
 * 3. Follows edges from orchestrator_edges table
 * 4. Emits events (node_enter, node_exit, edge_taken) via SSE
 * 5. Stores the execution in execution_runs table
 *
 * Request body:
 * {
 *   message: string,
 *   threadId?: string,
 *   maxNodes?: number  // Maximum nodes to execute (default 10, prevents infinite loops)
 * }
 *
 * SSE events:
 * - graph_start: { graphId, timestamp, threadId, input }
 * - node_enter: { node, timestamp, state }
 * - llm_call: { node, timestamp, model, promptTokens }
 * - node_exit: { node, timestamp, output, durationMs }
 * - edge_taken: { from, to, timestamp, conditional, condition }
 * - graph_end: { timestamp, finalState, totalDurationMs, success }
 * - error: { node?, timestamp, error }
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'
import {
  fetchGraphStructure,
  type GraphStructure,
  type OrchestratorPrompt,
  type OrchestratorEdge,
} from '../../../lib/graph-builder'
import { convertToGeminiFormat } from '../../../lib/gemini'
import { OPENROUTER_API_URL, APP_URL } from '../../../lib/config'

interface ExecuteRequest {
  message: string
  threadId?: string
  maxNodes?: number
}

interface ExecutionEvent {
  type: string
  [key: string]: unknown
}

interface LLMResponse {
  content: string
  model: string
  promptTokens?: number
  completionTokens?: number
  latencyMs: number
}

interface GraphState {
  userRequest: string
  messages: Array<{ role: string; content: string }>
  sessionId: string
  currentNode: string
  intent?: string
  response?: string
  nodeOutputs: Record<string, unknown>
  [key: string]: unknown
}

// =============================================================================
// LLM Caller
// =============================================================================

async function callLLM(
  env: Env,
  systemPrompt: string,
  userMessage: string,
  conversationHistory: Array<{ role: string; content: string }> = []
): Promise<LLMResponse> {
  const startTime = Date.now()

  // Get settings
  const settings = await env.DB.prepare(
    'SELECT llm_provider, default_model, openrouter_api_key, gemini_api_key FROM system_settings WHERE id = 1'
  ).first()

  const provider = (settings?.llm_provider as string) || 'openrouter'
  const model = env.TEXT_MODEL_SLUG || (settings?.default_model as string) || 'google/gemini-2.0-flash-001'
  const temperature = 0.7
  const maxTokens = 4096

  // Build messages array
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...conversationHistory,
    { role: 'user' as const, content: userMessage },
  ]

  let apiKey: string
  let response: Response

  if (provider === 'openrouter') {
    apiKey = (settings?.openrouter_api_key as string) || env.OPENROUTER_API_KEY || ''
    if (!apiKey) {
      throw new Error('OpenRouter API key not configured')
    }

    response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': 'Phaestus LangGraph Debugger',
      },
      body: JSON.stringify({
        model,
        messages: messages.map((m) => ({ role: m.role === 'system' ? 'system' : m.role, content: m.content })),
        temperature,
        max_tokens: maxTokens,
      }),
    })
  } else {
    // Gemini
    apiKey = (settings?.gemini_api_key as string) || ''
    if (!apiKey) {
      throw new Error('Gemini API key not configured')
    }

    const geminiMessages = messages.map((m) => ({
      role: m.role === 'system' ? 'user' : m.role === 'assistant' ? 'model' : 'user',
      content: m.content,
    }))
    const contents = convertToGeminiFormat(geminiMessages)

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
    throw new Error(`LLM API error: ${error}`)
  }

  const result = (await response.json()) as Record<string, unknown>
  const latencyMs = Date.now() - startTime

  let content: string
  let promptTokens: number | undefined
  let completionTokens: number | undefined

  if (provider === 'openrouter') {
    const choices = result.choices as Array<{ message: { content: string } }>
    content = choices?.[0]?.message?.content || ''
    const usageData = result.usage as { prompt_tokens: number; completion_tokens: number }
    promptTokens = usageData?.prompt_tokens
    completionTokens = usageData?.completion_tokens
  } else {
    const candidates = result.candidates as Array<{ content: { parts: Array<{ text: string }> } }>
    content = candidates?.[0]?.content?.parts?.[0]?.text || ''
    const usageMetadata = result.usageMetadata as { promptTokenCount: number; candidatesTokenCount: number }
    promptTokens = usageMetadata?.promptTokenCount
    completionTokens = usageMetadata?.candidatesTokenCount
  }

  return { content, model, promptTokens, completionTokens, latencyMs }
}

// =============================================================================
// Intent Detection (for start node)
// =============================================================================

function detectIntent(message: string): 'new_project' | 'load_project' | 'question' {
  const lower = message.toLowerCase()

  // Question patterns
  const questionPatterns = [/^(what|how|why|when|where|who|can you|could you|is it|are there)\b/i, /\?$/]
  if (questionPatterns.some((p) => p.test(lower))) {
    if (!/can you (build|make|create|design)/i.test(lower)) {
      return 'question'
    }
  }

  // Load patterns
  const loadPatterns = [
    /continue (working on|with)/i,
    /open (my |the )?project/i,
    /work on (my |the )?/i,
    /load (my |the )?project/i,
    /go back to/i,
  ]
  if (loadPatterns.some((p) => p.test(lower))) {
    return 'load_project'
  }

  return 'new_project'
}

// =============================================================================
// Edge Evaluation
// =============================================================================

function evaluateEdgeCondition(
  edge: OrchestratorEdge,
  state: GraphState
): boolean {
  if (!edge.condition) {
    return true // No condition = always take
  }

  try {
    const condition = JSON.parse(edge.condition) as Record<string, unknown>

    // Simple condition evaluation
    // Supports: { "intent": "new_project" } or { "score": { "gte": 85 } }
    for (const [key, expected] of Object.entries(condition)) {
      const actual = state[key] ?? state.nodeOutputs[key]

      if (typeof expected === 'object' && expected !== null) {
        // Comparison operators
        const ops = expected as Record<string, number>
        if ('gte' in ops && typeof actual === 'number' && actual < ops.gte) return false
        if ('lte' in ops && typeof actual === 'number' && actual > ops.lte) return false
        if ('gt' in ops && typeof actual === 'number' && actual <= ops.gt) return false
        if ('lt' in ops && typeof actual === 'number' && actual >= ops.lt) return false
        if ('eq' in ops && actual !== ops.eq) return false
      } else {
        // Direct equality
        if (actual !== expected) return false
      }
    }

    return true
  } catch {
    // If condition parsing fails, don't take the edge
    return false
  }
}

function findNextEdge(
  fromNode: string,
  edges: OrchestratorEdge[],
  state: GraphState
): OrchestratorEdge | null {
  // Filter edges from this node, sorted by priority (highest first)
  const outgoingEdges = edges
    .filter((e) => e.from_node === fromNode && e.is_active)
    .sort((a, b) => b.priority - a.priority)

  // Return first edge whose condition is satisfied
  for (const edge of outgoingEdges) {
    if (evaluateEdgeCondition(edge, state)) {
      return edge
    }
  }

  return null
}

// =============================================================================
// Node Execution
// =============================================================================

async function executeNode(
  nodeName: string,
  prompt: OrchestratorPrompt | undefined,
  state: GraphState,
  env: Env,
  sendEvent: (event: ExecutionEvent) => void
): Promise<{ output: Record<string, unknown>; response?: string }> {
  const nodeStartTime = Date.now()

  // Emit node_enter
  sendEvent({
    type: 'node_enter',
    node: nodeName,
    timestamp: nodeStartTime,
    state: { ...state, nodeOutputs: { ...state.nodeOutputs } },
  })

  let output: Record<string, unknown> = {}
  let response: string | undefined

  // Special handling for start node (intent detection)
  if (nodeName === 'start') {
    const intent = detectIntent(state.userRequest)
    output = { intent }
    state.intent = intent
  }
  // Special handling for __end__ node
  else if (nodeName === '__end__' || nodeName === 'end') {
    output = { completed: true }
  }
  // Execute node with LLM if it has a system prompt
  else if (prompt?.system_prompt) {
    // Build context from state
    const contextParts: string[] = [
      `User Request: ${state.userRequest}`,
    ]

    if (state.intent) {
      contextParts.push(`Detected Intent: ${state.intent}`)
    }

    // Add previous node outputs as context
    const prevOutputs = Object.entries(state.nodeOutputs)
    if (prevOutputs.length > 0) {
      contextParts.push('\nPrevious Node Outputs:')
      for (const [node, nodeOutput] of prevOutputs) {
        contextParts.push(`- ${node}: ${JSON.stringify(nodeOutput)}`)
      }
    }

    const userMessage = contextParts.join('\n')

    // Emit llm_call event
    sendEvent({
      type: 'llm_call',
      node: nodeName,
      timestamp: Date.now(),
      systemPromptPreview: prompt.system_prompt.slice(0, 200) + '...',
    })

    try {
      const llmResponse = await callLLM(env, prompt.system_prompt, userMessage)

      response = llmResponse.content
      output = {
        response: llmResponse.content,
        model: llmResponse.model,
        latencyMs: llmResponse.latencyMs,
        promptTokens: llmResponse.promptTokens,
        completionTokens: llmResponse.completionTokens,
      }

      // Try to parse JSON from response for structured output
      const jsonMatch = llmResponse.content.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0])
          output = { ...output, ...parsed }
        } catch {
          // Not valid JSON, keep raw response
        }
      }
    } catch (error) {
      output = {
        error: error instanceof Error ? error.message : 'LLM call failed',
      }
    }
  }
  // Node without prompt - just pass through
  else {
    output = { passthrough: true, nodeName }
  }

  const durationMs = Date.now() - nodeStartTime

  // Store output in state
  state.nodeOutputs[nodeName] = output
  if (response) {
    state.response = response
  }

  // Emit node_exit
  sendEvent({
    type: 'node_exit',
    node: nodeName,
    timestamp: Date.now(),
    output,
    durationMs,
  })

  return { output, response }
}

// =============================================================================
// Main Graph Executor
// =============================================================================

async function executeGraph(
  message: string,
  threadId: string,
  graphStructure: GraphStructure,
  env: Env,
  sendEvent: (event: ExecutionEvent) => void,
  maxNodes: number = 10
): Promise<{ success: boolean; response: string; finalState: GraphState }> {
  const startTime = Date.now()

  // Initialize state
  const state: GraphState = {
    userRequest: message,
    messages: [{ role: 'human', content: message }],
    sessionId: threadId,
    currentNode: '__start__',
    nodeOutputs: {},
  }

  // Fetch prompts and edges from DB
  const promptsResult = await env.DB.prepare(
    'SELECT * FROM orchestrator_prompts WHERE is_active = 1'
  ).all<OrchestratorPrompt>()
  const edgesResult = await env.DB.prepare(
    'SELECT * FROM orchestrator_edges WHERE is_active = 1 ORDER BY priority DESC'
  ).all<OrchestratorEdge>()

  const prompts = promptsResult.results || []
  const edges = edgesResult.results || []

  // Create prompt map for quick lookup
  const promptMap = new Map<string, OrchestratorPrompt>()
  for (const prompt of prompts) {
    promptMap.set(prompt.node_name, prompt)
  }

  // Emit graph_start
  sendEvent({
    type: 'graph_start',
    graphId: crypto.randomUUID(),
    timestamp: Date.now(),
    threadId,
    input: message,
    nodeCount: graphStructure.nodes.length,
    edgeCount: graphStructure.edges.length,
  })

  let nodesExecuted = 0
  let lastResponse = ''

  // Start from __start__ and follow edges
  let currentNode = '__start__'

  while (nodesExecuted < maxNodes) {
    // Find next edge
    const edge = findNextEdge(currentNode, edges, state)

    if (!edge) {
      // No outgoing edge - check if we're at end
      if (currentNode === '__end__' || currentNode === 'end') {
        break
      }
      // Dead end - try to go to __end__
      sendEvent({
        type: 'edge_taken',
        from: currentNode,
        to: '__end__',
        timestamp: Date.now(),
        conditional: false,
        condition: 'no outgoing edges',
      })
      break
    }

    // Emit edge_taken
    sendEvent({
      type: 'edge_taken',
      from: edge.from_node,
      to: edge.to_node,
      timestamp: Date.now(),
      conditional: edge.edge_type === 'conditional' || edge.edge_type === 'loop',
      condition: edge.condition || undefined,
      edgeType: edge.edge_type,
    })

    // Execute target node
    const targetNode = edge.to_node
    state.currentNode = targetNode

    if (targetNode === '__end__' || targetNode === 'end') {
      break
    }

    const prompt = promptMap.get(targetNode)
    const { response } = await executeNode(targetNode, prompt, state, env, sendEvent)

    if (response) {
      lastResponse = response
      state.messages.push({ role: 'assistant', content: response })
    }

    currentNode = targetNode
    nodesExecuted++
  }

  const totalDurationMs = Date.now() - startTime

  // Emit graph_end
  sendEvent({
    type: 'graph_end',
    timestamp: Date.now(),
    finalState: state,
    totalDurationMs,
    success: true,
    nodesExecuted,
  })

  return {
    success: true,
    response: lastResponse || state.response || 'Execution completed',
    finalState: state,
  }
}

// =============================================================================
// Request Handler
// =============================================================================

export const onRequestPost: PagesFunction<Env, '', AuthenticatedRequest> = async (context) => {
  const { user } = context.data
  const { DB } = context.env

  if (!user?.isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 })
  }

  let body: ExecuteRequest
  try {
    body = await context.request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.message?.trim()) {
    return Response.json({ error: 'Message is required' }, { status: 400 })
  }

  const threadId = body.threadId || crypto.randomUUID()
  const runId = crypto.randomUUID()
  const maxNodes = body.maxNodes || 10
  const events: ExecutionEvent[] = []

  // Fetch graph structure
  let graphStructure: GraphStructure
  try {
    graphStructure = await fetchGraphStructure(DB)
  } catch (error) {
    console.error('Failed to fetch graph structure:', error)
    return Response.json({ error: 'Failed to load graph structure' }, { status: 500 })
  }

  // Create SSE stream
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const sendEvent = (event: ExecutionEvent) => {
    events.push(event)
    const data = `data: ${JSON.stringify(event)}\n\n`
    writer.write(encoder.encode(data))
  }

  // Execute in the background
  const executePromise = (async () => {
    try {
      const result = await executeGraph(body.message, threadId, graphStructure, context.env, sendEvent, maxNodes)

      // Store execution in database
      const startedAt = (events.find((e) => e.type === 'graph_start')?.timestamp as number) || Date.now()
      const endedAt = (events.find((e) => e.type === 'graph_end')?.timestamp as number) || Date.now()
      const graphEndEvent = events.find((e) => e.type === 'graph_end') as { totalDurationMs?: number } | undefined
      const durationMs = graphEndEvent?.totalDurationMs

      await DB.prepare(
        `INSERT INTO execution_runs (id, thread_id, user_id, input, events, started_at, ended_at, duration_ms, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(runId, threadId, user?.id || null, body.message, JSON.stringify(events), startedAt, endedAt, durationMs || null, result.success ? 1 : 0)
        .run()

      // Send final metadata
      sendEvent({
        type: 'execution_complete',
        runId,
        threadId,
        timestamp: Date.now(),
      })

      await writer.close()
    } catch (error) {
      console.error('Execution error:', error)
      sendEvent({
        type: 'error',
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      // Still try to save the run
      try {
        await DB.prepare(
          `INSERT INTO execution_runs (id, thread_id, user_id, input, events, started_at, ended_at, success, error)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            runId,
            threadId,
            user?.id || null,
            body.message,
            JSON.stringify(events),
            Date.now(),
            Date.now(),
            0,
            error instanceof Error ? error.message : 'Unknown error'
          )
          .run()
      } catch {
        // Ignore DB errors during error handling
      }

      await writer.close()
    }
  })()

  // Don't await - let it run in the background
  context.waitUntil(executePromise)

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

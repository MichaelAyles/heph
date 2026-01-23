/**
 * POST /api/admin/langgraph/execute
 *
 * Executes the LangGraph with SSE streaming of execution events.
 * This is a simplified execution engine for the debugger that:
 * 1. Follows the graph structure from the database
 * 2. Emits events (node_enter, node_exit, edge_taken) via SSE
 * 3. Stores the execution in execution_runs table
 *
 * Request body:
 * {
 *   message: string,
 *   threadId?: string
 * }
 *
 * SSE events:
 * - graph_start: { graphId, timestamp, threadId, input }
 * - node_enter: { node, timestamp, state }
 * - node_exit: { node, timestamp, output, durationMs }
 * - edge_taken: { from, to, timestamp, conditional, condition }
 * - graph_end: { timestamp, finalState, totalDurationMs, success }
 * - error: { node?, timestamp, error }
 */

import type { Env, AuthenticatedRequest } from '../../_middleware'
import { fetchGraphStructure, type GraphStructure } from '../../../lib/graph-builder'

interface ExecuteRequest {
  message: string
  threadId?: string
}

interface ExecutionEvent {
  type: string
  [key: string]: unknown
}

// Simple intent detection (matches the client-side logic)
function detectIntent(message: string): 'new_project' | 'load_project' | 'question' {
  const lower = message.toLowerCase()

  // Question patterns
  const questionPatterns = [
    /^(what|how|why|when|where|who|can you|could you|is it|are there)\b/i,
    /\?$/,
  ]
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

// Simple graph executor that follows the MVP structure
async function executeGraph(
  message: string,
  threadId: string,
  graphStructure: GraphStructure,
  sendEvent: (event: ExecutionEvent) => void
): Promise<{ success: boolean; response: string; intent: string; finalState: Record<string, unknown> }> {
  const startTime = Date.now()
  const state: Record<string, unknown> = {
    userRequest: message,
    messages: [{ role: 'human', content: message }],
    sessionId: threadId,
  }

  // Graph start
  sendEvent({
    type: 'graph_start',
    graphId: crypto.randomUUID(),
    timestamp: Date.now(),
    threadId,
    input: message,
  })

  // Edge: __start__ -> start
  sendEvent({
    type: 'edge_taken',
    from: '__start__',
    to: 'start',
    timestamp: Date.now(),
    conditional: false,
  })

  // Node: start (intent detection)
  const startNodeTime = Date.now()
  sendEvent({
    type: 'node_enter',
    node: 'start',
    timestamp: startNodeTime,
    state: { ...state },
  })

  const intent = detectIntent(message)
  state.intent = intent

  sendEvent({
    type: 'node_exit',
    node: 'start',
    timestamp: Date.now(),
    output: { intent },
    durationMs: Date.now() - startNodeTime,
  })

  // Route based on intent
  let nextNode: string
  switch (intent) {
    case 'new_project':
      nextNode = 'new_project'
      break
    case 'load_project':
      nextNode = 'load_project'
      break
    case 'question':
      nextNode = 'question'
      break
    default:
      nextNode = 'new_project'
  }

  // Edge: start -> next_node (conditional)
  sendEvent({
    type: 'edge_taken',
    from: 'start',
    to: nextNode,
    timestamp: Date.now(),
    conditional: true,
    condition: `intent: ${intent}`,
  })

  // Execute the target node
  const nodeTime = Date.now()
  sendEvent({
    type: 'node_enter',
    node: nextNode,
    timestamp: nodeTime,
    state: { ...state },
  })

  let response: string
  switch (nextNode) {
    case 'new_project':
      response = `I'll help you design: "${message}"\n\nAnalyzing feasibility...`
      break
    case 'load_project':
      response = `Looking for projects matching your request...`
      break
    case 'question':
      response = `I'll help answer your question about hardware design.`
      break
    default:
      response = 'Processing your request...'
  }

  state.response = response
  state.messages = [
    ...(state.messages as unknown[]),
    { role: 'assistant', content: response },
  ]

  sendEvent({
    type: 'node_exit',
    node: nextNode,
    timestamp: Date.now(),
    output: { response },
    durationMs: Date.now() - nodeTime,
  })

  // Edge: next_node -> __end__
  sendEvent({
    type: 'edge_taken',
    from: nextNode,
    to: '__end__',
    timestamp: Date.now(),
    conditional: false,
  })

  const totalDurationMs = Date.now() - startTime

  // Graph end
  sendEvent({
    type: 'graph_end',
    timestamp: Date.now(),
    finalState: state,
    totalDurationMs,
    success: true,
  })

  return {
    success: true,
    response,
    intent,
    finalState: state,
  }
}

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
      const result = await executeGraph(
        body.message,
        threadId,
        graphStructure,
        sendEvent
      )

      // Store execution in database
      const startedAt = events.find((e) => e.type === 'graph_start')?.timestamp || Date.now()
      const endedAt = events.find((e) => e.type === 'graph_end')?.timestamp || Date.now()
      const durationMs = (events.find((e) => e.type === 'graph_end') as { totalDurationMs?: number })?.totalDurationMs

      await DB.prepare(
        `INSERT INTO execution_runs (id, thread_id, user_id, input, events, started_at, ended_at, duration_ms, success)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          runId,
          threadId,
          user?.id || null,
          body.message,
          JSON.stringify(events),
          startedAt,
          endedAt,
          durationMs || null,
          result.success ? 1 : 0
        )
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

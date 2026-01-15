/**
 * LangGraph Orchestrator Run Endpoint
 *
 * Executes the LangGraph orchestrator and streams state updates
 * back to the client using Server-Sent Events (SSE).
 */

import type { Env } from '../../env.d'
import {
  compileWithD1,
  prepareInitialState,
  stateToProjectSpec,
  type OrchestratorInput,
  type OrchestratorState,
} from '../../../src/services/orchestrator-graph'

interface User {
  id: string
  username: string
  displayName: string | null
  isAdmin?: boolean
}

interface PagesFunction<E> {
  (context: {
    request: Request
    env: E
    params: Record<string, string>
    data: Record<string, unknown>
  }): Promise<Response>
}

/**
 * POST /api/orchestrator/run
 *
 * Starts the LangGraph orchestrator and streams state updates.
 *
 * Request body:
 * {
 *   projectId: string
 *   mode: 'vibe_it' | 'fix_it' | 'design_it'
 *   description: string
 *   availableBlocks?: PcbBlock[]
 *   existingSpec?: ProjectSpec
 * }
 *
 * Response: Server-Sent Events stream
 * - event: state
 *   data: { node: string, state: OrchestratorState }
 * - event: spec
 *   data: { spec: Partial<ProjectSpec> }
 * - event: complete
 *   data: { success: true }
 * - event: error
 *   data: { error: string }
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as User | undefined

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let input: OrchestratorInput
  try {
    input = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Validate required fields
  if (!input.projectId || !input.mode || !input.description) {
    return new Response(
      JSON.stringify({ error: 'Missing required fields: projectId, mode, description' }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }
    )
  }

  // Create SSE stream
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Compile graph with D1 checkpointer
        const compiled = compileWithD1(env.DB)
        const initialState = prepareInitialState(input)

        const config = {
          configurable: {
            thread_id: input.projectId,
          },
        }

        // Stream state updates
        for await (const update of await compiled.stream(initialState, config)) {
          // Extract node name and state from update
          const entries = Object.entries(update)
          if (entries.length === 0) continue

          const [nodeName, nodeState] = entries[0]
          const state = nodeState as OrchestratorState

          // Send state update event
          const stateEvent = `event: state\ndata: ${JSON.stringify({ node: nodeName, state })}\n\n`
          controller.enqueue(encoder.encode(stateEvent))

          // Send spec update if meaningful changes
          const spec = stateToProjectSpec(state)
          if (spec.feasibility || spec.blueprints?.length || spec.finalSpec || spec.pcb || spec.enclosure || spec.firmware) {
            const specEvent = `event: spec\ndata: ${JSON.stringify({ spec })}\n\n`
            controller.enqueue(encoder.encode(specEvent))
          }
        }

        // Send completion event
        const completeEvent = `event: complete\ndata: ${JSON.stringify({ success: true })}\n\n`
        controller.enqueue(encoder.encode(completeEvent))
      } catch (error) {
        // Send error event
        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorEvent = `event: error\ndata: ${JSON.stringify({ error: errorMessage })}\n\n`
        controller.enqueue(encoder.encode(errorEvent))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * GET /api/orchestrator/run?projectId=xxx
 *
 * Resume an existing orchestrator run from checkpoint.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env, data }) => {
  const user = data.user as User | undefined

  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')

  if (!projectId) {
    return new Response(JSON.stringify({ error: 'Missing projectId parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // TODO: Implement resume from checkpoint
  // This would fetch the latest checkpoint and resume the graph
  return new Response(
    JSON.stringify({ error: 'Resume not yet implemented' }),
    {
      status: 501,
      headers: { 'Content-Type': 'application/json' },
    }
  )
}

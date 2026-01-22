/**
 * LangGraph Graph Definition
 *
 * The main PHAESTUS graph for hardware design feasibility assessment.
 * Built incrementally - starting with just the 'start' node.
 */

import { StateGraph, START, END } from '@langchain/langgraph'
import {
  PhaestusStateAnnotation,
  createInitialState,
  createMessage,
  createDebugStep,
  type PhaestusState,
} from './state'

// =============================================================================
// Graph Configuration
// =============================================================================

// D1Database type from Cloudflare Workers
type D1Database = {
  prepare: (query: string) => {
    bind: (...values: unknown[]) => {
      first: <T>() => Promise<T | null>
      all: <T>() => Promise<{ results: T[] }>
      run: () => Promise<{ success: boolean }>
    }
  }
}

export interface GraphConfig {
  /** D1 database instance */
  db?: D1Database
  /** LLM client for making chat completions */
  llm?: LLMClient
}

export interface LLMClient {
  chat: (params: {
    messages: Array<{ role: string; content: string }>
    temperature?: number
    projectId?: string
  }) => Promise<{ content: string }>
}

export interface GraphResult {
  state: PhaestusState
  response: string
  route: PhaestusState['route']
  projectId: string | null
  sessionId: string
}

// =============================================================================
// Nodes
// =============================================================================

/**
 * Start Node
 *
 * Entry point for the graph. Initializes the conversation and prepares
 * for the next step in the pipeline.
 *
 * TODO: This will eventually route to hard_rejection_check
 */
async function startNode(
  state: PhaestusState,
  _config?: { configurable?: GraphConfig }
): Promise<Partial<PhaestusState>> {
  const startTime = Date.now()

  // For now, just acknowledge receipt and prepare for next steps
  // This will be replaced with actual routing logic as we build out the graph

  const responseMessage = createMessage(
    'assistant',
    `I received your request: "${state.userRequest}". The graph is starting...

(This is a placeholder - the full pipeline is being migrated to LangGraph node by node.)`
  )

  const debugStep = createDebugStep(
    'start',
    { userRequest: state.userRequest, sessionId: state.sessionId },
    { status: 'initialized' },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Build the PHAESTUS graph
 *
 * Currently just has:
 * - START -> start -> END
 *
 * Will be expanded to include:
 * - START -> start -> hard_rejection_check -> capability_assess -> route_decision
 * - route_decision -> reject | clarify | proceed -> END
 */
export function buildGraph() {
  const graph = new StateGraph(PhaestusStateAnnotation)
    // Add nodes
    .addNode('start', startNode)

    // Add edges
    .addEdge(START, 'start')
    .addEdge('start', END)

  return graph.compile()
}

// =============================================================================
// Graph Runner
// =============================================================================

/**
 * Run the PHAESTUS graph
 *
 * @param message - User's message
 * @param config - Graph configuration (db, llm)
 * @param existingSessionId - Optional session ID for conversation continuity
 */
export async function runGraph(
  message: string,
  config: GraphConfig,
  existingSessionId?: string
): Promise<GraphResult> {
  const graph = buildGraph()

  // Create initial state using helper
  const initialState = createInitialState(message, existingSessionId)

  // Run the graph - cast to satisfy LangGraph's type expectations
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finalState = await graph.invoke(
    initialState as typeof PhaestusStateAnnotation.Update,
    { configurable: config as any }
  )

  // Finalize debug timing
  const endTime = new Date().toISOString()
  const totalDurationMs =
    new Date(endTime).getTime() - new Date(finalState.debug.startTime).getTime()

  finalState.debug.endTime = endTime
  finalState.debug.totalDurationMs = totalDurationMs

  // Extract the last assistant message as the response
  const assistantMessages = finalState.messages.filter(
    (m) => m.role === 'assistant'
  )
  const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]

  return {
    state: finalState,
    response: lastAssistantMessage?.content ?? '',
    route: finalState.route,
    projectId: finalState.projectId,
    sessionId: finalState.sessionId,
  }
}

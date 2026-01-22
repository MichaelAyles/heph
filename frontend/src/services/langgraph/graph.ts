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
  type ProjectSummary,
  type UserIntent,
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
  /** User's existing projects (for routing decisions) */
  userProjects?: ProjectSummary[]
  /** Current user ID */
  userId?: string
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
  intent: UserIntent
  matchedProject: ProjectSummary | null
  projectId: string | null
  sessionId: string
}

// =============================================================================
// Intent Detection
// =============================================================================

/**
 * Detect user intent from their message
 *
 * Uses simple pattern matching for now - can be upgraded to LLM-based later.
 */
function detectIntent(
  message: string,
  userProjects: ProjectSummary[]
): { intent: UserIntent; matchedProject: ProjectSummary | null } {
  const lowerMessage = message.toLowerCase()

  // Check if user is asking a question (not a project request)
  const questionPatterns = [
    /^(what|how|why|when|where|who|can you|could you|is it|are there)\b/i,
    /\?$/,
  ]
  if (questionPatterns.some((p) => p.test(lowerMessage))) {
    // But check if it's "can you build..." type question - that's a new project
    if (!/can you (build|make|create|design)/i.test(lowerMessage)) {
      return { intent: 'question', matchedProject: null }
    }
  }

  // Check if user wants to load an existing project
  const loadPatterns = [
    /continue (working on|with)/i,
    /open (my |the )?project/i,
    /work on (my |the )?/i,
    /load (my |the )?project/i,
    /go back to/i,
  ]

  if (loadPatterns.some((p) => p.test(lowerMessage))) {
    // Try to match a project by name
    const matched = findMatchingProject(message, userProjects)
    if (matched) {
      return { intent: 'load_project', matchedProject: matched }
    }
    // User wants to load but we couldn't match - still return load intent
    // so we can ask them to clarify
    if (userProjects.length > 0) {
      return { intent: 'load_project', matchedProject: null }
    }
  }

  // Check if message contains a project name
  const matchedByName = findMatchingProject(message, userProjects)
  if (matchedByName) {
    return { intent: 'load_project', matchedProject: matchedByName }
  }

  // Default: treat as new project request
  return { intent: 'new_project', matchedProject: null }
}

/**
 * Find a project that matches the user's message
 */
function findMatchingProject(
  message: string,
  projects: ProjectSummary[]
): ProjectSummary | null {
  const lowerMessage = message.toLowerCase()

  for (const project of projects) {
    const projectName = project.name.toLowerCase()
    // Check if project name appears in message
    if (lowerMessage.includes(projectName)) {
      return project
    }
    // Check for partial matches (words from project name)
    const words = projectName.split(/\s+/).filter((w) => w.length > 3)
    if (words.some((word) => lowerMessage.includes(word))) {
      return project
    }
  }

  return null
}

// =============================================================================
// Nodes
// =============================================================================

/**
 * Start Node
 *
 * Entry point for the graph. Detects user intent and routes accordingly:
 * - new_project: Continue to capability assessment
 * - load_project: Load existing project and go to workbench
 * - question: Answer the question
 */
async function startNode(
  state: PhaestusState,
  _config?: { configurable?: GraphConfig }
): Promise<Partial<PhaestusState>> {
  const startTime = Date.now()

  // Detect intent
  const { intent, matchedProject } = detectIntent(
    state.userRequest,
    state.userProjects
  )

  let responseMessage: ReturnType<typeof createMessage>

  switch (intent) {
    case 'load_project':
      if (matchedProject) {
        responseMessage = createMessage(
          'assistant',
          `Loading project "${matchedProject.name}"...`
        )
      } else if (state.userProjects.length > 0) {
        const projectList = state.userProjects
          .map((p) => `- ${p.name} (${p.status})`)
          .join('\n')
        responseMessage = createMessage(
          'assistant',
          `Which project would you like to work on?\n\n${projectList}`
        )
      } else {
        responseMessage = createMessage(
          'assistant',
          `You don't have any projects yet. Would you like to create one?`
        )
      }
      break

    case 'question':
      responseMessage = createMessage(
        'assistant',
        `I'll help answer your question. (Question handling not yet implemented - this will route to an LLM)`
      )
      break

    case 'new_project':
    default:
      responseMessage = createMessage(
        'assistant',
        `I'll help you design: "${state.userRequest}"\n\nAnalyzing feasibility... (Next: capability assessment node)`
      )
      break
  }

  const debugStep = createDebugStep(
    'start',
    {
      userRequest: state.userRequest,
      projectCount: state.userProjects.length,
    },
    {
      intent,
      matchedProject: matchedProject?.name ?? null,
    },
    Date.now() - startTime
  )

  return {
    intent,
    matchedProject,
    projectId: matchedProject?.id ?? null,
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
 * Current structure:
 * - START -> start -> END
 *
 * Next steps:
 * - start --[new_project]--> hard_rejection_check -> capability_assess
 * - start --[load_project]--> load_project -> workbench
 * - start --[question]--> answer_question -> END
 */
export function buildGraph() {
  const graph = new StateGraph(PhaestusStateAnnotation)
    // Add nodes
    .addNode('start', startNode)

    // Add edges (for now, always end after start)
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
 * @param config - Graph configuration (db, llm, userProjects)
 * @param existingSessionId - Optional session ID for conversation continuity
 */
export async function runGraph(
  message: string,
  config: GraphConfig,
  existingSessionId?: string
): Promise<GraphResult> {
  const graph = buildGraph()

  // Create initial state with user's projects
  const initialState = createInitialState(message, {
    sessionId: existingSessionId,
    userProjects: config.userProjects ?? [],
  })

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
    intent: finalState.intent,
    matchedProject: finalState.matchedProject,
    projectId: finalState.projectId,
    sessionId: finalState.sessionId,
  }
}

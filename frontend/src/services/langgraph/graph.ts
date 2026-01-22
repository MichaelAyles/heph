/**
 * LangGraph Graph Definition
 *
 * The main PHAESTUS graph for hardware design feasibility assessment.
 * Uses modern LangGraph patterns with conditional edges and proper typing.
 */

import {
  StateGraph,
  START,
  END,
  MemorySaver,
  type GraphNode,
} from '@langchain/langgraph'
import { AIMessage, HumanMessage } from '@langchain/core/messages'
import {
  PhaestusStateSchema,
  createDebugStep,
  createInitialDebugInfo,
  getMessageContent,
  type PhaestusState,
  type ProjectSummary,
  type UserIntent,
} from './state'

// =============================================================================
// Graph Configuration
// =============================================================================

export interface GraphConfig {
  /** Thread ID for checkpointing */
  threadId?: string
  /** User's existing projects (for routing decisions) */
  userProjects?: ProjectSummary[]
  /** Current user ID */
  userId?: string
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
 * Start Node - Entry point that detects user intent
 *
 * Determines whether the user wants to:
 * - Create a new project
 * - Load an existing project
 * - Ask a question
 */
const startNode: GraphNode<typeof PhaestusStateSchema> = async (state) => {
  const startTime = Date.now()

  // Get the user's message from the last human message
  const humanMessages = state.messages.filter((m) => m._getType() === 'human')
  const lastHumanMessage = humanMessages[humanMessages.length - 1]
  const userMessage = lastHumanMessage
    ? getMessageContent(lastHumanMessage)
    : state.userRequest

  // Detect intent
  const { intent, matchedProject } = detectIntent(
    userMessage,
    state.userProjects
  )

  const debugStep = createDebugStep(
    'start',
    {
      userMessage,
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
    userRequest: userMessage,
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * New Project Node - Handles new project creation flow
 *
 * Responds with acknowledgment and prepares for capability assessment.
 */
const newProjectNode: GraphNode<typeof PhaestusStateSchema> = async (state) => {
  const startTime = Date.now()

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `I'll help you design: "${state.userRequest}"\n\nAnalyzing feasibility...`,
  })

  const debugStep = createDebugStep(
    'new_project',
    { userRequest: state.userRequest },
    { response: 'Acknowledged new project request' },
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

/**
 * Load Project Node - Handles loading existing projects
 */
const loadProjectNode: GraphNode<typeof PhaestusStateSchema> = async (
  state
) => {
  const startTime = Date.now()

  let responseContent: string

  if (state.matchedProject) {
    responseContent = `Loading project "${state.matchedProject.name}"...`
  } else if (state.userProjects.length > 0) {
    const projectList = state.userProjects
      .map((p) => `- ${p.name} (${p.status})`)
      .join('\n')
    responseContent = `Which project would you like to work on?\n\n${projectList}`
  } else {
    responseContent = `You don't have any projects yet. Would you like to create one?`
  }

  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: responseContent,
  })

  const debugStep = createDebugStep(
    'load_project',
    { matchedProject: state.matchedProject?.name ?? null },
    { response: responseContent.substring(0, 100) },
    Date.now() - startTime
  )

  return {
    messages: [responseMessage],
    projectId: state.matchedProject?.id ?? null,
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Question Node - Handles general questions
 */
const questionNode: GraphNode<typeof PhaestusStateSchema> = async (state) => {
  const startTime = Date.now()

  // TODO: Route to LLM for Q&A
  const responseMessage = new AIMessage({
    id: crypto.randomUUID(),
    content: `I'll help answer your question. (Question handling not yet implemented - this will route to an LLM)`,
  })

  const debugStep = createDebugStep(
    'question',
    { userRequest: state.userRequest },
    { response: 'Question handling placeholder' },
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
// Routing
// =============================================================================

/**
 * Route based on detected intent
 */
function routeByIntent(
  state: PhaestusState
): 'new_project' | 'load_project' | 'question' {
  switch (state.intent) {
    case 'new_project':
      return 'new_project'
    case 'load_project':
      return 'load_project'
    case 'question':
      return 'question'
    default:
      // Default to new_project for unknown intents
      return 'new_project'
  }
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Build the PHAESTUS graph
 *
 * Current structure:
 * START -> start -> [new_project | load_project | question] -> END
 *
 * Next steps:
 * - new_project -> hard_rejection_check -> capability_assess -> [reject|clarify|proceed]
 * - load_project -> workbench
 * - question -> answer_question
 */
function buildGraph() {
  const workflow = new StateGraph(PhaestusStateSchema)
    // Add nodes
    .addNode('start', startNode)
    .addNode('new_project', newProjectNode)
    .addNode('load_project', loadProjectNode)
    .addNode('question', questionNode)

    // Entry point
    .addEdge(START, 'start')

    // Conditional routing based on intent
    .addConditionalEdges('start', routeByIntent)

    // All branches end for now
    .addEdge('new_project', END)
    .addEdge('load_project', END)
    .addEdge('question', END)

  return workflow
}

// =============================================================================
// Compiled Graph (module-level singleton)
// =============================================================================

// In-memory checkpointer for development
// TODO: Replace with D1-based checkpointer for production
const checkpointer = new MemorySaver()

// Compile once at module load
const compiledGraph = buildGraph().compile({ checkpointer })

// =============================================================================
// Graph Runner
// =============================================================================

/**
 * Run the PHAESTUS graph
 *
 * @param message - User's message
 * @param config - Graph configuration
 */
export async function runGraph(
  message: string,
  config: GraphConfig = {}
): Promise<GraphResult> {
  const sessionId = config.threadId ?? crypto.randomUUID()

  // Create input with user message
  const input = {
    messages: [
      new HumanMessage({
        id: crypto.randomUUID(),
        content: message,
      }),
    ],
    userRequest: message,
    userProjects: config.userProjects ?? [],
    sessionId,
    debug: createInitialDebugInfo(),
  }

  // Run the graph with thread ID for checkpointing
  const finalState = await compiledGraph.invoke(input, {
    configurable: {
      thread_id: sessionId,
    },
  })

  // Finalize debug timing
  const endTime = new Date().toISOString()
  const totalDurationMs =
    new Date(endTime).getTime() - new Date(finalState.debug.startTime).getTime()

  finalState.debug.endTime = endTime
  finalState.debug.totalDurationMs = totalDurationMs

  // Extract the last AI message as the response
  const aiMessages = finalState.messages.filter(
    (m) => m._getType() === 'ai'
  )
  const lastAiMessage = aiMessages[aiMessages.length - 1]
  const response = lastAiMessage ? getMessageContent(lastAiMessage) : ''

  return {
    state: finalState,
    response,
    route: finalState.route,
    intent: finalState.intent,
    matchedProject: finalState.matchedProject,
    projectId: finalState.projectId,
    sessionId: finalState.sessionId,
  }
}

// Export the compiled graph for testing/inspection
export { compiledGraph, buildGraph }

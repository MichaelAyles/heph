/**
 * PHAESTUS Orchestrator Graph
 *
 * LangGraph implementation of the hardware design orchestration workflow.
 * This graph manages the complete pipeline from description to manufacturable design.
 *
 * Graph Structure:
 * ================
 *
 * START
 *   │
 *   ▼
 * analyzeFeasibility ──rejected──► END
 *   │
 *   ▼ (has questions)
 * collectAnswers ◄────────────────┐
 *   │                             │
 *   ▼                             │
 * checkMoreQuestions ─has more────┘
 *   │
 *   ▼ (complete)
 * generateBlueprints
 *   │
 *   ▼
 * selectBlueprint ────interrupt───► (await user)
 *   │
 *   ▼
 * generateNames
 *   │
 *   ▼
 * selectName ─────────interrupt───► (await user)
 *   │
 *   ▼
 * finalizeSpec
 *   │
 *   ▼
 * suggestPcbBlocks
 *   │
 *   ▼
 * confirmPcbBlocks ───interrupt───► (await user)
 *   │
 *   ▼
 * generateEnclosure ◄─────────────┐
 *   │                             │
 *   ▼                             │
 * reviewEnclosure ────revise──────┘
 *   │
 *   ▼ (accept)
 * generateFirmware ◄──────────────┐
 *   │                             │
 *   ▼                             │
 * reviewFirmware ─────revise──────┘
 *   │
 *   ▼ (accept)
 * markComplete
 *   │
 *   ▼
 * END
 */

import { StateGraph, START, END } from '@langchain/langgraph'
import { BaseCheckpointSaver } from '@langchain/langgraph-checkpoint'
import { OrchestratorStateAnnotation, type OrchestratorState } from './state'
import {
  // Spec nodes
  analyzeFeasibility,
  collectAnswers,
  checkMoreQuestions,
  generateBlueprints,
  selectBlueprint,
  generateNames,
  selectName,
  finalizeSpec,
  // Spec routing
  routeAfterFeasibility,
  routeAfterAnswers,
  routeAfterQuestionCheck,
  routeAfterBlueprintSelect,
  routeAfterNameSelect,
  // Workspace nodes
  suggestPcbBlocks,
  confirmPcbBlocks,
  generateEnclosure,
  reviewEnclosure,
  fixEnclosure,
  generateFirmware,
  reviewFirmware,
  markComplete,
  // Workspace routing
  routeAfterPcbConfirm,
  routeAfterEnclosureReview,
  routeAfterFirmwareReview,
} from './nodes'

// =============================================================================
// GRAPH DEFINITION
// =============================================================================

// Node names as constants for type safety
const NODES = {
  analyzeFeasibility: 'analyzeFeasibility',
  collectAnswers: 'collectAnswers',
  checkMoreQuestions: 'checkMoreQuestions',
  generateBlueprints: 'generateBlueprints',
  selectBlueprint: 'selectBlueprint',
  generateNames: 'generateNames',
  selectName: 'selectName',
  finalizeSpec: 'finalizeSpec',
  suggestPcbBlocks: 'suggestPcbBlocks',
  confirmPcbBlocks: 'confirmPcbBlocks',
  generateEnclosure: 'generateEnclosure',
  reviewEnclosure: 'reviewEnclosure',
  fixEnclosure: 'fixEnclosure',
  generateFirmware: 'generateFirmware',
  reviewFirmware: 'reviewFirmware',
  markComplete: 'markComplete',
} as const

// =============================================================================
// GRAPH BUILDER
// =============================================================================

/**
 * Build the orchestrator graph.
 *
 * This creates an uncompiled graph that can be compiled with different
 * checkpointers for different execution contexts.
 */
export function buildOrchestratorGraph() {
  // Create a new StateGraph with our state annotation
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = new StateGraph(OrchestratorStateAnnotation) as any

  // =========================================================================
  // ADD SPEC PIPELINE NODES
  // =========================================================================

  graph.addNode(NODES.analyzeFeasibility, analyzeFeasibility)
  graph.addNode(NODES.collectAnswers, collectAnswers)
  graph.addNode(NODES.checkMoreQuestions, checkMoreQuestions)
  graph.addNode(NODES.generateBlueprints, generateBlueprints)
  graph.addNode(NODES.selectBlueprint, selectBlueprint)
  graph.addNode(NODES.generateNames, generateNames)
  graph.addNode(NODES.selectName, selectName)
  graph.addNode(NODES.finalizeSpec, finalizeSpec)

  // =========================================================================
  // ADD WORKSPACE NODES
  // =========================================================================

  graph.addNode(NODES.suggestPcbBlocks, suggestPcbBlocks)
  graph.addNode(NODES.confirmPcbBlocks, confirmPcbBlocks)
  graph.addNode(NODES.generateEnclosure, generateEnclosure)
  graph.addNode(NODES.reviewEnclosure, reviewEnclosure)
  graph.addNode(NODES.fixEnclosure, fixEnclosure)
  graph.addNode(NODES.generateFirmware, generateFirmware)
  graph.addNode(NODES.reviewFirmware, reviewFirmware)
  graph.addNode(NODES.markComplete, markComplete)

  // =========================================================================
  // ADD SPEC PIPELINE EDGES
  // =========================================================================

  // Start → Feasibility
  graph.addEdge(START, NODES.analyzeFeasibility)

  // Feasibility → (rejected: END | questions: collectAnswers | complete: generateBlueprints)
  graph.addConditionalEdges(NODES.analyzeFeasibility, routeAfterFeasibility, {
    __end__: END,
    collectAnswers: NODES.collectAnswers,
    generateBlueprints: NODES.generateBlueprints,
  })

  // Collect Answers → (awaiting: END | more questions: collectAnswers | check: checkMoreQuestions)
  graph.addConditionalEdges(NODES.collectAnswers, routeAfterAnswers, {
    __interrupt__: END, // LangGraph handles interrupt via END + status
    collectAnswers: NODES.collectAnswers,
    checkMoreQuestions: NODES.checkMoreQuestions,
  })

  // Check More Questions → (more: collectAnswers | complete: generateBlueprints)
  graph.addConditionalEdges(NODES.checkMoreQuestions, routeAfterQuestionCheck, {
    collectAnswers: NODES.collectAnswers,
    generateBlueprints: NODES.generateBlueprints,
  })

  // Generate Blueprints → Select Blueprint
  graph.addEdge(NODES.generateBlueprints, NODES.selectBlueprint)

  // Select Blueprint → (awaiting: END | done: generateNames)
  graph.addConditionalEdges(NODES.selectBlueprint, routeAfterBlueprintSelect, {
    __interrupt__: END,
    generateNames: NODES.generateNames,
  })

  // Generate Names → Select Name
  graph.addEdge(NODES.generateNames, NODES.selectName)

  // Select Name → (awaiting: END | done: finalizeSpec)
  graph.addConditionalEdges(NODES.selectName, routeAfterNameSelect, {
    __interrupt__: END,
    finalizeSpec: NODES.finalizeSpec,
  })

  // Finalize Spec → Suggest PCB Blocks
  graph.addEdge(NODES.finalizeSpec, NODES.suggestPcbBlocks)

  // =========================================================================
  // ADD WORKSPACE EDGES
  // =========================================================================

  // Suggest PCB Blocks → Confirm PCB Blocks
  graph.addEdge(NODES.suggestPcbBlocks, NODES.confirmPcbBlocks)

  // Confirm PCB → (awaiting: END | retry: suggestPcbBlocks | done: generateEnclosure)
  graph.addConditionalEdges(NODES.confirmPcbBlocks, routeAfterPcbConfirm, {
    __interrupt__: END,
    suggestPcbBlocks: NODES.suggestPcbBlocks,
    generateEnclosure: NODES.generateEnclosure,
  })

  // Generate Enclosure → Review Enclosure
  graph.addEdge(NODES.generateEnclosure, NODES.reviewEnclosure)

  // Review Enclosure → (accept: generateFirmware | revise: fixEnclosure | retry: reviewEnclosure)
  graph.addConditionalEdges(NODES.reviewEnclosure, routeAfterEnclosureReview, {
    generateFirmware: NODES.generateFirmware,
    fixEnclosure: NODES.fixEnclosure,
    reviewEnclosure: NODES.reviewEnclosure,
  })

  // Fix Enclosure → Review Enclosure
  graph.addEdge(NODES.fixEnclosure, NODES.reviewEnclosure)

  // Generate Firmware → Review Firmware
  graph.addEdge(NODES.generateFirmware, NODES.reviewFirmware)

  // Review Firmware → (accept: markComplete | retry: generateFirmware | review: reviewFirmware)
  graph.addConditionalEdges(NODES.reviewFirmware, routeAfterFirmwareReview, {
    markComplete: NODES.markComplete,
    generateFirmware: NODES.generateFirmware,
    reviewFirmware: NODES.reviewFirmware,
  })

  // Mark Complete → END
  graph.addEdge(NODES.markComplete, END)

  return graph
}

// =============================================================================
// COMPILED GRAPH FACTORY
// =============================================================================

/**
 * Create a compiled orchestrator graph.
 *
 * @param checkpointer - Optional checkpointer for state persistence
 * @param interruptBefore - Nodes to interrupt before (for user input)
 * @param interruptAfter - Nodes to interrupt after
 */
export function createOrchestratorGraph(options?: {
  checkpointer?: BaseCheckpointSaver
  interruptBefore?: string[]
  interruptAfter?: string[]
}) {
  const graph = buildOrchestratorGraph()

  // Default interrupt nodes for user input
  const defaultInterruptBefore = [
    NODES.collectAnswers,
    NODES.selectBlueprint,
    NODES.selectName,
    NODES.confirmPcbBlocks,
  ]

  return graph.compile({
    checkpointer: options?.checkpointer,
    interruptBefore: (options?.interruptBefore ?? defaultInterruptBefore) as never,
    interruptAfter: options?.interruptAfter as never,
  })
}

// =============================================================================
// GRAPH EXECUTION HELPERS
// =============================================================================

/**
 * Configuration for graph execution.
 */
export interface GraphExecutionConfig {
  threadId: string
  userId?: string
  checkpoint_ns?: string
}

/**
 * Create runnable config for graph execution.
 */
export function createGraphConfig(config: GraphExecutionConfig) {
  return {
    configurable: {
      thread_id: config.threadId,
      checkpoint_ns: config.checkpoint_ns ?? '',
      userId: config.userId,
    },
  }
}

/**
 * Run the orchestrator graph.
 *
 * @param graph - Compiled graph
 * @param initialState - Initial state (for new runs) or null (for resume)
 * @param config - Execution configuration
 */
export async function runOrchestratorGraph(
  graph: ReturnType<typeof createOrchestratorGraph>,
  initialState: Partial<OrchestratorState> | null,
  config: GraphExecutionConfig
): Promise<OrchestratorState> {
  const runnableConfig = createGraphConfig(config)

  if (initialState) {
    // New run
    return await graph.invoke(
      {
        ...initialState,
        status: 'running',
        startedAt: new Date().toISOString(),
      },
      runnableConfig
    )
  } else {
    // Resume from checkpoint
    const state = await graph.getState(runnableConfig)
    if (!state.values) {
      throw new Error('No checkpoint found for thread_id: ' + config.threadId)
    }
    return await graph.invoke(null, runnableConfig)
  }
}

/**
 * Stream orchestrator graph execution.
 *
 * Yields state updates as the graph executes.
 */
export async function* streamOrchestratorGraph(
  graph: ReturnType<typeof createOrchestratorGraph>,
  initialState: Partial<OrchestratorState> | null,
  config: GraphExecutionConfig
): AsyncGenerator<{
  node: string
  state: OrchestratorState
}> {
  const runnableConfig = createGraphConfig(config)

  const input = initialState
    ? {
        ...initialState,
        status: 'running' as const,
        startedAt: new Date().toISOString(),
      }
    : null

  for await (const event of await graph.stream(input, {
    ...runnableConfig,
    streamMode: 'updates',
  })) {
    // Event is { nodeName: stateUpdate }
    for (const [node, stateUpdate] of Object.entries(event)) {
      yield {
        node,
        state: stateUpdate as OrchestratorState,
      }
    }
  }
}

/**
 * Resume graph execution after user input.
 *
 * @param graph - Compiled graph
 * @param threadId - Thread ID to resume
 * @param userResponse - User's input response
 */
export async function resumeWithUserInput(
  graph: ReturnType<typeof createOrchestratorGraph>,
  threadId: string,
  userResponse: {
    nodeId: string
    selection: string | string[]
    isCustom: boolean
  }
): Promise<OrchestratorState> {
  const config = createGraphConfig({ threadId })

  // Get current state
  const currentState = await graph.getState(config)
  if (!currentState.values) {
    throw new Error('No checkpoint found for thread_id: ' + threadId)
  }

  // Update state with user response
  await graph.updateState(config, {
    userInputResponse: {
      nodeId: userResponse.nodeId,
      selection: userResponse.selection,
      isCustom: userResponse.isCustom,
      timestamp: new Date().toISOString(),
    },
    status: 'running',
  })

  // Resume execution
  return await graph.invoke(null, config)
}

/**
 * Get the current state of a graph execution.
 */
export async function getGraphState(
  graph: ReturnType<typeof createOrchestratorGraph>,
  threadId: string
): Promise<OrchestratorState | null> {
  const config = createGraphConfig({ threadId })
  const state = await graph.getState(config)
  return state.values as OrchestratorState | null
}

/**
 * Check if graph is awaiting user input.
 */
export function isAwaitingInput(state: OrchestratorState): boolean {
  return state.status === 'awaiting_input' && state.userInputRequest !== null
}

/**
 * Check if graph execution is complete.
 */
export function isComplete(state: OrchestratorState): boolean {
  return state.status === 'complete' || state.status === 'rejected'
}

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type CompiledOrchestratorGraph = ReturnType<typeof createOrchestratorGraph>

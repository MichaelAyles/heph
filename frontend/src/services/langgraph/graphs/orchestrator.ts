/**
 * Orchestrator Graph - Parent Graph
 *
 * Coordinates the 5 stage subgraphs:
 * 1. Router - Determines which stage to execute
 * 2. Spec Stage - Feasibility, refinement, blueprints, finalization
 * 3. PCB Stage - Block selection, placement, routing
 * 4. Enclosure Stage - Dimension analysis, OpenSCAD, review
 * 5. Firmware Stage - Component analysis, code generation, review
 * 6. Export Stage - Gerber merge, BOM, ZIP packaging
 */

import { StateGraph, START, END, type GraphNode, MemorySaver } from '@langchain/langgraph'
import { HumanMessage } from '@langchain/core/messages'
import {
  OrchestratorStateSchema,
  type OrchestratorState,
  type Stage,
  createDebugStep,
  createInitialDebugInfo,
  isStageComplete,
  updateStageStatus,
} from '../states/orchestrator'
import { compileSpecGraph, SPEC_NODES } from './spec'
import { compilePCBGraph, PCB_NODES } from './pcb'
import { compileEnclosureGraph, ENCLOSURE_NODES } from './enclosure'
import { compileFirmwareGraph, FIRMWARE_NODES } from './firmware'
import { compileExportGraph, EXPORT_NODES } from './export'

// =============================================================================
// Configuration
// =============================================================================

export interface OrchestratorConfig {
  /** Thread ID for checkpointing */
  threadId?: string
  /** User ID for context */
  userId?: string
  /** Starting stage (for resuming) */
  startStage?: Stage
}

export interface OrchestratorResult {
  state: OrchestratorState
  response: string
  currentStage: Stage
  projectId: string | null
  sessionId: string
  complete: boolean
}

// =============================================================================
// Compiled Subgraphs
// =============================================================================

// Compile subgraphs once
const specGraph = compileSpecGraph()
const pcbGraph = compilePCBGraph()
const enclosureGraph = compileEnclosureGraph()
const firmwareGraph = compileFirmwareGraph()
const exportGraph = compileExportGraph()

// =============================================================================
// Node Implementations
// =============================================================================

/**
 * Router Node
 *
 * Determines which stage to execute based on current state.
 * Handles stage transitions and completion checks.
 */
const routerNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()

  // Determine current stage based on completion status
  let targetStage: Stage = 'spec'

  if (isStageComplete(state, 'spec')) {
    targetStage = 'pcb'
  }
  if (isStageComplete(state, 'pcb')) {
    targetStage = 'enclosure'
  }
  if (isStageComplete(state, 'enclosure')) {
    targetStage = 'firmware'
  }
  if (isStageComplete(state, 'firmware')) {
    targetStage = 'export'
  }
  if (isStageComplete(state, 'export')) {
    targetStage = 'export' // Stay at export, we're done
  }

  const debugStep = createDebugStep(
    'router',
    { currentStage: state.currentStage, stageStatus: state.stageStatus },
    { targetStage },
    Date.now() - startTime
  )

  return {
    currentStage: targetStage,
    stageStatus: updateStageStatus(state.stageStatus, 'router', 'complete'),
    debug: {
      ...state.debug,
      steps: [debugStep],
    },
  }
}

/**
 * Spec Stage Node - Wrapper for spec subgraph
 */
const specStageNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()

  // Mark stage as in progress
  const inProgressStatus = updateStageStatus(state.stageStatus, 'spec', 'in_progress')

  // Prepare input for spec graph
  const specInput = {
    messages: state.messages,
    userRequest: state.userRequest,
    userFeedback: state.userFeedback,
    projectId: state.projectId,
    sessionId: state.sessionId,
    currentStage: 'spec' as const,
    stageStatus: inProgressStatus,
    debug: state.debug,
  }

  try {
    // Run spec subgraph
    const result = await specGraph.invoke(specInput)

    const debugStep = createDebugStep(
      'spec_stage',
      { startTime: new Date(startTime).toISOString() },
      { complete: result.specRoute === 'complete' },
      Date.now() - startTime,
      'spec'
    )

    // Determine if stage is complete
    const stageComplete = result.specRoute === 'complete'
    const newStatus = updateStageStatus(
      inProgressStatus,
      'spec',
      stageComplete ? 'complete' : 'in_progress'
    )

    return {
      messages: result.messages,
      stageStatus: newStatus,
      debug: {
        ...result.debug,
        steps: [...(result.debug?.steps || []), debugStep],
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    const debugStep = createDebugStep(
      'spec_stage',
      { error: true },
      { error: errorMessage },
      Date.now() - startTime,
      'spec'
    )

    return {
      error: errorMessage,
      stageStatus: updateStageStatus(inProgressStatus, 'spec', 'error'),
      debug: {
        ...state.debug,
        steps: [debugStep],
      },
    }
  }
}

/**
 * PCB Stage Node - Wrapper for PCB subgraph
 */
const pcbStageNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()
  const inProgressStatus = updateStageStatus(state.stageStatus, 'pcb', 'in_progress')

  const pcbInput = {
    messages: state.messages,
    userRequest: state.userRequest,
    userFeedback: state.userFeedback,
    projectId: state.projectId,
    sessionId: state.sessionId,
    currentStage: 'pcb' as const,
    stageStatus: inProgressStatus,
    debug: state.debug,
  }

  try {
    const result = await pcbGraph.invoke(pcbInput)

    const debugStep = createDebugStep(
      'pcb_stage',
      { startTime: new Date(startTime).toISOString() },
      { complete: result.pcbRoute === 'complete' },
      Date.now() - startTime,
      'pcb'
    )

    const stageComplete = result.pcbRoute === 'complete'
    const newStatus = updateStageStatus(
      inProgressStatus,
      'pcb',
      stageComplete ? 'complete' : 'in_progress'
    )

    return {
      messages: result.messages,
      stageStatus: newStatus,
      debug: {
        ...result.debug,
        steps: [...(result.debug?.steps || []), debugStep],
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      error: errorMessage,
      stageStatus: updateStageStatus(inProgressStatus, 'pcb', 'error'),
    }
  }
}

/**
 * Enclosure Stage Node - Wrapper for enclosure subgraph
 */
const enclosureStageNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()
  const inProgressStatus = updateStageStatus(state.stageStatus, 'enclosure', 'in_progress')

  const enclosureInput = {
    messages: state.messages,
    userRequest: state.userRequest,
    userFeedback: state.userFeedback,
    projectId: state.projectId,
    sessionId: state.sessionId,
    currentStage: 'enclosure' as const,
    stageStatus: inProgressStatus,
    debug: state.debug,
  }

  try {
    const result = await enclosureGraph.invoke(enclosureInput)

    const debugStep = createDebugStep(
      'enclosure_stage',
      { startTime: new Date(startTime).toISOString() },
      { complete: result.enclosureRoute === 'complete' },
      Date.now() - startTime,
      'enclosure'
    )

    const stageComplete = result.enclosureRoute === 'complete'
    const newStatus = updateStageStatus(
      inProgressStatus,
      'enclosure',
      stageComplete ? 'complete' : 'in_progress'
    )

    return {
      messages: result.messages,
      stageStatus: newStatus,
      debug: {
        ...result.debug,
        steps: [...(result.debug?.steps || []), debugStep],
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      error: errorMessage,
      stageStatus: updateStageStatus(inProgressStatus, 'enclosure', 'error'),
    }
  }
}

/**
 * Firmware Stage Node - Wrapper for firmware subgraph
 */
const firmwareStageNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()
  const inProgressStatus = updateStageStatus(state.stageStatus, 'firmware', 'in_progress')

  const firmwareInput = {
    messages: state.messages,
    userRequest: state.userRequest,
    userFeedback: state.userFeedback,
    projectId: state.projectId,
    sessionId: state.sessionId,
    currentStage: 'firmware' as const,
    stageStatus: inProgressStatus,
    debug: state.debug,
  }

  try {
    const result = await firmwareGraph.invoke(firmwareInput)

    const debugStep = createDebugStep(
      'firmware_stage',
      { startTime: new Date(startTime).toISOString() },
      { complete: result.firmwareRoute === 'complete' },
      Date.now() - startTime,
      'firmware'
    )

    const stageComplete = result.firmwareRoute === 'complete'
    const newStatus = updateStageStatus(
      inProgressStatus,
      'firmware',
      stageComplete ? 'complete' : 'in_progress'
    )

    return {
      messages: result.messages,
      stageStatus: newStatus,
      debug: {
        ...result.debug,
        steps: [...(result.debug?.steps || []), debugStep],
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      error: errorMessage,
      stageStatus: updateStageStatus(inProgressStatus, 'firmware', 'error'),
    }
  }
}

/**
 * Export Stage Node - Wrapper for export subgraph
 */
const exportStageNode: GraphNode<typeof OrchestratorStateSchema> = async (state) => {
  const startTime = Date.now()
  const inProgressStatus = updateStageStatus(state.stageStatus, 'export', 'in_progress')

  const exportInput = {
    messages: state.messages,
    userRequest: state.userRequest,
    userFeedback: state.userFeedback,
    projectId: state.projectId,
    sessionId: state.sessionId,
    currentStage: 'export' as const,
    stageStatus: inProgressStatus,
    debug: state.debug,
  }

  try {
    const result = await exportGraph.invoke(exportInput)

    const debugStep = createDebugStep(
      'export_stage',
      { startTime: new Date(startTime).toISOString() },
      { complete: result.exportRoute === 'complete' },
      Date.now() - startTime,
      'export'
    )

    const stageComplete = result.exportRoute === 'complete'
    const newStatus = updateStageStatus(
      inProgressStatus,
      'export',
      stageComplete ? 'complete' : 'in_progress'
    )

    return {
      messages: result.messages,
      stageStatus: newStatus,
      debug: {
        ...result.debug,
        steps: [...(result.debug?.steps || []), debugStep],
      },
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return {
      error: errorMessage,
      stageStatus: updateStageStatus(inProgressStatus, 'export', 'error'),
    }
  }
}

// =============================================================================
// Routing Functions
// =============================================================================

/**
 * Route from router to appropriate stage
 */
function routeFromRouter(state: OrchestratorState): string {
  // Check for errors
  if (state.error) {
    return END
  }

  // Route based on current stage
  switch (state.currentStage) {
    case 'spec':
      return 'spec_stage'
    case 'pcb':
      return 'pcb_stage'
    case 'enclosure':
      return 'enclosure_stage'
    case 'firmware':
      return 'firmware_stage'
    case 'export':
      return 'export_stage'
    default:
      return 'spec_stage'
  }
}

/**
 * Route after each stage
 * Returns to router if stage needs more work, END if waiting for user input
 */
function routeAfterStage(state: OrchestratorState): string {
  // Check for errors
  if (state.error) {
    return END
  }

  // Check if all stages complete
  if (isStageComplete(state, 'export')) {
    return END
  }

  // Return to router for next stage
  return 'router'
}

// =============================================================================
// Graph Builder
// =============================================================================

/**
 * Build the orchestrator graph
 */
function buildOrchestratorGraph() {
  const graph = new StateGraph(OrchestratorStateSchema)
    // Add nodes
    .addNode('router', routerNode)
    .addNode('spec_stage', specStageNode)
    .addNode('pcb_stage', pcbStageNode)
    .addNode('enclosure_stage', enclosureStageNode)
    .addNode('firmware_stage', firmwareStageNode)
    .addNode('export_stage', exportStageNode)

    // Entry point
    .addEdge(START, 'router')

    // Router routes to stages
    .addConditionalEdges('router', routeFromRouter, {
      spec_stage: 'spec_stage',
      pcb_stage: 'pcb_stage',
      enclosure_stage: 'enclosure_stage',
      firmware_stage: 'firmware_stage',
      export_stage: 'export_stage',
      [END]: END,
    })

    // Stages route back to router or END
    .addConditionalEdges('spec_stage', routeAfterStage, {
      router: 'router',
      [END]: END,
    })
    .addConditionalEdges('pcb_stage', routeAfterStage, {
      router: 'router',
      [END]: END,
    })
    .addConditionalEdges('enclosure_stage', routeAfterStage, {
      router: 'router',
      [END]: END,
    })
    .addConditionalEdges('firmware_stage', routeAfterStage, {
      router: 'router',
      [END]: END,
    })
    .addConditionalEdges('export_stage', routeAfterStage, {
      router: 'router',
      [END]: END,
    })

  return graph
}

// =============================================================================
// Compiled Graph (module-level singleton)
// =============================================================================

// In-memory checkpointer for development
// TODO: Replace with D1-based checkpointer
const checkpointer = new MemorySaver()

// Compile once at module load
const compiledOrchestratorGraph = buildOrchestratorGraph().compile({ checkpointer })

// =============================================================================
// Graph Runner
// =============================================================================

/**
 * Run the orchestrator graph
 */
export async function runOrchestratorGraph(
  message: string,
  config: OrchestratorConfig = {}
): Promise<OrchestratorResult> {
  const sessionId = config.threadId ?? crypto.randomUUID()

  // Create input state
  const input = {
    messages: [
      new HumanMessage({
        id: crypto.randomUUID(),
        content: message,
      }),
    ],
    userRequest: message,
    sessionId,
    currentStage: config.startStage ?? 'router',
    debug: createInitialDebugInfo(),
  }

  // Run the graph
  const finalState = await compiledOrchestratorGraph.invoke(input, {
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

  // Extract the last AI message as response
  const aiMessages = finalState.messages.filter((m) => m._getType() === 'ai')
  const lastAiMessage = aiMessages[aiMessages.length - 1]
  const response = lastAiMessage
    ? typeof lastAiMessage.content === 'string'
      ? lastAiMessage.content
      : ''
    : ''

  // Check if pipeline is complete
  const complete = isStageComplete(finalState, 'export')

  return {
    state: finalState,
    response,
    currentStage: finalState.currentStage,
    projectId: finalState.projectId,
    sessionId: finalState.sessionId,
    complete,
  }
}

// Export for external use
export { buildOrchestratorGraph, compiledOrchestratorGraph }

// Export all node names for visualization
export const ALL_NODES = {
  orchestrator: [
    'router',
    'spec_stage',
    'pcb_stage',
    'enclosure_stage',
    'firmware_stage',
    'export_stage',
  ],
  spec: SPEC_NODES,
  pcb: PCB_NODES,
  enclosure: ENCLOSURE_NODES,
  firmware: FIRMWARE_NODES,
  export: EXPORT_NODES,
} as const

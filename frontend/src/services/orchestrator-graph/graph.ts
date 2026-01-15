/**
 * LangGraph Orchestrator Graph
 *
 * Assembles all nodes into a StateGraph with conditional routing.
 * This is the main entry point for the LangGraph-based orchestrator.
 */

import { StateGraph, START, END } from '@langchain/langgraph'
import { MemorySaver } from '@langchain/langgraph-checkpoint'
import {
  OrchestratorStateAnnotation,
  type OrchestratorState,
  type OrchestratorMode,
  projectSpecToState,
} from './state'
import { D1Checkpointer, type D1Database } from './checkpointer'
import type { ProjectSpec, PcbBlock } from '../../db/schema'

// Import all nodes
import {
  analyzeFeasibilityNode,
  isFeasibilityRejected,
  hasOpenQuestions,
  answerQuestionsAutoNode,
  generateBlueprintsNode,
  selectBlueprintAutoNode,
  generateNamesNode,
  selectNameAutoNode,
  finalizeSpecNode,
} from './nodes/spec'

import { selectBlocksNode, validatePcbNode } from './nodes/pcb'

import {
  generateEnclosureNode,
  reviewEnclosureNode,
  decideEnclosureNode,
  acceptEnclosureNode,
} from './nodes/enclosure'

import {
  generateFirmwareNode,
  reviewFirmwareNode,
  decideFirmwareNode,
  acceptFirmwareNode,
} from './nodes/firmware'

import {
  markSpecComplete,
  markPcbComplete,
  markEnclosureComplete,
  markFirmwareComplete,
  markExportComplete,
  isComplete,
} from './nodes/shared'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStateGraph = StateGraph<any, any, any, any, any, any, any>

// =============================================================================
// GRAPH BUILDER
// =============================================================================

/**
 * Create the orchestrator graph.
 *
 * Graph topology:
 * START → analyzeFeasibility → [rejected?] → END
 *                            ↓
 *       answerQuestions → generateBlueprints → selectBlueprint →
 *       generateNames → selectName → finalizeSpec → markSpecComplete
 *                            ↓
 *       selectBlocks → validatePcb → markPcbComplete
 *                            ↓
 *       [ENCLOSURE LOOP] generate → review → decide → [accept | retry]
 *                            ↓
 *       [FIRMWARE LOOP] generate → review → decide → [accept | retry]
 *                            ↓
 *       markExportComplete → END
 */
export function createOrchestratorGraph() {
  // Use type assertion to allow flexible node addition
  // LangGraph's strict typing is too restrictive for our dynamic graph construction
  const graph = new StateGraph(OrchestratorStateAnnotation) as AnyStateGraph

  // =========================================================================
  // SPEC STAGE NODES
  // =========================================================================

  graph.addNode('analyzeFeasibility', analyzeFeasibilityNode)
  graph.addNode('answerQuestions', answerQuestionsAutoNode)
  graph.addNode('generateBlueprints', generateBlueprintsNode)
  graph.addNode('selectBlueprint', selectBlueprintAutoNode)
  graph.addNode('generateNames', generateNamesNode)
  graph.addNode('selectName', selectNameAutoNode)
  graph.addNode('finalizeSpec', async (state: OrchestratorState) => finalizeSpecNode(state, true))
  graph.addNode('markSpecComplete', markSpecComplete)

  // =========================================================================
  // PCB STAGE NODES
  // =========================================================================

  graph.addNode('selectBlocks', async (state: OrchestratorState) => selectBlocksNode(state))
  graph.addNode('validatePcb', validatePcbNode)
  graph.addNode('markPcbComplete', markPcbComplete)

  // =========================================================================
  // ENCLOSURE STAGE NODES
  // =========================================================================

  graph.addNode('generateEnclosure', async (state: OrchestratorState) => {
    // Check if there's feedback from previous decide node
    const feedback = (state as OrchestratorState & { _enclosureFeedback?: string })._enclosureFeedback
    return generateEnclosureNode(state, undefined, undefined, undefined, feedback)
  })
  graph.addNode('reviewEnclosure', reviewEnclosureNode)
  // decideEnclosure uses Command API - declare possible destinations
  graph.addNode('decideEnclosure', decideEnclosureNode, {
    ends: ['acceptEnclosure', 'generateEnclosure', 'reviewEnclosure', 'requestUserInput'],
  })
  graph.addNode('acceptEnclosure', acceptEnclosureNode)
  graph.addNode('markEnclosureComplete', markEnclosureComplete)
  graph.addNode('requestUserInput', async () => ({ history: [] })) // Placeholder for user input

  // =========================================================================
  // FIRMWARE STAGE NODES
  // =========================================================================

  graph.addNode('generateFirmware', async (state: OrchestratorState) => {
    // Check if there's feedback from previous decide node
    const feedback = (state as OrchestratorState & { _firmwareFeedback?: string })._firmwareFeedback
    return generateFirmwareNode(state, undefined, undefined, undefined, undefined, feedback)
  })
  graph.addNode('reviewFirmware', reviewFirmwareNode)
  // decideFirmware uses Command API - declare possible destinations
  graph.addNode('decideFirmware', decideFirmwareNode, {
    ends: ['acceptFirmware', 'generateFirmware', 'reviewFirmware', 'requestUserInput'],
  })
  graph.addNode('acceptFirmware', acceptFirmwareNode)
  graph.addNode('markFirmwareComplete', markFirmwareComplete)

  // =========================================================================
  // EXPORT STAGE NODE
  // =========================================================================

  graph.addNode('markExportComplete', markExportComplete)

  // =========================================================================
  // EDGES - SPEC STAGE
  // =========================================================================

  // Entry point
  graph.addEdge(START, 'analyzeFeasibility')

  // After feasibility: check if rejected or needs questions
  graph.addConditionalEdges(
    'analyzeFeasibility',
    (state: OrchestratorState) => {
      if (isFeasibilityRejected(state)) return 'rejected'
      if (hasOpenQuestions(state)) return 'hasQuestions'
      return 'noQuestions'
    },
    {
      rejected: END,
      hasQuestions: 'answerQuestions',
      noQuestions: 'generateBlueprints',
    }
  )

  // After answering questions: generate blueprints
  graph.addEdge('answerQuestions', 'generateBlueprints')

  // Blueprint flow
  graph.addEdge('generateBlueprints', 'selectBlueprint')
  graph.addEdge('selectBlueprint', 'generateNames')
  graph.addEdge('generateNames', 'selectName')
  graph.addEdge('selectName', 'finalizeSpec')
  graph.addEdge('finalizeSpec', 'markSpecComplete')

  // =========================================================================
  // EDGES - PCB STAGE
  // =========================================================================

  graph.addEdge('markSpecComplete', 'selectBlocks')
  graph.addEdge('selectBlocks', 'validatePcb')
  graph.addEdge('validatePcb', 'markPcbComplete')

  // =========================================================================
  // EDGES - ENCLOSURE STAGE
  // =========================================================================

  graph.addEdge('markPcbComplete', 'generateEnclosure')
  graph.addEdge('generateEnclosure', 'reviewEnclosure')
  graph.addEdge('reviewEnclosure', 'decideEnclosure')

  // decideEnclosure uses Command API for routing (goto)
  // But we need to add edges for the possible destinations
  graph.addEdge('acceptEnclosure', 'markEnclosureComplete')

  // =========================================================================
  // EDGES - FIRMWARE STAGE
  // =========================================================================

  graph.addEdge('markEnclosureComplete', 'generateFirmware')
  graph.addEdge('generateFirmware', 'reviewFirmware')
  graph.addEdge('reviewFirmware', 'decideFirmware')

  // decideFirmware uses Command API for routing (goto)
  graph.addEdge('acceptFirmware', 'markFirmwareComplete')

  // =========================================================================
  // EDGES - EXPORT STAGE
  // =========================================================================

  graph.addEdge('markFirmwareComplete', 'markExportComplete')

  // Final completion check
  graph.addConditionalEdges(
    'markExportComplete',
    (state: OrchestratorState) => {
      return isComplete(state) ? 'done' : 'continue'
    },
    {
      done: END,
      continue: END, // All stages complete, end anyway
    }
  )

  return graph
}

// =============================================================================
// GRAPH COMPILATION
// =============================================================================

/**
 * Compile the graph with an in-memory checkpointer (for testing/development).
 */
export function compileWithMemory() {
  const graph = createOrchestratorGraph()
  const checkpointer = new MemorySaver()
  return graph.compile({ checkpointer })
}

/**
 * Compile the graph with a D1 checkpointer (for production).
 */
export function compileWithD1(db: D1Database) {
  const graph = createOrchestratorGraph()
  const checkpointer = new D1Checkpointer(db)
  return graph.compile({ checkpointer })
}

// =============================================================================
// RUNNER HELPERS
// =============================================================================

/**
 * Initial input for starting orchestration.
 */
export interface OrchestratorInput {
  projectId: string
  mode: OrchestratorMode
  description: string
  availableBlocks: PcbBlock[]
  existingSpec?: ProjectSpec
}

/**
 * Prepare initial state from input.
 */
export function prepareInitialState(input: OrchestratorInput): Partial<OrchestratorState> {
  const { projectId, mode, description, availableBlocks, existingSpec } = input

  if (existingSpec) {
    // Resume from existing spec
    return projectSpecToState(projectId, mode, existingSpec, availableBlocks)
  }

  // Fresh start
  return {
    projectId,
    mode,
    description,
    availableBlocks,
    currentStage: 'spec',
    startedAt: new Date().toISOString(),
  }
}

/**
 * Run the orchestrator graph.
 *
 * @param input - Initial input
 * @param db - Optional D1 database for persistence
 * @returns Async generator of state updates
 */
export async function* runOrchestrator(
  input: OrchestratorInput,
  db?: D1Database
) {
  const compiled = db ? compileWithD1(db) : compileWithMemory()
  const initialState = prepareInitialState(input)

  const config = {
    configurable: {
      thread_id: input.projectId,
    },
  }

  // Stream state updates
  for await (const update of await compiled.stream(initialState, config)) {
    yield update
  }
}

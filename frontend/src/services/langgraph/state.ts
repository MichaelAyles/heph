/**
 * LangGraph State Annotation
 *
 * Defines the state schema for the PHAESTUS hardware design orchestrator.
 * This state flows through all nodes in the graph and captures the complete
 * context needed for hardware design decisions.
 */

import { Annotation } from '@langchain/langgraph'
import type {
  ProjectSpec,
  FeasibilityAnalysis,
  Decision,
  Blueprint,
  FinalSpec,
  PlacedBlock,
  FirmwareFile,
  PcbBlock,
  EnclosureArtifacts,
} from '../../db/schema'

// =============================================================================
// CORE TYPES
// =============================================================================

export type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'
export type WorkflowStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

export type GraphStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'awaiting_input'
  | 'complete'
  | 'error'
  | 'rejected'

/**
 * Review result from enclosure/firmware review nodes
 */
export interface ReviewResult {
  score: number
  issues: string[]
  verdict: 'accept' | 'revise' | 'reject'
  suggestions: string[]
}

/**
 * User input request for interrupt points
 */
export interface UserInputRequest {
  nodeId: string
  prompt: string
  options?: string[]
  multiSelect?: boolean
  allowCustom?: boolean
}

/**
 * Collected user response
 */
export interface UserInputResponse {
  nodeId: string
  selection: string | string[]
  isCustom: boolean
  timestamp: string
}

/**
 * History item for audit trail
 */
export interface GraphHistoryItem {
  id: string
  timestamp: string
  nodeId: string
  type: 'node_enter' | 'node_exit' | 'llm_call' | 'tool_call' | 'user_input' | 'error'
  data?: Record<string, unknown>
}

// =============================================================================
// CHANNEL REDUCERS
// =============================================================================

/**
 * Reducer that appends to array (for history, decisions, etc.)
 */
function appendReducer<T>(existing: T[], update: T | T[]): T[] {
  if (Array.isArray(update)) {
    return [...existing, ...update]
  }
  return [...existing, update]
}

/**
 * Reducer that replaces value (default behavior)
 */
function replaceReducer<T>(_existing: T, update: T): T {
  return update
}

/**
 * Reducer for messages that handles deduplication
 */
function messagesReducer(
  existing: GraphHistoryItem[],
  update: GraphHistoryItem | GraphHistoryItem[]
): GraphHistoryItem[] {
  const items = Array.isArray(update) ? update : [update]
  const existingIds = new Set(existing.map((h) => h.id))
  const newItems = items.filter((item) => !existingIds.has(item.id))
  return [...existing, ...newItems]
}

// =============================================================================
// STATE ANNOTATION
// =============================================================================

/**
 * Complete state annotation for the PHAESTUS orchestrator graph.
 *
 * Channels are organized by workflow stage:
 * - Project context (unchanging during execution)
 * - Spec pipeline (feasibility → refinement → blueprints → finalization)
 * - Workspace stages (PCB → enclosure → firmware → export)
 * - Control state (status, errors, user input)
 */
export const OrchestratorStateAnnotation = Annotation.Root({
  // =========================================================================
  // PROJECT CONTEXT (set at initialization)
  // =========================================================================

  /** Project ID from database */
  projectId: Annotation<string>({
    reducer: replaceReducer,
    default: () => '',
  }),

  /** User's control mode preference */
  mode: Annotation<OrchestratorMode>({
    reducer: replaceReducer,
    default: () => 'fix_it',
  }),

  /** User ID for auth/ownership */
  userId: Annotation<string>({
    reducer: replaceReducer,
    default: () => '',
  }),

  /** Available PCB blocks from database */
  availableBlocks: Annotation<PcbBlock[]>({
    reducer: replaceReducer,
    default: () => [],
  }),

  // =========================================================================
  // SPEC PIPELINE
  // =========================================================================

  /** Original user description (max 2000 chars) */
  description: Annotation<string>({
    reducer: replaceReducer,
    default: () => '',
  }),

  /** Feasibility analysis result from step 0 */
  feasibility: Annotation<FeasibilityAnalysis | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Open questions from feasibility or refinement */
  openQuestions: Annotation<
    Array<{
      id: string
      question: string
      options: string[]
      explanation?: string
    }>
  >({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** User decisions from refinement Q&A (appends) */
  decisions: Annotation<Decision[]>({
    reducer: appendReducer,
    default: () => [],
  }),

  /** Current refinement round (1-5) */
  refinementRound: Annotation<number>({
    reducer: replaceReducer,
    default: () => 0,
  }),

  /** Generated blueprint images (8 variations) */
  blueprints: Annotation<Blueprint[]>({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** Index of selected blueprint (0-7) */
  selectedBlueprint: Annotation<number | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Generated project name options */
  generatedNames: Annotation<
    Array<{
      name: string
      style: string
      reasoning: string
    }>
  >({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** Selected project name */
  selectedName: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Final locked specification */
  finalSpec: Annotation<FinalSpec | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  // =========================================================================
  // PCB STAGE
  // =========================================================================

  /** AI-suggested block placements */
  suggestedBlocks: Annotation<
    Array<{
      slug: string
      x: number
      y: number
      reasoning?: string
    }>
  >({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** User-confirmed placed blocks */
  placedBlocks: Annotation<PlacedBlock[]>({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** Grid dimensions for PCB layout */
  gridSize: Annotation<{ width: number; height: number } | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Merged KiCad schematic data */
  schematicData: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Merged KiCad PCB data */
  pcbData: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  // =========================================================================
  // ENCLOSURE STAGE
  // =========================================================================

  /** Generated OpenSCAD code */
  enclosureCode: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Enclosure review result */
  enclosureReview: Annotation<ReviewResult | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Enclosure generation iterations */
  enclosureIterations: Annotation<EnclosureArtifacts['iterations']>({
    reducer: appendReducer,
    default: () => [],
  }),

  /** STL file URL after render */
  stlUrl: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  // =========================================================================
  // FIRMWARE STAGE
  // =========================================================================

  /** Generated firmware files */
  firmwareFiles: Annotation<FirmwareFile[]>({
    reducer: replaceReducer,
    default: () => [],
  }),

  /** Firmware review result */
  firmwareReview: Annotation<ReviewResult | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Firmware iteration count */
  firmwareIterations: Annotation<number>({
    reducer: replaceReducer,
    default: () => 0,
  }),

  // =========================================================================
  // CONTROL STATE
  // =========================================================================

  /** Current workflow stage */
  currentStage: Annotation<WorkflowStage>({
    reducer: replaceReducer,
    default: () => 'spec',
  }),

  /** Current node being executed */
  currentNode: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Graph execution status */
  status: Annotation<GraphStatus>({
    reducer: replaceReducer,
    default: () => 'idle',
  }),

  /** Error message if status is 'error' */
  error: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Pending user input request (for interrupts) */
  userInputRequest: Annotation<UserInputRequest | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Collected user input response */
  userInputResponse: Annotation<UserInputResponse | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Execution history (audit trail) */
  history: Annotation<GraphHistoryItem[]>({
    reducer: messagesReducer,
    default: () => [],
  }),

  /** Current iteration count */
  iterationCount: Annotation<number>({
    reducer: replaceReducer,
    default: () => 0,
  }),

  /** Timestamp when execution started */
  startedAt: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),

  /** Timestamp when execution completed */
  completedAt: Annotation<string | null>({
    reducer: replaceReducer,
    default: () => null,
  }),
})

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * Inferred state type from the annotation
 */
export type OrchestratorState = typeof OrchestratorStateAnnotation.State

/**
 * Update type for partial state updates
 */
export type OrchestratorStateUpdate = Partial<OrchestratorState>

// =============================================================================
// STATE UTILITIES
// =============================================================================

/**
 * Create initial state from a project spec
 */
export function createInitialState(
  projectId: string,
  userId: string,
  mode: OrchestratorMode,
  spec: ProjectSpec | null,
  availableBlocks: PcbBlock[]
): OrchestratorState {
  return {
    // Project context
    projectId,
    userId,
    mode,
    availableBlocks,

    // Spec pipeline - restore from existing spec if available
    description: spec?.description ?? '',
    feasibility: spec?.feasibility ?? null,
    openQuestions: spec?.openQuestions ?? [],
    decisions: spec?.decisions ?? [],
    refinementRound: 0,
    blueprints: spec?.blueprints ?? [],
    selectedBlueprint: spec?.selectedBlueprint ?? null,
    generatedNames: [],
    selectedName: spec?.finalSpec?.name ?? null,
    finalSpec: spec?.finalSpec ?? null,

    // PCB stage
    suggestedBlocks: [],
    placedBlocks: spec?.pcb?.placedBlocks ?? [],
    gridSize: spec?.pcb?.boardSize
      ? { width: spec.pcb.boardSize.width, height: spec.pcb.boardSize.height }
      : null,
    schematicData: spec?.pcb?.schematicData ?? null,
    pcbData: spec?.pcb?.pcbData ?? null,

    // Enclosure stage
    enclosureCode: spec?.enclosure?.openScadCode ?? null,
    enclosureReview: null,
    enclosureIterations: spec?.enclosure?.iterations ?? [],
    stlUrl: spec?.enclosure?.stlUrl ?? null,

    // Firmware stage
    firmwareFiles: spec?.firmware?.files ?? [],
    firmwareReview: null,
    firmwareIterations: 0,

    // Control state
    currentStage: determineCurrentStage(spec),
    currentNode: null,
    status: 'idle',
    error: null,
    userInputRequest: null,
    userInputResponse: null,
    history: [],
    iterationCount: 0,
    startedAt: null,
    completedAt: null,
  }
}

/**
 * Determine current stage from project spec
 */
function determineCurrentStage(spec: ProjectSpec | null): WorkflowStage {
  if (!spec) return 'spec'
  if (!spec.finalSpec) return 'spec'
  if (!spec.pcb?.placedBlocks?.length) return 'pcb'
  if (!spec.enclosure?.stlUrl) return 'enclosure'
  if (!spec.firmware?.files?.length) return 'firmware'
  return 'export'
}

/**
 * Convert graph state back to ProjectSpec for persistence
 */
export function stateToProjectSpec(state: OrchestratorState): Partial<ProjectSpec> {
  return {
    description: state.description,
    feasibility: state.feasibility,
    openQuestions: state.openQuestions,
    decisions: state.decisions,
    blueprints: state.blueprints,
    selectedBlueprint: state.selectedBlueprint,
    finalSpec: state.finalSpec,
    pcb: state.placedBlocks.length
      ? {
          placedBlocks: state.placedBlocks,
          schematicData: state.schematicData ?? undefined,
          pcbData: state.pcbData ?? undefined,
          boardSize: state.gridSize
            ? { width: state.gridSize.width, height: state.gridSize.height, unit: 'mm' }
            : undefined,
        }
      : undefined,
    enclosure: state.enclosureCode
      ? {
          openScadCode: state.enclosureCode,
          stlUrl: state.stlUrl ?? undefined,
          iterations: state.enclosureIterations,
        }
      : undefined,
    firmware: state.firmwareFiles.length
      ? {
          files: state.firmwareFiles,
        }
      : undefined,
    stages: {
      spec: {
        status: state.finalSpec ? 'complete' : 'in_progress',
        completedAt: state.finalSpec?.lockedAt,
      },
      pcb: {
        status: state.schematicData ? 'complete' : state.placedBlocks.length ? 'in_progress' : 'pending',
      },
      enclosure: {
        status: state.stlUrl ? 'complete' : state.enclosureCode ? 'in_progress' : 'pending',
      },
      firmware: {
        status: state.firmwareFiles.length ? 'complete' : 'pending',
      },
      export: {
        status: 'pending',
      },
    },
    orchestratorState: {
      conversationHistory: [], // Not storing full conversation in new model
      iteration: state.iterationCount,
      status: state.status === 'complete' ? 'completed' : state.status === 'paused' ? 'paused' : 'running',
      currentStage: state.currentStage,
      updatedAt: new Date().toISOString(),
    },
  }
}

/**
 * Generate a unique history item ID
 */
export function generateHistoryId(): string {
  return `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Create a history item
 */
export function createHistoryItem(
  nodeId: string,
  type: GraphHistoryItem['type'],
  data?: Record<string, unknown>
): GraphHistoryItem {
  return {
    id: generateHistoryId(),
    timestamp: new Date().toISOString(),
    nodeId,
    type,
    data,
  }
}

/**
 * Check if mode requires user input for a given node
 */
export function requiresUserInput(mode: OrchestratorMode, nodeId: string): boolean {
  // In vibe_it mode, AI makes all decisions
  if (mode === 'vibe_it') return false

  // Nodes that always require user input in fix_it/design_it
  const userInputNodes = [
    'collectAnswer',
    'selectBlueprint',
    'selectName',
    'confirmPcbBlocks',
    'provideFeedback',
  ]

  if (userInputNodes.includes(nodeId)) {
    return mode === 'fix_it' || mode === 'design_it'
  }

  // design_it mode requires user confirmation for generated artifacts
  if (mode === 'design_it') {
    const designModeNodes = [
      'reviewEnclosure',
      'reviewFirmware',
      'confirmGeneration',
    ]
    return designModeNodes.includes(nodeId)
  }

  return false
}

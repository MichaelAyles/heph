/**
 * LangGraph State Schema for PHAESTUS Orchestrator
 *
 * Defines the typed state that flows through the orchestrator graph.
 * Uses LangGraph's Annotation pattern for state definition with reducers.
 */

import { Annotation } from '@langchain/langgraph'
import type {
  ProjectSpec,
  FeasibilityAnalysis,
  FinalSpec,
  PCBArtifacts,
  EnclosureArtifacts,
  FirmwareArtifacts,
  PcbBlock,
  OpenQuestion,
  Decision,
  Blueprint,
  StageStatus,
} from '../../db/schema'

// =============================================================================
// TYPES
// =============================================================================

export type OrchestratorMode = 'vibe_it' | 'fix_it' | 'design_it'
export type OrchestratorStage = 'spec' | 'pcb' | 'enclosure' | 'firmware' | 'export'

/**
 * Review result from generate -> review -> decide feedback loops
 */
export interface ReviewResult {
  score: number // 0-100
  verdict: 'accept' | 'revise' | 'reject'
  issues: Array<{
    severity: 'error' | 'warning' | 'info'
    description: string
    suggestion: string
  }>
  positives: string[]
  summary: string
}

/**
 * History item for UI display (separate from LLM conversation)
 */
export interface HistoryItem {
  id: string
  timestamp: string
  type: 'tool_call' | 'tool_result' | 'validation' | 'error' | 'progress' | 'thinking'
  stage: OrchestratorStage
  action: string
  result?: string
  details?: Record<string, unknown>
}

/**
 * Stage completion tracking
 */
export interface StageState {
  status: StageStatus
  completedAt?: string
  error?: string
}

/**
 * Generated name option from the naming stage
 */
export interface GeneratedName {
  name: string
  style: string
  reasoning: string
}

// =============================================================================
// STATE ANNOTATION
// =============================================================================

/**
 * Main graph state using LangGraph Annotation pattern.
 *
 * Each field has:
 * - A type annotation
 * - Optional default value factory
 * - Optional reducer for handling updates (default: last-write-wins)
 *
 * Reducers control how state updates are merged:
 * - Last-write-wins: (_, next) => next (default)
 * - Accumulate: (prev, next) => [...prev, ...next]
 * - Custom logic: (prev, next) => customMerge(prev, next)
 */
export const OrchestratorStateAnnotation = Annotation.Root({
  // -------------------------------------------------------------------------
  // Project Identification
  // -------------------------------------------------------------------------

  /** Project ID from D1 database */
  projectId: Annotation<string>(),

  /** Orchestration mode: vibe_it (auto), fix_it (semi-auto), design_it (user-guided) */
  mode: Annotation<OrchestratorMode>(),

  /** Current stage being processed */
  currentStage: Annotation<OrchestratorStage>({
    default: () => 'spec',
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // User Input
  // -------------------------------------------------------------------------

  /** Original user description of what they want to build */
  description: Annotation<string>(),

  /** Available hardware blocks (injected at start from D1) */
  availableBlocks: Annotation<PcbBlock[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // Spec Stage Artifacts
  // -------------------------------------------------------------------------

  /** Feasibility analysis result from LLM */
  feasibility: Annotation<FeasibilityAnalysis | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Open questions from feasibility that need answers */
  openQuestions: Annotation<OpenQuestion[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),

  /** User/auto decisions (accumulates throughout session) */
  decisions: Annotation<Decision[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),

  /** Generated blueprint images (4 variations) */
  blueprints: Annotation<Blueprint[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),

  /** Index of selected blueprint (0-3) */
  selectedBlueprint: Annotation<number | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Generated project name options */
  generatedNames: Annotation<GeneratedName[]>({
    default: () => [],
    reducer: (_, next) => next,
  }),

  /** Selected project name */
  selectedName: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Final locked specification with BOM */
  finalSpec: Annotation<FinalSpec | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // PCB Stage Artifacts
  // -------------------------------------------------------------------------

  /** PCB artifacts: placed blocks, schematic, layout */
  pcb: Annotation<PCBArtifacts | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // Enclosure Stage Artifacts + Review Loop State
  // -------------------------------------------------------------------------

  /** Enclosure artifacts: OpenSCAD code, STL */
  enclosure: Annotation<EnclosureArtifacts | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Latest enclosure review result (cleared on regenerate) */
  enclosureReview: Annotation<ReviewResult | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Number of enclosure generation attempts (for max 3 loop) */
  enclosureAttempts: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // Firmware Stage Artifacts + Review Loop State
  // -------------------------------------------------------------------------

  /** Firmware artifacts: source files, build status */
  firmware: Annotation<FirmwareArtifacts | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Latest firmware review result (cleared on regenerate) */
  firmwareReview: Annotation<ReviewResult | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Number of firmware generation attempts (for max 3 loop) */
  firmwareAttempts: Annotation<number>({
    default: () => 0,
    reducer: (_, next) => next,
  }),

  // -------------------------------------------------------------------------
  // Stage Completion Tracking
  // -------------------------------------------------------------------------

  /** Set of completed stages (accumulates) */
  completedStages: Annotation<Set<OrchestratorStage>>({
    default: () => new Set(),
    reducer: (prev, next) => new Set([...prev, ...next]),
  }),

  /** Full stage state for each stage */
  stages: Annotation<Record<OrchestratorStage, StageState>>({
    default: () => ({
      spec: { status: 'in_progress' },
      pcb: { status: 'pending' },
      enclosure: { status: 'pending' },
      firmware: { status: 'pending' },
      export: { status: 'pending' },
    }),
    reducer: (prev, next) => ({ ...prev, ...next }),
  }),

  // -------------------------------------------------------------------------
  // Execution History (UI Display)
  // -------------------------------------------------------------------------

  /** History items for UI activity log (accumulates) */
  history: Annotation<HistoryItem[]>({
    default: () => [],
    reducer: (prev, next) => [...prev, ...next],
  }),

  // -------------------------------------------------------------------------
  // Error & Iteration Tracking
  // -------------------------------------------------------------------------

  /** Current error message (null if no error) */
  error: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Iteration counter for safety (max 100) */
  iterationCount: Annotation<number>({
    default: () => 0,
    reducer: (prev, _) => prev + 1,
  }),

  /** Timestamp when orchestration started */
  startedAt: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),

  /** Timestamp when orchestration completed */
  completedAt: Annotation<string | null>({
    default: () => null,
    reducer: (_, next) => next,
  }),
})

// =============================================================================
// TYPE EXPORTS
// =============================================================================

/**
 * Inferred type of the orchestrator state.
 * Use this for typing node functions and state access.
 */
export type OrchestratorState = typeof OrchestratorStateAnnotation.State

/**
 * Partial state update type for node return values.
 * Nodes return partial updates that get merged via reducers.
 */
export type OrchestratorStateUpdate = Partial<OrchestratorState>

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a new history item with auto-generated ID and timestamp
 */
export function createHistoryItem(
  type: HistoryItem['type'],
  stage: OrchestratorStage,
  action: string,
  result?: string,
  details?: Record<string, unknown>
): HistoryItem {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    type,
    stage,
    action,
    result,
    details,
  }
}

/**
 * Convert graph state to ProjectSpec for persistence
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
    pcb: state.pcb || undefined,
    enclosure: state.enclosure || undefined,
    firmware: state.firmware || undefined,
    stages: {
      spec: state.stages.spec,
      pcb: state.stages.pcb,
      enclosure: state.stages.enclosure,
      firmware: state.stages.firmware,
      export: state.stages.export,
    },
  }
}

/**
 * Initialize state from existing ProjectSpec (for resume)
 */
export function projectSpecToState(
  projectId: string,
  mode: OrchestratorMode,
  spec: ProjectSpec,
  blocks: PcbBlock[]
): Partial<OrchestratorState> {
  // Determine current stage from stages status
  let currentStage: OrchestratorStage = 'spec'
  const stageOrder: OrchestratorStage[] = ['spec', 'pcb', 'enclosure', 'firmware', 'export']

  for (const stage of stageOrder) {
    if (spec.stages?.[stage]?.status === 'in_progress') {
      currentStage = stage
      break
    }
    if (spec.stages?.[stage]?.status === 'complete') {
      const idx = stageOrder.indexOf(stage)
      if (idx < stageOrder.length - 1) {
        currentStage = stageOrder[idx + 1]
      }
    }
  }

  // Build completed stages set
  const completedStages = new Set<OrchestratorStage>()
  for (const stage of stageOrder) {
    if (spec.stages?.[stage]?.status === 'complete') {
      completedStages.add(stage)
    }
  }

  return {
    projectId,
    mode,
    description: spec.description,
    availableBlocks: blocks,
    currentStage,
    feasibility: spec.feasibility,
    openQuestions: spec.openQuestions,
    decisions: spec.decisions,
    blueprints: spec.blueprints,
    selectedBlueprint: spec.selectedBlueprint,
    finalSpec: spec.finalSpec,
    pcb: spec.pcb || null,
    enclosure: spec.enclosure || null,
    firmware: spec.firmware || null,
    completedStages,
    stages: spec.stages || {
      spec: { status: 'in_progress' },
      pcb: { status: 'pending' },
      enclosure: { status: 'pending' },
      firmware: { status: 'pending' },
      export: { status: 'pending' },
    },
  }
}

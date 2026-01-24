/**
 * Orchestrator State - Parent Graph State Schema
 *
 * Shared state visible to all subgraphs. Contains common fields
 * needed across all stages of the hardware design pipeline.
 */

import { StateSchema, MessagesValue, ReducedValue } from '@langchain/langgraph'
import { z } from 'zod'

// =============================================================================
// Shared Schemas
// =============================================================================

export const StageSchema = z.enum(['router', 'spec', 'pcb', 'enclosure', 'firmware', 'export'])

export type Stage = z.infer<typeof StageSchema>

export const StageStatusSchema = z.enum(['pending', 'in_progress', 'complete', 'error'])

export type StageStatus = z.infer<typeof StageStatusSchema>

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string(),
})

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export const DebugStepSchema = z.object({
  node: z.string(),
  subgraph: z.string().optional(),
  timestamp: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  durationMs: z.number().optional(),
})

export type DebugStep = z.infer<typeof DebugStepSchema>

export const DebugInfoSchema = z.object({
  steps: z.array(DebugStepSchema).default([]),
  startTime: z.string(),
  endTime: z.string().nullable().default(null),
  totalDurationMs: z.number().nullable().default(null),
  currentSubgraph: z.string().nullable().default(null),
})

export type DebugInfo = z.infer<typeof DebugInfoSchema>

// =============================================================================
// Orchestrator State Schema
// =============================================================================

/**
 * Parent Orchestrator State
 *
 * This state is shared across all subgraphs. Each subgraph extends this
 * with stage-specific fields.
 */
export const OrchestratorStateSchema = new StateSchema({
  // Conversation messages - uses LangGraph's built-in message reducer
  messages: MessagesValue,

  // User's original request/description
  userRequest: z.string().default(''),

  // User feedback during any stage
  userFeedback: z.string().nullable().default(null),

  // Current stage in the pipeline
  currentStage: StageSchema.default('router'),

  // Stage completion status
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'pending',
    spec: 'pending',
    pcb: 'pending',
    enclosure: 'pending',
    firmware: 'pending',
    export: 'pending',
  }),

  // Project context
  projectId: z.string().nullable().default(null),
  sessionId: z.string().default(''),

  // User's existing projects (for routing decisions)
  userProjects: z.array(ProjectSummarySchema).default([]),

  // Error state
  error: z.string().nullable().default(null),

  // Debug info - uses reducer to accumulate steps
  debug: new ReducedValue(DebugInfoSchema, {
    reducer: (current, update) => ({
      ...current,
      ...update,
      steps: [...(current.steps || []), ...(update.steps || [])],
    }),
  }),
})

// Type helpers
export type OrchestratorState = typeof OrchestratorStateSchema.State
export type OrchestratorStateUpdate = typeof OrchestratorStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a debug step entry
 */
export function createDebugStep(
  node: string,
  input?: unknown,
  output?: unknown,
  durationMs?: number,
  subgraph?: string
): DebugStep {
  return {
    node,
    subgraph,
    timestamp: new Date().toISOString(),
    input,
    output,
    durationMs,
  }
}

/**
 * Create initial debug info
 */
export function createInitialDebugInfo(): DebugInfo {
  return {
    steps: [],
    startTime: new Date().toISOString(),
    endTime: null,
    totalDurationMs: null,
    currentSubgraph: null,
  }
}

/**
 * Get the next stage in the pipeline
 */
export function getNextStage(currentStage: Stage): Stage | null {
  const stageOrder: Stage[] = ['router', 'spec', 'pcb', 'enclosure', 'firmware', 'export']
  const currentIndex = stageOrder.indexOf(currentStage)
  if (currentIndex === -1 || currentIndex >= stageOrder.length - 1) {
    return null
  }
  return stageOrder[currentIndex + 1]
}

/**
 * Check if a stage is complete
 */
export function isStageComplete(state: OrchestratorState, stage: Stage): boolean {
  return state.stageStatus[stage] === 'complete'
}

/**
 * Update stage status in state
 */
export function updateStageStatus(
  current: Record<Stage, StageStatus>,
  stage: Stage,
  status: StageStatus
): Record<Stage, StageStatus> {
  return {
    ...current,
    [stage]: status,
  }
}

/**
 * Spec Stage State Schema
 *
 * State for the specification stage subgraph. Handles feasibility analysis,
 * requirement refinement, blueprint generation, and final spec creation.
 */

import { StateSchema, MessagesValue, ReducedValue } from '@langchain/langgraph'
import { z } from 'zod'
import {
  StageSchema,
  StageStatusSchema,
  ProjectSummarySchema,
  DebugInfoSchema,
  createDebugStep as baseCreateDebugStep,
  createInitialDebugInfo,
  type DebugStep,
  type DebugInfo,
} from './orchestrator'

// =============================================================================
// Spec-Specific Schemas
// =============================================================================

export const FeasibilityAnalysisSchema = z.object({
  communication: z.object({
    type: z.string(),
    confidence: z.number(),
    notes: z.string(),
  }),
  processing: z.object({
    level: z.string(),
    confidence: z.number(),
    notes: z.string(),
  }),
  power: z.object({
    options: z.array(z.string()),
    confidence: z.number(),
    notes: z.string(),
  }),
  inputs: z.object({
    items: z.array(z.string()),
    confidence: z.number(),
  }),
  outputs: z.object({
    items: z.array(z.string()),
    confidence: z.number(),
  }),
  overallScore: z.number(),
  manufacturable: z.boolean(),
  rejectionReason: z.string().optional(),
})

export type FeasibilityAnalysis = z.infer<typeof FeasibilityAnalysisSchema>

export const OpenQuestionSchema = z.object({
  id: z.string(),
  question: z.string(),
  options: z.array(z.string()),
})

export type OpenQuestion = z.infer<typeof OpenQuestionSchema>

export const DecisionSchema = z.object({
  questionId: z.string(),
  question: z.string(),
  answer: z.string(),
  timestamp: z.string(),
})

export type Decision = z.infer<typeof DecisionSchema>

export const BlueprintSchema = z.object({
  url: z.string(),
  prompt: z.string(),
})

export type Blueprint = z.infer<typeof BlueprintSchema>

export const FinalSpecSchema = z.object({
  name: z.string(),
  summary: z.string(),
  pcbSize: z.object({
    width: z.number(),
    height: z.number(),
    unit: z.literal('mm'),
  }),
  inputs: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
      notes: z.string(),
    })
  ),
  outputs: z.array(
    z.object({
      type: z.string(),
      count: z.number(),
      notes: z.string(),
    })
  ),
  power: z.object({
    source: z.string(),
    voltage: z.string(),
    current: z.string(),
    batteryLife: z.string().optional(),
  }),
  communication: z.object({
    type: z.string(),
    protocol: z.string(),
  }),
  enclosure: z.object({
    style: z.string(),
    width: z.number(),
    height: z.number(),
    depth: z.number(),
  }),
  estimatedBOM: z.array(
    z.object({
      item: z.string(),
      quantity: z.number(),
      unitCost: z.number(),
    })
  ),
  locked: z.boolean(),
  lockedAt: z.string(),
})

export type FinalSpec = z.infer<typeof FinalSpecSchema>

export const SpecNodeSchema = z.enum([
  'feasibility_check',
  'refinement_loop',
  'blueprint_generation',
  'finalization',
])

export type SpecNode = z.infer<typeof SpecNodeSchema>

export const SpecRouteSchema = z.enum([
  'proceed',
  'reject',
  'clarify',
  'generate_blueprints',
  'finalize',
  'complete',
])

export type SpecRoute = z.infer<typeof SpecRouteSchema>

// =============================================================================
// Spec State Schema
// =============================================================================

/**
 * Spec Stage State
 *
 * Contains all fields needed for the specification stage:
 * - Feasibility analysis results
 * - Refinement Q&A state
 * - Blueprint generation
 * - Final specification
 */
export const SpecStateSchema = new StateSchema({
  // Inherited from parent
  messages: MessagesValue,
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),
  currentStage: StageSchema.default('spec'),
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'complete',
    spec: 'in_progress',
    pcb: 'pending',
    enclosure: 'pending',
    firmware: 'pending',
    export: 'pending',
  }),
  projectId: z.string().nullable().default(null),
  sessionId: z.string().default(''),
  userProjects: z.array(ProjectSummarySchema).default([]),
  error: z.string().nullable().default(null),
  debug: new ReducedValue(DebugInfoSchema, {
    reducer: (current, update) => ({
      ...current,
      ...update,
      steps: [...(current.steps || []), ...(update.steps || [])],
    }),
  }),

  // Spec-specific fields
  feasibility: FeasibilityAnalysisSchema.nullable().default(null),
  refinementRound: z.number().default(0),
  maxRefinementRounds: z.number().default(5),
  openQuestions: z.array(OpenQuestionSchema).default([]),
  decisions: z.array(DecisionSchema).default([]),
  blueprints: z.array(BlueprintSchema).default([]),
  selectedBlueprint: z.number().nullable().default(null),
  finalSpec: FinalSpecSchema.nullable().default(null),

  // Internal routing
  specRoute: SpecRouteSchema.nullable().default(null),
})

// Type helpers
export type SpecState = typeof SpecStateSchema.State
export type SpecStateUpdate = typeof SpecStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a debug step for spec stage
 */
export function createSpecDebugStep(
  node: SpecNode,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): DebugStep {
  return baseCreateDebugStep(node, input, output, durationMs, 'spec')
}

/**
 * Check if feasibility passed
 */
export function didFeasibilityPass(state: SpecState): boolean {
  return (
    state.feasibility !== null &&
    state.feasibility.manufacturable &&
    state.feasibility.overallScore >= 50
  )
}

/**
 * Check if refinement is complete
 */
export function isRefinementComplete(state: SpecState): boolean {
  // Complete if all questions answered or max rounds reached
  return state.openQuestions.length === 0 || state.refinementRound >= state.maxRefinementRounds
}

/**
 * Check if blueprints are ready
 */
export function areBlueprintsReady(state: SpecState): boolean {
  return state.blueprints.length >= 4
}

/**
 * Check if blueprint is selected
 */
export function isBlueprintSelected(state: SpecState): boolean {
  return state.selectedBlueprint !== null
}

/**
 * Get the selected blueprint
 */
export function getSelectedBlueprint(state: SpecState): Blueprint | null {
  if (state.selectedBlueprint === null) return null
  return state.blueprints[state.selectedBlueprint] ?? null
}

/**
 * Convert decisions record to answer map
 */
export function decisionsToAnswerMap(decisions: Decision[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const decision of decisions) {
    map[decision.questionId] = decision.answer
  }
  return map
}

// Re-export shared types and functions
export { createInitialDebugInfo }
export type { DebugStep, DebugInfo }

/**
 * Enclosure Stage State Schema
 *
 * State for the enclosure design stage subgraph. Handles dimension analysis,
 * OpenSCAD generation, and review loops.
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
// Enclosure-Specific Schemas
// =============================================================================

export const EnclosureIterationSchema = z.object({
  feedback: z.string(),
  openScadCode: z.string(),
  stlUrl: z.string().optional(),
  timestamp: z.string(),
})

export type EnclosureIteration = z.infer<typeof EnclosureIterationSchema>

export const EnclosureDimensionsSchema = z.object({
  // Internal dimensions (from PCB)
  pcbWidth: z.number(),
  pcbHeight: z.number(),
  pcbThickness: z.number().default(1.6),

  // Component clearances
  topClearance: z.number().default(10),
  bottomClearance: z.number().default(3),

  // Wall thickness
  wallThickness: z.number().default(2),

  // Calculated external dimensions
  externalWidth: z.number(),
  externalHeight: z.number(),
  externalDepth: z.number(),
})

export type EnclosureDimensions = z.infer<typeof EnclosureDimensionsSchema>

export const EnclosureFeatureSchema = z.object({
  type: z.enum(['button_hole', 'led_hole', 'usb_cutout', 'vent', 'mount_post', 'custom']),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }),
  dimensions: z.object({
    width: z.number().optional(),
    height: z.number().optional(),
    depth: z.number().optional(),
    diameter: z.number().optional(),
  }),
  description: z.string().optional(),
})

export type EnclosureFeature = z.infer<typeof EnclosureFeatureSchema>

export const EnclosureStyleSchema = z.enum(['box', 'rounded', 'organic', 'industrial', 'minimal'])

export type EnclosureStyle = z.infer<typeof EnclosureStyleSchema>

export const EnclosureNodeSchema = z.enum([
  'dimension_analysis',
  'openscad_generation',
  'review_loop',
])

export type EnclosureNode = z.infer<typeof EnclosureNodeSchema>

export const EnclosureRouteSchema = z.enum([
  'analyze_dimensions',
  'generate_openscad',
  'review',
  'regenerate',
  'complete',
])

export type EnclosureRoute = z.infer<typeof EnclosureRouteSchema>

// =============================================================================
// Enclosure State Schema
// =============================================================================

/**
 * Enclosure Stage State
 *
 * Contains all fields needed for enclosure design:
 * - PCB dimensions for fitting
 * - OpenSCAD code generation
 * - Review feedback loops
 * - STL generation status
 */
export const EnclosureStateSchema = new StateSchema({
  // Inherited from parent
  messages: MessagesValue,
  userRequest: z.string().default(''),
  userFeedback: z.string().nullable().default(null),
  currentStage: StageSchema.default('enclosure'),
  stageStatus: z.record(StageSchema, StageStatusSchema).default({
    router: 'complete',
    spec: 'complete',
    pcb: 'complete',
    enclosure: 'in_progress',
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

  // Enclosure-specific fields
  dimensions: EnclosureDimensionsSchema.nullable().default(null),
  style: EnclosureStyleSchema.default('box'),
  features: z.array(EnclosureFeatureSchema).default([]),
  openScadCode: z.string().default(''),
  stlUrl: z.string().nullable().default(null),
  stlGenerated: z.boolean().default(false),
  iterations: z.array(EnclosureIterationSchema).default([]),
  reviewRound: z.number().default(0),
  maxReviewRounds: z.number().default(3),
  reviewFeedback: z.array(z.string()).default([]),

  // Blueprint reference (from spec stage)
  blueprintUrl: z.string().nullable().default(null),

  // Internal routing
  enclosureRoute: EnclosureRouteSchema.nullable().default(null),
})

// Type helpers
export type EnclosureState = typeof EnclosureStateSchema.State
export type EnclosureStateUpdate = typeof EnclosureStateSchema.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a debug step for enclosure stage
 */
export function createEnclosureDebugStep(
  node: EnclosureNode,
  input?: unknown,
  output?: unknown,
  durationMs?: number
): DebugStep {
  return baseCreateDebugStep(node, input, output, durationMs, 'enclosure')
}

/**
 * Calculate enclosure dimensions from PCB size
 */
export function calculateEnclosureDimensions(
  pcbWidth: number,
  pcbHeight: number,
  options: {
    pcbThickness?: number
    topClearance?: number
    bottomClearance?: number
    wallThickness?: number
  } = {}
): EnclosureDimensions {
  const pcbThickness = options.pcbThickness ?? 1.6
  const topClearance = options.topClearance ?? 10
  const bottomClearance = options.bottomClearance ?? 3
  const wallThickness = options.wallThickness ?? 2

  return {
    pcbWidth,
    pcbHeight,
    pcbThickness,
    topClearance,
    bottomClearance,
    wallThickness,
    externalWidth: pcbWidth + wallThickness * 2,
    externalHeight: pcbHeight + wallThickness * 2,
    externalDepth: pcbThickness + topClearance + bottomClearance + wallThickness * 2,
  }
}

/**
 * Check if OpenSCAD code is valid (basic syntax check)
 */
export function isOpenSCADValid(code: string): boolean {
  if (!code || code.trim().length === 0) return false

  // Check for basic OpenSCAD structure
  const hasModule =
    /module\s+\w+/.test(code) || /difference\s*\(/.test(code) || /union\s*\(/.test(code)
  const hasCube = /cube\s*\(/.test(code) || /cylinder\s*\(/.test(code)

  return hasModule || hasCube
}

/**
 * Check if review is complete
 */
export function isReviewComplete(state: EnclosureState): boolean {
  return (
    state.reviewRound >= state.maxReviewRounds ||
    (state.stlGenerated && state.reviewFeedback.length === 0)
  )
}

/**
 * Add an iteration to history
 */
export function addIteration(
  iterations: EnclosureIteration[],
  feedback: string,
  openScadCode: string,
  stlUrl?: string
): EnclosureIteration[] {
  return [
    ...iterations,
    {
      feedback,
      openScadCode,
      stlUrl,
      timestamp: new Date().toISOString(),
    },
  ]
}

/**
 * Get the latest OpenSCAD code
 */
export function getLatestOpenSCAD(state: EnclosureState): string {
  if (state.iterations.length > 0) {
    return state.iterations[state.iterations.length - 1].openScadCode
  }
  return state.openScadCode
}

// Re-export shared types and functions
export { createInitialDebugInfo }
export type { DebugStep, DebugInfo }

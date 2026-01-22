/**
 * LangGraph State Definition
 *
 * Defines the state schema for the PHAESTUS hardware design assistant.
 * Uses LangGraph's StateSchema with MessagesValue for proper message handling.
 */

import {
  StateSchema,
  MessagesValue,
  ReducedValue,
} from '@langchain/langgraph'
import { z } from 'zod'
import type { BaseMessage } from '@langchain/core/messages'

// =============================================================================
// Zod Schemas for State Fields
// =============================================================================

export const ProjectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.string(),
  description: z.string().nullable(),
  updatedAt: z.string(),
})

export type ProjectSummary = z.infer<typeof ProjectSummarySchema>

export const BlockSummarySchema = z.object({
  slug: z.string(),
  name: z.string(),
  category: z.string(),
  description: z.string(),
})

export type BlockSummary = z.infer<typeof BlockSummarySchema>

export const UserIntentSchema = z.enum([
  'new_project',
  'load_project',
  'question',
  'unknown',
])

export type UserIntent = z.infer<typeof UserIntentSchema>

export const DebugStepSchema = z.object({
  node: z.string(),
  timestamp: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  durationMs: z.number().optional(),
})

export type DebugStep = z.infer<typeof DebugStepSchema>

export const DebugInfoSchema = z.object({
  steps: z.array(DebugStepSchema).default([]),
  systemPromptName: z.string().nullable().default(null),
  systemPromptContent: z.string().nullable().default(null),
  hardRejectionCriteriaCount: z.number().default(0),
  hardRejectionMatched: z.string().nullable().default(null),
  llmPrompt: z.string().nullable().default(null),
  llmRawResponse: z.string().nullable().default(null),
  startTime: z.string(),
  endTime: z.string().nullable().default(null),
  totalDurationMs: z.number().nullable().default(null),
})

export type DebugInfo = z.infer<typeof DebugInfoSchema>

// Capability assessment schema (matches db/schema.ts)
export const CapabilityAssessmentSchema = z
  .object({
    canBuild: z.boolean(),
    confidence: z.number(),
    missingCapabilities: z.array(z.string()).optional(),
    suggestions: z.array(z.string()).optional(),
    reasoning: z.string().optional(),
  })
  .nullable()

// Chat route schema (matches db/schema.ts)
export const ChatRouteSchema = z
  .enum(['REJECT', 'CLARIFY', 'PROCEED'])
  .nullable()

// =============================================================================
// State Schema
// =============================================================================

/**
 * PHAESTUS Graph State Schema
 *
 * Uses LangGraph's StateSchema with:
 * - MessagesValue for proper message handling with IDs
 * - ReducedValue for accumulated state (debug steps)
 * - Zod schemas for type safety
 */
export const PhaestusStateSchema = new StateSchema({
  // Conversation messages - uses LangGraph's built-in message reducer
  messages: MessagesValue,

  // User's original request text
  userRequest: z.string().default(''),

  // User feedback during refinement
  userFeedback: z.string().nullable().default(null),

  // User's existing projects (for routing)
  userProjects: z.array(ProjectSummarySchema).default([]),

  // Intent detection result
  intent: UserIntentSchema.default('unknown'),

  // Matched project if intent is load_project
  matchedProject: ProjectSummarySchema.nullable().default(null),

  // Capability assessment (for new project flow)
  capabilityAssessment: CapabilityAssessmentSchema.default(null),

  // Iteration count for refinement loops
  iterationCount: z.number().default(0),

  // Routing decision
  route: ChatRouteSchema.default(null),

  // Session tracking
  sessionId: z.string().default(''),

  // Project context (set when project created or loaded)
  projectId: z.string().nullable().default(null),

  // Available PCB blocks
  availableBlocks: z.array(BlockSummarySchema).default([]),

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
export type PhaestusState = typeof PhaestusStateSchema.State
export type PhaestusStateUpdate = typeof PhaestusStateSchema.Update

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
  durationMs?: number
): DebugStep {
  return {
    node,
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
    systemPromptName: null,
    systemPromptContent: null,
    hardRejectionCriteriaCount: 0,
    hardRejectionMatched: null,
    llmPrompt: null,
    llmRawResponse: null,
    startTime: new Date().toISOString(),
    endTime: null,
    totalDurationMs: null,
  }
}

/**
 * Get the text content from a message
 */
export function getMessageContent(message: BaseMessage): string {
  if (typeof message.content === 'string') {
    return message.content
  }
  // Handle complex content (e.g., multimodal)
  if (Array.isArray(message.content)) {
    return message.content
      .filter((c) => typeof c === 'string' || (c && 'text' in c))
      .map((c) => (typeof c === 'string' ? c : (c as { text: string }).text))
      .join('')
  }
  return ''
}

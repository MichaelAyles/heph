/**
 * LangGraph State Definition
 *
 * Defines the state annotation for the PHAESTUS hardware design assistant.
 * Uses LangGraph's Annotation system for proper state management with reducers.
 */

import { Annotation } from '@langchain/langgraph'
import type { CapabilityAssessment, ChatRoute } from '../../db/schema'

// =============================================================================
// Message Types
// =============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

// =============================================================================
// Block Summary (for context)
// =============================================================================

export interface BlockSummary {
  slug: string
  name: string
  category: string
  description: string
}

// =============================================================================
// Debug Info
// =============================================================================

export interface DebugStep {
  node: string
  timestamp: string
  input?: unknown
  output?: unknown
  durationMs?: number
}

export interface DebugInfo {
  steps: DebugStep[]
  systemPromptName: string | null
  systemPromptContent: string | null
  hardRejectionCriteriaCount: number
  hardRejectionMatched: string | null
  llmPrompt: string | null
  llmRawResponse: string | null
  startTime: string
  endTime: string | null
  totalDurationMs: number | null
}

// =============================================================================
// State Annotation
// =============================================================================

/**
 * PHAESTUS Graph State Annotation
 *
 * This defines the shape of the state that flows through the graph.
 * Each field can have a reducer that defines how updates are merged.
 *
 * - Simple fields use Annotation<Type> which stores the last value
 * - Fields with reducers use Annotation<Type>({ reducer: ... })
 */
export const PhaestusStateAnnotation = Annotation.Root({
  // User input - simple last-value storage
  userRequest: Annotation<string>,
  userFeedback: Annotation<string | null>,

  // Assessment results
  capabilityAssessment: Annotation<CapabilityAssessment | null>,

  // Control flow
  iterationCount: Annotation<number>({
    reducer: (current, update) => update ?? current,
    default: () => 0,
  }),
  route: Annotation<ChatRoute>,

  // Conversation - messages accumulate
  messages: Annotation<ChatMessage[]>({
    reducer: (current, update) => {
      // Append new messages to existing ones
      if (Array.isArray(update)) {
        return [...current, ...update]
      }
      return current
    },
    default: () => [],
  }),

  // Session tracking
  sessionId: Annotation<string>,

  // Project context (set when project created)
  projectId: Annotation<string | null>,
  availableBlocks: Annotation<BlockSummary[]>({
    reducer: (current, update) => update ?? current,
    default: () => [],
  }),

  // Error state
  error: Annotation<string | null>,

  // Debug info - accumulates steps
  debug: Annotation<DebugInfo>({
    reducer: (current, update) => {
      // Merge debug info, accumulating steps
      return {
        ...current,
        ...update,
        steps: [...(current.steps || []), ...(update.steps || [])],
      }
    },
    default: () => ({
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
    }),
  }),
})

// Type helpers
export type PhaestusState = typeof PhaestusStateAnnotation.State
export type PhaestusStateUpdate = typeof PhaestusStateAnnotation.Update

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create initial state for a new conversation
 */
export function createInitialState(
  userRequest: string,
  sessionId?: string
): PhaestusState {
  const now = new Date().toISOString()
  const id = sessionId ?? crypto.randomUUID()

  return {
    userRequest,
    userFeedback: null,
    capabilityAssessment: null,
    iterationCount: 0,
    route: null,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'user',
        content: userRequest,
        timestamp: now,
      },
    ],
    sessionId: id,
    projectId: null,
    availableBlocks: [],
    error: null,
    debug: {
      steps: [],
      systemPromptName: null,
      systemPromptContent: null,
      hardRejectionCriteriaCount: 0,
      hardRejectionMatched: null,
      llmPrompt: null,
      llmRawResponse: null,
      startTime: now,
      endTime: null,
      totalDurationMs: null,
    },
  }
}

/**
 * Create a new message
 */
export function createMessage(
  role: ChatMessage['role'],
  content: string
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Create a debug step
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

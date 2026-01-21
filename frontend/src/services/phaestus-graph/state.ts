/**
 * PHAESTUS Graph State
 *
 * State schema for the chat-first capability assessment pipeline.
 * Uses a simple state object (no LangGraph Annotation for browser compatibility).
 */

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
// State Schema
// =============================================================================

// =============================================================================
// Debug Info
// =============================================================================

export interface DebugStep {
  node: string
  timestamp: string
  input?: unknown
  output?: unknown
  duration?: number
}

export interface DebugInfo {
  // Execution trace
  steps: DebugStep[]

  // System prompt used
  systemPromptName: string | null
  systemPromptContent: string | null

  // Hard rejection check
  hardRejectionCriteriaCount: number
  hardRejectionMatched: string | null

  // LLM call details
  llmPrompt: string | null
  llmRawResponse: string | null

  // Timing
  startTime: string
  endTime: string | null
  totalDuration: number | null
}

// =============================================================================
// State Schema
// =============================================================================

export interface PhaestusState {
  // User input
  userRequest: string
  userFeedback: string | null

  // Assessment results
  capabilityAssessment: CapabilityAssessment | null

  // Control flow
  iterationCount: number
  route: ChatRoute

  // Conversation
  messages: ChatMessage[]

  // Session tracking
  sessionId: string

  // Project context (optional - set when project created)
  projectId: string | null
  availableBlocks: BlockSummary[]

  // Error state
  error: string | null

  // Debug info
  debug: DebugInfo
}

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialState(
  userRequest: string,
  sessionId?: string
): PhaestusState {
  const now = new Date().toISOString()
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
    sessionId: sessionId ?? crypto.randomUUID(),
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
      totalDuration: null,
    },
  }
}

// =============================================================================
// State Update Helpers
// =============================================================================

export function addMessage(
  state: PhaestusState,
  role: ChatMessage['role'],
  content: string
): PhaestusState {
  return {
    ...state,
    messages: [
      ...state.messages,
      {
        id: crypto.randomUUID(),
        role,
        content,
        timestamp: new Date().toISOString(),
      },
    ],
  }
}

export function setAssessment(
  state: PhaestusState,
  assessment: CapabilityAssessment
): PhaestusState {
  return {
    ...state,
    capabilityAssessment: assessment,
  }
}

export function setRoute(
  state: PhaestusState,
  route: ChatRoute
): PhaestusState {
  return {
    ...state,
    route,
  }
}

export function setProjectId(
  state: PhaestusState,
  projectId: string
): PhaestusState {
  return {
    ...state,
    projectId,
  }
}

export function setError(
  state: PhaestusState,
  error: string | null
): PhaestusState {
  return {
    ...state,
    error,
  }
}

export function incrementIteration(state: PhaestusState): PhaestusState {
  return {
    ...state,
    iterationCount: state.iterationCount + 1,
  }
}

// =============================================================================
// Debug Helpers
// =============================================================================

export function addDebugStep(
  state: PhaestusState,
  node: string,
  input?: unknown,
  output?: unknown,
  duration?: number
): PhaestusState {
  return {
    ...state,
    debug: {
      ...state.debug,
      steps: [
        ...state.debug.steps,
        {
          node,
          timestamp: new Date().toISOString(),
          input,
          output,
          duration,
        },
      ],
    },
  }
}

export function setDebugSystemPrompt(
  state: PhaestusState,
  name: string,
  content: string
): PhaestusState {
  return {
    ...state,
    debug: {
      ...state.debug,
      systemPromptName: name,
      systemPromptContent: content,
    },
  }
}

export function setDebugHardRejection(
  state: PhaestusState,
  criteriaCount: number,
  matchedPattern: string | null
): PhaestusState {
  return {
    ...state,
    debug: {
      ...state.debug,
      hardRejectionCriteriaCount: criteriaCount,
      hardRejectionMatched: matchedPattern,
    },
  }
}

export function setDebugLlm(
  state: PhaestusState,
  prompt: string,
  rawResponse: string
): PhaestusState {
  return {
    ...state,
    debug: {
      ...state.debug,
      llmPrompt: prompt,
      llmRawResponse: rawResponse,
    },
  }
}

export function finalizeDebug(state: PhaestusState): PhaestusState {
  const endTime = new Date().toISOString()
  const startMs = new Date(state.debug.startTime).getTime()
  const endMs = new Date(endTime).getTime()
  return {
    ...state,
    debug: {
      ...state.debug,
      endTime,
      totalDuration: endMs - startMs,
    },
  }
}

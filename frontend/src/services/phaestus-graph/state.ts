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
}

// =============================================================================
// Initial State Factory
// =============================================================================

export function createInitialState(
  userRequest: string,
  sessionId?: string
): PhaestusState {
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
        timestamp: new Date().toISOString(),
      },
    ],
    sessionId: sessionId ?? crypto.randomUUID(),
    projectId: null,
    availableBlocks: [],
    error: null,
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

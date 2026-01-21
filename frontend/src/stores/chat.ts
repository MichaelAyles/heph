/**
 * Chat Store
 *
 * Zustand store for managing chat state in the PHAESTUS chat interface.
 */

import { create } from 'zustand'
import type { CapabilityAssessment, ChatRoute } from '../db/schema'

// =============================================================================
// Types
// =============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  assessment?: CapabilityAssessment
  route?: ChatRoute
}

export interface ChatState {
  // Session
  sessionId: string | null
  projectId: string | null

  // Messages
  messages: ChatMessage[]

  // Loading state
  isLoading: boolean
  error: string | null

  // Assessment result
  latestAssessment: CapabilityAssessment | null
  latestRoute: ChatRoute

  // Actions
  sendMessage: (message: string) => Promise<void>
  clearChat: () => void
  setError: (error: string | null) => void
}

// =============================================================================
// API Client
// =============================================================================

interface ChatResponse {
  response: string
  route: ChatRoute
  assessment?: CapabilityAssessment
  projectId?: string
  sessionId: string
}

async function sendChatMessage(
  message: string,
  sessionId: string | null
): Promise<ChatResponse> {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      sessionId: sessionId ?? undefined,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(error.error || 'Chat request failed')
  }

  return response.json()
}

// =============================================================================
// Store
// =============================================================================

export const useChatStore = create<ChatState>((set, get) => ({
  // Initial state
  sessionId: null,
  projectId: null,
  messages: [],
  isLoading: false,
  error: null,
  latestAssessment: null,
  latestRoute: null,

  // Actions
  sendMessage: async (content: string) => {
    const { sessionId, messages } = get()

    // Create user message
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    }

    // Update state with user message and loading
    set({
      messages: [...messages, userMessage],
      isLoading: true,
      error: null,
    })

    try {
      const response = await sendChatMessage(content, sessionId)

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: response.response,
        timestamp: new Date().toISOString(),
        assessment: response.assessment,
        route: response.route,
      }

      set((state) => ({
        messages: [...state.messages, assistantMessage],
        sessionId: response.sessionId,
        projectId: response.projectId ?? state.projectId,
        latestAssessment: response.assessment ?? state.latestAssessment,
        latestRoute: response.route,
        isLoading: false,
      }))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error'
      set({
        error: errorMessage,
        isLoading: false,
      })
    }
  },

  clearChat: () => {
    set({
      sessionId: null,
      projectId: null,
      messages: [],
      isLoading: false,
      error: null,
      latestAssessment: null,
      latestRoute: null,
    })
  },

  setError: (error: string | null) => {
    set({ error })
  },
}))

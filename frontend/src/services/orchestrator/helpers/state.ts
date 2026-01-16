/**
 * State Management Utilities
 *
 * Conversation history trimming and state persistence.
 */

import type {
  ChatMessage,
  OrchestratorStage,
  ProjectSpec,
  PersistedOrchestratorState,
  OrchestratorCallbacks,
} from '../types'

/**
 * Trim conversation history to prevent unbounded growth.
 * Keeps the system message and most recent messages.
 * OPTIMIZED: More aggressive trimming (15→8 instead of 40→20)
 */
export function trimConversationHistory(
  history: ChatMessage[],
  currentStage: OrchestratorStage,
  currentSpec: ProjectSpec | null,
  iterationCount: number
): ChatMessage[] {
  const MAX_MESSAGES = 15 // Reduced from 40 for token efficiency
  const TRIM_TO = 8 // Reduced from 20 - keep system + summary + last 6 exchanges

  if (history.length <= MAX_MESSAGES) {
    return history
  }

  // Always keep the system message (first message)
  const systemMessage = history[0]
  const recentMessages = history.slice(-TRIM_TO)

  // Create a concise summary of trimmed history with current state
  const trimmedCount = history.length - TRIM_TO - 1
  const completedStages = Object.entries(currentSpec?.stages || {})
    .filter(([, s]) => s?.status === 'complete')
    .map(([name]) => name)
    .join(', ')

  const summaryMessage: ChatMessage = {
    role: 'user',
    content: `[${trimmedCount} messages trimmed. Stage: ${currentStage}. Completed: ${completedStages || 'none'}. Iteration: ${iterationCount}. Continue.]`,
  }

  return [systemMessage, summaryMessage, ...recentMessages]
}

/**
 * Build persisted state for resume capability.
 * Filters out tool messages and prepares for storage.
 */
export function buildPersistedState(
  conversationHistory: ChatMessage[],
  iterationCount: number,
  status: PersistedOrchestratorState['status'],
  currentStage: OrchestratorStage
): PersistedOrchestratorState {
  // Filter out tool messages (results stored in spec) and stringify content
  const filteredHistory = conversationHistory
    .filter((msg) => msg.role !== 'tool')
    .map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }))

  return {
    conversationHistory: filteredHistory,
    iteration: iterationCount,
    status,
    currentStage,
    updatedAt: new Date().toISOString(),
  }
}

/**
 * Persist orchestrator state for resume capability.
 */
export async function persistState(
  currentSpec: ProjectSpec | null,
  conversationHistory: ChatMessage[],
  iterationCount: number,
  status: PersistedOrchestratorState['status'],
  currentStage: OrchestratorStage,
  callbacks: OrchestratorCallbacks
): Promise<void> {
  if (!currentSpec) return

  const persistedState = buildPersistedState(
    conversationHistory,
    iterationCount,
    status,
    currentStage
  )

  currentSpec.orchestratorState = persistedState
  await callbacks.onSpecUpdate({ orchestratorState: persistedState })
}

/**
 * Build default stages structure for a new spec.
 */
export function buildDefaultStages() {
  return {
    spec: { status: 'in_progress' as const },
    pcb: { status: 'pending' as const },
    enclosure: { status: 'pending' as const },
    firmware: { status: 'pending' as const },
    export: { status: 'pending' as const },
  }
}

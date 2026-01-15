/**
 * Orchestrator Store
 *
 * Zustand store for managing the hardware design orchestrator state.
 * Provides reactive state management for the UI components.
 */

import { create } from 'zustand'
import {
  createOrchestrator,
  type HardwareOrchestrator,
  type OrchestratorMode,
  type OrchestratorState,
  type OrchestratorCallbacks,
  type OrchestratorHistoryItem,
  type OrchestratorStage,
  type OrchestratorStatus,
} from '@/services/orchestrator'
import type { ProjectSpec, PcbBlock } from '@/db/schema'

// =============================================================================
// FEATURE FLAGS
// =============================================================================

/**
 * Check if LangGraph orchestrator is enabled.
 * Reads from localStorage to allow runtime toggling via admin panel.
 */
export function isLangGraphEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('USE_LANGGRAPH_ORCHESTRATOR') === 'true'
}

// =============================================================================
// STORE TYPES
// =============================================================================

interface OrchestratorStoreState {
  // Orchestrator instance (legacy)
  orchestrator: HardwareOrchestrator | null
  // LangGraph abort controller
  abortController: AbortController | null

  // Mirrored state from orchestrator
  status: OrchestratorStatus
  mode: OrchestratorMode
  currentStage: OrchestratorStage
  currentAction: string | null
  history: OrchestratorHistoryItem[]
  error: string | null
  iterationCount: number

  // UI state
  isPanelExpanded: boolean
  showThinking: boolean

  // Actions
  startOrchestrator: (
    projectId: string,
    mode: OrchestratorMode,
    description: string,
    existingSpec?: ProjectSpec,
    blocks?: PcbBlock[],
    onSpecUpdate?: (spec: Partial<ProjectSpec>) => Promise<void>
  ) => void
  stopOrchestrator: () => void
  resetOrchestrator: () => void
  togglePanel: () => void
  toggleThinking: () => void
  setMode: (mode: OrchestratorMode) => void
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useOrchestratorStore = create<OrchestratorStoreState>((set, get) => ({
  // Initial state
  orchestrator: null,
  abortController: null,
  status: 'idle',
  mode: 'vibe_it',
  currentStage: 'spec',
  currentAction: null,
  history: [],
  error: null,
  iterationCount: 0,
  isPanelExpanded: true,
  showThinking: false,

  // Start the orchestrator
  startOrchestrator: (projectId, mode, description, existingSpec, blocks, onSpecUpdate) => {
    // Don't start if already running
    const currentStatus = get().status
    if (currentStatus === 'running') {
      return
    }

    // Check if LangGraph is enabled via localStorage
    if (isLangGraphEnabled()) {
      // LangGraph path - call server-side API
      const abortController = new AbortController()

      set({
        orchestrator: null,
        abortController,
        mode,
        status: 'running',
        error: null,
        history: [],
        iterationCount: 0,
      })

      // Run LangGraph orchestrator via API
      runLangGraphOrchestrator(
        projectId,
        mode,
        description,
        existingSpec,
        blocks || [],
        abortController,
        // onStateChange
        (update) => {
          const currentHistory = get().history
          set({
            currentStage: update.stage || get().currentStage,
            currentAction: update.node || null,
            history: update.historyItem
              ? [...currentHistory, update.historyItem]
              : currentHistory,
            iterationCount: get().iterationCount + 1,
          })
        },
        // onSpecUpdate
        async (spec) => {
          if (onSpecUpdate) {
            await onSpecUpdate(spec)
          }
        },
        // onComplete
        () => {
          set({
            status: 'complete',
            currentAction: null,
            abortController: null,
          })
        },
        // onError
        (error) => {
          set({
            status: 'error',
            error,
            currentAction: null,
            abortController: null,
          })
        }
      )

      return
    }

    // Legacy path - run orchestrator in browser
    const callbacks: OrchestratorCallbacks = {
      onStateChange: (state: OrchestratorState) => {
        set({
          status: state.status,
          currentStage: state.currentStage,
          currentAction: state.currentAction,
          history: [...state.history],
          error: state.error,
          iterationCount: state.iterationCount,
        })
      },
      onSpecUpdate: async (spec: Partial<ProjectSpec>) => {
        if (onSpecUpdate) {
          await onSpecUpdate(spec)
        }
      },
      onComplete: (_state: OrchestratorState) => {
        set({
          status: 'complete',
          currentAction: null,
        })
      },
      onError: (error: Error) => {
        set({
          status: 'error',
          error: error.message,
          currentAction: null,
        })
      },
    }

    const orchestrator = createOrchestrator(projectId, mode, callbacks)

    set({
      orchestrator,
      abortController: null,
      mode,
      status: 'running',
      error: null,
      history: [],
      iterationCount: 0,
    })

    // Start the orchestration (async, don't await)
    orchestrator.run(description, existingSpec, blocks).catch((error) => {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      })
    })
  },

  // Stop the orchestrator
  stopOrchestrator: () => {
    const { orchestrator, abortController } = get()
    if (orchestrator) {
      orchestrator.stop()
    }
    if (abortController) {
      abortController.abort()
    }
    set({ status: 'paused', currentAction: null, abortController: null })
  },

  // Reset the orchestrator
  resetOrchestrator: () => {
    const { orchestrator, abortController } = get()
    if (orchestrator) {
      orchestrator.stop()
    }
    if (abortController) {
      abortController.abort()
    }
    set({
      orchestrator: null,
      abortController: null,
      status: 'idle',
      currentStage: 'spec',
      currentAction: null,
      history: [],
      error: null,
      iterationCount: 0,
    })
  },

  // Toggle panel expansion
  togglePanel: () => {
    set((state) => ({ isPanelExpanded: !state.isPanelExpanded }))
  },

  // Toggle thinking visibility
  toggleThinking: () => {
    set((state) => ({ showThinking: !state.showThinking }))
  },

  // Set mode (only when idle)
  setMode: (mode) => {
    if (get().status === 'idle') {
      set({ mode })
    }
  },
}))

// =============================================================================
// SELECTOR HOOKS
// =============================================================================

/**
 * Select only the status-related state (for performance)
 */
export const useOrchestratorStatus = () =>
  useOrchestratorStore((s) => ({
    status: s.status,
    currentStage: s.currentStage,
    currentAction: s.currentAction,
    error: s.error,
  }))

/**
 * Select the history for the activity log
 */
export const useOrchestratorHistory = () =>
  useOrchestratorStore((state) => ({
    history: state.history,
    showThinking: state.showThinking,
  }))

/**
 * Select actions only (stable references)
 */
export const useOrchestratorActions = () =>
  useOrchestratorStore((state) => ({
    startOrchestrator: state.startOrchestrator,
    stopOrchestrator: state.stopOrchestrator,
    resetOrchestrator: state.resetOrchestrator,
    togglePanel: state.togglePanel,
    toggleThinking: state.toggleThinking,
    setMode: state.setMode,
  }))

// =============================================================================
// LANGGRAPH API CLIENT
// =============================================================================

interface LangGraphStateUpdate {
  node?: string
  stage?: OrchestratorStage
  historyItem?: OrchestratorHistoryItem
}

/**
 * Run the LangGraph orchestrator via the server-side API.
 * Handles SSE streaming and calls appropriate callbacks.
 */
async function runLangGraphOrchestrator(
  projectId: string,
  mode: OrchestratorMode,
  description: string,
  existingSpec: ProjectSpec | undefined,
  blocks: PcbBlock[],
  abortController: AbortController,
  onStateChange: (update: LangGraphStateUpdate) => void,
  onSpecUpdate: (spec: Partial<ProjectSpec>) => Promise<void>,
  onComplete: () => void,
  onError: (error: string) => void
): Promise<void> {
  try {
    const response = await fetch('/api/orchestrator/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        mode,
        description,
        existingSpec,
        availableBlocks: blocks,
      }),
      signal: abortController.signal,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
      throw new Error(errorData.error || `HTTP ${response.status}`)
    }

    // Read SSE stream
    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // Parse SSE events
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // Keep incomplete line in buffer

      let currentEventType: string | null = null
      let currentData: string | null = null

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6)
        } else if (line === '' && currentEventType && currentData) {
          // End of event - process it
          try {
            const parsed = JSON.parse(currentData)

            switch (currentEventType) {
              case 'state':
                onStateChange({
                  node: parsed.node,
                  stage: parsed.stage,
                  historyItem: parsed.historyItem
                    ? {
                        id: parsed.historyItem.id || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: parsed.historyItem.timestamp || new Date().toISOString(),
                        type: parsed.historyItem.type || 'progress',
                        stage: parsed.historyItem.stage || parsed.stage || 'spec',
                        action: parsed.historyItem.action || parsed.node || 'unknown',
                        result: parsed.historyItem.result,
                        details: parsed.historyItem.details,
                      }
                    : {
                        id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                        timestamp: new Date().toISOString(),
                        type: 'progress',
                        stage: parsed.stage || 'spec',
                        action: parsed.node || 'unknown',
                        result: `Executing ${parsed.node || 'node'}`,
                      },
                })
                break

              case 'spec':
                if (parsed.spec) {
                  await onSpecUpdate(parsed.spec)
                }
                break

              case 'complete':
                onComplete()
                return

              case 'error':
                onError(parsed.error || 'Unknown error')
                return
            }
          } catch (parseError) {
            console.error('Failed to parse SSE event:', currentData, parseError)
          }

          currentEventType = null
          currentData = null
        }
      }
    }

    // Stream ended without explicit complete event
    onComplete()
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      // User stopped the orchestrator - not an error
      return
    }
    const message = err instanceof Error ? err.message : String(err)
    onError(message)
  }
}

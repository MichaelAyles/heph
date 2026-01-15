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
 * Feature flag to enable LangGraph-based orchestrator.
 * Set to true to use the new StateGraph implementation.
 *
 * NOTE: LangGraph runs server-side on Cloudflare Workers.
 * When enabled, this will call /api/orchestrator/run instead of
 * running the marathon agent in the browser.
 *
 * Default: false (uses existing marathon agent)
 */
export const USE_LANGGRAPH_ORCHESTRATOR = false

// =============================================================================
// STORE TYPES
// =============================================================================

interface OrchestratorStoreState {
  // Orchestrator instance
  orchestrator: HardwareOrchestrator | null

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

    // NOTE: When USE_LANGGRAPH_ORCHESTRATOR is true, this would call
    // /api/orchestrator/run endpoint. For now, the LangGraph orchestrator
    // is server-side only and not yet integrated with the frontend.
    // The flag is reserved for future server-side orchestration.
    if (USE_LANGGRAPH_ORCHESTRATOR) {
      console.warn('LangGraph orchestrator is not yet integrated with frontend. Using legacy orchestrator.')
    }

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
    const { orchestrator } = get()
    if (orchestrator) {
      orchestrator.stop()
    }
    set({ status: 'paused', currentAction: null })
  },

  // Reset the orchestrator
  resetOrchestrator: () => {
    const { orchestrator } = get()
    if (orchestrator) {
      orchestrator.stop()
    }
    set({
      orchestrator: null,
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

/**
 * LangGraph Orchestrator Store
 *
 * Zustand store for managing the LangGraph-based hardware design orchestrator.
 * Provides reactive state management with interrupt handling for user input.
 */

import { create } from 'zustand'
import {
  createOrchestratorGraph,
  createInitialState,
  streamOrchestratorGraph,
  resumeWithUserInput,
  isAwaitingInput,
  isComplete,
  stateToProjectSpec,
  MemoryCheckpointer,
  type OrchestratorState,
  type OrchestratorMode,
  type WorkflowStage,
  type GraphStatus,
  type GraphHistoryItem,
  type UserInputRequest,
  type CompiledOrchestratorGraph,
} from '../services/langgraph'
import type { ProjectSpec, PcbBlock } from '../db/schema'

// =============================================================================
// STORE TYPES
// =============================================================================

interface LangGraphOrchestratorStore {
  // Graph instance
  graph: CompiledOrchestratorGraph | null
  checkpointer: MemoryCheckpointer | null

  // Current execution state
  state: OrchestratorState | null
  status: GraphStatus
  mode: OrchestratorMode
  currentStage: WorkflowStage
  currentNode: string | null
  history: GraphHistoryItem[]
  error: string | null
  iterationCount: number

  // User input state
  userInputRequest: UserInputRequest | null
  isAwaitingInput: boolean

  // UI state
  isPanelExpanded: boolean
  showHistory: boolean
  isStreaming: boolean

  // Actions
  initializeGraph: () => void
  startExecution: (
    projectId: string,
    mode: OrchestratorMode,
    description: string,
    existingSpec?: ProjectSpec | null,
    blocks?: PcbBlock[],
    onSpecUpdate?: (spec: Partial<ProjectSpec>) => Promise<void>
  ) => Promise<void>
  resumeExecution: () => Promise<void>
  submitUserInput: (selection: string | string[], isCustom?: boolean) => Promise<void>
  pauseExecution: () => void
  resetExecution: () => void
  togglePanel: () => void
  toggleHistory: () => void
  setMode: (mode: OrchestratorMode) => void
}

// =============================================================================
// STORE IMPLEMENTATION
// =============================================================================

export const useLangGraphOrchestratorStore = create<LangGraphOrchestratorStore>((set, get) => ({
  // Initial state
  graph: null,
  checkpointer: null,
  state: null,
  status: 'idle',
  mode: 'fix_it',
  currentStage: 'spec',
  currentNode: null,
  history: [],
  error: null,
  iterationCount: 0,
  userInputRequest: null,
  isAwaitingInput: false,
  isPanelExpanded: true,
  showHistory: false,
  isStreaming: false,

  // Initialize the graph (done once)
  initializeGraph: () => {
    const { graph } = get()
    if (graph) return // Already initialized

    const checkpointer = new MemoryCheckpointer()
    const newGraph = createOrchestratorGraph({
      checkpointer,
      interruptBefore: [
        'collectAnswers',
        'selectBlueprint',
        'selectName',
        'confirmPcbBlocks',
      ],
    })

    set({ graph: newGraph, checkpointer })
  },

  // Start a new execution
  startExecution: async (projectId, mode, _description, existingSpec, blocks, onSpecUpdate) => {
    const { graph } = get()

    if (!graph) {
      get().initializeGraph()
    }

    const currentGraph = get().graph
    if (!currentGraph) {
      set({ error: 'Failed to initialize graph', status: 'error' })
      return
    }

    // Create initial state
    const initialState = createInitialState(
      projectId,
      '', // userId will be set from context
      mode,
      existingSpec ?? null,
      blocks ?? []
    )

    set({
      state: initialState,
      status: 'running',
      mode,
      currentStage: 'spec',
      currentNode: null,
      history: [],
      error: null,
      iterationCount: 0,
      isAwaitingInput: false,
      userInputRequest: null,
      isStreaming: true,
    })

    try {
      // Stream execution
      for await (const event of streamOrchestratorGraph(currentGraph, initialState, {
        threadId: projectId,
      })) {
        const newState = event.state

        // Update store with new state
        set({
          state: newState,
          currentNode: event.node,
          status: newState.status,
          currentStage: newState.currentStage,
          history: newState.history,
          error: newState.error,
          iterationCount: newState.iterationCount,
          isAwaitingInput: isAwaitingInput(newState),
          userInputRequest: newState.userInputRequest,
        })

        // Persist to project if callback provided
        if (onSpecUpdate && newState.status !== 'awaiting_input') {
          const specUpdate = stateToProjectSpec(newState)
          await onSpecUpdate(specUpdate)
        }

        // Check if awaiting input
        if (newState.status === 'awaiting_input') {
          set({ isStreaming: false })
          return
        }

        // Check if complete
        if (isComplete(newState)) {
          set({ isStreaming: false })
          if (onSpecUpdate) {
            const specUpdate = stateToProjectSpec(newState)
            await onSpecUpdate(specUpdate)
          }
          return
        }
      }
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        isStreaming: false,
      })
    }
  },

  // Resume execution after pause
  resumeExecution: async () => {
    const { graph, state } = get()

    if (!graph || !state) {
      set({ error: 'No execution to resume', status: 'error' })
      return
    }

    set({ status: 'running', isStreaming: true, error: null })

    try {
      for await (const event of streamOrchestratorGraph(graph, null, {
        threadId: state.projectId,
      })) {
        const newState = event.state

        set({
          state: newState,
          currentNode: event.node,
          status: newState.status,
          currentStage: newState.currentStage,
          history: newState.history,
          error: newState.error,
          iterationCount: newState.iterationCount,
          isAwaitingInput: isAwaitingInput(newState),
          userInputRequest: newState.userInputRequest,
        })

        if (newState.status === 'awaiting_input') {
          set({ isStreaming: false })
          return
        }

        if (isComplete(newState)) {
          set({ isStreaming: false })
          return
        }
      }
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        isStreaming: false,
      })
    }
  },

  // Submit user input and continue
  submitUserInput: async (selection, isCustom = false) => {
    const { graph, state, userInputRequest } = get()

    if (!graph || !state || !userInputRequest) {
      set({ error: 'No input request to respond to', status: 'error' })
      return
    }

    set({ status: 'running', isStreaming: true, isAwaitingInput: false })

    try {
      const newState = await resumeWithUserInput(graph, state.projectId, {
        nodeId: userInputRequest.nodeId,
        selection,
        isCustom,
      })

      set({
        state: newState,
        status: newState.status,
        currentStage: newState.currentStage,
        history: newState.history,
        error: newState.error,
        iterationCount: newState.iterationCount,
        isAwaitingInput: isAwaitingInput(newState),
        userInputRequest: newState.userInputRequest,
        isStreaming: false,
      })

      // Continue if not awaiting more input
      if (newState.status === 'running') {
        get().resumeExecution()
      }
    } catch (error) {
      set({
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
        isStreaming: false,
      })
    }
  },

  // Pause execution
  pauseExecution: () => {
    set({
      status: 'paused',
      isStreaming: false,
    })
  },

  // Reset everything
  resetExecution: () => {
    const { checkpointer } = get()
    if (checkpointer) {
      checkpointer.clear()
    }

    set({
      state: null,
      status: 'idle',
      currentStage: 'spec',
      currentNode: null,
      history: [],
      error: null,
      iterationCount: 0,
      userInputRequest: null,
      isAwaitingInput: false,
      isStreaming: false,
    })
  },

  // Toggle panel
  togglePanel: () => {
    set((s) => ({ isPanelExpanded: !s.isPanelExpanded }))
  },

  // Toggle history visibility
  toggleHistory: () => {
    set((s) => ({ showHistory: !s.showHistory }))
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
 * Select status-related state
 */
export const useLangGraphStatus = () =>
  useLangGraphOrchestratorStore((s) => ({
    status: s.status,
    currentStage: s.currentStage,
    currentNode: s.currentNode,
    error: s.error,
    isStreaming: s.isStreaming,
  }))

/**
 * Select user input state
 */
export const useLangGraphUserInput = () =>
  useLangGraphOrchestratorStore((s) => ({
    isAwaitingInput: s.isAwaitingInput,
    userInputRequest: s.userInputRequest,
    submitUserInput: s.submitUserInput,
  }))

/**
 * Select history
 */
export const useLangGraphHistory = () =>
  useLangGraphOrchestratorStore((s) => ({
    history: s.history,
    showHistory: s.showHistory,
    toggleHistory: s.toggleHistory,
  }))

/**
 * Select actions
 */
export const useLangGraphActions = () =>
  useLangGraphOrchestratorStore((s) => ({
    initializeGraph: s.initializeGraph,
    startExecution: s.startExecution,
    resumeExecution: s.resumeExecution,
    pauseExecution: s.pauseExecution,
    resetExecution: s.resetExecution,
    togglePanel: s.togglePanel,
    setMode: s.setMode,
  }))

/**
 * Select current orchestrator state (for components that need full state)
 */
export const useLangGraphState = () =>
  useLangGraphOrchestratorStore((s) => s.state)

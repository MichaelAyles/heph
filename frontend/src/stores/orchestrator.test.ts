/**
 * Tests for Orchestrator Store
 */

import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { useOrchestratorStore } from './orchestrator'

// Mock the orchestrator service
vi.mock('@/services/orchestrator', () => ({
  createOrchestrator: vi.fn(),
}))

import { createOrchestrator } from '@/services/orchestrator'

// Create mock orchestrator
const createMockOrchestrator = () => ({
  run: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
})

// Reset store before each test
beforeEach(() => {
  vi.clearAllMocks()
  useOrchestratorStore.setState({
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
  })
})

// =============================================================================
// INITIAL STATE TESTS
// =============================================================================

describe('useOrchestratorStore initial state', () => {
  it('starts with idle status', () => {
    const { status } = useOrchestratorStore.getState()
    expect(status).toBe('idle')
  })

  it('starts with vibe_it mode', () => {
    const { mode } = useOrchestratorStore.getState()
    expect(mode).toBe('vibe_it')
  })

  it('starts with spec stage', () => {
    const { currentStage } = useOrchestratorStore.getState()
    expect(currentStage).toBe('spec')
  })

  it('starts with null orchestrator', () => {
    const { orchestrator } = useOrchestratorStore.getState()
    expect(orchestrator).toBeNull()
  })

  it('starts with empty history', () => {
    const { history } = useOrchestratorStore.getState()
    expect(history).toEqual([])
  })

  it('starts with no error', () => {
    const { error } = useOrchestratorStore.getState()
    expect(error).toBeNull()
  })

  it('starts with iteration count 0', () => {
    const { iterationCount } = useOrchestratorStore.getState()
    expect(iterationCount).toBe(0)
  })

  it('starts with panel expanded', () => {
    const { isPanelExpanded } = useOrchestratorStore.getState()
    expect(isPanelExpanded).toBe(true)
  })

  it('starts with thinking hidden', () => {
    const { showThinking } = useOrchestratorStore.getState()
    expect(showThinking).toBe(false)
  })
})

// =============================================================================
// startOrchestrator TESTS
// =============================================================================

describe('startOrchestrator', () => {
  it('creates and starts orchestrator', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    expect(createOrchestrator).toHaveBeenCalledWith(
      'project-1',
      'vibe_it',
      expect.any(Object) // callbacks
    )
    expect(mockOrchestrator.run).toHaveBeenCalledWith(
      'Build a sensor',
      undefined, // existingSpec
      undefined // blocks
    )
  })

  it('sets status to running', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    expect(useOrchestratorStore.getState().status).toBe('running')
  })

  it('sets mode from parameter', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'design_it', 'Build a sensor')

    expect(useOrchestratorStore.getState().mode).toBe('design_it')
  })

  it('clears previous error', () => {
    useOrchestratorStore.setState({ error: 'Previous error' })

    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    expect(useOrchestratorStore.getState().error).toBeNull()
  })

  it('resets history', () => {
    useOrchestratorStore.setState({
      history: [
        { type: 'tool_call', timestamp: new Date(), toolName: 'test', args: {} },
      ],
    })

    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    expect(useOrchestratorStore.getState().history).toEqual([])
  })

  it('resets iteration count', () => {
    useOrchestratorStore.setState({ iterationCount: 50 })

    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    expect(useOrchestratorStore.getState().iterationCount).toBe(0)
  })

  it('passes existing spec to orchestrator', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const existingSpec = {
      description: 'Test spec',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
    }

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'fix_it', 'Fix the sensor', existingSpec)

    expect(mockOrchestrator.run).toHaveBeenCalledWith(
      'Fix the sensor',
      existingSpec,
      undefined
    )
  })

  it('passes blocks to orchestrator', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const blocks = [
      {
        id: 'block-1',
        slug: 'esp32-c6',
        name: 'ESP32-C6',
        description: 'MCU',
        category: 'mcu' as const,
        width: 2,
        height: 2,
        taps: [],
        i2cAddresses: null,
        spiPins: null,
        gpioPins: [],
        power: { currentMaxMa: 200 },
        edges: { north: [], south: [], east: [], west: [] },
        previewImageUrl: null,
        schematicUrl: null,
        createdAt: '',
        updatedAt: '',
      },
    ]

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'design_it', 'Design with blocks', undefined, blocks)

    expect(mockOrchestrator.run).toHaveBeenCalledWith(
      'Design with blocks',
      undefined,
      blocks
    )
  })

  it('does not start if already running', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    // First start
    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Reset mock to check second call
    vi.clearAllMocks()

    // Try to start again
    startOrchestrator('project-2', 'design_it', 'Another project')

    // Should not create new orchestrator
    expect(createOrchestrator).not.toHaveBeenCalled()
  })

  it('sets error on orchestrator failure', async () => {
    const mockOrchestrator = createMockOrchestrator()
    mockOrchestrator.run.mockRejectedValue(new Error('Run failed'))
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Wait for the promise to reject
    await vi.waitFor(() => {
      expect(useOrchestratorStore.getState().error).toBe('Run failed')
    })
  })

  it('handles non-Error rejection', async () => {
    const mockOrchestrator = createMockOrchestrator()
    mockOrchestrator.run.mockRejectedValue('String error')
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    await vi.waitFor(() => {
      expect(useOrchestratorStore.getState().error).toBe('String error')
    })
  })
})

// =============================================================================
// CALLBACKS TESTS
// =============================================================================

describe('orchestrator callbacks', () => {
  it('onStateChange updates store state', () => {
    let capturedCallbacks: any = null
    ;(createOrchestrator as Mock).mockImplementation((_projectId, _mode, callbacks) => {
      capturedCallbacks = callbacks
      return createMockOrchestrator()
    })

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Simulate state change callback
    capturedCallbacks.onStateChange({
      status: 'running',
      currentStage: 'pcb',
      currentAction: 'Selecting blocks',
      history: [{ type: 'message', content: 'test' }],
      error: null,
      iterationCount: 5,
    })

    const state = useOrchestratorStore.getState()
    expect(state.status).toBe('running')
    expect(state.currentStage).toBe('pcb')
    expect(state.currentAction).toBe('Selecting blocks')
    expect(state.history).toHaveLength(1)
    expect(state.iterationCount).toBe(5)
  })

  it('onComplete sets status to complete', () => {
    let capturedCallbacks: any = null
    ;(createOrchestrator as Mock).mockImplementation((_projectId, _mode, callbacks) => {
      capturedCallbacks = callbacks
      return createMockOrchestrator()
    })

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Simulate complete callback
    capturedCallbacks.onComplete({
      status: 'complete',
      currentStage: 'export',
      currentAction: null,
      history: [],
      error: null,
      iterationCount: 10,
    })

    const state = useOrchestratorStore.getState()
    expect(state.status).toBe('complete')
    expect(state.currentAction).toBeNull()
  })

  it('onError sets status to error', () => {
    let capturedCallbacks: any = null
    ;(createOrchestrator as Mock).mockImplementation((_projectId, _mode, callbacks) => {
      capturedCallbacks = callbacks
      return createMockOrchestrator()
    })

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Simulate error callback
    capturedCallbacks.onError(new Error('Something went wrong'))

    const state = useOrchestratorStore.getState()
    expect(state.status).toBe('error')
    expect(state.error).toBe('Something went wrong')
    expect(state.currentAction).toBeNull()
  })

  it('onSpecUpdate calls provided callback', async () => {
    let capturedCallbacks: any = null
    ;(createOrchestrator as Mock).mockImplementation((_projectId, _mode, callbacks) => {
      capturedCallbacks = callbacks
      return createMockOrchestrator()
    })

    const onSpecUpdate = vi.fn().mockResolvedValue(undefined)

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor', undefined, undefined, onSpecUpdate)

    // Simulate spec update callback
    await capturedCallbacks.onSpecUpdate({ description: 'Updated' })

    expect(onSpecUpdate).toHaveBeenCalledWith({ description: 'Updated' })
  })

  it('onSpecUpdate handles missing callback gracefully', async () => {
    let capturedCallbacks: any = null
    ;(createOrchestrator as Mock).mockImplementation((_projectId, _mode, callbacks) => {
      capturedCallbacks = callbacks
      return createMockOrchestrator()
    })

    const { startOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')

    // Should not throw even without callback
    await expect(
      capturedCallbacks.onSpecUpdate({ description: 'Updated' })
    ).resolves.toBeUndefined()
  })
})

// =============================================================================
// stopOrchestrator TESTS
// =============================================================================

describe('stopOrchestrator', () => {
  it('calls stop on orchestrator', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator, stopOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    stopOrchestrator()

    expect(mockOrchestrator.stop).toHaveBeenCalled()
  })

  it('sets status to paused', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator, stopOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    stopOrchestrator()

    expect(useOrchestratorStore.getState().status).toBe('paused')
  })

  it('clears current action', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    useOrchestratorStore.setState({ currentAction: 'Doing something' })

    const { startOrchestrator, stopOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    stopOrchestrator()

    expect(useOrchestratorStore.getState().currentAction).toBeNull()
  })

  it('handles missing orchestrator gracefully', () => {
    const { stopOrchestrator } = useOrchestratorStore.getState()

    // Should not throw
    expect(() => stopOrchestrator()).not.toThrow()
    expect(useOrchestratorStore.getState().status).toBe('paused')
  })
})

// =============================================================================
// resetOrchestrator TESTS
// =============================================================================

describe('resetOrchestrator', () => {
  it('calls stop on orchestrator', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator, resetOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    resetOrchestrator()

    expect(mockOrchestrator.stop).toHaveBeenCalled()
  })

  it('sets orchestrator to null', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator, resetOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    resetOrchestrator()

    expect(useOrchestratorStore.getState().orchestrator).toBeNull()
  })

  it('resets status to idle', () => {
    const mockOrchestrator = createMockOrchestrator()
    ;(createOrchestrator as Mock).mockReturnValue(mockOrchestrator)

    const { startOrchestrator, resetOrchestrator } = useOrchestratorStore.getState()
    startOrchestrator('project-1', 'vibe_it', 'Build a sensor')
    resetOrchestrator()

    expect(useOrchestratorStore.getState().status).toBe('idle')
  })

  it('resets currentStage to spec', () => {
    useOrchestratorStore.setState({ currentStage: 'export' })

    const { resetOrchestrator } = useOrchestratorStore.getState()
    resetOrchestrator()

    expect(useOrchestratorStore.getState().currentStage).toBe('spec')
  })

  it('clears current action', () => {
    useOrchestratorStore.setState({ currentAction: 'Doing something' })

    const { resetOrchestrator } = useOrchestratorStore.getState()
    resetOrchestrator()

    expect(useOrchestratorStore.getState().currentAction).toBeNull()
  })

  it('clears history', () => {
    useOrchestratorStore.setState({
      history: [{ type: 'message', content: 'test' } as any],
    })

    const { resetOrchestrator } = useOrchestratorStore.getState()
    resetOrchestrator()

    expect(useOrchestratorStore.getState().history).toEqual([])
  })

  it('clears error', () => {
    useOrchestratorStore.setState({ error: 'Some error' })

    const { resetOrchestrator } = useOrchestratorStore.getState()
    resetOrchestrator()

    expect(useOrchestratorStore.getState().error).toBeNull()
  })

  it('resets iteration count', () => {
    useOrchestratorStore.setState({ iterationCount: 75 })

    const { resetOrchestrator } = useOrchestratorStore.getState()
    resetOrchestrator()

    expect(useOrchestratorStore.getState().iterationCount).toBe(0)
  })

  it('handles missing orchestrator gracefully', () => {
    const { resetOrchestrator } = useOrchestratorStore.getState()

    // Should not throw
    expect(() => resetOrchestrator()).not.toThrow()
    expect(useOrchestratorStore.getState().status).toBe('idle')
  })
})

// =============================================================================
// UI ACTIONS TESTS
// =============================================================================

describe('togglePanel', () => {
  it('toggles isPanelExpanded from true to false', () => {
    useOrchestratorStore.setState({ isPanelExpanded: true })

    const { togglePanel } = useOrchestratorStore.getState()
    togglePanel()

    expect(useOrchestratorStore.getState().isPanelExpanded).toBe(false)
  })

  it('toggles isPanelExpanded from false to true', () => {
    useOrchestratorStore.setState({ isPanelExpanded: false })

    const { togglePanel } = useOrchestratorStore.getState()
    togglePanel()

    expect(useOrchestratorStore.getState().isPanelExpanded).toBe(true)
  })
})

describe('toggleThinking', () => {
  it('toggles showThinking from false to true', () => {
    useOrchestratorStore.setState({ showThinking: false })

    const { toggleThinking } = useOrchestratorStore.getState()
    toggleThinking()

    expect(useOrchestratorStore.getState().showThinking).toBe(true)
  })

  it('toggles showThinking from true to false', () => {
    useOrchestratorStore.setState({ showThinking: true })

    const { toggleThinking } = useOrchestratorStore.getState()
    toggleThinking()

    expect(useOrchestratorStore.getState().showThinking).toBe(false)
  })
})

describe('setMode', () => {
  it('sets mode when idle', () => {
    useOrchestratorStore.setState({ status: 'idle', mode: 'vibe_it' })

    const { setMode } = useOrchestratorStore.getState()
    setMode('design_it')

    expect(useOrchestratorStore.getState().mode).toBe('design_it')
  })

  it('does not set mode when running', () => {
    useOrchestratorStore.setState({ status: 'running', mode: 'vibe_it' })

    const { setMode } = useOrchestratorStore.getState()
    setMode('design_it')

    expect(useOrchestratorStore.getState().mode).toBe('vibe_it')
  })

  it('does not set mode when paused', () => {
    useOrchestratorStore.setState({ status: 'paused', mode: 'vibe_it' })

    const { setMode } = useOrchestratorStore.getState()
    setMode('fix_it')

    expect(useOrchestratorStore.getState().mode).toBe('vibe_it')
  })

  it('does not set mode when in error state', () => {
    useOrchestratorStore.setState({ status: 'error', mode: 'vibe_it' })

    const { setMode } = useOrchestratorStore.getState()
    setMode('design_it')

    expect(useOrchestratorStore.getState().mode).toBe('vibe_it')
  })

  it('sets all mode types when idle', () => {
    const modes = ['vibe_it', 'fix_it', 'design_it'] as const

    for (const mode of modes) {
      useOrchestratorStore.setState({ status: 'idle', mode: 'vibe_it' })
      const { setMode } = useOrchestratorStore.getState()
      setMode(mode)
      expect(useOrchestratorStore.getState().mode).toBe(mode)
    }
  })
})

// =============================================================================
// SELECTOR HOOKS TESTS
// =============================================================================

// Note: useOrchestratorStatus, useOrchestratorHistory, and useOrchestratorActions
// are React hooks that cannot be tested outside of a component context.
// They are simple selector wrappers around useOrchestratorStore and don't
// contain complex logic, so we skip unit testing them.
// They would be covered by integration/component tests.

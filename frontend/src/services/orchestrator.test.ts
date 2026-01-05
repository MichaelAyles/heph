/**
 * Orchestrator Integration Tests
 *
 * Tests the full orchestration flow from spec through PCB, enclosure, and firmware.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  HardwareOrchestrator,
  type OrchestratorCallbacks,
  type OrchestratorState,
} from './orchestrator'
import type { ProjectSpec, PcbBlock } from '@/db/schema'

// Mock the llm service
vi.mock('./llm', () => ({
  llm: {
    chat: vi.fn(),
    chatWithTools: vi.fn(),
  },
}))

import { llm } from './llm'

// =============================================================================
// TEST FIXTURES
// =============================================================================

const mockBlocks: PcbBlock[] = [
  {
    id: '1',
    slug: 'mcu-esp32c6',
    name: 'ESP32-C6 DevKit',
    category: 'mcu',
    widthUnits: 2,
    heightUnits: 2,
    description: 'ESP32-C6 microcontroller',
    pins: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '2',
    slug: 'power-usb-c',
    name: 'USB-C Power',
    category: 'power',
    widthUnits: 1,
    heightUnits: 1,
    description: 'USB-C power input',
    pins: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '3',
    slug: 'sensor-bme280',
    name: 'BME280 Sensor',
    category: 'sensor',
    widthUnits: 1,
    heightUnits: 1,
    description: 'Temperature/humidity sensor',
    pins: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: '4',
    slug: 'output-ws2812b-8',
    name: '8x WS2812B LEDs',
    category: 'output',
    widthUnits: 2,
    heightUnits: 1,
    description: 'RGB LED strip',
    pins: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

const createMockCallbacks = (): OrchestratorCallbacks & {
  stateChanges: OrchestratorState[]
  specUpdates: Partial<ProjectSpec>[]
} => {
  const stateChanges: OrchestratorState[] = []
  const specUpdates: Partial<ProjectSpec>[] = []

  return {
    stateChanges,
    specUpdates,
    onStateChange: vi.fn((state) => stateChanges.push({ ...state })),
    onSpecUpdate: vi.fn(async (spec) => {
      specUpdates.push({ ...spec })
    }),
    onComplete: vi.fn(),
    onError: vi.fn(),
    onUserInputRequired: vi.fn(),
  }
}

// =============================================================================
// UNIT TESTS
// =============================================================================

describe('HardwareOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('constructor', () => {
    it('initializes with correct state', () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)
      const state = orchestrator.getState()

      expect(state.projectId).toBe('proj-1')
      expect(state.mode).toBe('vibe_it')
      expect(state.status).toBe('idle')
      expect(state.currentStage).toBe('spec')
      expect(state.history).toHaveLength(0)
    })

    it('accepts different modes', () => {
      const callbacks = createMockCallbacks()

      const vibeIt = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)
      expect(vibeIt.getState().mode).toBe('vibe_it')

      const fixIt = new HardwareOrchestrator('proj-2', 'fix_it', callbacks)
      expect(fixIt.getState().mode).toBe('fix_it')

      const designIt = new HardwareOrchestrator('proj-3', 'design_it', callbacks)
      expect(designIt.getState().mode).toBe('design_it')
    })
  })

  describe('run', () => {
    it('throws if already running', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      // Mock chatWithTools to return a stop response after first call
      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockImplementation(async () => {
        // Simulate slow response
        await new Promise((resolve) => setTimeout(resolve, 100))
        return {
          content: 'Done',
          finishReason: 'stop',
          usage: { inputTokens: 100, outputTokens: 50 },
        }
      })

      // Start first run (don't await)
      const firstRun = orchestrator.run('Test project', undefined, mockBlocks)

      // Try to start second run immediately
      await expect(orchestrator.run('Another project')).rejects.toThrow(
        'Orchestrator is already running'
      )

      // Clean up first run
      orchestrator.stop()
      await firstRun.catch(() => {}) // Ignore any errors
    })

    it('updates state to running when started', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      // Mock chatWithTools to run one iteration then complete
      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Processing...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'report_progress',
            arguments: {
              message: 'Starting analysis',
              stage: 'spec',
              percentage: 10,
            },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      // Second call returns stop to end the loop
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Complete',
        finishReason: 'stop',
        toolCalls: [
          {
            id: 'call-2',
            name: 'mark_stage_complete',
            arguments: { stage: 'export' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have state changes including 'running'
      expect(callbacks.stateChanges.some((s) => s.status === 'running')).toBe(true)
    })

    it('calls onStateChange when state updates', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'mark_stage_complete',
            arguments: { stage: 'export' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      expect(callbacks.onStateChange).toHaveBeenCalled()
    })
  })

  describe('stop', () => {
    it('stops a running orchestrator', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      let callCount = 0
      mockChatWithTools.mockImplementation(async () => {
        callCount++
        if (callCount >= 2) {
          orchestrator.stop()
        }
        return {
          content: 'Processing...',
          finishReason: 'stop',
          usage: { inputTokens: 100, outputTokens: 50 },
        }
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have paused status in state changes
      expect(callbacks.stateChanges.some((s) => s.status === 'paused')).toBe(true)
    })
  })

  describe('tool execution', () => {
    it('executes analyze_feasibility tool', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      // Mock chat for feasibility analysis
      const mockChat = vi.mocked(llm.chat)
      mockChat.mockResolvedValueOnce({
        content: JSON.stringify({
          manufacturable: true,
          overallScore: 85,
          inputs: { items: ['Button'] },
          outputs: { items: ['LED'] },
          openQuestions: [{ id: 'q1', question: 'Power?', options: ['USB', 'Battery'] }],
        }),
        usage: { inputTokens: 100, outputTokens: 200 },
      })

      // Mock chatWithTools
      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Analyzing...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'analyze_feasibility',
            arguments: { description: 'Temperature monitor' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      // End loop
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Temperature monitor', undefined, mockBlocks)

      // Should have called llm.chat for feasibility
      expect(mockChat).toHaveBeenCalled()

      // Should have updated spec with feasibility
      expect(callbacks.specUpdates.some((u) => u.feasibility !== undefined)).toBe(true)
    })

    it('executes report_progress tool', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Progress...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'report_progress',
            arguments: { message: 'Working on PCB', stage: 'pcb', percentage: 50 },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.history.some((h) => h.action === 'report_progress')).toBe(true)
    })

    it('executes validate_cross_stage tool', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Validating...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'validate_cross_stage',
            arguments: { check_type: 'all' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.history.some((h) => h.action === 'validate_cross_stage')).toBe(true)
    })

    it('executes select_pcb_blocks tool with auto-selection', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      // Provide initial spec with finalSpec
      const initialSpec: ProjectSpec = {
        description: 'Test project',
        feasibility: null,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: {
          name: 'Test',
          summary: 'Test device',
          pcbSize: { width: 50, height: 40 },
          inputs: [{ type: 'Button', count: 1, notes: '' }],
          outputs: [{ type: 'Temperature', count: 1, notes: '' }],
          power: { source: 'USB-C', voltage: '5V', current: '500mA' },
          communication: { type: 'WiFi', protocol: 'HTTP' },
          enclosure: { style: 'box', width: 60, height: 50, depth: 25 },
          estimatedBOM: [],
          locked: true,
          lockedAt: new Date().toISOString(),
        },
        stages: {
          spec: { status: 'complete' },
          pcb: { status: 'pending' },
          enclosure: { status: 'pending' },
          firmware: { status: 'pending' },
          export: { status: 'pending' },
        },
      }

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Selecting blocks...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'select_pcb_blocks',
            arguments: { blocks: [], reasoning: 'Auto-selecting based on spec' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', initialSpec, mockBlocks)

      // Should have updated spec with pcb artifacts
      expect(callbacks.specUpdates.some((u) => u.pcb !== undefined)).toBe(true)
    })

    it('executes mark_stage_complete tool', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'call-1', name: 'mark_stage_complete', arguments: { stage: 'spec' } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have stage update in spec updates
      expect(callbacks.specUpdates.some((u) => u.stages !== undefined)).toBe(true)
    })
  })

  describe('error handling', () => {
    it('handles LLM errors gracefully', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockRejectedValueOnce(new Error('API error'))

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have error state
      const state = orchestrator.getState()
      expect(state.status).toBe('error')
      expect(state.error).toBe('API error')

      // Should have called onError
      expect(callbacks.onError).toHaveBeenCalled()
    })

    it('handles tool execution errors', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      // Mock chat to throw for feasibility
      const mockChat = vi.mocked(llm.chat)
      mockChat.mockRejectedValueOnce(new Error('Feasibility failed'))

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Analyzing...',
        finishReason: 'tool_calls',
        toolCalls: [
          {
            id: 'call-1',
            name: 'analyze_feasibility',
            arguments: { description: 'Test' },
          },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-2', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have error in history
      const state = orchestrator.getState()
      expect(state.history.some((h) => h.type === 'error')).toBe(true)
    })

    it('prevents runaway loops', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      // Always return stop but never complete
      mockChatWithTools.mockResolvedValue({
        content: 'Processing...',
        finishReason: 'stop',
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      // Should have error about max iterations
      const state = orchestrator.getState()
      expect(state.status).toBe('error')
      expect(state.error).toContain('maximum iterations')
    })
  })

  describe('state management', () => {
    it('tracks history of actions', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Progress 1',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'call-1', name: 'report_progress', arguments: { message: 'Step 1', stage: 'spec', percentage: 25 } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Progress 2',
        finishReason: 'tool_calls',
        toolCalls: [
          { id: 'call-2', name: 'report_progress', arguments: { message: 'Step 2', stage: 'spec', percentage: 50 } },
        ],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-3', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.history.length).toBeGreaterThan(0)

      // Should have tool_call and tool_result pairs
      const toolCalls = state.history.filter((h) => h.type === 'tool_call')
      const toolResults = state.history.filter((h) => h.type === 'tool_result')
      expect(toolCalls.length).toBeGreaterThan(0)
      expect(toolResults.length).toBeGreaterThan(0)
    })

    it('tracks iteration count', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      let iterationCount = 0
      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockImplementation(async () => {
        iterationCount++
        if (iterationCount >= 3) {
          return {
            content: 'Done',
            finishReason: 'tool_calls',
            toolCalls: [{ id: 'call-x', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
            usage: { inputTokens: 100, outputTokens: 50 },
          }
        }
        return {
          content: 'Processing...',
          finishReason: 'stop',
          usage: { inputTokens: 100, outputTokens: 50 },
        }
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.iterationCount).toBe(3)
    })
  })

  describe('completion', () => {
    it('completes when export stage is marked complete', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-1', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.status).toBe('complete')
      expect(state.completedAt).not.toBeNull()
      expect(callbacks.onComplete).toHaveBeenCalled()
    })

    it('sets startedAt timestamp on run', async () => {
      const callbacks = createMockCallbacks()
      const orchestrator = new HardwareOrchestrator('proj-1', 'vibe_it', callbacks)

      const mockChatWithTools = vi.mocked(llm.chatWithTools)
      mockChatWithTools.mockResolvedValueOnce({
        content: 'Done',
        finishReason: 'tool_calls',
        toolCalls: [{ id: 'call-1', name: 'mark_stage_complete', arguments: { stage: 'export' } }],
        usage: { inputTokens: 100, outputTokens: 50 },
      })

      await orchestrator.run('Test project', undefined, mockBlocks)

      const state = orchestrator.getState()
      expect(state.startedAt).not.toBeNull()
    })
  })
})

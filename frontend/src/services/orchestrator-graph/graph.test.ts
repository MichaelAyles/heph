/**
 * Tests for Graph Creation
 */

import { describe, it, expect, vi } from 'vitest'
import { createOrchestratorGraph, prepareInitialState, type OrchestratorInput } from './graph'

// Mock all the node modules to avoid LLM calls
vi.mock('./nodes/spec', () => ({
  analyzeFeasibilityNode: vi.fn(),
  isFeasibilityRejected: vi.fn(() => false),
  hasOpenQuestions: vi.fn(() => false),
  answerQuestionsAutoNode: vi.fn(),
  generateBlueprintsNode: vi.fn(),
  selectBlueprintAutoNode: vi.fn(),
  generateNamesNode: vi.fn(),
  selectNameAutoNode: vi.fn(),
  finalizeSpecNode: vi.fn(),
}))

vi.mock('./nodes/pcb', () => ({
  selectBlocksNode: vi.fn(),
  validatePcbNode: vi.fn(),
}))

vi.mock('./nodes/enclosure', () => ({
  generateEnclosureNode: vi.fn(),
  reviewEnclosureNode: vi.fn(),
  decideEnclosureNode: vi.fn(),
  acceptEnclosureNode: vi.fn(),
}))

vi.mock('./nodes/firmware', () => ({
  generateFirmwareNode: vi.fn(),
  reviewFirmwareNode: vi.fn(),
  decideFirmwareNode: vi.fn(),
  acceptFirmwareNode: vi.fn(),
}))

vi.mock('./nodes/shared', () => ({
  markSpecComplete: vi.fn(),
  markPcbComplete: vi.fn(),
  markEnclosureComplete: vi.fn(),
  markFirmwareComplete: vi.fn(),
  markExportComplete: vi.fn(),
  isComplete: vi.fn(() => false),
}))

describe('createOrchestratorGraph', () => {
  it('should create a graph with all nodes', () => {
    const graph = createOrchestratorGraph()

    // Check that the graph is created
    expect(graph).toBeDefined()

    // The graph should have nodes defined
    // StateGraph doesn't expose nodes directly, so we just verify creation succeeds
  })

  it('should be compilable', () => {
    const graph = createOrchestratorGraph()

    // Compile without checkpointer should work
    const compiled = graph.compile()
    expect(compiled).toBeDefined()
  })
})

describe('prepareInitialState', () => {
  it('should prepare fresh start state', () => {
    const input: OrchestratorInput = {
      projectId: 'test-project',
      mode: 'vibe_it',
      description: 'A temperature sensor',
      availableBlocks: [],
    }

    const state = prepareInitialState(input)

    expect(state.projectId).toBe('test-project')
    expect(state.mode).toBe('vibe_it')
    expect(state.description).toBe('A temperature sensor')
    expect(state.currentStage).toBe('spec')
    expect(state.startedAt).toBeDefined()
  })

  it('should prepare resume state from existing spec', () => {
    const input: OrchestratorInput = {
      projectId: 'test-project',
      mode: 'fix_it',
      description: 'A temperature sensor',
      availableBlocks: [],
      existingSpec: {
        description: 'A temperature sensor',
        feasibility: { manufacturable: true, overallScore: 85 } as any,
        openQuestions: [],
        decisions: [],
        blueprints: [],
        selectedBlueprint: null,
        finalSpec: null,
        stages: {
          spec: { status: 'complete' },
          pcb: { status: 'in_progress' },
          enclosure: { status: 'pending' },
          firmware: { status: 'pending' },
          export: { status: 'pending' },
        },
      },
    }

    const state = prepareInitialState(input)

    expect(state.projectId).toBe('test-project')
    expect(state.mode).toBe('fix_it')
    expect(state.currentStage).toBe('pcb')
    expect(state.feasibility?.manufacturable).toBe(true)
    expect(state.completedStages?.has('spec')).toBe(true)
  })

  it('should use all available modes', () => {
    const modes = ['vibe_it', 'fix_it', 'design_it'] as const

    for (const mode of modes) {
      const input: OrchestratorInput = {
        projectId: 'test',
        mode,
        description: 'Test',
        availableBlocks: [],
      }

      const state = prepareInitialState(input)
      expect(state.mode).toBe(mode)
    }
  })
})

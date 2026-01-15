/**
 * Tests for State Schema and Utilities
 */

import { describe, it, expect } from 'vitest'
import {
  createHistoryItem,
  stateToProjectSpec,
  projectSpecToState,
  type OrchestratorState,
} from './state'
import type { ProjectSpec, PcbBlock } from '@/db/schema'

describe('createHistoryItem', () => {
  it('should create a history item with all fields', () => {
    const item = createHistoryItem(
      'tool_result',
      'spec',
      'analyze_feasibility',
      'Success',
      { score: 85 }
    )

    expect(item.type).toBe('tool_result')
    expect(item.stage).toBe('spec')
    expect(item.action).toBe('analyze_feasibility')
    expect(item.result).toBe('Success')
    expect(item.details).toEqual({ score: 85 })
    expect(item.id).toBeDefined()
    expect(item.timestamp).toBeDefined()
  })

  it('should generate unique IDs', () => {
    const item1 = createHistoryItem('progress', 'pcb', 'select_blocks')
    const item2 = createHistoryItem('progress', 'pcb', 'select_blocks')

    expect(item1.id).not.toBe(item2.id)
  })
})

describe('stateToProjectSpec', () => {
  it('should convert state to project spec', () => {
    const state: Partial<OrchestratorState> = {
      description: 'Test project',
      feasibility: { manufacturable: true, overallScore: 85 } as any,
      openQuestions: [{ id: 'q1', question: 'Test?', options: ['A'] }],
      decisions: [{ questionId: 'q1', question: 'Test?', answer: 'A', timestamp: '2024-01-01' }],
      blueprints: [{ url: 'http://example.com/1.png', prompt: 'test' }],
      selectedBlueprint: 0,
      finalSpec: { name: 'Test', locked: true } as any,
      pcb: { placedBlocks: [], boardSize: { width: 50, height: 40, unit: 'mm' }, netList: [] },
      enclosure: { openScadCode: '// code' },
      firmware: { files: [], buildStatus: 'pending' },
      stages: {
        spec: { status: 'complete' },
        pcb: { status: 'in_progress' },
        enclosure: { status: 'pending' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      },
    }

    const spec = stateToProjectSpec(state as OrchestratorState)

    expect(spec.description).toBe('Test project')
    expect(spec.feasibility?.manufacturable).toBe(true)
    expect(spec.openQuestions).toHaveLength(1)
    expect(spec.decisions).toHaveLength(1)
    expect(spec.blueprints).toHaveLength(1)
    expect(spec.selectedBlueprint).toBe(0)
    expect(spec.finalSpec?.name).toBe('Test')
    expect(spec.pcb?.boardSize.width).toBe(50)
    expect(spec.enclosure?.openScadCode).toBe('// code')
    expect(spec.stages?.spec.status).toBe('complete')
  })

  it('should handle null optional fields', () => {
    const state: Partial<OrchestratorState> = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
      pcb: null,
      enclosure: null,
      firmware: null,
      stages: {
        spec: { status: 'in_progress' },
        pcb: { status: 'pending' },
        enclosure: { status: 'pending' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      },
    }

    const spec = stateToProjectSpec(state as OrchestratorState)

    expect(spec.feasibility).toBeNull()
    expect(spec.pcb).toBeUndefined()
    expect(spec.enclosure).toBeUndefined()
    expect(spec.firmware).toBeUndefined()
  })
})

describe('projectSpecToState', () => {
  it('should convert project spec to state', () => {
    const spec: ProjectSpec = {
      description: 'Test project',
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
    }

    const blocks: PcbBlock[] = []
    const state = projectSpecToState('project-1', 'vibe_it', spec, blocks)

    expect(state.projectId).toBe('project-1')
    expect(state.mode).toBe('vibe_it')
    expect(state.description).toBe('Test project')
    expect(state.currentStage).toBe('pcb')
    expect(state.completedStages?.has('spec')).toBe(true)
  })

  it('should determine current stage from in_progress status', () => {
    const spec: ProjectSpec = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
      stages: {
        spec: { status: 'complete' },
        pcb: { status: 'complete' },
        enclosure: { status: 'in_progress' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      },
    }

    const state = projectSpecToState('project-1', 'fix_it', spec, [])

    expect(state.currentStage).toBe('enclosure')
    expect(state.completedStages?.size).toBe(2)
  })

  it('should advance to next stage after complete', () => {
    const spec: ProjectSpec = {
      description: 'Test',
      feasibility: null,
      openQuestions: [],
      decisions: [],
      blueprints: [],
      selectedBlueprint: null,
      finalSpec: null,
      stages: {
        spec: { status: 'complete' },
        pcb: { status: 'complete' },
        enclosure: { status: 'complete' },
        firmware: { status: 'pending' },
        export: { status: 'pending' },
      },
    }

    const state = projectSpecToState('project-1', 'design_it', spec, [])

    expect(state.currentStage).toBe('firmware')
  })
})
